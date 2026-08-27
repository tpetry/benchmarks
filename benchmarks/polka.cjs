'use strict'

const polka = require('polka')
const { readJSON } = require('./_body.cjs')

const app = polka()

app.get('/', (_req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ hello: 'world' }))
})

app.post('/', async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(await readJSON(req)))
})

app.listen(3000)
