// Shared JSON body reader for frameworks that have no zero-config body parsing.
// Using one implementation everywhere keeps the POST rows comparable: they all
// measure "routing + a common JSON.parse", not each framework's own parser.
export function readJSON (req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}
