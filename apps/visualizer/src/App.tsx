import { createSignal, onMount, onCleanup } from 'solid-js'
import QRCode from 'qrcode'

function App() {
  const [serverInfo, setServerInfo] = createSignal<{ ip: string; loginUrl: string; wsUrl: string } | null>(null)
  const [credentials, setCredentials] = createSignal<any[]>([])
  let canvasRef: HTMLCanvasElement | undefined
  let ws: WebSocket | undefined

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const backendParam = urlParams.get('backend')
    const host = window.location.hostname
    
    const backend = backendParam || import.meta.env.VITE_BACKEND_URL || `http://${host}:3080`
    try {
      const info = await fetch(`${backend}/api/server-info`).then((r) => r.json())
      setServerInfo(info)
      if (canvasRef) {
        QRCode.toCanvas(canvasRef, info.loginUrl, { width: 240, margin: 2 })
      }

      let wsUrl = info.wsUrl
      if (!wsUrl.includes('://')) {
        const isHttps = backend.startsWith('https')
        const wsScheme = isHttps ? 'wss' : 'ws'
        const domain = backend.replace(/^https?:\/\//, '')
        wsUrl = `${wsScheme}://${domain}/ws`
      } else if (backend.startsWith('https') && wsUrl.startsWith('ws://')) {
        wsUrl = wsUrl.replace('ws://', 'wss://')
      }

      ws = new WebSocket(wsUrl)
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.type === 'login') {
          setCredentials((prev) => [msg.data, ...prev].slice(0, 20))
        }
      }
    } catch (e) {
      console.error(e)
    }
  })

  onCleanup(() => {
    ws?.close()
  })

  return (
    <main style={{ padding: '2rem', 'max-width': '720px', margin: '0 auto' }}>
      <h1 style={{ 'font-size': '1.6rem', 'margin-bottom': '1.5rem' }}>패킷 스니핑 모니터</h1>

      <section
        style={{
          background: '#11131f',
          padding: '1.5rem',
          'border-radius': '8px',
          'margin-bottom': '1.5rem',
          border: '1px solid #1f2330'
        }}
      >
        <h2 style={{ 'font-size': '1.1rem', 'margin-bottom': '0.75rem' }}>접속 안내</h2>
        <p style={{ color: '#94a3b8', 'margin-bottom': '1rem' }}>
          아래 QR코드를 휴 대폰으로 찍어 로그인 페이지에 접속하세요.
        </p>
        <div style={{ display: 'flex', gap: '1.5rem', 'align-items': 'center', 'flex-wrap': 'wrap' }}>
          <canvas ref={(el) => (canvasRef = el)} />
          <div>
            <p style={{ 'font-size': '0.9rem', color: '#64748b' }}>로그인 페이지 URL</p>
            <p style={{ 'font-size': '1.05rem', 'word-break': 'break-all' }}>{serverInfo()?.loginUrl ?? '...'}</p>
          </div>
        </div>
      </section>

      <section style={{ background: '#11131f', padding: '1.5rem', 'border-radius': '8px', border: '1px solid #1f2330' }}>
        <h2 style={{ 'font-size': '1.1rem', 'margin-bottom': '0.75rem' }}>실시간 캡처된 로그인 정보</h2>
        {credentials().length === 0 && (
          <p style={{ color: '#64748b' }}>아직 캡처된 정보가 없습니다. QR코드로 접속 후 로그인을 시도핳보세요.</p>
        )}
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.75rem' }}>
          {credentials().map((c, i) => (
            <div
              style={{
                background: '#0b0c15',
                padding: '1rem',
                'border-radius': '6px',
                border: '1px solid #1f2330'
              }}
            >
              <div style={{ display: 'flex', gap: '1rem', 'margin-bottom': '0.5rem', 'flex-wrap': 'wrap' }}>
                <span style={{ color: '#f87171' }}>ID: {c.username}</span>
                <span style={{ color: '#60a5fa' }}>PW: {c.password}</span>
              </div>
              <div style={{ 'font-size': '0.8rem', color: '#475569' }}>
                {new Date(c.timestamp).toLocaleTimeString()} · {c.ip} · {c.userAgent}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
