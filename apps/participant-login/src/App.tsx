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
          <div class="demo-label">보안 체험용 모의 로그인</div>
          <h1>NAVER</h1>
          <p>로그인하여 계속 구매하기</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div class="login-fieldset">
            <div class="input-group">
              <label for="demo-username">아이디</label>
              <input
                id="demo-username"
                type="text"
                placeholder="아이디"
                value={username()}
                onInput={(e) => setUsername(e.currentTarget.value)}
                disabled={isLoading()}
                autocomplete="off"
              />
            </div>

            <div class="input-group">
              <label for="demo-password">비밀번호</label>
              <input
                id="demo-password"
                type="password"
                placeholder="비밀번호"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                disabled={isLoading()}
                autocomplete="off"
              />
            </div>
          </div>

          <label class="keep-login">
            <input type="checkbox" disabled={isLoading()} />
            <span>로그인 상태 유지</span>
          </label>

          <button
            type="submit"
            class="submit-btn"
            disabled={isLoading()}
            onPointerDown={captureInteraction}
          >
            {isLoading() ? '로그인 확인 중...' : '로그인'}
          </button>
        </form>

        <nav class="helper-links" aria-label="체험용 로그인 도움말">
          <span>비밀번호 찾기</span>
          <span>아이디 찾기</span>
          <span>체험 안내</span>
        </nav>

        <p class="safe-caption">스마트융합보안학과 보안 체험 페이지입니다. 실제 계정 정보는 입력하지 마세요.</p>

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
