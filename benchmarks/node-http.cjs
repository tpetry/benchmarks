'use strict'

const { readJSON } = require('./_body.cjs')

const server = require('node:http').createServer(async function (req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  if (req.method === 'POST') {
    res.end(JSON.stringify(await readJSON(req)))
    return
  }
  res.end(JSON.stringify({ hello: 'world' }))
})

server.listen(3000)
