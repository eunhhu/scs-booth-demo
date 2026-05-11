# 스마트융합보안학과 보안 체험 시스템 (Packet Sniffing Demo)

이 프로젝트는 오픈 하우스 및 부스 데모용으로 제작된 **"네트워크 패킷 스니핑 체험 시스템"**입니다.
참가자가 자신의 스마트폰으로 특정 페이지에 접속하여 로그인을 시도하면, 동일 네트워크(혹은 모니터링 환경) 내의 비주얼라이저(Visualizer) 화면에 실시간으로 입력한 ID와 비밀번호 정보가 노출되는 시연용 데모입니다. 이를 통해 와이파이나 암호화되지 않은 HTTP 통신망에서 패킷 스니핑이 얼마나 쉽게 일어날 수 있는지 직관적으로 보여줍니다.

## 🏗️ 아키텍처

이 프로젝트는 3개의 마이크로 앱으로 구성된 모노레포(Workspace) 구조입니다.

- **`apps/backend` (Bun + TypeScript)**: WebSocket을 통해 클라이언트들의 접속 이벤트를 받아 Visualizer 화면에 실시간 브로드캐스트합니다.
- **`apps/participant-login` (SolidJS + Vite)**: 참가자가 자신의 스마트폰으로 접속하여 아이디/비밀번호를 입력하는 페이크(Fake) 로그인 페이지입니다.
- **`apps/visualizer` (SolidJS + Vite)**: 대형 모니터에 띄워두는 시스템으로, 접속할 수 있는 QR 코드와 함께 탈취된(?) 로그인 정보를 실시간으로 보여줍니다.

## 🚀 시작하기 (로컬 환경)

### 필수 조건
- [Bun](https://bun.sh/) 설치 (`v1.0.0` 이상)

### 설치 및 구동

```bash
# 1. 의존성 설치
bun install

# 2. 로컬 개발 서버 동시 실행 (각각 다른 터미널 탭에서 실행하세요)
bun run dev:backend
bun run dev:login
bun run dev:viz
```

> 로컬 실행 시 접속 주소:
> - **Visualizer 모니터 (시연용 PC 화면)**: `http://localhost:3001`
> - **참가자 로그인 (스마트폰 등)**: `http://localhost:3000` (비주얼라이저 화면의 QR 코드를 찍어서 접속 가능)
> - **백엔드 서버**: `http://localhost:3080`

## 🌍 외부 접속 환경 구성 (Cloudflare Tunnel, ngrok 등)

부스 시연 중 내부망(동일 와이파이) 접속이 불가능하거나 방문자가 모바일 데이터로 접속해야 하는 경우, 터널링 서비스를 통해 외부에 노출해야 합니다.
본 프로젝트는 **Host 헤더**와 **터널링 환경 프로토콜**을 자동으로 감지하여 동적으로 WebSocket 및 API URL을 안전하게 바인딩합니다.

### Cloudflare Tunnel (`cloudflared`) 사용 시 예시

3개의 터미널을 열고, 각각의 포트를 터널링합니다.

1. **백엔드 터널링**
   ```bash
   cloudflared tunnel --url http://localhost:3080
   # 터널 URL 생성 예시: https://backend-random-hash.trycloudflare.com
   ```

2. **로그인 앱 터널링**
   ```bash
   cloudflared tunnel --url http://localhost:3000
   # 터널 URL 생성 예시: https://login-random-hash.trycloudflare.com
   ```

3. **비주얼라이저 앱 터널링** (선택, 모니터용 PC를 로컬로 띄운다면 불필요)
   ```bash
   cloudflared tunnel --url http://localhost:3001
   ```

**🌟 백엔드 실행 시 터널링 도메인 세팅**

터널링 환경에서는 백엔드가 **로그인 앱의 외부 접속 URL**을 알아야 Visualizer 화면에 QR코드를 올바르게 띄울 수 있습니다. 백엔드를 구동할 때 `LOGIN_URL` 환경 변수를 넘겨줍니다.

```bash
# 백엔드 터미널에서 아래와 같이 실행합니다.
LOGIN_URL=https://login-random-hash.trycloudflare.com bun run dev:backend
```

이 상태에서 `Visualizer` 화면에 접속하면 
1. QR 코드가 `https://login-random-hash.trycloudflare.com?backend=https://backend-random-hash.trycloudflare.com` 형태로 자동 생성됩니다.
2. 참가자는 QR 코드를 찍고 접속하기만 하면, 스마트폰이 백엔드 터널을 정확히 인식해 WSS(보안 웹소켓)로 통신을 시작합니다.

## 📦 프로덕션 빌드

```bash
# 프론트엔드 앱 전체 빌드
bun run build

# 백엔드 직접 실행
bun run demo
```