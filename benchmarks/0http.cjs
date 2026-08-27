'use strict'

const cero = require('0http')
const { readJSON } = require('./_body.cjs')
const { router, server } = cero()

router.get('/', (_req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ hello: 'world' }))
})

router.post('/', async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(await readJSON(req)))
})

server.listen(3000)
