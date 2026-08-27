import { Elysia } from 'elysia'
import { node } from '@elysia/node'

new Elysia({ adapter: node() })
  .get('/', () => ({ hello: 'world' }))
  .post('/', ({ body }) => body)
  .listen(3000)
