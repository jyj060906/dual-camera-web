# 로그인·친구·팔로우 설정 (Supabase)

카메라와 사진 꾸미기는 이 설정 없이도 쓸 수 있습니다. 로그인, 프로필, 친구, 팔로우만 Supabase가 필요합니다.
설정하지 않으면 로그인 화면에 "설정되지 않았어요" 안내만 나옵니다.

## 1. 프로젝트 만들기

1. <https://supabase.com>에서 새 프로젝트를 만듭니다.
2. **SQL Editor**에 [`schema.sql`](schema.sql) 내용을 붙여 넣고 실행합니다. (여러 번 실행해도 안전합니다.)
   테이블(프로필·친구·팔로우), 접근 규칙(RLS), 프로필 사진 저장소가 한 번에 만들어집니다.

## 2. 로그인 설정 (Authentication)

| 위치 | 설정 |
| --- | --- |
| Providers → Email | **Enable email signups 켜기**, **Confirm email 끄기** (필수) |
| Providers → Email | Minimum password length를 8 이상으로 |
| URL Configuration | Site URL: `http://localhost:3000` (배포하면 실제 주소) |
| URL Configuration | Redirect URLs에 `http://localhost:3000/auth/callback` 추가 (배포 주소도 같은 형태로 추가) |

> 아이디/비밀번호 로그인은 메일을 보내지 않으므로 **Confirm email을 꺼야** 가입 직후 로그인됩니다.
> 아이디 `abc`는 내부적으로 `abc@id.dual-camera.example`로 저장됩니다(실제 메일 아님).

## 3. 앱에 연결

1. Project Settings → API에서 **Project URL**과 **anon public** 키를 복사합니다.
2. `.env.example`을 `.env.local`로 복사해 값을 채웁니다. (`.env.local`은 GitHub에 올라가지 않습니다.)
3. `npm run dev`를 다시 시작합니다.

`service_role` 키는 **절대** 이 앱에 넣지 마세요. anon 키는 공개돼도 되지만, 데이터 보호는 `schema.sql`의 규칙(RLS)이 맡습니다.

## 설정 점검

`.env.local`을 채운 뒤 아래를 실행하면 Confirm email, 구글 활성화, `schema.sql` 적용 여부를 한 번에 확인합니다. 키는 출력하지 않아서 결과를 그대로 공유해도 안전합니다.

```bash
node scripts/check-supabase.mjs
```

## 4. 구글 로그인

1. Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → **OAuth 클라이언트 ID(웹 애플리케이션)** 만들기
2. 승인된 리디렉션 URI: `https://<프로젝트 ref>.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → **Google**을 켜고 클라이언트 ID/보안 비밀번호를 넣습니다.

## 동작 규칙

- 아이디: 영문 소문자·숫자·`_` 4~20자. 한 번 정하면 바꿀 수 없고, 이미 있는 아이디로는 가입할 수 없습니다.
- 구글로 처음 들어오면 아이디를 직접 만들 때까지 친구 기능을 쓸 수 없습니다.
- 로그인 방법마다 별개 계정입니다. (아이디/비밀번호 계정과 구글 계정은 합쳐지지 않습니다.)
- 친구는 한쪽이 요청하고 상대가 수락해야 맺어집니다.
- 팔로우는 한쪽만 구독합니다. 공개 계정은 바로 팔로우되고, 비공개 계정은 승인이 필요합니다. 비공개에서 공개로 바꾸면 대기 중인 요청이 모두 승인됩니다.

## 알아둘 한계

- **비밀번호를 잊으면 찾을 수 없습니다.** 메일 주소 없이 가입하기 때문입니다.
- 아이디가 이미 쓰이고 있는지 로그인 전에 확인할 수 있어서, 누구나 특정 아이디의 존재 여부를 알 수 있습니다. (가입 시 중복을 막는 요구 때문입니다.)

## 규칙 검증 (`tests/rls.test.mjs`)

`schema.sql`을 고쳤다면 아래로 규칙이 깨지지 않았는지 확인합니다. 임시 Postgres를 띄워 가입 트리거, 아이디 중복, 남의 데이터 수정 차단,
친구·팔로우 위조 차단, 비공개 승인, 사진 폴더 권한 등을 시나리오별로 검사합니다.

```bash
npm i --no-save embedded-postgres pg
node supabase/tests/rls.test.mjs
```
