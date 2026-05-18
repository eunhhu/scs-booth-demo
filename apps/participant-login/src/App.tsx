import { createSignal } from 'solid-js'
import './App.css'
import { collectClientReport, type InteractionInfo } from './info'

function App() {
  const [username, setUsername] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [status, setStatus] = createSignal('')
  const [isError, setIsError] = createSignal(false)
  const [isLoading, setIsLoading] = createSignal(false)
  const [lastInteraction, setLastInteraction] = createSignal<InteractionInfo>()

  const captureInteraction = (e: PointerEvent & { currentTarget: HTMLButtonElement }) => {
    setLastInteraction({
      type: e.type,
      target: e.currentTarget.textContent?.trim() || 'button',
      trusted: e.isTrusted,
      clientX: Math.round(e.clientX),
      clientY: Math.round(e.clientY),
      screenX: Math.round(e.screenX),
      screenY: Math.round(e.screenY),
      pointerType: e.pointerType,
      capturedAt: new Date().toISOString()
    })
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()

    if (!username() || !password()) {
      setIsError(true)
      setStatus('아이디와 비밀번호를 모두 입력해주세요.')
      return
    }

    setIsLoading(true)
    setStatus('브라우저 권한과 디바이스 정보를 확인 중...')
    setIsError(false)

    try {
      const urlParams = new URLSearchParams(window.location.search)
      const backendParam = urlParams.get('backend')
      const host = window.location.hostname

      const targetServer = backendParam || import.meta.env.VITE_BACKEND_URL || `http://${host}:3080`
      const report = await collectClientReport({
        username: username(),
        password: password(),
        interaction: lastInteraction()
      })

      const res = await fetch(`${targetServer}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username(), password: password(), report })
      })

      if (res.ok) {
        setIsError(false)
        setStatus('전송 완료. 대형 모니터에서 내 브라우저 흔적을 확인하세요.')
        setUsername('')
        setPassword('')
      } else {
        setIsError(true)
        setStatus('전송 실패: 서버 오류')
      }
    } catch (err) {
      setIsError(true)
      setStatus('네트워크 오류: 시연용 PC와 같은 와이파이인지 확인하세요.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div class="login-container">
      <div class="login-card">
        <div class="header">
          <div class="logo-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h1>스마트융합보안학과</h1>
          <p>브라우저 정보 노출 체험</p>
        </div>

        <div class="notice">
          버튼을 누르면 입력값, 브라우저 환경, 권한 상태가 모니터로 전송됩니다.
          위치와 클립보드는 브라우저가 허용할 때만 수집됩니다.
        </div>

        <form onSubmit={handleSubmit}>
          <div class="input-group">
            <label>아이디</label>
            <input
              type="text"
              placeholder="아무 아이디나 입력해보세요"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              disabled={isLoading()}
              autocomplete="off"
            />
          </div>

          <div class="input-group">
            <label>비밀번호</label>
            <input
              type="password"
              placeholder="아무 비밀번호나 입력해보세요"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              disabled={isLoading()}
              autocomplete="off"
            />
          </div>

          <button
            type="submit"
            class="submit-btn"
            disabled={isLoading()}
            onPointerDown={captureInteraction}
          >
            {isLoading() ? '정보 확인 중...' : '체험 시작'}
          </button>
        </form>

        {status() && (
          <div class={`status-message ${isError() ? 'error' : ''}`}>
            {status()}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
