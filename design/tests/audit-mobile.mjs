/* 모바일 점검 — 휴대폰에서 실제로 "게임이 되는지"
   ------------------------------------------------------------------
   왜 필요한가:
     PC 배치를 그대로 좁은 화면에 밀어 넣었더니
     문서 높이가 **1841px**(화면은 844px)이 됐습니다.
     조이스틱과 스킬 버튼이 화면 밖이라 **스크롤해야 눌렀고**,
     HUD 두 상자가 3D 화면을 거의 다 덮었습니다. 게임이 안 됐습니다.

     그래서 모바일은 전체 화면 배치(body.mob)로 따로 짭니다.
     이 점검은 "예쁜가" 가 아니라 **"엄지로 끝까지 할 수 있는가"** 를 봅니다.

   실행: node design/tests/audit-mobile.mjs   (먼저 localhost:8899 로 서버를 띄울 것)
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL = process.env.SG_URL || 'http://localhost:8899/samguk-99-3d.html';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
         + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const R = []; const ok = (n, c, d='') => R.push(`${c?'✅':'❌'} ${n}${d?' — '+d:''}`);
const errs = [];

/* ── ① 세 가지 화면 크기에서 "스크롤 없이 다 보이는가" ── */
const SIZES = [
  ['세로 · 큰 폰', { width: 390, height: 844 }],
  ['세로 · 작은 폰', { width: 360, height: 640 }],
  ['가로', { width: 844, height: 390 }],
];
for (const [tag, vp] of SIZES) {
  const ctx = await b.newContext({ viewport: vp, isMobile:true, hasTouch:true, userAgent: UA });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`${tag}: ${e.message}`));
  await p.goto(URL); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__sg.startGame('taesaja'));
  await p.waitForTimeout(1800);

  const m = await p.evaluate(() => {
    const box = id => { const e = document.getElementById(id); if (!e) return null;
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return { x:r.x, y:r.y, w:r.width, h:r.height, r:r.right, bo:r.bottom,
               vis: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 }; };
    const hit = id => { const e = document.getElementById(id); if (!e) return false;
      const r = e.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      return !!t && (t === e || e.contains(t) || t.contains(e)); };
    return {
      mob: document.body.classList.contains('mob'),
      docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth,
      vw: innerWidth, vh: innerHeight,
      stage: box('stage'), stick: box('stick'), skill: box('skillBar'), dock: box('buildDock'),
      stickHit: hit('stick'),
      skillHit: !!document.querySelector('#skillBar .skillBtn'),
      dockN: document.querySelectorAll('#buildDockRow .bdBtn').length,
      dockRows: (() => {                       // 건설 바가 몇 줄인지
        const ys = [...document.querySelectorAll('#buildDockRow .bdBtn')]
          .map(e => Math.round(e.getBoundingClientRect().y));
        return new Set(ys).size;
      })(),
    };
  });
  ok(`${tag} — 모바일 배치로 전환된다`, m.mob);
  ok(`${tag} — 세로 스크롤이 없다`, m.docH <= m.vh + 1, `문서 ${m.docH} / 화면 ${m.vh}`);
  ok(`${tag} — 가로 스크롤이 없다`, m.docW <= m.vw + 1, `문서 ${m.docW} / 화면 ${m.vw}`);
  ok(`${tag} — 무대가 화면을 채운다`, m.stage.h >= m.vh * 0.95, `${Math.round(m.stage.h)}/${m.vh}`);
  for (const [k, label] of [['stick','조이스틱'], ['skill','스킬바'], ['dock','건설 바']]) {
    const e = m[k];
    ok(`${tag} — ${label}가 화면 안에 있다`,
       e && e.vis && e.y >= 0 && e.bo <= m.vh + 1 && e.x >= 0 && e.r <= m.vw + 1,
       e ? `${Math.round(e.x)},${Math.round(e.y)} ${Math.round(e.w)}x${Math.round(e.h)}` : '없음');
  }
  ok(`${tag} — 조이스틱이 다른 것에 가려지지 않는다`, m.stickHit);
  ok(`${tag} — 건설 버튼 6개가 한 줄에 들어간다`, m.dockN === 6 && m.dockRows === 1,
     `${m.dockN}개 / ${m.dockRows}줄`);
  await ctx.close();
}

/* ── ② 엄지로 끝까지 해보기 (세로 · 큰 폰) ── */
const ctx = await b.newContext({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, userAgent: UA });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push('play: ' + e.message));
await p.goto(URL); await p.waitForTimeout(1500);

await p.tap('[data-diff="easy"]'); await p.waitForTimeout(250);
ok('난이도를 탭으로 고를 수 있다',
   await p.evaluate(() => document.querySelector('.diffCard.on')?.dataset.diff === 'easy'));
await p.tap('#btnStart'); await p.waitForTimeout(2200);
ok('탭으로 게임이 시작된다', await p.evaluate(() => !!window.__sg.S && window.__sg.S.day === 1));

/* 조이스틱을 실제로 끌어봅니다 */
const st = await (await p.$('#stick')).boundingBox();
const before = await p.evaluate(() => ({ x: window.__sg.S.hero.x, y: window.__sg.S.hero.y }));
await p.evaluate(([cx, cy]) => {
  const el = document.getElementById('stick');
  const mk = (t, x, y) => el.dispatchEvent(new PointerEvent(t,
    { pointerId: 1, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
  mk('pointerdown', cx, cy); mk('pointermove', cx + 40, cy - 40);
}, [st.x + st.width / 2, st.y + st.height / 2]);
await p.waitForTimeout(1200);
const after = await p.evaluate(() => ({ x: window.__sg.S.hero.x, y: window.__sg.S.hero.y }));
ok('조이스틱을 끌면 장수가 움직인다',
   Math.hypot(after.x - before.x, after.y - before.y) > 20,
   `${Math.hypot(after.x - before.x, after.y - before.y).toFixed(0)}유닛`);
await p.evaluate(() => document.getElementById('stick').dispatchEvent(
  new PointerEvent('pointerup', { pointerId: 1, bubbles: true, pointerType: 'touch' })));
await p.waitForTimeout(300);
/* ★ 손잡이 가운데를 56px 로 박아놨던 적이 있습니다 —
   조이스틱을 104px 로 줄이면 손잡이가 한쪽으로 치우칩니다. */
ok('손잡이가 조이스틱 한가운데로 돌아온다', await p.evaluate(() => {
  const k = document.getElementById('knob'), e = document.getElementById('stick');
  return Math.abs(parseFloat(k.style.left) - e.offsetWidth / 2) < 1.5; }));

/* 건설 — 탭으로 고르고 땅을 탭 */
await p.evaluate(() => { const S = window.__sg.S; S.res.wood = 500; S.res.stone = 500; });
await p.waitForTimeout(300);
const camp = await p.$('#buildDockRow .bdBtn:nth-child(3)');
await camp.tap(); await p.waitForTimeout(400);
ok('건설 버튼을 탭으로 고를 수 있다',
   await p.evaluate(() => !!document.querySelector('.bdBtn.on')),
   await p.evaluate(() => document.querySelector('.bdBtn.on .nm')?.textContent || '선택 안 됨'));
let built = false;
for (const [dx, dy] of [[0,-90],[70,-60],[-70,-60],[0,-150],[100,-120],[-100,-120],[120,-40]]) {
  await p.touchscreen.tap(195 + dx, 480 + dy);
  await p.waitForTimeout(350);
  const shown = await p.evaluate(() =>
    getComputedStyle(document.getElementById('buildConfirm')).display !== 'none');
  if (!shown) continue;
  if (!await p.evaluate(() => document.getElementById('btnConfirmBuild').disabled)) {
    await p.tap('#btnConfirmBuild'); await p.waitForTimeout(400);
    built = await p.evaluate(() => window.__sg.S.structs.length > 0);
    if (built) break;
  }
  await p.tap('#btnCancelBuild'); await p.waitForTimeout(200);
  await camp.tap(); await p.waitForTimeout(200);
}
ok('땅을 탭해서 실제로 지어진다', built,
   await p.evaluate(() => `시설 ${window.__sg.S.structs.length}채`));

/* 화면들이 모바일에서 열리고 닫히는가 */
/* ★ 화면을 닫을 때 'button.primary 아무거나' 를 누르면 안 됩니다 —
   상점의 첫 primary 버튼은 '닫기' 가 아니라 **10연차 뽑기** 입니다.
   실제로 그렇게 눌렀다가 상점이 안 닫혀서 게임이 멈춘 채로 남았습니다.
   폰에서는 화면이 길어 아래의 닫기까지 스크롤해야 하므로, 오른쪽 위 ✕ 로 닫습니다. */
for (const [id, scr] of [['btnGuide','scGuide'], ['btnCraft','scCraft'], ['btnShop','scShop']]) {
  await p.tap('#' + id); await p.waitForTimeout(500);
  ok(`${id} 화면이 탭으로 열린다`,
     await p.evaluate(s => document.getElementById(s).classList.contains('on'), scr));
  ok(`${id} 화면에 가로 스크롤이 없다`,
     await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok(`${id} 화면에 ✕ 버튼이 보인다`,
     await p.evaluate(() => { const x = document.getElementById('btnScreenX');
       return !!x && getComputedStyle(x).display !== 'none'; }));
  await p.tap('#btnScreenX'); await p.waitForTimeout(500);
  ok(`${id} 화면이 ✕ 로 닫힌다`,
     await p.evaluate(s => !document.getElementById(s).classList.contains('on'), scr));
}
ok('화면을 닫으면 게임 시각이 다시 흐른다', await (async () => {
  const t0 = await p.evaluate(() => window.__sg.S.t);
  await p.waitForTimeout(1200);
  return await p.evaluate(t => window.__sg.S.t > t, t0);
})());
ok('화면을 여닫은 뒤에도 스크롤이 안 생긴다',
   await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
   `${await p.evaluate(() => document.documentElement.scrollHeight)}`);

/* 밤 — 진격 배너·전황 게이지가 좁은 화면을 안 넘치는가 */
await p.evaluate(() => { const { S, C } = window.__sg; S.day = 10; S.dayT = C.DAY_SEC - 0.05; });
for (let i = 0; i < 160; i++) {
  if (await p.evaluate(() => window.__sg.S.phase === 'night')) break;
  await p.waitForTimeout(125);
}
ok('모바일에서도 밤이 시작된다', await p.evaluate(() => window.__sg.S.phase === 'night'));
const night = await p.evaluate(() => {
  const r = id => { const e = document.getElementById(id); const b = e.getBoundingClientRect();
    return { l: b.left, r: b.right, w: b.width }; };
  return { war: r('warBar'), vw: innerWidth };
});
ok('전황 게이지가 화면 밖으로 안 나간다',
   night.war.l >= -1 && night.war.r <= night.vw + 1,
   `${Math.round(night.war.l)}~${Math.round(night.war.r)} / ${night.vw}`);
/* ★ 게이지가 HUD 상자 위로 겹치면 자원 숫자를 가립니다 — 겹치는지 직접 잽니다 */
ok('전황 게이지가 HUD 상자를 가리지 않는다', await p.evaluate(() => {
  const w = document.getElementById('warBar').getBoundingClientRect();
  return [...document.querySelectorAll('#hud .hudBox')].every(e => {
    const h = e.getBoundingClientRect();
    return w.right <= h.left + 1 || w.left >= h.right - 1
        || w.bottom <= h.top + 1 || w.top >= h.bottom - 1;
  });
}), await p.evaluate(() => {
  const w = document.getElementById('warBar').getBoundingClientRect();
  return `게이지 ${Math.round(w.top)}~${Math.round(w.bottom)}`;
}));
ok('밤에도 세로 스크롤이 안 생긴다',
   await p.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
ok('전체 과정에서 오류가 없다', errs.length === 0,
   [...new Set(errs)].join(' | ').slice(0, 200));

console.log('\n=== 모바일 점검 ===\n');
console.log(R.join('\n'));
const bad = R.filter(x => x.startsWith('❌')).length;
console.log(`\n결과: ${R.length - bad}개 통과, ${bad}개 실패`);
await b.close();
process.exit(bad ? 1 : 0);
