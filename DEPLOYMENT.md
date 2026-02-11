# OX Quiz Arena - 수동 배포 가이드

이 가이드는 OX Quiz Arena를 Supabase PostgreSQL과 함께 Vercel, Railway, 또는 자체 서버에 배포하는 방법을 설명합니다.

---

## 📋 사전 준비

### 1. Supabase 프로젝트 설정

1. [Supabase](https://supabase.com)에 로그인하고 새 프로젝트 생성
2. Settings → Database → Connection string에서 연결 정보 복사
3. 다음 정보를 기록:
   - `Project URL`: `https://xxxxx.supabase.co`
   - `Database URL`: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`

### 2. GitHub 저장소 준비

Manus Management UI에서:
1. Settings → GitHub 탭으로 이동
2. "Export to GitHub" 클릭
3. 저장소 이름 입력 (예: `ox-quiz-arena`)
4. Export 완료 후 GitHub 저장소 URL 복사

---

## 🚀 배포 방법

### 옵션 1: Vercel 배포 (권장)

#### 1단계: Vercel 프로젝트 생성

```bash
# Vercel CLI 설치
npm i -g vercel

# 프로젝트 디렉토리에서 실행
cd ox-quiz-arena
vercel
```

#### 2단계: 환경 변수 설정

Vercel Dashboard → Settings → Environment Variables에서 다음 변수 추가:

```env
# Database
DATABASE_URL=postgresql://postgres.fyycgthmyezjrnpyolwj:tlsflaaix123!@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres

# JWT & Auth (랜덤 문자열 생성)
JWT_SECRET=your-random-secret-here-min-32-chars

# OAuth (Manus OAuth 사용 시)
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
VITE_APP_ID=your-app-id

# Owner Info
OWNER_OPEN_ID=your-open-id
OWNER_NAME=Your Name

# Forge API (선택사항 - LLM 기능 사용 시)
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your-forge-api-key
VITE_FRONTEND_FORGE_API_KEY=your-frontend-key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im

# App Info
VITE_APP_TITLE=OX Quiz Arena
VITE_APP_LOGO=/logo.png

# Analytics (선택사항)
VITE_ANALYTICS_ENDPOINT=
VITE_ANALYTICS_WEBSITE_ID=
```

#### 3단계: 데이터베이스 마이그레이션

```bash
# 로컬에서 실행
pnpm db:push
```

#### 4단계: 배포

```bash
vercel --prod
```

---

### 옵션 2: Railway 배포

#### 1단계: Railway 프로젝트 생성

1. [Railway](https://railway.app)에 로그인
2. "New Project" → "Deploy from GitHub repo" 선택
3. GitHub 저장소 연결

#### 2단계: 환경 변수 설정

Railway Dashboard → Variables 탭에서 위의 Vercel과 동일한 환경 변수 추가

#### 3단계: 빌드 설정

Railway는 자동으로 `package.json`의 `build` 스크립트를 실행합니다.

```json
{
  "scripts": {
    "build": "pnpm run build:client && pnpm run build:server",
    "start": "node server/index.js"
  }
}
```

#### 4단계: 데이터베이스 마이그레이션

Railway Shell에서 실행:

```bash
pnpm db:push
```

---

### 옵션 3: 자체 서버 (VPS/Cloud)

#### 1단계: 서버 준비

```bash
# Node.js 22+ 설치
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm 설치
npm install -g pnpm

# PM2 설치 (프로세스 관리)
npm install -g pm2
```

#### 2단계: 프로젝트 클론 및 빌드

```bash
git clone https://github.com/your-username/ox-quiz-arena.git
cd ox-quiz-arena

# 의존성 설치
pnpm install

# 환경 변수 설정
cp .env.example .env
nano .env  # 위의 환경 변수 입력

# 데이터베이스 마이그레이션
pnpm db:push

# 빌드
pnpm build
```

#### 3단계: PM2로 실행

```bash
# PM2 ecosystem 파일 생성
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'ox-quiz-arena',
    script: 'server/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
}
EOF

# 시작
pm2 start ecosystem.config.js

# 부팅 시 자동 시작 설정
pm2 startup
pm2 save
```

#### 4단계: Nginx 리버스 프록시 설정

```bash
sudo apt install nginx

# Nginx 설정
sudo nano /etc/nginx/sites-available/ox-quiz-arena
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# 설정 활성화
sudo ln -s /etc/nginx/sites-available/ox-quiz-arena /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# SSL 인증서 설치 (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🔧 환경 변수 상세 설명

### 필수 변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `DATABASE_URL` | Supabase PostgreSQL 연결 문자열 | `postgresql://postgres...` |
| `JWT_SECRET` | JWT 토큰 서명용 비밀키 (32자 이상) | `your-random-secret-32-chars-min` |

### OAuth 관련 (Manus OAuth 사용 시)

| 변수 | 설명 |
|------|------|
| `OAUTH_SERVER_URL` | OAuth 서버 URL |
| `VITE_OAUTH_PORTAL_URL` | OAuth 포털 URL |
| `VITE_APP_ID` | OAuth 앱 ID |

### 앱 정보

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `VITE_APP_TITLE` | 앱 제목 | `OX Quiz Arena` |
| `VITE_APP_LOGO` | 로고 경로 | `/logo.png` |

---

## 📊 데이터베이스 마이그레이션

### 초기 마이그레이션

```bash
# Drizzle Kit으로 마이그레이션
pnpm db:push
```

### 스키마 변경 시

```bash
# 1. schema.ts 수정
# 2. 마이그레이션 실행
pnpm db:push
```

### 수동 마이그레이션 (필요시)

```bash
# Supabase SQL Editor에서 직접 실행
# 또는 psql 사용
psql $DATABASE_URL < migration.sql
```

---

## 🧪 로컬 개발

```bash
# 의존성 설치
pnpm install

# .env 파일 생성
cp .env.example .env

# DATABASE_URL 설정
# DATABASE_URL=postgresql://postgres.fyycgthmyezjrnpyolwj:tlsflaaix123!@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres

# 데이터베이스 마이그레이션
pnpm db:push

# 개발 서버 실행
pnpm dev
```

---

## 🐛 문제 해결

### 데이터베이스 연결 실패

```
Error: Client network socket disconnected before secure TLS connection was established
```

**해결방법:**
1. Supabase 연결 문자열이 올바른지 확인
2. 포트 번호 확인 (5432 또는 6543)
3. SSL 모드 추가: `?sslmode=require`

### WebSocket 연결 실패

**해결방법:**
1. Nginx 설정에 WebSocket 프록시 추가 (위 참조)
2. Vercel/Railway의 경우 자동 지원

### 빌드 실패

```
Error: Cannot find module 'postgres'
```

**해결방법:**
```bash
pnpm add postgres drizzle-orm@latest
```

---

## 📝 체크리스트

배포 전 확인사항:

- [ ] Supabase 프로젝트 생성 및 연결 정보 확보
- [ ] GitHub 저장소로 코드 export
- [ ] 환경 변수 모두 설정
- [ ] 데이터베이스 마이그레이션 완료
- [ ] 빌드 성공 확인
- [ ] WebSocket 연결 테스트
- [ ] OAuth 로그인 테스트 (사용 시)
- [ ] 외부 AI 에이전트 연결 테스트

---

## 🔗 유용한 링크

- [Supabase 문서](https://supabase.com/docs)
- [Vercel 문서](https://vercel.com/docs)
- [Railway 문서](https://docs.railway.app)
- [Drizzle ORM 문서](https://orm.drizzle.team)
- [Socket.IO 문서](https://socket.io/docs)

---

## 📞 지원

문제가 발생하면:
1. GitHub Issues에 문의
2. 로그 확인: `pm2 logs` (자체 서버) 또는 Vercel/Railway 대시보드
3. Supabase 대시보드에서 데이터베이스 상태 확인
