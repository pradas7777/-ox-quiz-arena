# OX Quiz Arena - Docker 배포 가이드

이 가이드는 OX Quiz Arena를 Docker를 사용하여 다른 컴퓨터에서 쉽게 구동하는 방법을 설명합니다.

## 사전 요구사항

- Docker 20.10 이상
- Docker Compose 2.0 이상

## 빠른 시작

### 1. 환경 변수 설정

프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 다음 내용을 입력합니다:

```bash
# Database Configuration
MYSQL_ROOT_PASSWORD=your-secure-root-password
MYSQL_DATABASE=ox_quiz_arena
MYSQL_USER=oxuser
MYSQL_PASSWORD=your-secure-password

# Application Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
OWNER_NAME=Admin
OWNER_OPEN_ID=your-owner-open-id

# Manus OAuth (선택사항 - Manus 플랫폼 사용 시)
VITE_APP_ID=your-manus-app-id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im

# Manus Forge API (선택사항 - AI 기능 사용 시)
BUILT_IN_FORGE_API_URL=https://forge.manus.im
BUILT_IN_FORGE_API_KEY=your-forge-api-key
VITE_FRONTEND_FORGE_API_KEY=your-frontend-forge-api-key
VITE_FRONTEND_FORGE_API_URL=https://forge.manus.im
```

### 2. Docker Compose로 실행

```bash
# 컨테이너 빌드 및 시작
docker-compose up -d

# 로그 확인
docker-compose logs -f app

# 데이터베이스 마이그레이션 실행 (최초 1회)
docker-compose exec app sh -c "cd /app && npx drizzle-kit generate && npx drizzle-kit migrate"
```

### 3. 애플리케이션 접속

브라우저에서 `http://localhost:3000`으로 접속합니다.

- **홈페이지**: `http://localhost:3000`
- **게임 아레나**: `http://localhost:3000/arena`
- **관리자 모드**: `http://localhost:3000/admin` (owner만 접근 가능)

## 주요 명령어

### 컨테이너 관리

```bash
# 컨테이너 시작
docker-compose up -d

# 컨테이너 중지
docker-compose down

# 컨테이너 재시작
docker-compose restart

# 컨테이너 및 볼륨 완전 삭제 (데이터 초기화)
docker-compose down -v
```

### 로그 확인

```bash
# 모든 서비스 로그
docker-compose logs -f

# 앱 로그만
docker-compose logs -f app

# 데이터베이스 로그만
docker-compose logs -f db
```

### 데이터베이스 접속

```bash
# MySQL 컨테이너에 접속
docker-compose exec db mysql -u oxuser -p ox_quiz_arena

# 또는 호스트에서 직접 접속
mysql -h 127.0.0.1 -P 3306 -u oxuser -p ox_quiz_arena
```

## 프로덕션 배포

### 1. 환경 변수 보안 강화

프로덕션 환경에서는 반드시 강력한 비밀번호와 시크릿 키를 사용하세요:

```bash
# 랜덤 JWT Secret 생성
openssl rand -base64 32

# 랜덤 MySQL 비밀번호 생성
openssl rand -base64 16
```

### 2. 포트 변경 (선택사항)

`docker-compose.yml`에서 포트를 변경할 수 있습니다:

```yaml
services:
  app:
    ports:
      - "8080:3000"  # 호스트:컨테이너
```

### 3. 리버스 프록시 설정 (Nginx 예시)

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

    # WebSocket 지원
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

## 트러블슈팅

### 데이터베이스 연결 실패

```bash
# 데이터베이스 컨테이너 상태 확인
docker-compose ps db

# 데이터베이스 헬스체크 확인
docker-compose exec db mysqladmin ping -h localhost

# 데이터베이스 재시작
docker-compose restart db
```

### 앱 컨테이너 크래시

```bash
# 로그 확인
docker-compose logs app

# 컨테이너 재빌드
docker-compose up -d --build app
```

### 포트 충돌

다른 애플리케이션이 3000 또는 3306 포트를 사용 중인 경우:

```bash
# 사용 중인 포트 확인
lsof -i :3000
lsof -i :3306

# docker-compose.yml에서 포트 변경 후 재시작
docker-compose down
docker-compose up -d
```

## 백업 및 복구

### 데이터베이스 백업

```bash
# 백업 생성
docker-compose exec db mysqldump -u oxuser -p ox_quiz_arena > backup_$(date +%Y%m%d_%H%M%S).sql

# 백업 복구
docker-compose exec -T db mysql -u oxuser -p ox_quiz_arena < backup_20260210_120000.sql
```

### 볼륨 백업

```bash
# 데이터베이스 볼륨 백업
docker run --rm -v ox-quiz-arena_mysql_data:/data -v $(pwd):/backup alpine tar czf /backup/mysql_data_backup.tar.gz /data

# 볼륨 복구
docker run --rm -v ox-quiz-arena_mysql_data:/data -v $(pwd):/backup alpine tar xzf /backup/mysql_data_backup.tar.gz -C /
```

## 개발 모드

개발 중에는 Docker 대신 로컬 환경에서 실행하는 것을 권장합니다:

```bash
# 데이터베이스만 Docker로 실행
docker-compose up -d db

# 앱은 로컬에서 실행
pnpm install
pnpm dev
```

## 지원

문제가 발생하면 다음을 확인하세요:

1. Docker 및 Docker Compose 버전
2. `.env` 파일 설정
3. 컨테이너 로그 (`docker-compose logs`)
4. 데이터베이스 연결 상태
5. 포트 충돌 여부

## 라이선스

MIT License
