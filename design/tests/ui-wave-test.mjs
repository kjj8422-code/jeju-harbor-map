/* 웨이브 한 판을 끝까지 치러보는 검수
   ------------------------------------------------------------------
   왜 이 파일이 따로 있나:
     로직 검수(sim-test)는 브라우저를 안 쓰고, 건설 검수(ui-build-test)는
     웨이브를 치르지 않습니다. 그 틈에서 게임이 **통째로 얼어붙는** 버그가
     그대로 배포됐습니다 —
       · HUD 의 밤 분기가 <b id="hDayLeft"> 를 지움
       · 다시 낮이 되는 첫 프레임에 null 참조로 TypeError
       · frame() 의 마지막 줄이던 requestAnimationFrame 에 도달 못 함
       · 다음 프레임이 예약되지 않아 게임 정지 (11일에서 멈춤)
     밤 → 리포트 → 낮으로 **되돌아오는** 경로를 아무도 밟지 않았던 것입니다.

   실행: node design/tests/ui-wave-test.mjs   (먼저 localhost:8899 로 서버를 띄울 것)
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL = process.env.SG_URL || 'http://localhost:8899/samguk-99-3d.html';

const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1100,height:800} });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/CERT|fonts/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
await p.goto(URL);
await p.waitForTimeout(2000);
await p.click('#btnStart');
await p.waitForTimeout(2000);

const R = []; const ok = (n, c, d='') => R.push(`${c?'✅':'❌'} ${n}${d?' — '+d:''}`);
const state = () => p.evaluate(() => { const S = window.__sg.S; return {
  t:+S.t.toFixed(1), day:S.day, phase:S.phase, mon:S.monsters.length, obj:S.objIdx,
  report: getComputedStyle(document.getElementById('scReport')).display,
  hPhase: document.getElementById('hPhase').textContent,
  dt: document.getElementById('dayTimer').querySelector('.dt').textContent }; });

/* 웨이브를 세 번 연달아 치릅니다 — 낮 → 예고 → 밤 → 리포트 → 낮 을 반복해야 합니다 */
for (let wave = 1; wave <= 3; wave++) {
  const day = wave * 11;
  await p.evaluate(d => { const S = window.__sg.S, C = window.__sg.C;
    S.day = d - 1; S.dayT = C.DAY_SEC - 0.02; S.base.hp = S.base.maxHp; }, day);
  await p.waitForTimeout(900);
  await p.evaluate(() => { window.__sg.S.warnT = window.__sg.C.WARN_SEC; });
  await p.waitForTimeout(900);

  let st = await state();
  ok(`${day}일 — 예고를 지나 밤이 되고 몬스터가 나온다`, st.phase === 'night' && st.mon > 0,
     `phase=${st.phase} 적=${st.mon}`);

  await p.evaluate(() => { const S = window.__sg.S, Sim = window.__sg.Sim;
    while (S.monsters.length) Sim.damageMonster(S, S.monsters[0], 99999, 'hero'); });
  await p.waitForTimeout(1000);

  st = await state();
  ok(`${day}일 — 전멸시키면 리포트 화면이 뜬다`, st.phase === 'report' && st.report !== 'none',
     `phase=${st.phase} 화면=${st.report}`);
  if (st.report === 'none') break;

  await p.click('#btnRepClose');
  await p.waitForTimeout(900);

  /* ★ 여기가 게임이 죽던 지점입니다 — 밤에서 낮으로 되돌아오는 순간 */
  st = await state();
  ok(`${day}일 — 리포트를 닫으면 낮으로 돌아온다`, st.phase === 'day', `phase=${st.phase}`);
  ok(`${day}일 — HUD 가 "다음 날까지" 로 되돌아온다`, /다음 날까지/.test(st.dt), st.dt.trim());

  const t0 = st.t;
  await p.waitForTimeout(2000);
  const st2 = await state();
  ok(`${day}일 — 리포트를 닫은 뒤 게임이 계속 돈다 (정지하지 않음)`, st2.t > t0 + 0.3,
     `게임 시각 ${t0} → ${st2.t}`);
  ok(`${day}일 — 화면 표시가 실제 단계와 어긋나지 않는다`,
     !(/낮/.test(st2.hPhase) && /전투 중/.test(st2.dt)),
     `${st2.hPhase} / ${st2.dt.trim()}`);
}

/* 리포트 화면을 강제로 숨겨도 플레이어가 갇히지 않아야 합니다 */
await p.evaluate(() => { const S = window.__sg.S, C = window.__sg.C;
  S.day = 43; S.dayT = C.DAY_SEC - 0.02; });
await p.waitForTimeout(900);
await p.evaluate(() => { window.__sg.S.warnT = window.__sg.C.WARN_SEC; });
await p.waitForTimeout(900);
await p.evaluate(() => { const S = window.__sg.S, Sim = window.__sg.Sim;
  while (S.monsters.length) Sim.damageMonster(S, S.monsters[0], 99999, 'hero'); });
await p.waitForTimeout(900);
await p.evaluate(() => {           // 화면을 강제로 닫아 "갇힌 상태" 를 만듭니다
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
});
await p.waitForTimeout(3000);
const st3 = await state();
ok('리포트 화면이 사라져도 갇히지 않고 되살아난다',
   st3.report !== 'none' || st3.phase === 'day', `phase=${st3.phase} 화면=${st3.report}`);

console.log('\n=== 웨이브 진행 검수 ===\n');
console.log(R.join('\n'));
const bad = R.filter(x => x.startsWith('❌')).length;
console.log(`\n결과: ${R.length - bad}개 통과, ${bad}개 실패`);
console.log('에러:', errs.length ? errs.join('\n') : '없음');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
