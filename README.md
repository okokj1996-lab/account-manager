# ZEUS 계정 관리

제우스 게임 계정을 한곳에서 관리하는 로컬 웹 앱입니다.

## 기능

- 계정 추가 / 수정 / 삭제
- 아이디·캐릭터·서버·메모 검색
- 상태·정렬 필터
- 비밀번호 보기 / 로그인 정보 복사
- JSON 내보내기 / 가져오기
- **친구와 공유**: 공유 방을 만들면 방 코드/초대 링크로 같은 목록을 함께 사용
- 혼자 쓸 때는 브라우저 `localStorage`에 저장

### 친구와 공유하는 방법

1. `공유 방 만들기`를 누릅니다. (현재 계정 목록이 방에 올라갑니다)
2. 복사된 초대 링크 또는 방 코드를 친구에게 보냅니다.
3. 친구는 **같은 앱 주소**에서 링크를 열거나 방 코드를 입력해 `참가`합니다.
4. 이후 추가·수정·삭제가 몇 초 안에 서로 동기화됩니다.

> 친구가 접속하려면 이 앱이 돌아가는 주소를 친구도 열 수 있어야 합니다.
> (같은 Wi-Fi의 PC IP, 또는 배포한 URL 등)
> 방 코드를 아는 사람은 목록을 볼 수 있으니, 믿을 수 있는 친구에게만 공유하세요.

### Vercel에서 공유 방 쓰기 (필수)

Vercel은 서버 파일을 저장할 수 없어서, 공유 방은 **Upstash Redis(KV)** 가 필요합니다.

1. [Vercel 대시보드](https://vercel.com/dashboard) → `zeus-deploy` 프로젝트 열기
2. **Storage** (또는 스토리지) → **Create Database** / **Create Store**
3. **Upstash Redis** (또는 KV) 선택 → 만들기
4. 이 프로젝트(`zeus-deploy`)에 **Connect** / 연결
5. **Deployments** → 최신 배포 옆 메뉴 → **Redeploy** (또는 새 zip으로 다시 배포)

환경 변수 `KV_REST_API_URL` / `KV_REST_API_TOKEN`
(또는 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) 가 생기면 공유 방이 동작합니다.

로컬(`npm run dev`)에서는 Redis 없이도 `.data/rooms` 파일로 공유 방이 동작합니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 [http://127.0.0.1:43123](http://127.0.0.1:43123) 을 엽니다.

> 개발 서버는 `127.0.0.1`에 바인딩됩니다. `localhost`로만 열면 버튼이 반응하지 않을 수 있으니 위 주소를 사용하세요.

## 스택

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
