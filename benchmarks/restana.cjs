'use strict'

const restana = require('restana')
const { readJSON } = require('./_body.cjs')

const app = restana()

app.get('/', (_req, res) => {
  res.send({ hello: 'world' })
})

app.post('/', async (req, res) => {
  res.send(await readJSON(req))
})

app.start(3000)
