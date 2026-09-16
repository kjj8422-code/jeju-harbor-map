/* 긴 플레이 점검 — 브라우저에서 99일을 끝까지 돌립니다
   ------------------------------------------------------------------
   왜 필요한가:
     로직 검수는 브라우저를 안 쓰고, 다른 UI 검수는 몇 초짜리입니다.
     "11일에서 게임이 멈춘" 사고처럼, **오래 돌려야만** 나오는 것들이 있습니다.
     화면 갱신·이벤트 처리·메모리까지 실제 브라우저에서 끝까지 확인합니다.
   실행: node design/tests/audit-longplay.mjs
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL = process.env.SG_URL || 'http://localhost:8899/samguk-99-3d.html';

const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1100,height:760} });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/CERT|fonts/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
await p.goto(URL);
await p.waitForTimeout(2000);
await p.click('#btnStart');
await p.waitForTimeout(2000);

const R = []; const ok = (n, c, d='') => R.push(`${c?'✅':'❌'} ${n}${d?' — '+d:''}`);

/* 자동으로 자원을 대주고 건물을 지어가며 9번의 대란을 전부 치릅니다.
   목적은 "이기는 것" 이 아니라 **끝까지 오류 없이 도는지** 보는 것입니다. */
const seen = { reports: 0, days: new Set(), stalls: [] };
let lastT = 0, lastDay = 0, stalled = 0;

for (let wave = 1; wave <= 9; wave++) {
  const day = wave * 11;
  await p.evaluate(d => { const S = window.__sg.S, C = window.__sg.C, Sim = window.__sg.Sim;
    S.res.wood = 900; S.res.stone = 900; S.res.iron = 400; S.res.herb = 200;
    S.res.hide = 200; S.res.essence = 60;
    S.forge = true; S.pickaxe = true;
    S.day = d - 1; S.dayT = C.DAY_SEC - 0.02;
    S.base.hp = S.base.maxHp;
    // 가끔 성을 올리고 장비를 만들어 상태 변화를 섞습니다
    if (d >= 33 && Sim.canUpgradeBase(S).ok) Sim.upgradeBase(S);
    if (d >= 44) { for (const id of ['leather','ironmail','weapon']) Sim.doCraft(S, id); }
  }, day);
  await p.waitForTimeout(900);
  await p.evaluate(() => { window.__sg.S.warnT = window.__sg.C.WARN_SEC; });
  await p.waitForTimeout(900);

  const spawned = await p.evaluate(() => window.__sg.S.monsters.length);
  if (!spawned) { ok(`${day}일 몬스터 스폰`, false, '0마리'); break; }

  // 절반만 잡고 나머지는 자연스럽게 싸우게 둡니다
  await p.evaluate(() => { const S = window.__sg.S, Sim = window.__sg.Sim;
    const n = Math.floor(S.monsters.length * 0.5);
    for (let i = 0; i < n; i++) Sim.damageMonster(S, S.monsters[0], 99999, 'hero'); });
  await p.waitForTimeout(600);
  await p.evaluate(() => { const S = window.__sg.S, Sim = window.__sg.Sim;
    while (S.monsters.length) Sim.damageMonster(S, S.monsters[0], 99999, 'trap', S.traps[0] || null); });
  await p.waitForTimeout(1100);

  const st = await p.evaluate(() => { const S = window.__sg.S; return {
    phase: S.phase, t: S.t, day: S.day, waveIdx: S.waveIdx,
    report: getComputedStyle(document.getElementById('scReport')).display,
    end: getComputedStyle(document.getElementById('scEnd')).display }; });

  if (st.phase === 'report' && st.report !== 'none') {
    seen.reports++;
    await p.click('#btnRepClose'); await p.waitForTimeout(800);
  } else if (st.end !== 'none') {
    ok(`${day}일 — 마지막 웨이브 뒤 종료 화면이 뜬다`, true);
    break;
  } else {
    ok(`${day}일 — 리포트가 뜬다`, false, `phase=${st.phase} 화면=${st.report}`);
    break;
  }

  /* 리포트를 닫은 뒤 실제로 게임이 흐르는지.
     단, 마지막 대란을 막은 뒤에는 게임이 끝나는 게 정상입니다. */
  const over = await p.evaluate(() => window.__sg.S.over);
  if (over) {
    ok('마지막 대란을 막으면 승리로 끝난다',
       await p.evaluate(() => window.__sg.S.win === true
         && getComputedStyle(document.getElementById('scEnd')).display !== 'none'));
    seen.days.add(day);
    break;
  }
  const a = await p.evaluate(() => window.__sg.S.t);
  await p.waitForTimeout(1300);
  const c = await p.evaluate(() => window.__sg.S.t);
  if (!(c > a + 0.2)) { stalled++; seen.stalls.push(day); }
  seen.days.add(day);
}

ok(`대란 ${seen.reports}회를 리포트까지 정상 처리했다`, seen.reports >= 8, `${seen.reports}회`);
ok('리포트를 닫은 뒤 멈추는 일이 한 번도 없다', stalled === 0,
   stalled ? `멈춘 일차: ${seen.stalls.join(', ')}` : '');

/* 메모리·DOM 이 새지 않는지 — 오래 돌면 화면 위 요소가 쌓일 수 있습니다 */
const dom = await p.evaluate(() => ({
  fx: document.getElementById('fxLayer').children.length,
  toast: document.getElementById('toast').children.length,
  screens: document.querySelectorAll('.screen.on').length }));
ok('화면 위 임시 요소가 쌓이지 않는다', dom.fx < 120, `fxLayer ${dom.fx}개`);
ok('토스트가 쌓이지 않는다', dom.toast <= 5, `${dom.toast}개`);

/* 끝까지 간 뒤에 다시 시작해서 조작이 되는가 */
await p.evaluate(() => { const b = document.getElementById('btnAgain'); if (b && b.offsetParent) b.click(); });
await p.waitForTimeout(700);
const onTitle = await p.evaluate(() => document.getElementById('scTitle').classList.contains('on'));
ok('끝난 뒤 "다시 한 판" 으로 시작 화면에 돌아온다', onTitle);
if (onTitle) {
  await p.click('#btnStart'); await p.waitForTimeout(2000);
  await p.keyboard.press('1'); await p.waitForTimeout(300);
  const canStill = await p.evaluate(() => !!document.querySelector('#buildDock .bdBtn.on'));
  ok('다시 시작한 판에서 조작이 된다', canStill);
  const a2 = await p.evaluate(() => window.__sg.S.t);
  await p.waitForTimeout(900);
  ok('다시 시작한 판이 실제로 돌아간다', await p.evaluate(() => window.__sg.S.t) > a2);
}

console.log('\n=== 긴 플레이 점검 (99일 완주) ===\n');
console.log(R.join('\n'));
const bad = R.filter(x => x.startsWith('❌')).length;
console.log(`\n결과: ${R.length - bad}개 통과, ${bad}개 실패`);
console.log('오류:', errs.length ? [...new Set(errs)].join('\n  ') : '없음');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
