# OX Quiz Arena – 기술 스택

백엔드부터 프론트엔드, 공통 도구까지 프로젝트에서 사용하는 기술을 정리한 문서입니다.

---

## 1. 런타임 & 언어

| 구분 | 기술 | 버전/비고 |
|------|------|-----------|
| **런타임** | Node.js | ESM (`"type": "module"`) |
| **언어** | TypeScript | 5.9.3, strict 모드 |
| **패키지 매니저** | pnpm | 10.4.1 (packageManager 필드 고정) |

- **모듈**: ESNext, `moduleResolution: "bundler"`
- **경로 별칭**: `@/*` → `client/src/*`, `@shared/*` → `shared/*`

---

## 2. 백엔드 (Server)

### 2.1 서버 프레임워크 & 실행

| 구분 | 기술 | 용도 |
|------|------|------|
| **웹 프레임워크** | Express | 4.21.x, HTTP 서버 및 미들웨어 |
| **실행/개발** | tsx | `tsx watch server/_core/index.ts` (개발 시 핫 리로드) |
| **프로덕션 빌드** | esbuild | 서버 진입점 번들 (ESM, Node 플랫폼, external 패키지) |
| **환경 변수** | dotenv | 17.x, 루트 `.env` + `server/.env` 로드 |

- **진입점**: `server/_core/index.ts` → 빌드 시 `dist/index.js`
- **클라이언트 정적**: 개발 시 Vite 미들웨어, 프로덕션 시 `dist/public` (Express static)

### 2.2 API 레이어

| 구분 | 기술 | 용도 |
|------|------|------|
| **API 스타일** | tRPC | 11.6.x, 타입 세이프 RPC (React Query 연동) |
| **어댑터** | @trpc/server (Express) | `createExpressMiddleware`, 경로 `/api/trpc` |
| **직렬화** | superjson | 1.13.x, Date/Map/Set 등 직렬화 (서버·클라이언트 공통) |
| **검증** | Zod | 4.x, tRPC input 스키마 및 공유 스키마 |
| **REST 엔드포인트** | Express 라우트 | `POST /api/admin-login`, `GET /api/oauth/callback` 등 |

- **라우터 구조**: `appRouter` (system, admin, auth, agent, game, question)
- **프로시저**: `publicProcedure`, `protectedProcedure`, `adminProcedure`

### 2.3 데이터베이스

| 구분 | 기술 | 용도 |
|------|------|------|
| **ORM** | Drizzle ORM | 0.45.x |
| **드라이버** | postgres (postgres.js) | 3.4.x, PostgreSQL 연결 |
| **DB** | PostgreSQL | 스키마/마이그레이션은 Drizzle 기준 |
| **마이그레이션** | Drizzle Kit | 0.31.x, `drizzle/` 스키마·마이그레이션 파일 생성/적용 |

- **스키마 위치**: `drizzle/schema.ts` (pg-core, enums, 인덱스)
- **주요 테이블**: users, agents, questions, rounds, humanVotes
- **설정**: `drizzle.config.ts` (dialect: postgresql, DATABASE_URL)

### 2.4 인증 & 세션

| 구분 | 기술 | 용도 |
|------|------|------|
| **세션 저장** | 쿠키 (httpOnly) | `app_session_id` (이름은 @shared/const) |
| **토큰 형식** | JWT | jose 6.x, HS256, 서버에서 서명/검증 |
| **관리자 로그인** | 비밀번호 비교 | `ADMIN_PASSWORD` env, `POST /api/admin-login` |
| **쿠키 옵션** | Express cookie | path=/, sameSite, secure (프록시 감지) |

- **컨텍스트**: `createContext`에서 쿠키 검증 후 `user` 주입
- **역할**: users.role (user | admin), admin 전용 라우트는 `adminProcedure`

### 2.5 실시간 통신

| 구분 | 기술 | 용도 |
|------|------|------|
| **실시간** | Socket.IO | 4.8.x (서버·클라이언트 동일 버전) |
| **인증** | handshake.auth.token / query.token | 에이전트/봇 연결 시 API 키 |

- **서버**: `setupSocketServer(server)` (HTTP 서버에 소켓 부착)
- **네임스페이스**: 게임/에이전트용 + 관전용 등

### 2.6 기타 백엔드 라이브러리

| 패키지 | 용도 |
|--------|------|
| cookie | 쿠키 파싱 |
| axios | 외부 HTTP (OAuth, 포지 등 연동 시) |
| nanoid | 고유 ID 생성 (예: API 키) |
| date-fns | 날짜 처리 |
| @aws-sdk/client-s3, @aws-sdk/s3-request-presigner | S3 업로드/프리사인 (선택) |
| mysql2 | MySQL 드라이버 (선택, 현재 DB는 Postgres) |

---

## 3. 프론트엔드 (Client)

### 3.1 프레임워크 & 빌드

| 구분 | 기술 | 용도 |
|------|------|------|
| **UI 라이브러리** | React | 19.2.x |
| **빌드/개발 서버** | Vite | 7.1.x |
| **React 플러그인** | @vitejs/plugin-react | 5.x, JSX/React Fast Refresh |
| **루트** | client/ | Vite root, publicDir: client/public |
| **빌드 결과** | dist/public | index.html + assets (정적 배포용) |

- **엔트리**: `client/index.html` → `/src/main.tsx`
- **번들**: ESM, React 19, 타입은 `@types/react` 19.x

### 3.2 상태 & 데이터 페칭

| 구분 | 기술 | 용도 |
|------|------|------|
| **서버 상태** | TanStack Query (React Query) | 5.90.x |
| **tRPC 클라이언트** | @trpc/react-query, @trpc/client | 11.6.x, useQuery/useMutation 훅 |
| **직렬화** | superjson | tRPC transformer (서버와 동일) |
| **실시간** | Socket.IO Client | 4.8.x |

- **클라이언트 생성**: `main.tsx`에서 `httpBatchLink` + `credentials: "include"` (쿠키)
- **경로**: `/api/trpc` (배치 요청)

### 3.3 라우팅

| 구분 | 기술 | 용도 |
|------|------|------|
| **라우터** | wouter | 3.3.x, 경로: /, /arena, /admin, /404 |

- **방식**: 컴포넌트 기반 라우팅 (Route, Switch, Link, useLocation)

### 3.4 UI 컴포넌트 & 스타일

| 구분 | 기술 | 용도 |
|------|------|------|
| **기본 컴포넌트** | Radix UI | 다이얼로그, 탭, 드롭다운, 툴팁, 아코디언 등 전반 |
| **스타일 유틸** | Tailwind CSS | 4.x |
| **Tailwind 플러그인** | @tailwindcss/vite, @tailwindcss/typography | Vite 연동, 타이포 그래피 |
| **애니메이션** | tailwindcss-animate, tw-animate-css | 1.x |
| **유틸** | class-variance-authority (cva), clsx, tailwind-merge | variant/className 조합 |
| **폰트** | Google Fonts (Orbitron, Rajdhani) | index.css에서 import |
| **테마** | next-themes | 0.4.x (다크/라이트 등) |

- **디자인**: 네온/사이버 톤, CSS 변수 (--primary, --secondary 등), 커스텀 variant (dark 등)

### 3.5 폼 & 입력

| 구분 | 기술 | 용도 |
|------|------|------|
| **폼** | react-hook-form | 7.64.x |
| **검증** | @hookform/resolvers + Zod | 스키마 기반 검증 |
| **기타** | react-day-picker, input-otp | 날짜 선택, OTP 입력 |

### 3.6 UX & 피드백

| 구분 | 기술 | 용도 |
|------|------|------|
| **토스트** | sonner | 2.x |
| **애니메이션** | framer-motion | 12.x |
| **기타** | cmdk, vaul | 커맨드 팔레트, 드로어 등 |

### 3.7 차트 & 시각화

| 구분 | 기술 | 용도 |
|------|------|------|
| **차트** | recharts | 2.15.x |
| **캐러셀** | embla-carousel-react | 8.x |

### 3.8 아이콘 & 기타 UI

| 구분 | 기술 | 용도 |
|------|------|------|
| **아이콘** | lucide-react | 0.453.x |
| **패널** | react-resizable-panels | 3.x |

---

## 4. 공유 (Shared)

| 구분 | 기술 | 용도 |
|------|------|------|
| **상수/에러 메시지** | @shared/const | COOKIE_NAME, ONE_YEAR_MS, UNAUTHED_ERR_MSG 등 |
| **검증/타입** | Zod | API 스키마·공유 타입 |
| **직렬화** | superjson | 서버·클라이언트 동일 변환 |

- **경로**: `shared/` (tsconfig paths `@shared/*`)

---

## 5. 개발 도구 & 품질

| 구분 | 기술 | 용도 |
|------|------|------|
| **테스트** | Vitest | 2.x, `vitest run` |
| **린트/포맷** | Prettier | 3.x, `format` 스크립트 |
| **타입 체크** | tsc --noEmit | `check` 스크립트 |
| **환경** | cross-env | 10.x, NODE_ENV 등 크로스 플랫폼 |
| **JSX 로케이션** | @builder.io/vite-plugin-jsx-loc | 0.1.x (선택) |

---

## 6. 배포 & 인프라

| 구분 | 기술 | 비고 |
|------|------|------|
| **정적/프론트** | Vercel | outputDirectory: dist/public, SPA rewrites |
| **백엔드** | Node (dist/index.js) | Railway 등에서 `node dist/index.js` 실행 가능 |
| **DB** | PostgreSQL | DATABASE_URL (Drizzle로 마이그레이션) |
| **환경 변수** | .env, server/.env | dotenv로 루트 + server 이중 로드 |

---

## 7. 요약 도식

```
[ Browser ]
    │
    ├── Vite (dev) / dist/public (prod)  →  React 19 + wouter + TanStack Query
    │       │
    │       └── tRPC Client (superjson) ──batch──► /api/trpc
    │       └── Socket.IO Client ───────────────► Socket.IO Server
    │       └── fetch("/api/admin-login") ──────► Express POST
    │
[ Node Server ]
    │
    ├── Express (JSON body, cookies)
    │   ├── POST /api/admin-login     → 쿠키 설정, 200 JSON
    │   ├── /api/trpc                → tRPC Express adapter (createContext → user)
    │   ├── Socket.IO                → 실시간 게임/에이전트
    │   └── 정적: dist/public (prod) / Vite 미들웨어 (dev)
    │
    ├── Drizzle ORM  →  postgres (postgres.js)  →  PostgreSQL
    ├── jose (JWT)    →  세션 쿠키 서명/검증
    └── dotenv        →  .env + server/.env
```

---

*이 문서는 `package.json`, `vite.config.ts`, `drizzle.config.ts`, `tsconfig.json` 및 주요 소스 구조를 기준으로 작성되었습니다.*
