'use strict'

// uWebSockets.js does NOT sit on top of `node:http` — it ships its own HTTP
// server (C++), so it cannot reuse the shared `_body.cjs` reader and its handler
// API is event-based. Two things the library requires for a correct handler:
//   - `res.onAborted(...)` must be registered before the first async gap, or uWS
//     tears the response state down under you;
//   - `res.cork(...)` batches the header + body writes into a single send, which
//     is also how the library's own examples do it.

const uWS = require('uWebSockets.js')

const CONTENT_TYPE = 'content-type'
const JSON_UTF8 = 'application/json; charset=utf-8'
const HELLO = JSON.stringify({ hello: 'world' })

const app = uWS.App()

app.get('/', (res) => {
  res.cork(() => {
    res.writeHeader(CONTENT_TYPE, JSON_UTF8)
    res.end(HELLO)
  })
})

app.post('/', (res) => {
  let aborted = false
  res.onAborted(() => { aborted = true })

  let buffered
  res.onData((ab, isLast) => {
    // `ab` is an ArrayBuffer valid only for this call; Buffer.from is a view, so
    // anything kept past the callback has to be copied (Buffer.concat does that).
    const chunk = Buffer.from(ab)

    if (!isLast) {
      buffered = buffered ? Buffer.concat([buffered, chunk]) : Buffer.concat([chunk])
      return
    }

    const full = buffered ? Buffer.concat([buffered, chunk]) : chunk
    const parsed = full.length ? JSON.parse(full) : {}
    if (aborted) return

    res.cork(() => {
      res.writeHeader(CONTENT_TYPE, JSON_UTF8)
      res.end(JSON.stringify(parsed))
    })
  })
})

app.listen('127.0.0.1', 3000, (token) => {
  if (!token) process.exit(1)
})
