const http = require('http')
const fs = require('fs')
const path = require('path')

const DIST_DIR = path.resolve(__dirname, 'dist')
const INDEX_PATH = path.join(DIST_DIR, 'index.html')
const HOST = process.env.HOST || '127.0.0.1'
const PORT = Number(process.env.PORT) || 3000

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

function send(res, statusCode, contentType, body) {
  res.writeHead(statusCode, { 'Content-Type': contentType })
  res.end(body)
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (readErr, data) => {
    if (readErr) {
      send(res, 500, 'text/plain; charset=utf-8', 'Internal Server Error')
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    send(res, 200, contentType, data)
  })
}

function normalizePathname(rawPathname) {
  if (!rawPathname || rawPathname === '/') {
    return '/index.html'
  }

  const withoutQuery = rawPathname.split('?')[0]
  const normalized = path.posix.normalize(withoutQuery)
  if (normalized.includes('..')) {
    return null
  }

  return normalized
}

const server = http.createServer((req, res) => {
  fs.access(INDEX_PATH, fs.constants.R_OK, (accessErr) => {
    if (accessErr) {
      send(
        res,
        503,
        'text/plain; charset=utf-8',
        'Build output missing. Run "npm run build" before starting the Passenger app.'
      )
      return
    }

    const requestPath = normalizePathname(req.url || '/')
    if (!requestPath) {
      send(res, 400, 'text/plain; charset=utf-8', 'Bad Request')
      return
    }

    const filePath = path.join(DIST_DIR, requestPath)
    fs.stat(filePath, (statErr, stats) => {
      if (!statErr && stats.isFile()) {
        serveFile(filePath, res)
        return
      }

      serveFile(INDEX_PATH, res)
    })
  })
})

server.listen(PORT, HOST, () => {
  console.log(`Passenger app listening on http://${HOST}:${PORT}`)
})
