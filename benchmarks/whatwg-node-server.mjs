import { createServer } from 'node:http'
import { createServerAdapter, Response } from '@whatwg-node/server'

createServer(
  createServerAdapter(async (request) => {
    if (request.method === 'POST') {
      return Response.json(await request.json())
    }
    return Response.json({ hello: 'world' })
  })
).listen(3000)
