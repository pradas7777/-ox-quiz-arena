# 프론트엔드 수정 가이드

OX Quiz Arena 클라이언트(React) 구조와 수정 방법을 정리한 문서입니다.

---

## 1. 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | React 19 |
| 빌드 | Vite 7 |
| 라우팅 | wouter |
| API 클라이언트 | tRPC + React Query |
| 스타일 | Tailwind CSS v4, CSS 변수(테마) |
| UI 컴포넌트 | Radix UI 기반 (`client/src/components/ui/`) |
| 토스트 | sonner |

---

## 2. 디렉터리 구조

```
client/
├── index.html          # 진입점 HTML
├── public/             # 정적 파일 (이미지, skill.md 등)
└── src/
    ├── main.tsx        # React 진입점, tRPC/QueryClient 설정
    ├── App.tsx         # 루트 컴포넌트, 라우터 정의
    ├── index.css       # 전역 스타일, Tailwind, 테마 변수
    ├── const.ts        # 쿠키명, getLoginUrl 등 공용 상수
    ├── _core/          # 앱 핵심 훅
    │   └── hooks/
    │       └── useAuth.ts
    ├── components/     # 공용 컴포넌트
    │   ├── ui/        # shadcn 스타일 기본 UI (Button, Card, Input 등)
    │   ├── AIChatBox.tsx
    │   ├── ErrorBoundary.tsx
    │   └── ...
    ├── contexts/       # React Context (ThemeProvider 등)
    ├── hooks/          # 공용 훅
    ├── lib/            # trpc 클라이언트, cn() 등 유틸
    └── pages/          # 페이지 컴포넌트 (라우트 1:1)
        ├── Home.tsx
        ├── GameArena.tsx
        ├── Admin.tsx
        └── NotFound.tsx
```

- **경로 별칭**: `@` → `client/src`, `@shared` → `shared` (vite.config.ts, tsconfig)
- **공용 타입/상수**: `shared/` (서버·클라이언트 공유)

---

## 3. 실행 및 빌드

- **개발**: 프로젝트 루트에서 `pnpm dev` (Express + Vite 동시 실행, 프론트는 Vite가 제공)
- **프론트만 빌드**: `pnpm exec vite build` (결과물: `dist/public/`)
- **타입 체크**: `pnpm check` (tsc --noEmit)

---

## 4. 라우팅 (새 페이지 추가)

라우트는 `client/src/App.tsx`의 `<Switch>` 안에 정의합니다.

```tsx
// App.tsx
import { Route, Switch } from "wouter";
import MyPage from "./pages/MyPage";

<Switch>
  <Route path="/" component={Home} />
  <Route path="/arena" component={GameArena} />
  <Route path="/admin" component={Admin} />
  <Route path="/my-page" component={MyPage} />  {/* 새 라우트 */}
  <Route path="/404" component={NotFound} />
  <Route component={NotFound} />
</Switch>
```

- 새 페이지는 `client/src/pages/MyPage.tsx`처럼 만들고, 위처럼 `Route`에 등록하면 됩니다.
- `wouter`의 `Link` 사용: `<Link href="/my-page">이동</Link>`

---

## 5. API 호출 (tRPC)

백엔드 API는 tRPC로 타입 안전하게 호출합니다.

```tsx
import { trpc } from "@/lib/trpc";

// 쿼리 (GET)
const { data, isLoading, error, refetch } = trpc.auth.me.useQuery();
const { data: stats } = trpc.admin.getGameStats.useQuery(undefined, { refetchInterval: 5000 });

// 뮤테이션 (POST 등)
const mutation = trpc.admin.spawnBot.useMutation({
  onSuccess: () => toast.success("완료!"),
});
mutation.mutate({ nickname: "MyBot", autoPlay: true });
```

- 사용 가능한 프로시저는 `server/routers.ts`, `server/adminRouter.ts` 등에 정의되어 있습니다.
- 타입은 `AppRouter`에서 자동 추론되므로 서버 라우터만 보면 됩니다.

---

## 6. 스타일 및 테마

### Tailwind

- `client/src/index.css`에서 `@import "tailwindcss"`로 Tailwind v4 사용.
- 클래스명으로 스타일 적용: `className="flex gap-4 text-primary"`

### 테마(색상) — HEX로 수정

- 모든 테마 색은 **HEX**로 `client/src/index.css`의 `:root` / `.dark` 블록에 정의되어 있습니다.
- **수정 방법**: `:root` 안의 `--primary`, `--secondary` 등 값을 원하는 HEX로 바꾸면 됩니다.
  - 예: `--primary: #94f814;` → `--primary: #00ff88;`
  - 투명도가 필요하면 8자리 HEX 사용 (예: `--border: #94f81480;` = 50% 투명).
- 파일 상단 주석에 "테마 컬러 (HEX)" 블록이 있으므로, 그 구간만 수정하면 됩니다.
- Tailwind에서는 `text-primary`, `bg-background`, `border-border`처럼 그대로 사용.
- **기본 팔레트**: primary `#94f814`, secondary `#22d3ee`, accent `#f472b6`, background `#0a0a0a`.

### 프로젝트 전용 클래스

- `index.css` 하단에 `.cyber-button`, `.neon-text`, `.scan-line`, `.cyber-card` 등 커스텀 클래스가 있으면 그대로 사용 가능합니다.

### 다크 모드

- `ThemeProvider`(contexts/ThemeContext.tsx)가 `dark` 클래스를 `<html>`에 붙입니다.
- 기본값은 `defaultTheme="dark"`. `useTheme()`로 theme / toggleTheme 사용 가능.

---

## 7. UI 컴포넌트 사용

`client/src/components/ui/` 아래는 Radix 기반 공용 컴포넌트입니다.

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
```

- **Button**: `variant="default" | "destructive" | "outline" | "secondary" | "ghost" | "link"`, `size="default" | "sm" | "lg" | "icon"` 등.
- **스타일 합치기**: `import { cn } from "@/lib/utils";` 후 `className={cn("base-class", condition && "extra-class")}`

새 기본 UI가 필요하면 `components/ui/`에 추가하고, 기존 컴포넌트와 동일한 패턴(cva, Radix, cn)으로 맞추면 됩니다.

---

## 8. 인증(Admin/로그인)

- **useAuth**: `@/_core/hooks/useAuth`
  - `user`, `loading`, `isAuthenticated`, `logout`, `refresh`
  - 옵션: `redirectOnUnauthenticated`, `redirectPath` (기본값: getLoginUrl())
- **로그인 URL**: `getLoginUrl()` (const.ts). OAuth 미설정 시 현재 origin으로 대체되어 Invalid URL이 나지 않음.
- **Admin 페이지**: `user?.role === 'admin'`일 때만 패널 표시. 개발 모드에서는 서버가 가상 admin을 넣어주므로 로그인 없이 접근 가능.

---

## 9. 환경 변수 (프론트)

Vite는 `VITE_` 접두사가 붙은 변수만 클라이언트에 노출합니다. 프로젝트 루트 `.env`에 설정합니다.

| 변수 | 용도 |
|------|------|
| `VITE_OAUTH_PORTAL_URL` | Manus OAuth 포털 URL |
| `VITE_APP_ID` | Manus 앱 ID |
| `VITE_ANALYTICS_ENDPOINT` | Umami 등 분석 스크립트 URL (선택) |
| `VITE_ANALYTICS_WEBSITE_ID` | 분석 사이트 ID (선택) |

사용: `import.meta.env.VITE_APP_ID`

---

## 10. 자주 수정하는 파일 요약

| 목적 | 파일 |
|------|------|
| 라우트 추가/변경 | `client/src/App.tsx` |
| 새 페이지 | `client/src/pages/` 에 추가 후 App.tsx에 Route 등록 |
| 전역 스타일/테마 색 | `client/src/index.css` |
| 로그인 URL/공용 상수 | `client/src/const.ts` |
| tRPC 클라이언트 | `client/src/lib/trpc.ts` (보통 수정 없음) |
| 새 공용 컴포넌트 | `client/src/components/` |
| 기본 UI(버튼, 카드 등) | `client/src/components/ui/` |

---

## 11. 참고

- **서버 API 정의**: `server/routers.ts`, `server/adminRouter.ts`
- **배포/환경 변수**: `DEPLOYMENT.md`
- **DB 스키마/타입**: `drizzle/schema.ts`, `shared/types.ts`

추가로 궁금한 점이 있으면 팀 내부 문서나 코드 주석을 참고하면 됩니다.
