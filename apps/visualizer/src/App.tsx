import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import QRCode from 'qrcode'

type ServerInfo = {
  ip: string
  loginUrl: string
  wsUrl: string
  backendUrl: string
}

type InteractionInfo = {
  type?: string
  target?: string
  trusted?: boolean
  clientX?: number
  clientY?: number
  screenX?: number
  screenY?: number
  pointerType?: string
  capturedAt?: string
}

type CaptureReport = {
  capturedAt?: string
  interaction?: InteractionInfo
  form?: {
    username?: string
    password?: string
  }
  page?: Record<string, unknown>
  browser?: Record<string, unknown>
  userAgentData?: Record<string, unknown>
  device?: Record<string, unknown>
  screen?: Record<string, unknown>
  network?: Record<string, unknown>
  permissions?: Record<string, string>
  location?: {
    status?: string
    latitude?: number
    longitude?: number
    accuracy?: number
    altitude?: number | null
    speed?: number | null
    heading?: number | null
    error?: string
  }
  clipboard?: {
    status?: string
    text?: string
    length?: number
    error?: string
  }
  battery?: {
    status?: string
    charging?: boolean
    level?: number
    chargingTime?: number
    dischargingTime?: number
    error?: string
  }
}

type Credential = {
  username: string
  password: string
  timestamp: string
  ip: string
  userAgent: string
  report?: CaptureReport
}

type CaptureMessage = {
  type: 'login' | 'capture'
  data: Credential
}

type InfoRow = {
  label: string
  value: unknown
  tone?: 'good' | 'warn' | 'bad'
  description?: string
}

function resolveWsUrl(wsUrl: string, backendUrl: string): string {
  if (!wsUrl.includes('://')) {
    const isHttps = backendUrl.startsWith('https')
    const wsScheme = isHttps ? 'wss' : 'ws'
    const domain = backendUrl.replace(/^https?:\/\//, '')
    return `${wsScheme}://${domain}/ws`
  }

  if (backendUrl.startsWith('https') && wsUrl.startsWith('ws://')) {
    return wsUrl.replace('ws://', 'wss://')
  }

  return wsUrl
}

function appendViewerToken(wsUrl: string): string {
  const token = import.meta.env.VITE_VISUALIZER_TOKEN as string | undefined
  if (!token) return wsUrl

  const url = new URL(wsUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

function formatTime(value?: string): string {
  if (!value) return '-'
  return new Date(value).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '미수집'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '무한대'
  if (Array.isArray(value)) return value.length ? value.join(', ') : '없음'
  if (typeof value === 'object') return '수집됨'
  return String(value)
}

function statusTone(status?: string): 'good' | 'warn' | 'bad' {
  const value = status?.toLowerCase() ?? ''
  if (value.includes('granted') || value.includes('available')) return 'good'
  if (value.includes('denied') || value.includes('blocked') || value.includes('error')) return 'bad'
  return 'warn'
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function truncate(value: string, maxLength = 90): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function humanStatus(status?: string): string {
  const value = status?.toLowerCase() ?? ''
  if (!value) return '미수집'
  if (value.includes('granted') || value.includes('available')) return '허용됨'
  if (value.includes('denied')) return '거부됨'
  if (value.includes('blocked')) return '차단됨'
  if (value.includes('prompt')) return '아직 묻지 않음'
  if (value.includes('unsupported')) return '브라우저 미지원'
  if (value.includes('error')) return '오류'
  return status ?? '미수집'
}

function yesNo(value: unknown, yesText = '예', noText = '아니오'): string {
  const bool = asBoolean(value)
  if (bool === undefined) return '미수집'
  return bool ? yesText : noText
}

function describeBrowser(userAgent?: string): string {
  if (!userAgent) return '미수집'
  if (/Edg\//.test(userAgent)) return 'Microsoft Edge 계열'
  if (/SamsungBrowser\//.test(userAgent)) return '삼성 인터넷'
  if (/Chrome\//.test(userAgent) || /CriOS\//.test(userAgent)) return 'Chrome 계열'
  if (/Firefox\//.test(userAgent) || /FxiOS\//.test(userAgent)) return 'Firefox 계열'
  if (/Safari\//.test(userAgent)) return 'Safari 계열'
  return '알 수 없는 브라우저'
}

function describeOs(userAgent?: string, platform?: string): string {
  const source = `${userAgent ?? ''} ${platform ?? ''}`
  if (/iPhone|iPad|iPod/.test(source)) return 'iOS / iPadOS'
  if (/Android/.test(source)) return 'Android'
  if (/Mac/.test(source)) return 'macOS'
  if (/Win/.test(source)) return 'Windows'
  if (/Linux/.test(source)) return 'Linux'
  return platform || '미수집'
}

function describeLanguages(value: unknown): string {
  if (Array.isArray(value) && value.length > 0) {
    return `${value[0]} 우선, ${value.length}개 언어 노출`
  }
  const language = asString(value)
  return language ? `${language} 우선` : '미수집'
}

function describeDpr(value: unknown): string {
  const dpr = asNumber(value)
  if (!dpr) return '미수집'
  const rounded = Math.round(dpr * 100) / 100
  if (dpr >= 2) return `고밀도 화면 (${rounded}배)`
  return `일반 밀도 (${rounded}배)`
}

function describeOrientation(value: unknown): string {
  const orientation = asString(value)
  if (!orientation) return '미수집'
  if (orientation.includes('landscape')) return '가로 화면'
  if (orientation.includes('portrait')) return '세로 화면'
  return orientation
}

function describePointer(value?: string): string {
  if (value === 'mouse') return '마우스로 클릭'
  if (value === 'touch') return '손가락 터치'
  if (value === 'pen') return '펜 입력'
  return value || '미수집'
}

function describeConnection(value: unknown): string {
  const connection = asString(value)
  if (!connection) return '미수집'
  return `${connection.toUpperCase()} 수준으로 보고됨`
}

function formatCoordinate(value?: number): string {
  if (value === undefined) return '미수집'
  return value.toFixed(6)
}

function FieldPanel(props: { title: string; kicker?: string; rows: InfoRow[] }) {
  return (
    <section class="field-panel">
      <div class="panel-heading">
        <p>{props.kicker}</p>
        <h2>{props.title}</h2>
      </div>
      <dl class="info-table">
        <For each={props.rows}>
          {(row) => (
            <div class="info-row">
              <dt>{row.label}</dt>
              <dd class={row.tone ? `tone-${row.tone}` : ''}>
                <strong>{formatValue(row.value)}</strong>
                <Show when={row.description}>
                  <small>{row.description}</small>
                </Show>
              </dd>
            </div>
          )}
        </For>
      </dl>
    </section>
  )
}

function PermissionPanel(props: { permissions?: Record<string, string> }) {
  const entries = createMemo(() => Object.entries(props.permissions ?? {}))

  return (
    <section class="field-panel">
      <div class="panel-heading">
        <p>permission</p>
        <h2>권한 상태</h2>
      </div>
      <div class="permission-grid">
        <Show when={entries().length > 0} fallback={<p class="muted">권한 API 미수집</p>}>
          <For each={entries()}>
            {([name, status]) => (
              <div class={`permission-chip tone-${statusTone(status)}`}>
                <span>{name}</span>
                <strong>{humanStatus(status)}</strong>
              </div>
            )}
          </For>
        </Show>
      </div>
    </section>
  )
}

function EventItem(props: { capture: Credential; active: boolean }) {
  return (
    <article class={`event-item ${props.active ? 'is-active' : ''}`}>
      <div>
        <strong>{props.capture.username || 'anonymous'}</strong>
        <span>{props.capture.ip}</span>
      </div>
      <time>{formatTime(props.capture.timestamp)}</time>
    </article>
  )
}

function App() {
  const [captures, setCaptures] = createSignal<Credential[]>([])
  const [connectionStatus, setConnectionStatus] = createSignal('백엔드 연결 중')
  const [isConnectionError, setIsConnectionError] = createSignal(false)
  const [clock, setClock] = createSignal(new Date())
  let canvasRef: HTMLCanvasElement | undefined
  let ws: WebSocket | undefined
  let timer: number | undefined

  const activeCapture = createMemo(() => captures()[0])
  const activeReport = createMemo(() => activeCapture()?.report)
  const stats = createMemo(() => {
    const items = captures()
    return {
      total: items.length,
      uniqueIp: new Set(items.map((item) => item.ip)).size,
      locationGranted: items.filter((item) => item.report?.location?.status === 'granted').length,
      clipboardGranted: items.filter((item) => item.report?.clipboard?.status === 'granted').length
    }
  })

  onMount(async () => {
    timer = window.setInterval(() => setClock(new Date()), 1000)

    const urlParams = new URLSearchParams(window.location.search)
    const backendParam = urlParams.get('backend')
    const host = window.location.hostname
    const backend = backendParam || import.meta.env.VITE_BACKEND_URL || `http://${host}:3080`

    try {
      const res = await fetch(`${backend}/api/server-info`)
      if (!res.ok) {
        throw new Error(`server-info failed: ${res.status}`)
      }

      const info = await res.json() as ServerInfo
      if (canvasRef) {
        QRCode.toCanvas(canvasRef, info.loginUrl, {
          width: 336,
          margin: 1,
          color: {
            dark: '#031016',
            light: '#f8fafc'
          }
        }).catch(console.error)
      }

      const wsUrl = appendViewerToken(resolveWsUrl(info.wsUrl, info.backendUrl || backend))
      ws = new WebSocket(wsUrl)
      ws.onopen = () => {
        setIsConnectionError(false)
        setConnectionStatus('실시간 수신 중')
      }
      ws.onerror = () => {
        setIsConnectionError(true)
        setConnectionStatus('WebSocket 연결 실패')
      }
      ws.onclose = () => {
        setIsConnectionError(true)
        setConnectionStatus('연결 끊김')
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as CaptureMessage
          if ((msg.type === 'capture' || msg.type === 'login') && msg.data) {
            setCaptures((prev) => [msg.data, ...prev].slice(0, 40))
          }
        } catch {
          console.error('Invalid WebSocket message:', event.data)
        }
      }
    } catch (e) {
      setIsConnectionError(true)
      setConnectionStatus('백엔드 연결 실패')
      console.error(e)
    }
  })

  onCleanup(() => {
    ws?.close()
    if (timer) window.clearInterval(timer)
  })

  const credentialRows = createMemo<InfoRow[]>(() => {
    const capture = activeCapture()
    return [
      { label: 'ID', value: capture?.username },
      { label: 'PW', value: capture?.password, tone: 'bad' },
      { label: 'IP', value: capture?.ip },
      { label: '수신 시각', value: formatTime(capture?.timestamp) }
    ]
  })

  const actionRows = createMemo<InfoRow[]>(() => {
    const interaction = activeReport()?.interaction
    return [
      { label: '참여 방식', value: interaction?.type ? '버튼을 눌러 직접 참여' : undefined, description: '브라우저 권한 API는 실제 사용자 제스처가 있어야 열립니다.' },
      { label: '누른 버튼', value: interaction?.target },
      { label: '실제 클릭', value: yesNo(interaction?.trusted, '사용자 클릭으로 확인됨', '자동화/스크립트 가능성'), tone: interaction?.trusted ? 'good' : 'warn' },
      { label: '입력 장치', value: describePointer(interaction?.pointerType) },
      { label: '화면 안 위치', value: interaction?.clientX === undefined ? undefined : `왼쪽 ${interaction.clientX}px, 위 ${interaction.clientY}px`, description: '클릭한 대략 위치까지 이벤트에 남습니다.' },
      { label: '모니터 좌표', value: interaction?.screenX === undefined ? undefined : `${interaction.screenX}, ${interaction.screenY}` }
    ]
  })

  const browserRows = createMemo<InfoRow[]>(() => {
    const browser = activeReport()?.browser
    const page = activeReport()?.page
    const userAgentData = activeReport()?.userAgentData
    const userAgent = asString(browser?.userAgent ?? activeCapture()?.userAgent)
    const secureContext = asBoolean(page?.secureContext)
    const webdriver = asBoolean(browser?.webdriver)
    return [
      { label: '브라우저', value: describeBrowser(userAgent), description: '서버는 방문자가 쓰는 브라우저 종류를 추정할 수 있습니다.' },
      { label: '운영체제', value: describeOs(userAgent, asString(browser?.platform)), description: '기기 OS도 함께 추정됩니다.' },
      { label: '언어/지역', value: describeLanguages(browser?.languages ?? browser?.language), description: '한국어 우선 같은 언어 설정은 지역 추정 단서입니다.' },
      { label: '시간대', value: browser?.timezone, description: '시간대만으로도 대략적인 지역을 좁힐 수 있습니다.' },
      { label: '보안 상태', value: secureContext ? 'HTTPS/localhost 보안 컨텍스트' : '일반 HTTP', tone: secureContext ? 'good' : 'warn', description: '위치와 클립보드는 보안 컨텍스트에서만 동작합니다.' },
      { label: '쿠키', value: yesNo(browser?.cookieEnabled, '쿠키 사용 가능', '쿠키 차단됨') },
      { label: '자동화 흔적', value: webdriver ? '자동화 브라우저로 보임' : '일반 사용자 브라우저로 보임', tone: webdriver ? 'warn' : 'good' },
      { label: '고급 힌트', value: humanStatus(asString(userAgentData?.status)), description: 'Chrome 계열은 CPU 구조, 모델명 같은 추가 힌트를 줄 수 있습니다.' }
    ]
  })

  const deviceRows = createMemo<InfoRow[]>(() => {
    const device = activeReport()?.device
    const screen = activeReport()?.screen
    const threads = asNumber(device?.hardwareConcurrency)
    const memory = asNumber(device?.deviceMemory)
    const viewportWidth = asNumber(screen?.viewportWidth)
    const viewportHeight = asNumber(screen?.viewportHeight)
    const screenWidth = asNumber(screen?.width)
    const screenHeight = asNumber(screen?.height)
    return [
      { label: 'CPU 규모', value: threads ? `논리 코어 ${threads}개` : undefined, description: '정확한 모델명은 아니지만 기기 성능을 추정할 수 있습니다.' },
      { label: '메모리 힌트', value: memory ? `약 ${memory}GB` : undefined },
      { label: '입력 방식', value: asBoolean(device?.touchSupport) ? '터치 기기 가능성 높음' : '마우스/키보드 중심', description: `터치 포인트 ${formatValue(device?.maxTouchPoints)}개` },
      { label: '브라우저 창', value: viewportWidth ? `${viewportWidth} x ${viewportHeight}` : undefined },
      { label: '전체 화면', value: screenWidth ? `${screenWidth} x ${screenHeight}` : undefined, description: '화면 크기는 PC/태블릿/폰 구분 단서입니다.' },
      { label: '화면 밀도', value: describeDpr(screen?.devicePixelRatio) },
      { label: '화면 방향', value: describeOrientation(screen?.orientation) }
    ]
  })

  const networkRows = createMemo<InfoRow[]>(() => {
    const network = activeReport()?.network
    const online = asBoolean(network?.online)
    return [
      { label: '인터넷', value: online ? '연결됨' : '끊김/확인 불가', tone: online ? 'good' : 'bad' },
      { label: '체감 속도', value: describeConnection(network?.effectiveType), description: '브라우저가 네트워크 품질을 대략 보고합니다.' },
      { label: '다운로드 힌트', value: network?.downlink ? `약 ${network.downlink} Mbps` : undefined },
      { label: '지연시간', value: network?.rtt ? `약 ${network.rtt}ms` : undefined },
      { label: '데이터 절약', value: yesNo(network?.saveData, '절약 모드 켜짐', '절약 모드 꺼짐') },
      { label: '연결 타입', value: network?.type ? `${network.type} 연결` : undefined }
    ]
  })

  const locationRows = createMemo<InfoRow[]>(() => {
    const location = activeReport()?.location
    const granted = location?.status === 'granted'
    return [
      { label: '위치 권한', value: humanStatus(location?.status), tone: statusTone(location?.status), description: granted ? '위도와 경도까지 전달됐습니다.' : '사용자가 거부했거나 브라우저가 제한했습니다.' },
      { label: '좌표', value: granted ? `${formatCoordinate(location?.latitude)}, ${formatCoordinate(location?.longitude)}` : '좌표 미노출' },
      { label: '정확도', value: location?.accuracy ? `반경 약 ${Math.round(location.accuracy)}m` : undefined },
      { label: '추가 정보', value: location?.altitude ? `고도 ${location.altitude}m` : '고도/속도 미수집' },
      { label: '실패 이유', value: location?.error ? location.error.replace(/^\d+:\s*/, '') : undefined, tone: location?.error ? 'bad' : undefined }
    ]
  })

  const clipboardRows = createMemo<InfoRow[]>(() => {
    const clipboard = activeReport()?.clipboard
    const text = clipboard?.text ?? ''
    return [
      { label: '읽기 결과', value: humanStatus(clipboard?.status), tone: statusTone(clipboard?.status), description: '클립보드는 버튼 클릭과 권한 허용이 있을 때만 읽힙니다.' },
      { label: '내용 길이', value: clipboard?.length === undefined ? undefined : `${clipboard.length}자` },
      { label: '보인 내용', value: text ? truncate(text) : '비어 있거나 차단됨', tone: text ? 'bad' : undefined },
      { label: '실패 이유', value: clipboard?.error, tone: clipboard?.error ? 'bad' : undefined }
    ]
  })

  const batteryRows = createMemo<InfoRow[]>(() => {
    const battery = activeReport()?.battery
    return [
      { label: '지원 여부', value: humanStatus(battery?.status), tone: statusTone(battery?.status) },
      { label: '충전 상태', value: yesNo(battery?.charging, '충전 중', '배터리 사용 중') },
      { label: '잔량', value: battery?.level === undefined ? undefined : `${Math.round(battery.level * 100)}%`, description: '지원 브라우저에서는 배터리 상태도 노출될 수 있습니다.' },
      { label: '오류', value: battery?.error, tone: battery?.error ? 'bad' : undefined }
    ]
  })

  return (
    <main class="viz-shell">
      <header class="viz-header">
        <div>
          <p class="eyebrow">SCS Booth Demo</p>
          <h1>브라우저 정보 노출 현황판</h1>
        </div>
        <div class="header-status">
          <span class={`live-pill ${isConnectionError() ? 'is-error' : 'is-live'}`}>
            {connectionStatus()}
          </span>
          <time>{clock().toLocaleString('ko-KR')}</time>
        </div>
      </header>

      <section class="top-grid">
        <article class="qr-panel">
          <canvas ref={(el) => (canvasRef = el)} role="img" aria-label="참가자 접속 QR 코드" />
          <div class="qr-copy">
            <p class="panel-label">참가자 접속 QR</p>
            <strong>남은 에어팟 상품 2개!</strong>
            <span>QR을 스캔해 가상 쇼핑몰 보안 체험을 시작하세요.</span>
            <small>보안 체험용 모의 페이지입니다. 실제 계정 정보는 입력하지 마세요.</small>
          </div>
        </article>

        <article class="metric-panel">
          <div>
            <span>총 수신</span>
            <strong>{stats().total}</strong>
          </div>
          <div>
            <span>고유 IP</span>
            <strong>{stats().uniqueIp}</strong>
          </div>
          <div>
            <span>위치 허용</span>
            <strong>{stats().locationGranted}</strong>
          </div>
          <div>
            <span>클립보드 허용</span>
            <strong>{stats().clipboardGranted}</strong>
          </div>
        </article>
      </section>

      <section class="main-grid">
        <aside class="event-stream">
          <div class="stream-heading">
            <p class="panel-label">Live Events</p>
            <h2>실시간 참가자</h2>
          </div>
          <Show
            when={captures().length > 0}
            fallback={<p class="empty-state">아직 수신된 정보가 없습니다. QR 접속 후 체험 시작 버튼을 누르세요.</p>}
          >
            <For each={captures()}>
              {(capture, index) => <EventItem capture={capture} active={index() === 0} />}
            </For>
          </Show>
        </aside>

        <section class="detail-board">
          <Show
            when={activeCapture()}
            fallback={<div class="waiting-board">대기 중</div>}
          >
            <div class="credential-strip">
              <For each={credentialRows()}>
                {(row) => (
                  <div class={row.tone ? `tone-${row.tone}` : ''}>
                    <span>{row.label}</span>
                    <strong>{formatValue(row.value)}</strong>
                  </div>
                )}
              </For>
            </div>

            <div class="section-grid">
              <FieldPanel title="클릭 액션" kicker="gesture" rows={actionRows()} />
              <FieldPanel title="브라우저" kicker="browser" rows={browserRows()} />
              <FieldPanel title="디바이스/화면" kicker="hardware" rows={deviceRows()} />
              <FieldPanel title="네트워크" kicker="network" rows={networkRows()} />
              <FieldPanel title="위치" kicker="location" rows={locationRows()} />
              <FieldPanel title="클립보드" kicker="clipboard" rows={clipboardRows()} />
              <FieldPanel title="배터리" kicker="battery" rows={batteryRows()} />
              <PermissionPanel permissions={activeReport()?.permissions} />
            </div>
          </Show>
        </section>
      </section>
    </main>
  )
}

export default App
