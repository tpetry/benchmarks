#!/usr/bin/env node

import { access, writeFile } from 'node:fs/promises'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { connect } from 'node:net'
import ora from 'ora'
import { join } from 'node:path'
import { fire } from './autocannon.js'
import { fileURLToPath } from 'node:url'

const execFileP = promisify(execFile)

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = join(__dirname, '..')

// The HTTP servers are never started on the host: each one runs inside a
// throwaway Docker container. `--network host` is required (not `-p`): several
// servers bind `127.0.0.1` explicitly (e.g. benchmarks/fastify.cjs), which is
// unreachable through published ports, and host networking also removes the
// bridge/NAT overhead so the numbers reflect the framework, not Docker.
// The repo is bind-mounted, so the container uses the exact same dependency
// versions that lib/packages.js reports for the results table.
const IMAGE = process.env.BENCHMARK_DOCKER_IMAGE || 'node:24'
const CONTAINER = 'fastify-benchmark-server'
const PORT = 3000
// The servers now run on the image's Node, not the host's. Record the image's
// version so lib/packages.js reports it for `node-http` instead of the host's.
const NODE_VERSION_FILE = join(repoRoot, '.docker-node-version')

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

const stopContainer = async () => {
  try {
    await execFileP('docker', ['rm', '--force', CONTAINER])
  } catch {
    // container was not running
  }
  // `docker rm` returning does not guarantee the kernel has released the
  // socket; wait for it so the next server does not benchmark a dying one.
  // Never throw from here: teardown must not be able to abort the run.
  try {
    await waitFor(async () => !(await canConnect()), {
      timeout: 10000,
      label: `port ${PORT} to be released`
    })
  } catch (error) {
    console.log(`Warning: ${error.message}`)
  }
}

const containerRunning = async () => {
  try {
    const { stdout } = await execFileP('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER])
    return stdout.trim() === 'true'
  } catch {
    return false
  }
}

const dumpContainerLogs = async (handler) => {
  try {
    const { stdout, stderr } = await execFileP('docker', ['logs', '--tail', '20', CONTAINER])
    const output = `${stdout}${stderr}`.trim()
    if (output) console.log(`--- ${handler} container output ---\n${output}\n---`)
  } catch {
    // container already gone
  }
}

// Don't leave the server container running if the benchmark is interrupted.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    try {
      execFileSync('docker', ['rm', '--force', CONTAINER], { stdio: 'ignore' })
    } catch {
      // nothing to clean up
    }
    process.exit(1)
  })
}

let prepared = false
const prepare = async () => {
  if (prepared) return
  const spinner = ora(`Pulling ${IMAGE}`).start()
  try {
    await execFileP('docker', ['pull', IMAGE])
    const { stdout } = await execFileP('docker', ['run', '--rm', IMAGE, 'node', '--version'])
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

  await stopContainer()

  try {
    await execFileP('docker', [
      'run', '--detach', '--name', CONTAINER,
      '--network', 'host',
      '--volume', `${repoRoot}:/app`,
      '--workdir', '/app',
      IMAGE,
      'node', `benchmarks/${file}`
    ])
  } catch (error) {
    spinner.fail(`Could not start container for ${handler}`)
    console.log(error)
    return false
  }

  try {
    spinner.color = 'magenta'
    spinner.text = `Warming ${handler}`
    await waitFor(async () => {
      if (!(await containerRunning())) {
        throw new Error(`${handler} container exited before it started serving`)
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
    await dumpContainerLogs(handler)
    return false
  } finally {
    await stopContainer()
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
