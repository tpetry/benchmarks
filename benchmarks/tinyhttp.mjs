import { App } from '@tinyhttp/app'
import { readJSON } from './_body.mjs'

const app = new App()

app.get('/', (_req, res) => {
  res.send({ hello: 'world' })
})

app.post('/', async (req, res) => {
  res.send(await readJSON(req))
})

app.listen(3000)
