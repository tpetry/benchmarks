'use strict'

const { H3, serve, readBody } = require('h3')

const app = new H3()
  .get('/', () => ({ hello: 'world' }))
  .post('/', (event) => readBody(event))

serve(app, { port: process.env.PORT || 3000 })
