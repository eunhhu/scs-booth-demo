import { createSignal } from 'solid-js'
import './App.css'

function App() {
  const [username, setUsername] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [status, setStatus] = createSignal('')
  const [isError, setIsError] = createSignal(false)
  const [isLoading, setIsLoading] = createSignal(false)

  const handleSubmit = async (e: Event) => {
    e.preventDefault()

    if (!username() || !password()) {
      setIsError(true)
      setStatus('아이디와 비밀번호를 모두 입력해주세요.')
      return
    }

    setIsLoading(true)
    setStatus('전송 중...')
    setIsError(false)

    try {
      const urlParams = new URLSearchParams(window.location.search)
      const backendParam = urlParams.get('backend')
      const host = window.location.hostname
      
      const targetServer = backendParam || import.meta.env.VITE_BACKEND_URL || `http://${host}:3080`

      const res = await fetch(`${targetServer}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username(), password: password() })
      })

      if (res.ok) {
        setIsError(false)
        setStatus('✅ 전송 완료! 모니터 화면의 와이어샤크를 확인하세요.')
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
          <p>보안 체험 시스템 로그인</p>
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

          <button type="submit" class="submit-btn" disabled={isLoading()}>
            {isLoading() ? '패킷 전송 중...' : '시스템 접속'}
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
