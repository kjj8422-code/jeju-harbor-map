/* 제작소 점검 — 제작 화면을 실제 마우스로 끝까지 눌러봅니다
   ------------------------------------------------------------------
   왜 필요한가:
     2026-09 정리에서 제작 목록을 11개 → 8개로 줄이고 화면도 새로 짰습니다.
     이때 줄 전체를 <button> 으로 만들어 놓고 "만들기" 딱지를 안 붙여서,
     눌러도 되는 줄인지 화면만 봐서는 알 수 없는 상태였습니다.
     화면을 새로 짤 때마다 이런 구멍이 생기므로 제작 화면만 따로 봅니다.

   확인하는 것:
     · 만들 수 있는 줄에는 눌러도 된다는 표시(만들기 딱지)가 실제로 있는가
     · 그 딱지를 마우스로 눌렀을 때 정말 제작이 되는가 (줄이 아니라 딱지를 눌러도)
     · 잠긴 줄은 눌리지 않는가
     · 만든 것은 "보유" 한 줄로 접히는가
     · 무기 강화가 ★3 에서 멈추는가
     · 제작 중 예외가 나지 않는가

   실행: node design/tests/audit-craft.mjs   (먼저 localhost:8899 로 서버를 띄울 것)
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL = process.env.SG_URL || 'http://localhost:8899/samguk-99-3d.html';

const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{ width:1180, height:900 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/CERT|fonts/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });

const R = []; const ok = (n, c, d='') => R.push(`${c?'✅':'❌'} ${n}${d?' — '+d:''}`);

await p.goto(URL);
await p.waitForTimeout(1400);
await p.evaluate(() => window.__sg.startGame('taesaja'));
await p.waitForTimeout(1600);

/* 대장간도 자원도 없는 맨 처음 상태 — 여기서는 전부 잠겨 있어야 합니다 */
await p.evaluate(() => document.getElementById('btnCraft').click());
await p.waitForTimeout(400);
const lockedAtStart = await p.evaluate(() =>
  [...document.querySelectorAll('#craftList [data-craft]')].every(x => x.disabled));
ok('대장간이 없으면 제작 줄이 전부 잠겨 있다', lockedAtStart);
ok('잠긴 줄에는 만들기 딱지가 없다',
   await p.evaluate(() => !document.querySelector('#craftList [data-craft][disabled] .cGo')));
/* 잠긴 줄을 눌러도 아무 일도 없어야 합니다 */
{
  const before = errs.length;
  await p.evaluate(() => document.querySelector('#craftList [data-craft]')?.click());
  await p.waitForTimeout(200);
  ok('잠긴 줄을 눌러도 오류가 나지 않는다', errs.length === before);
}
await p.evaluate(() => document.getElementById('btnCraftClose').click());
await p.waitForTimeout(200);

/* 대장간 + 철옹성 + 자원을 채우고 다시 */
await p.evaluate(() => { const S = window.__sg.S;
  S.forge = true; S.baseLv = 3;
  S.res.wood = 500; S.res.stone = 500; S.res.iron = 200; S.res.hide = 200; S.res.herb = 100; });
await p.evaluate(() => document.getElementById('btnCraft').click());
await p.waitForTimeout(400);

const ALL = await p.evaluate(() => window.__sg.C.CRAFTS.map(c => c.id));
ok('제작 목록이 8개로 정리되어 있다', ALL.length === 8, `${ALL.length}개`);

/* 만들 수 있는 줄에는 반드시 딱지가 있어야 합니다 (이번 정리에서 놓쳤던 부분) */
ok('만들 수 있는 줄에는 전부 만들기 딱지가 있다',
   await p.evaluate(() =>
     [...document.querySelectorAll('#craftList [data-craft]:not([disabled])')]
       .every(x => !!x.querySelector('.cGo'))));

/* 줄이 아니라 딱지를 눌러도 제작이 되어야 합니다 */
const clickCraft = async id => {
  const el = await p.$(`#craftList [data-craft="${id}"]:not([disabled])`);
  if (!el) return false;
  const go = await el.$('.cGo');
  await (go || el).click();
  await p.waitForTimeout(160);
  return true;
};
let clicked = 0;
for (const id of ['huntknife','leather','ironmail','steelspike','banner','potion',
                  'weapon','weapon','weapon','weapon']) if (await clickCraft(id)) clicked++;
ok('딱지를 눌러 제작이 진행된다', clicked >= 9, `${clicked}번`);

const st = await p.evaluate(() => { const S = window.__sg.S;
  return { w: S.weaponLv, gear: { ...S.gear }, pot: S.potions,
           max: window.__sg.C.WEAPON_COST.length }; });
ok('무기 강화가 ★3 에서 멈춘다', st.w === st.max && st.w === 3, `★${st.w}`);
ok('장비 5종이 전부 만들어진다',
   ['huntknife','leather','ironmail','steelspike','banner'].every(k => st.gear[k]),
   Object.keys(st.gear).filter(k => st.gear[k]).join(','));
ok('치유약이 쌓인다', st.pot >= 1, `${st.pot}개`);
ok('★3 뒤에는 무기 줄이 더 눌리지 않는다',
   await p.evaluate(() => {
     const el = document.querySelector('#craftList [data-craft="weapon"]');
     return !el || el.disabled; }));
ok('만든 것은 보유 한 줄로 접힌다',
   await p.evaluate(() => document.querySelectorAll('#craftList .cDone').length >= 5),
   `${await p.evaluate(() => document.querySelectorAll('#craftList .cDone').length)}줄`);
ok('철옹성까지 올리면 성 올리기가 완료 줄이 된다',
   await p.evaluate(() => !!document.querySelector('#baseUpgrade .cDone')));

/* 닫고 게임이 계속 돌아가는지 */
await p.evaluate(() => document.getElementById('btnCraftClose').click());
await p.waitForTimeout(300);
const t0 = await p.evaluate(() => window.__sg.S.t);
await p.waitForTimeout(600);
const t1 = await p.evaluate(() => window.__sg.S.t);
ok('제작 화면을 닫은 뒤에도 게임이 돌아간다', t1 > t0, `${t0.toFixed(1)} → ${t1.toFixed(1)}`);
ok('오류가 하나도 없다', errs.length === 0, [...new Set(errs)].join(' | ').slice(0, 200));

console.log('\n=== 제작소 점검 ===\n');
console.log(R.join('\n'));
const bad = R.filter(x => x.startsWith('❌')).length;
console.log(`\n결과: ${R.length - bad}개 통과, ${bad}개 실패`);
await b.close();
process.exit(bad ? 1 : 0);
