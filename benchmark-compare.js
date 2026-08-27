#!/usr/bin/env node

import { platform, arch, cpus, totalmem } from 'node:os'
import { program } from 'commander'
import inquirer from 'inquirer'
import Table from 'cli-table'
import chalk from 'chalk'
import { join } from 'node:path'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { info } from './lib/packages.js'
import { compare } from './lib/autocannon.js'

const resultsPath = join(process.cwd(), 'results')

const PHASES = [
  { key: 'get', title: '`GET /` — returns a small static JSON object' },
  { key: 'post', title: '`POST /` — decodes the posted JSON object and echoes it back' }
]

// Every engine we have saved data for is reported, in this order.
const ENGINE_ORDER = ['docker', 'podman', 'host']

program.option('-t, --table', 'print table')
  .option('-m --markdown', 'format table for markdown')
  .option('-u --update', 'update README.md')
  .parse(process.argv)

const opts = program.opts()

if (opts.markdown || opts.update) {
  chalk.level = 0
}

// Result files are `results/<server>-<engine>.json`. Only files carrying both
// GET and POST numbers and a known engine are usable; a stale file from an older
// run (or a handler that failed this time) is skipped loudly so it never reaches
// a table or the interactive picker.
let resultsCache
function getResults () {
  if (resultsCache) return resultsCache
  const results = []
  for (const file of readdirSync(resultsPath).filter((f) => f.endsWith('.json')).sort()) {
    const name = file.replace(/\.json$/, '')
    const parsed = JSON.parse(readFileSync(`${resultsPath}/${file}`).toString())
    if (!parsed.get || !parsed.post || !parsed.engine) {
      console.log(chalk.yellow(`Skipping ${name}: not a GET/POST result for a known engine (stale format)`))
      continue
    }
    parsed.server = parsed.server || name.replace(new RegExp(`-${parsed.engine}$`), '')
    results.push(parsed)
  }
  resultsCache = results
  return results
}

// Engines we have data for, in ENGINE_ORDER first, then any others alphabetically.
function enginesPresent () {
  const present = new Set(getResults().map((result) => result.engine))
  return [
    ...ENGINE_ORDER.filter((engine) => present.has(engine)),
    ...[...present].filter((engine) => !ENGINE_ORDER.includes(engine)).sort()
  ]
}

function resultsForEngine (engine) {
  return getResults().filter((result) => result.engine === engine)
}

function getAvailableResults () {
  return getResults().map((result) => `${result.server}-${result.engine}`)
}

function formatHasRouter (hasRouter) {
  return typeof hasRouter === 'string' ? hasRouter : (hasRouter ? '✓' : '✗')
}

function updateReadme () {
  const machineInfo = `${platform()} ${arch()} | ${cpus().length} vCPUs | ${(totalmem() / (1024 ** 3)).toFixed(1)}GB Mem`
  const benchmarkMd = `# Benchmarks

* __Machine:__ ${machineInfo}
* __Node:__ \`${process.version}\`
* __Run:__ ${new Date()}
* __Method:__ \`autocannon -c 100 -d 40 -p 10 localhost:3000\`, measured separately for \`GET /\` (static JSON) and \`POST /\` (decodes a posted JSON object); two rounds each, one to warm up and one to measure. One section per runtime the benchmark was run under (\`docker\`, \`podman\`, \`host\`).

${compareResults(true)}
`
  const md = readFileSync('README.md', 'utf8')
  writeFileSync('README.md', md.split('# Benchmarks', 1)[0] + benchmarkMd, 'utf8')
}

function tableStyle (markdown) {
  return !markdown
    ? {}
    : {
        chars: {
          top: '',
          'top-left': '',
          'top-mid': '',
          'top-right': '',
          bottom: '',
          'bottom-left': '',
          'bottom-mid': '',
          'bottom-right': '',
          mid: '',
          'left-mid': '',
          'mid-mid': '',
          'right-mid': '',
          left: '|',
          right: '|',
          middle: '|'
        },
        style: {
          border: [],
          head: []
        }
      }
}

function formatThroughput (throughput) {
  return throughput ? (throughput / 1024 / 1024).toFixed(2) : 'N/A'
}
function formatRequests (requests) {
  return requests ? requests.toFixed(1) : 'N/A'
}
function formatLatency (latency) {
  return latency ? latency.toFixed(2) : 'N/A'
}

function renderPhase (results, phase, markdown) {
  const table = new Table({
    ...tableStyle(markdown),
    head: ['', 'Version', 'Router', 'Requests/s', 'Latency (ms)', 'Throughput/Mb']
  })

  if (markdown) {
    table.push([':--', '--:', '--:', ':-:', '--:', '--:'])
  }

  const sorted = [...results].sort((a, b) => parseFloat(b[phase].requests.mean) - parseFloat(a[phase].requests.mean))

  for (const result of sorted) {
    const beBold = result.server === 'fastify'
    const { hasRouter, version } = info(result.server) || {}
    const {
      requests: { average: requests },
      latency: { average: latency },
      throughput: { average: throughput }
    } = result[phase]

    table.push([
      bold(beBold, chalk.blue(result.server)),
      bold(beBold, version),
      bold(beBold, formatHasRouter(hasRouter)),
      bold(beBold, formatRequests(requests)),
      bold(beBold, formatLatency(latency)),
      bold(beBold, formatThroughput(throughput))
    ])
  }

  return table.toString()
}

function compareResults (markdown) {
  return enginesPresent()
    .map((engine) => {
      const rows = resultsForEngine(engine)
      const header = markdown ? `## ${engine}` : `=== ${engine} ===`
      const phases = PHASES
        .map(({ key, title }) => {
          const heading = markdown ? `### ${title}\n\n` : `${title}\n`
          return heading + renderPhase(rows, key, markdown)
        })
        .join('\n\n')
      return `${header}\n\n${phases}`
    })
    .join('\n\n')
}

async function compareResultsInteractive () {
  let choices = getAvailableResults()

  const firstChoice = await inquirer.prompt([{
    type: 'list',
    name: 'choice',
    message: 'What\'s your first pick?',
    choices
  }])

  choices = choices.filter(choice => choice !== firstChoice.choice)

  const secondChoice = await inquirer.prompt([{
    type: 'list',
    name: 'choice',
    message: 'What\'s your second one?',
    choices
  }])

  const [a, b] = [firstChoice.choice, secondChoice.choice]
  const result = compare(a, b)

  const fastest = chalk.bold.yellow(result.fastest)
  const fastestAverage = chalk.green(result.fastestAverage)
  const slowest = chalk.bold.yellow(result.slowest)
  const slowestAverage = chalk.green(result.slowestAverage)
  const diff = chalk.bold.green(result.diff)

  if (result === true) {
    console.log(chalk.green.bold(`${a} and ${b} both are fast!`))
    return
  }

  console.log(`
 ${chalk.blue('Both are awesome but')} ${fastest} ${chalk.blue('is')} ${diff} ${chalk.blue('faster than')} ${slowest} ${chalk.blue('on GET')}
 • ${fastest} ${chalk.blue('request average is')} ${fastestAverage}
 • ${slowest} ${chalk.blue('request average is')} ${slowestAverage}`)
}

function bold (writeBold, str) {
  return writeBold ? chalk.bold(str) : str
}

if (!getAvailableResults().length) {
  console.log(chalk.red('Benchmark to gather some results to compare.'))
} else if (opts.update) {
  updateReadme()
} else if (opts.table) {
  console.log(compareResults(opts.markdown))
} else {
  compareResultsInteractive()
}
