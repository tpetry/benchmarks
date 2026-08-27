'use strict'

const Koa = require('koa')
const Router = require('@koa/router')
const { readJSON } = require('./_body.cjs')

const app = new Koa()
const router = new Router()

router.get('/', async function (ctx) {
  ctx.body = { hello: 'world' }
})

router.post('/', async function (ctx) {
  ctx.body = await readJSON(ctx.req)
})

app.use(router.routes())
app.listen(3000)
