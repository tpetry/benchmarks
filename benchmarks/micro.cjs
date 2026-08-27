'use strict'

const http = require('node:http')
const { serve, json } = require('micro')

const server = new http.Server(
  serve(async function (req) {
    if (req.method === 'POST') {
      return json(req)
    }
    return { hello: 'world' }
  })
)

server.listen(3000)
