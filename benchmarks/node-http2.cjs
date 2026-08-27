'use strict'

// Same bare `node:http` server as `node-http`, but written the way the micro
// frameworks (0http, restana) squeeze extra throughput out of pipelined load:
//   - the `request` listener only schedules work via `setImmediate`, so Node
//     drains and parses the whole socket buffer before any handler runs and the
//     batched `res.end` writes get coalesced;
//   - GET and POST are separate handlers, and only POST (which awaits the body)
//     pays the async cost;
//   - the `createServer` callback itself stays synchronous.

const { createServer } = require('node:http')
const { readJSON } = require('./_body.cjs')

function handleGet (_req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ hello: 'world' }))
}

async function handlePost (req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(await readJSON(req)))
}

const server = createServer(function (req, res) {
  setImmediate(() => {
    if (req.method === 'POST') {
      void handlePost(req, res)
      return
    }
    handleGet(req, res)
  })
})

server.listen(3000)
