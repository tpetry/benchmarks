import pkgJson from '../package.json' with { type: 'json' }
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);

// The HTTP servers run inside the `node:*` container image (see lib/bench.js),
// so `node-http` should be attributed to that image's Node, not the host's. The
// benchmark run writes the image version here; fall back to the host otherwise.
let nodeHttpVersion = process.version
try {
  nodeHttpVersion = readFileSync(resolve('.container-node-version'), 'utf8').trim() || process.version
} catch {
  // benchmark has not run yet, or ran on the host
}

const packages = {
  '0http': { hasRouter: true, package: '0http' },
  'adonisjs': { hasRouter: true, package: '@adonisjs/http-server' },
  connect: {},
  'connect-router': { extra: true, package: 'router', hasRouter: true },
  elysia: { hasRouter: true },
  express: { hasRouter: true },
  'express-with-middlewares': { extra: true, package: 'express', hasRouter: true },
  fastify: { checked: true, hasRouter: true },
  'fastify-big-json': { extra: true, package: 'fastify', hasRouter: true },
  h3: { package: 'h3', hasRouter: true },
  hapi: { hasRouter: true, package: '@hapi/hapi' },
  hono: { hasRouter: true, package: 'hono' },
  koa: {},
  'koa-router': { extra: true, hasRouter: true, package: '@koa/router' },
  micro: { extra: true },
  microrouter: { extra: true, hasRouter: true },
  'node-http': { version: nodeHttpVersion },
  'node-http2': { version: nodeHttpVersion },
  polka: { hasRouter: true },
  restana: { hasRouter: true, package: 'restana' },
  restify: { hasRouter: true },
	'srvx': { package: 'srvx' },
  'trpc-router': { extra: true, hasRouter: true, package: '@trpc/server' },
  uwebsockets: { hasRouter: true, package: 'uWebSockets.js' },
  'whatwg-node-server': { package: '@whatwg-node/server' },
}

const _choices = []
Object.keys(packages).forEach(pkg => {
  if (!packages[pkg].version) {
    const module = pkgJson.dependencies[pkg] ? pkg : packages[pkg].package
    const version = require(resolve(`node_modules/${module}/package.json`)).version
    packages[pkg].version = version
  }
  _choices.push(pkg)
})

export const choices = _choices.sort()
export function list(extra = false) {
  return _choices
    .map(c => {
      return extra === !!packages[c].extra
        ? Object.assign({}, packages[c], { name: c })
        : null
    })
    .filter(c => c)
}
export function info(module) {
  return packages[module]
}
