import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()
app.get('/', (c) => c.json({ hello: 'world' }))
app.post('/', async (c) => c.json(await c.req.json()))

serve(app)
