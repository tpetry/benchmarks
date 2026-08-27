'use strict'

const express = require('express')

const app = express()

app.disable('etag')
app.disable('x-powered-by')

app.use(express.json())

app.get('/', function (_req, res) {
  res.json({ hello: 'world' })
})

app.post('/', function (req, res) {
  res.json(req.body)
})

app.listen(3000)
