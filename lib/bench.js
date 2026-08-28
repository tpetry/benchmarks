#!/usr/bin/env node

import { access, writeFile } from 'node:fs/promises'
import { execFile, execFileSync, fork } from 'node:child_process'
import { promisify } from 'node:util'
import { connect } from 'node:net'
import ora from 'ora'
import { join } from 'node:path'
import { fire } from './autocannon.js'
import { fileURLToPath } from 'node:url'

const execFileP = promisify(execFile)

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = join(__dirname, '..')

// How the HTTP servers are run is a required choice:
//
//   docker / podman  each server runs in a throwaway container. `--network host`
//                    is required (not `-p`): several servers bind `127.0.0.1`
//                    explicitly (e.g. benchmarks/fastify.cjs), and host
//                    networking also removes the bridge/NAT overhead. The repo is
//                    bind-mounted so the container uses the same dependency
//                    versions that lib/packages.js reports.
//   host             no isolation — each server is a plain `node` child process
//                    on this machine, the way the benchmarks originally ran.
//
// Docker and Podman differ slightly in networking/cgroup behaviour, and "host"
// removes isolation entirely, so results are only comparable when everyone is
// explicit about which mode produced them.
const SUPPORTED_ENGINES = ['docker', 'podman', 'host']
const ENGINE = process.env.BENCHMARK_CONTAINER_ENGINE
if (!SUPPORTED_ENGINES.includes(ENGINE)) {
  console.error(
    `Set BENCHMARK_CONTAINER_ENGINE to one of: ${SUPPORTED_ENGINES.join(', ')}` +
    (ENGINE ? ` (got ${JSON.stringify(ENGINE)})` : '')
  )
  process.exit(1)
}
const CONTAINERISED = ENGINE !== 'host'

// `-trixie` (Debian 13, glibc 2.41) rather than the default bookworm tag: the
// uWebSockets.js prebuilt binaries need GLIBC_2.38+. Override with
// BENCHMARK_CONTAINER_IMAGE if you want a different base.
const IMAGE = process.env.BENCHMARK_CONTAINER_IMAGE || 'docker.io/library/node:24-trixie'
const CONTAINER = 'fastify-benchmark-server'
const PORT = 3000
// Podman relabels the bind mount for SELinux with `:z`; on Docker (or a host
// without SELinux) it is a no-op.
const VOLUME = ENGINE === 'podman' ? `${repoRoot}:/app:z` : `${repoRoot}:/app`
// Record the Node version the servers actually ran on, so lib/packages.js
// reports it for `node-http` instead of assuming the host's.
const NODE_VERSION_FILE = join(repoRoot, '.container-node-version')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const canConnect = () => new Promise((resolve) => {
  const socket = connect(PORT, '127.0.0.1')
  socket.once('connect', () => { socket.destroy(); resolve(true) })
  socket.once('error', () => { socket.destroy(); resolve(false) })
})

const waitFor = async (predicate, { timeout, label }) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await sleep(100)
  }
  throw new Error(`Timed out after ${timeout}ms waiting for ${label}`)
}

// Render an argv as a copy-pasteable shell command, quoting only what needs it.
const formatCommand = (bin, args) => [bin, ...args]
  .map((arg) => /[^\w@%+=:,./-]/.test(arg) ? `'${arg.replace(/'/g, "'\\''")}'` : arg)
  .join(' ')

let serverProcess = null

const startServer = async (file, runArgs) => {
  if (CONTAINERISED) {
    await execFileP(ENGINE, runArgs)
    return
  }
  // execArgv: [] so parent flags (e.g. --input-type) are not forced on the
  // handler, which can be an .mjs or .cjs file.
  serverProcess = fork(join(repoRoot, 'benchmarks', file), { cwd: repoRoot, execArgv: [] })
}

const serverRunning = async () => {
  if (!CONTAINERISED) {
    return serverProcess !== null &&
      serverProcess.exitCode === null &&
      serverProcess.signalCode === null
  }
  try {
    const { stdout } = await execFileP(ENGINE, ['inspect', '-f', '{{.State.Running}}', CONTAINER])
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

const stopServer = async () => {
  if (CONTAINERISED) {
    try {
      await execFileP(ENGINE, ['rm', '--force', CONTAINER])
    } catch {
      // container was not running
    }
  } else if (serverProcess !== null) {
    const proc = serverProcess
    serverProcess = null
    if (proc.exitCode === null && proc.signalCode === null) {
      // Wait for the process to actually exit so its listening socket is gone
      // before the next server tries to bind the same port.
      await new Promise((resolve) => {
        proc.once('exit', resolve)
        proc.kill('SIGKILL')
      })
    }
  }
  // Stopping the server does not guarantee the kernel has released the socket;
  // wait for it so the next server does not benchmark a dying one. Never throw
  // from here: teardown must not be able to abort the run.
  try {
    await waitFor(async () => !(await canConnect()), {
      timeout: 10000,
      label: `port ${PORT} to be released`
    })
  } catch (error) {
    console.log(`Warning: ${error.message}`)
  }
}

const dumpServerLogs = async (handler) => {
  // In host mode the child inherits stdio, so its output is already on screen.
  if (!CONTAINERISED) return
  try {
    const { stdout, stderr } = await execFileP(ENGINE, ['logs', '--tail', '20', CONTAINER])
    const output = `${stdout}${stderr}`.trim()
    if (output) console.log(`--- ${handler} server output ---\n${output}\n---`)
  } catch {
    // container already gone
  }
}

// Don't leave the server running if the benchmark is interrupted.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    try {
      if (CONTAINERISED) {
        execFileSync(ENGINE, ['rm', '--force', CONTAINER], { stdio: 'ignore' })
      } else if (serverProcess !== null) {
        serverProcess.kill('SIGKILL')
      }
    } catch {
      // nothing to clean up
    }
    process.exit(1)
  })
}

let prepared = false
const prepare = async () => {
  if (prepared) return

  if (!CONTAINERISED) {
    await writeFile(NODE_VERSION_FILE, process.version)
    prepared = true
    return
  }

  const spinner = ora(`Pulling ${IMAGE}`).start()
  try {
    await execFileP(ENGINE, ['pull', IMAGE])
    const { stdout } = await execFileP(ENGINE, ['run', '--rm', IMAGE, 'node', '--version'])
    await writeFile(NODE_VERSION_FILE, stdout.trim())
    spinner.succeed(`Pulled ${IMAGE} (Node ${stdout.trim()})`)
  } catch (error) {
    spinner.fail(`Could not pull ${IMAGE}`)
    throw error
  }
  prepared = true
}

const doBench = async (opts, handler) => {
  const spinner = ora(`Started ${handler}`).start()

  let file = handler + '.cjs'
  try {
    await access(join(repoRoot, 'benchmarks', file))
  } catch {
    file = handler + '.mjs'
  }

  await stopServer()

  const runArgs = CONTAINERISED
    ? [
        'run', '--detach', '--name', CONTAINER,
        '--network', 'host',
        '--volume', VOLUME,
        '--workdir', '/app',
        IMAGE,
        'node', `benchmarks/${file}`
      ]
    : null
  // Print the exact command so it can be re-run by hand to verify the setup.
  const command = CONTAINERISED
    ? formatCommand(ENGINE, runArgs)
    : formatCommand('node', [`benchmarks/${file}`])
  spinner.info(`${handler}: ${command}`)
  spinner.start(`Starting ${handler}`)

  try {
    await startServer(file, runArgs)
  } catch (error) {
    spinner.fail(`Could not start server for ${handler}`)
    console.log(error)
    return false
  }

  try {
    spinner.color = 'magenta'
    spinner.text = `Warming ${handler}`
    await waitFor(async () => {
      if (!(await serverRunning())) {
        throw new Error(`${handler} server exited before it started serving`)
      }
      return canConnect()
    }, { timeout: 30000, label: `${handler} server` })
    await fire(opts, handler, false)

    spinner.color = 'yellow'
    spinner.text = `Working ${handler}`
    await fire(opts, handler, true)

    spinner.text = `Results saved for ${handler}`
    spinner.succeed()
    return true
  } catch (error) {
    spinner.fail(`Benchmark failed for ${handler}`)
    console.log(error)
    await dumpServerLogs(handler)
    return false
  } finally {
    await stopServer()
  }
}

let index = 0
const start = async (opts, list) => {
  if (list.length === index) {
    return true
  }

  try {
    await prepare()
    await doBench(opts, list[index])
    index += 1
    return start(opts, list)
  } catch (error) {
    return console.log(error)
  }
}

export default start
