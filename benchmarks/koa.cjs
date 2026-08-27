'use strict'

const Koa = require('koa')
const { readJSON } = require('./_body.cjs')
const app = new Koa()

app.use(async ctx => {
  if (ctx.method === 'POST') {
    ctx.body = await readJSON(ctx.req)
    return
  }
  ctx.body = { hello: 'world' }
})

const _server = app.listen(3000)

process.on('SIGINT', () => {
  _server.close()
})
