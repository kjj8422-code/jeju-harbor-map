# 이 프로젝트 전용 규칙 (jeju-harbor-map)

공통 규칙(계획 먼저 설명, 생략 없는 전체 코드, 원인 진단 우선, DRY/클린코드/에러처리/
반응형/보안 등)은 상위 폴더의 [`../CLAUDE.md`](../CLAUDE.md)를 그대로 따른다.

## 이 프로젝트만의 예외: 기술 스택
- 상위 CLAUDE.md의 "Next.js / TypeScript / Zustand" 규칙은 **이 프로젝트엔 적용하지 않는다.**
- 이 프로젝트는 **순수 HTML + CSS + JS 파일 1개(`index.html`)** 구조를 그대로 유지한다
  (빌드 과정 없음, `npm install` 불필요).
- 이유: GitHub Pages 무료 호스팅 + 빌드 없이 즉시 수정·배포 가능 + 이미 완성도 높은
  라이브 서비스라 구조를 바꿀 이유가 없음.
- 새 기능을 추가할 때도 이 구조(단일 HTML, 바닐라 JS)를 유지한다. 데이터 배열은
  `const DATA = [...]`, `const RULES = [...]`, `const ORGS = [...]` 형태로
  `index.html` 안에 있다 (정확한 위치는 텍스트 검색으로 찾을 것, 줄 번호는 수시로 바뀜).

## 배포 방법
```bash
git add -A
git commit -m "수정 내용 설명"
git push
```
푸시가 성공하면 1~2분 내 자동으로 아래 라이브 사이트에 반영된다.

- 라이브 사이트: https://kjj8422-code.github.io/jeju-harbor-map/
- 저장소: https://github.com/kjj8422-code/jeju-harbor-map
- 자세한 배경/데이터 출처: [`HANDOFF.md`](HANDOFF.md)
