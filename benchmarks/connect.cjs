'use strict'

const connect = require('connect')
const { readJSON } = require('./_body.cjs')

const app = connect()
app.use(async function (req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  if (req.method === 'POST') {
    res.end(JSON.stringify(await readJSON(req)))
    return
  }
  res.end(JSON.stringify({ hello: 'world' }))
})

app.listen(3000)
