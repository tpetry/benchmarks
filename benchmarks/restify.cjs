'use strict'

const restify = require('restify')

const server = restify.createServer()
server.use(restify.plugins.bodyParser())

server.get('/', function (_req, res, next) {
  res.send({ hello: 'world' })
  return next()
})

server.post('/', function (req, res, next) {
  res.send(req.body)
  return next()
})

server.listen(3000, function () {})
