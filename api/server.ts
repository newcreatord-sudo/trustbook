/**
 * local server entry file, for local development
 */
import type { Server } from 'node:http'
import app from './app.js'

const preferredPort = Number(process.env.PORT) || 3001
const MAX_TRIES = 20

function listenFrom(port: number, attemptsLeft: number): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    if (attemptsLeft <= 0) {
      reject(new Error(`[trustbook-api] Nessuna porta libera da ${preferredPort} a ${port - 1}`))
      return
    }
    const srv = app.listen(port, () => {
      resolve({ server: srv, port })
    })
    srv.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        srv.close(() => {
          listenFrom(port + 1, attemptsLeft - 1).then(resolve).catch(reject)
        })
      } else {
        reject(err)
      }
    })
  })
}

;(async () => {
  try {
    const { server, port } = await listenFrom(preferredPort, MAX_TRIES)
    console.log(`Server ready on port ${port}`)
    if (port !== preferredPort) {
      console.warn(
        `[trustbook-api] La porta ${preferredPort} era occupata → uso ${port}. Se il frontend non raggiunge /api, imposta in .env.local:\n` +
          `VITE_API_PROXY_TARGET=http://localhost:${port}`,
      )
    }

    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received')
      server.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })

    process.on('SIGINT', () => {
      console.log('SIGINT signal received')
      server.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
})()

export default app
