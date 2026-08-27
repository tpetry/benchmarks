'use strict'

const connect = require('connect')
const router = require('router')()
const { readJSON } = require('./_body.cjs')

const app = connect()
router.get('/', function (_req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ hello: 'world' }))
})

router.post('/', async function (req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(await readJSON(req)))
})

app.use(router)
app.listen(3000)
