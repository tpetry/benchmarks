import autocannon from 'autocannon'
import { writeFile as _writeFile, mkdir as _mkdir, access as _access } from 'node:fs'
import compare from 'autocannon-compare'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'

const writeFile = promisify(_writeFile)
const mkdir = promisify(_mkdir)
const access = promisify(_access)
const require = createRequire(import.meta.url)

const resultsDirectory = join(process.cwd(), 'results')

// Which runtime produced these numbers (docker | podman | host). Validated in
// lib/bench.js before we get here; each result file is scoped to it.
const engine = process.env.BENCHMARK_CONTAINER_ENGINE || 'unknown'

const url = 'http://127.0.0.1:3000/'
// The POST benchmark sends this JSON object; every handler decodes it and echoes
// it back, so GET and POST differ only by the request-body parsing cost.
const postBody = JSON.stringify({ hello: 'world' })

const run = (opts, method) => new Promise((resolve, reject) => {
  const settings = { ...opts, url, method }
  if (method === 'POST') {
    settings.headers = { 'content-type': 'application/json' }
    settings.body = postBody
  }
  autocannon(settings, (err, result) => {
    if (err) {
      reject(err)
    } else {
      resolve(result)
    }
  })
})

const writeResult = async (handler, result) => {
  try {
    await access(resultsDirectory)
  } catch {
    await mkdir(resultsDirectory)
  }

  const dest = join(resultsDirectory, `${handler}-${engine}.json`)
  return writeFile(dest, JSON.stringify(result))
}

export async function fire (opts, handler, save) {
  const get = await run(opts, 'GET')
  const post = await run(opts, 'POST')

  return save ? writeResult(handler, { server: handler, engine, get, post }) : null
}

const _compare = (a, b) => {
  const resA = require(`${resultsDirectory}/${a}.json`).get
  const resB = require(`${resultsDirectory}/${b}.json`).get
  const comp = compare(resA, resB)
  if (comp.equal) {
    return true
  } else if (comp.aWins) {
    return {
      diff: comp.requests.difference,
      fastest: a,
      slowest: b,
      fastestAverage: resA.requests.average,
      slowestAverage: resB.requests.average
    }
  }
  return {
    diff: compare(resB, resA).requests.difference,
    fastest: b,
    slowest: a,
    fastestAverage: resB.requests.average,
    slowestAverage: resA.requests.average
  }
}
export { _compare as compare }
