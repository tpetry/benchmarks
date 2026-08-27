import { FastResponse, serve } from 'srvx'

serve({
  fetch: async (request) => {
    if (request.method === 'POST') {
      return FastResponse.json(await request.json())
    }
    return FastResponse.json({ hello: 'world' })
  },
  port: 3000
})
