# feed-app — 내 피드 꾸미기

흑백 미니멀 톤의 피드 꾸미기 웹앱 시안 (HTML · CSS · JavaScript)

## 폴더 구조

```
feed-app/
├── index.html      내 피드 (그리드 / 번호 / 스트립 보기)
├── post.html       게시물 상세 (앞+뒤 듀얼 사진, 셀카 반응, 댓글)
├── decorate.html   꾸미기 (프레임, 캡션, 톤, 텍스트 스탬프)
├── css/style.css   모든 화면 공통 스타일
├── js/feed.js      피드 데이터와 보기 전환
└── js/decorate.js  꾸미기 화면 동작
```

## VS Code에서 열기 (Ubuntu)

1. 압축 풀기: `unzip feed-app.zip -d ~/projects`
2. VS Code로 열기: `code ~/projects/feed-app`
3. 확장 프로그램에서 **Live Server** 설치
4. `index.html`을 열고 오른쪽 아래 **Go Live** 클릭 → 브라우저에서 확인
5. 폰 크기로 보려면 브라우저에서 F12 → 기기 툴바(Ctrl+Shift+M)

## 진짜 사진 넣기

1. `images/` 폴더를 만들고 직접 찍은 사진을 넣기
2. `js/feed.js`의 `posts` 목록에서 `img: 'images/01.jpg'`처럼 경로 입력

> 직접 찍은 사진이나 무료 라이선스 사진(Unsplash 등)만 쓰기

## 폰트

Google Fonts — Archivo Narrow, IBM Plex Sans KR (둘 다 SIL Open Font License, 무료)
