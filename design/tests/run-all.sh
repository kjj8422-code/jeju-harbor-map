#!/usr/bin/env bash
# 전체 검수 — 배포 전에 이것 하나만 돌리면 됩니다.
#   bash design/tests/run-all.sh
#
# 왜 이 파일이 있나:
#   검수가 네 종류로 나뉘어 있어서 하나를 빼먹기 쉽습니다.
#   실제로 "로직 검수는 통과했는데 화면이 죽어 있는" 상태로 배포한 적이 있습니다.
set -u
cd "$(dirname "$0")/../.."

FAIL=0
run() {  # run <이름> <명령...>
  echo ""
  echo "──────── $1 ────────"
  shift
  if "$@"; then :; else FAIL=1; echo "  ⚠️  실패"; fi
}

# 브라우저 검수를 위해 서버를 띄웁니다
if ! curl -s -o /dev/null http://localhost:8899/samguk-99-3d.html; then
  python3 -m http.server 8899 >/dev/null 2>&1 &
  SERVER=$!
  sleep 1
fi

run "① 정적 전수 점검 (코드 ↔ 화면 대조)"  node design/tests/audit-static.mjs
run "② 로직 검수"                          node design/tests/sim-test.mjs
run "③ 불변식 감시 (18판 · 규칙 40여 개)"  node design/tests/invariants.mjs 1
run "④ 건설 조작 검수"                     node design/tests/ui-build-test.mjs
run "⑤ 웨이브 진행 검수 (밤 → 낮 복귀)"    node design/tests/ui-wave-test.mjs
run "⑥ 전수 클릭 점검 (모든 버튼)"         node design/tests/audit-clicks.mjs
run "⑦ 제작소 점검 (제작 화면 전수)"      node design/tests/audit-craft.mjs
run "⑧ 밤 연출 점검 (진격·게이지·난이도)"   node design/tests/audit-night.mjs
run "⑨ 상점·가챠 점검 (확률·천장·재화)"     node design/tests/audit-shop.mjs
run "⑩ 모바일 점검 (세로·가로·터치)"        node design/tests/audit-mobile.mjs
run "⑪ 모바일 실전 (엄지로 한 판)"          node design/tests/audit-mobile-play.mjs
run "⑫ 다시 시작 점검 (판 사이 정리)"       node design/tests/audit-restart.mjs
run "⑬ 긴 플레이 점검 (99일 완주)"         node design/tests/audit-longplay.mjs

[ -n "${SERVER:-}" ] && kill $SERVER 2>/dev/null

echo ""
if [ $FAIL -eq 0 ]; then echo "✅ 전체 검수 통과"; else echo "❌ 실패한 검수가 있습니다"; fi
exit $FAIL
