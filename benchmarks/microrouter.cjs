'use strict'

const http = require('node:http')
const { serve, send, json } = require('micro')
const { router, get, post } = require('microrouter')

const hello = async function (_req, res) {
  return send(res, 200, { hello: 'world' })
}
const echo = async function (req, res) {
  return send(res, 200, await json(req))
}
const server = new http.Server(serve(router(get('/', hello), post('/', echo))))

server.listen(3000)
