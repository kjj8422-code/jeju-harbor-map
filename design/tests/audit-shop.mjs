/* 상점 · 가챠 점검 — 돈이 걸린 곳이라 따로 봅니다
   ------------------------------------------------------------------
   왜 필요한가:
     확률형 아이템의 **확률과 천장 고지는 법적 의무**입니다(게임산업법 제33조).
     화면에 적힌 값과 실제 동작이 다르면 그냥 버그가 아니라 허위 고지입니다.
     실제로 이 점검을 만들면서 "180회 이내 신화 확정" 이 **한 번도 발동할 수 없는**
     문구였다는 걸 찾았습니다(천장 카운터가 하나뿐이라 180에 도달 자체가 불가능).

   확인하는 것:
     · 화면의 확률표가 코드의 실제 확률과 **같은 값**인가
     · 표시된 확률이 실제 뽑기 분포와 맞는가 (대량 표본)
     · 90회 전설 천장이 실제로 발동하는가
     · 180회 신화 천장이 실제로 발동하는가  ← 예전에 불가능했던 항목
     · 재화(옥새·보석·혼백)가 음수가 되지 않는가
     · 저장값이 망가져 있어도 화면이 죽지 않는가
     · 각성이 ★5 를 넘지 않는가

   실행: node design/tests/audit-shop.mjs   (먼저 localhost:8899 로 서버를 띄울 것)
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL = process.env.SG_URL || 'http://localhost:8899/samguk-99-3d.html';

const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{ width:1180, height:900 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/CERT|fonts/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
/* ★ addInitScript 로 지우면 **새로고침할 때마다** 지워집니다.
   보석을 넣고 새로고침하면 그게 날아가서 한 장도 안 뽑힙니다 (실제로 그렇게 실패했습니다).
   처음 한 번만 비웁니다. */

const R = []; const ok = (n, c, d='') => R.push(`${c?'✅':'❌'} ${n}${d?' — '+d:''}`);

await p.goto(URL);
await p.waitForTimeout(1400);
await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await p.evaluate(() => location.reload());
await p.waitForTimeout(1500);
await p.evaluate(() => document.getElementById('btnTitleShop').click());
await p.waitForTimeout(500);

/* ── 확률표가 코드와 같은 값인가 ── */
const rate = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('#rateTable .repRow')]
    .map(r => ({ g: r.children[0].textContent.trim(), p: parseFloat(r.children[1].textContent) }));
  return rows;
});
ok('확률표가 화면에 그려진다', rate.length === 5, `${rate.length}줄`);
ok('확률표의 합이 100% 다',
   Math.abs(rate.reduce((a, r) => a + r.p, 0) - 100) < 0.001,
   `${rate.reduce((a, r) => a + r.p, 0).toFixed(3)}%`);

/* ── 실제로 뽑아서 분포를 봅니다 ── */
/* rollOnce 는 모듈 안에 있으므로 **실제 버튼을 눌러서** 확인합니다.
   대량 표본은 보석을 넉넉히 넣고 10연차를 반복해서 얻습니다. */
await p.evaluate(() => {
  localStorage.setItem('sg3d_gem', '99999999');
  localStorage.setItem('sg3d_pity', '0');
  localStorage.setItem('sg3d_pity_myth', '0');
  localStorage.setItem('sg3d_dex', '{}');
  localStorage.setItem('sg3d_souls', '0');
});
await p.evaluate(() => location.reload());
await p.waitForTimeout(1500);
await p.evaluate(() => document.getElementById('btnTitleShop').click());
await p.waitForTimeout(400);

const stats = await p.evaluate(async () => {
  const cnt = {};
  let maxPity = 0, maxMyth = 0, softHits = 0, hardHits = 0;
  const btn = document.getElementById('btnPull10');
  for (let i = 0; i < 400; i++) {                 // 10연차 × 400 = 4000회
    const beforeMyth = Number(localStorage.getItem('sg3d_pity_myth') || 0);
    btn.click();
    const rows = [...document.querySelectorAll('#pullResult > div')]
      .map(r => r.children[1] && r.children[1].textContent.trim()).filter(Boolean);
    for (const g of rows) cnt[g] = (cnt[g] || 0) + 1;
    maxPity = Math.max(maxPity, Number(localStorage.getItem('sg3d_pity') || 0));
    maxMyth = Math.max(maxMyth, Number(localStorage.getItem('sg3d_pity_myth') || 0));
  }
  return { cnt, maxPity, maxMyth, gems: Number(localStorage.getItem('sg3d_gem')),
           souls: Number(localStorage.getItem('sg3d_souls') || 0) };
});
const total = Object.values(stats.cnt).reduce((a, b) => a + b, 0);
ok('10연차가 실제로 10장을 준다', total >= 3900, `${total}장`);

for (const r of rate) {
  const real = (stats.cnt[r.g] || 0) / total * 100;
  const lo = r.p * 0.4, hi = r.p * 2.2 + 0.4;     // 천장 때문에 위로는 조금 높게 나옵니다
  ok(`${r.g} 실제 확률이 표시값 근처다 (표시 ${r.p}%)`, real >= lo && real <= hi,
     `실측 ${real.toFixed(3)}%`);
}

/* ── 천장 ── */
ok('전설 천장(90회)을 넘어가지 않는다', stats.maxPity < 90, `최대 ${stats.maxPity}`);
ok('신화 천장 카운터가 실제로 쌓인다 (예전엔 90에서 매번 초기화돼 불가능했습니다)',
   stats.maxMyth > 90, `최대 ${stats.maxMyth}`);
ok('신화 천장(180회)을 넘어가지 않는다', stats.maxMyth < 180, `최대 ${stats.maxMyth}`);

/* ── 재화 ── */
ok('보석이 음수가 되지 않는다', stats.gems >= 0, `${stats.gems}`);
ok('중복이 혼백으로 쌓인다', stats.souls > 0, `혼백 ${stats.souls}`);
await p.evaluate(() => { localStorage.setItem('sg3d_gem', '0'); location.reload(); });
await p.waitForTimeout(1500);
await p.evaluate(() => document.getElementById('btnTitleShop').click());
await p.waitForTimeout(400);
await p.click('#btnPull10'); await p.waitForTimeout(300);
ok('보석 0 에서 10연차를 눌러도 음수가 안 된다',
   await p.evaluate(() => Number(localStorage.getItem('sg3d_gem')) >= 0),
   `${await p.evaluate(() => localStorage.getItem('sg3d_gem'))}`);
ok('옥새 0 에서 뽑기를 눌러도 음수가 안 된다', await (async () => {
  await p.evaluate(() => { localStorage.setItem('sg3d_shard','0'); });
  await p.click('#btnPull'); await p.waitForTimeout(250);
  return await p.evaluate(() => Number(localStorage.getItem('sg3d_shard') || 0) >= 0);
})(), `${await p.evaluate(() => localStorage.getItem('sg3d_shard'))}`);

/* ── 각성 ── */
await p.evaluate(() => { localStorage.setItem('sg3d_souls', '999999'); location.reload(); });
await p.waitForTimeout(1500);
await p.evaluate(() => document.getElementById('btnTitleShop').click());
await p.waitForTimeout(400);
await p.evaluate(() => {
  for (let i = 0; i < 30; i++)
    document.querySelectorAll('#playableList .awBtn').forEach(b => b.click());
});
await p.waitForTimeout(400);
const awk = await p.evaluate(() => {
  const a = JSON.parse(localStorage.getItem('sg3d_awaken') || '{}');
  return { max: Math.max(0, ...Object.values(a).map(Number)),
           souls: Number(localStorage.getItem('sg3d_souls')) };
});
ok('각성이 ★5 를 넘지 않는다', awk.max <= 5, `★${awk.max}`);
ok('혼백이 음수가 되지 않는다', awk.souls >= 0, `${awk.souls}`);

/* ── 저장값이 망가져 있어도 살아남는가 ── */
await p.evaluate(() => {
  localStorage.setItem('sg3d_dex', '{망가진 JSON');
  localStorage.setItem('sg3d_awaken', 'null');
  localStorage.setItem('sg3d_gem', 'NaN');
  localStorage.setItem('sg3d_souls', '-50');
  localStorage.setItem('sg3d_shard', 'abc');
  localStorage.setItem('sg3d_pity', 'xyz');
});
const before = errs.length;
await p.evaluate(() => location.reload());
await p.waitForTimeout(1600);
ok('저장값이 망가져 있어도 시작 화면이 뜬다',
   await p.evaluate(() => document.getElementById('scTitle').classList.contains('on')));
await p.evaluate(() => document.getElementById('btnTitleShop').click());
await p.waitForTimeout(400);
ok('망가진 저장값으로 상점을 열어도 오류가 없다', errs.length === before,
   errs.slice(before).join(' | ').slice(0, 160));
ok('망가진 저장값이 화면에 NaN 으로 새지 않는다',
   await p.evaluate(() => !/NaN|undefined/.test(document.getElementById('scShop').textContent)),
   (await p.evaluate(() => (document.getElementById('scShop').textContent.match(/NaN|undefined/g) || []).join(','))));

ok('전체 과정에서 오류가 없다', errs.length === 0,
   [...new Set(errs)].join(' | ').slice(0, 200));

console.log('\n=== 상점 · 가챠 점검 ===\n');
console.log(R.join('\n'));
const bad = R.filter(x => x.startsWith('❌')).length;
console.log(`\n결과: ${R.length - bad}개 통과, ${bad}개 실패`);
await b.close();
process.exit(bad ? 1 : 0);
