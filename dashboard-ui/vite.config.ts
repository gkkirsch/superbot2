import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'

const configPath = process.env.SUPERBOT2_HOME
  ? `${process.env.SUPERBOT2_HOME}/config.json`
  : `${process.env.HOME}/.superbot2/config.json`

// Read tunnel hostname from superbot2 config for allowedHosts
function getTunnelHost(): string[] {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const url = config.telegram?.webAppUrl
    if (url) {
      const hostname = new URL(url).hostname
      return [hostname]
    }
  } catch {}
  return []
}

function readAccessToken(): string {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return config?.telegram?.accessToken || ''
  } catch {
    return ''
  }
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=')
    if (idx > 0) {
      const key = pair.slice(0, idx).trim()
      const val = pair.slice(idx + 1).trim()
      cookies[key] = decodeURIComponent(val)
    }
  }
  return cookies
}

// Vite plugin that gates tunnel access with a rotating UUID token
function tunnelAuthPlugin(): Plugin {
  return {
    name: 'tunnel-auth',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        // Parse host from headers
        const host = req.headers.host || ''
        const hostname = host.split(':')[0]

        // Skip for localhost / private network requests
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
          return next()
        }

        // Skip if Telegram initData header is present
        if (req.headers['x-telegram-init-data']) {
          return next()
        }

        const validToken = readAccessToken()

        // No token configured — allow through
        if (!validToken) {
          return next()
        }

        // Check for token in query string
        const url = new URL(req.url || '/', `http://${host}`)
        const token = url.searchParams.get('token')

        if (token && token === validToken) {
          // Set cookie so subsequent requests work without token in URL
          res.setHeader('Set-Cookie', `sb2_access=${validToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/`)
          return next()
        }

        // Check for session cookie
        const cookies = parseCookies(req.headers.cookie || '')
        if (cookies.sb2_access && cookies.sb2_access === validToken) {
          return next()
        }

        // No valid auth — 403
        res.statusCode = 403
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Access denied. Invalid or missing access token.' }))
      })
    },
  }
}

export default defineConfig({
  plugins: [tunnelAuthPlugin(), react(), tailwindcss()],
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: parseInt(process.env.SUPERBOT2_UI_PORT || '47474', 10),
    allowedHosts: getTunnelHost(),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.SUPERBOT2_API_PORT || '3274'}`,
        changeOrigin: true,
      },
    },
  },
})
