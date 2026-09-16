/* 동적 전수 점검 — 화면의 모든 버튼을 실제로 눌러봅니다
   ------------------------------------------------------------------
   왜 필요한가:
     팀장님이 5분 만에 찾은 버그들을 제가 못 찾은 이유는 단순합니다.
     저는 제가 만든 기능의 "성공 경로" 만 눌러봤고, 팀장님은 아무거나 눌렀습니다.
     그래서 **모든 버튼을 전부, 여러 상황에서** 눌러보는 검수를 따로 둡니다.

   확인하는 것:
     · 모든 버튼이 클릭을 실제로 받는가 (화면 안 UI 가 가려지지 않았는가)
     · 어떤 버튼을 눌러도 예외가 나지 않는가
     · 어떤 버튼을 눌러도 게임 루프가 멈추지 않는가
     · 화면을 아무 순서로 열고 닫아도 갇히지 않는가

   실행: node design/tests/audit-clicks.mjs   (먼저 localhost:8899 로 서버를 띄울 것)
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL = process.env.SG_URL || 'http://localhost:8899/samguk-99-3d.html';

const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1180,height:820} });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/CERT|fonts/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });

const R = []; const ok = (n, c, d='') => R.push(`${c?'✅':'❌'} ${n}${d?' — '+d:''}`);
/* 게임 루프가 살아 있는가.
   일시정지를 눌렀다면 그건 정상 동작이므로 먼저 풀고 잽니다. */
const alive = async () => {
  await p.evaluate(() => {
    const b = document.getElementById('btnPause');
    if (b && /계속하기/.test(b.textContent)) b.click();
    document.querySelectorAll('.screen.on').forEach(s => {
      const c = s.querySelector('button.primary'); if (c) c.click();
    });
  });
  await p.waitForTimeout(350);
  const a = await p.evaluate(() => window.__sg && window.__sg.S ? window.__sg.S.t : -1);
  await p.waitForTimeout(800);
  const c = await p.evaluate(() => window.__sg && window.__sg.S ? window.__sg.S.t : -1);
  return c > a;
};

await p.goto(URL);
await p.waitForTimeout(2200);

/* ── 1. 시작 화면의 모든 버튼 ── */
{
  const before = errs.length;
  const cards = await p.locator('#heroCards .gcard').count();
  for (let i = 0; i < cards; i++) { await p.locator('#heroCards .gcard').nth(i).click(); await p.waitForTimeout(120); }
  ok(`시작 화면의 장수 카드 ${cards}장을 눌러도 오류가 없다`, errs.length === before);

  await p.click('#btnTitleShop'); await p.waitForTimeout(500);
  ok('출전 전 뽑기가 열린다', await p.locator('#scShop').isVisible());
}

/* ── 2. 상점의 모든 버튼 (보석 없이 눌러도 죽으면 안 됩니다) ── */
{
  const before = errs.length;
  for (const id of ['btnPull','btnPullGem','btnPull10','btnFreeGem']) {
    await p.click('#' + id, { force: true }).catch(()=>{});
    await p.waitForTimeout(250);
  }
  ok('재화가 없어도 뽑기 버튼들이 안전하다', errs.length === before);

  const packs = await p.locator('#packRow .packCard').count();
  for (let i = 0; i < packs; i++) { await p.locator('#packRow .packCard').nth(i).click(); await p.waitForTimeout(150); }
  ok(`보석 팩 ${packs}종을 눌러도 오류가 없다`, errs.length === before);

  await p.click('#btnPull10'); await p.waitForTimeout(600);
  const aw = await p.locator('#playableList [data-awaken]').count();
  for (let i = 0; i < aw; i++) {
    await p.locator('#playableList [data-awaken]').nth(i).click({ force: true }).catch(()=>{});
    await p.waitForTimeout(120);
  }
  ok(`각성 버튼 ${aw}개를 눌러도 오류가 없다`, errs.length === before);
  await p.click('#btnShopClose'); await p.waitForTimeout(400);
  ok('상점을 닫으면 시작 화면으로 돌아온다', await p.locator('#scTitle').isVisible());
}

/* ── 3. 게임 시작 후 — 화면 안 모든 버튼을 실제 좌표로 클릭 ── */
await p.click('#btnStart'); await p.waitForTimeout(2200);
{
  const before = errs.length;
  const btns = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (el.closest('.screen:not(.on)')) continue;
      out.push({ sel: el.id ? '#' + el.id : null,
                 txt: (el.textContent || '').trim().slice(0, 14),
                 x: r.x + r.width/2, y: r.y + r.height/2 });
    }
    return out;
  });
  ok(`게임 화면에 눌러볼 버튼이 ${btns.length}개 있다`, btns.length > 8, String(btns.length));

  /* 실제 좌표로 눌러 "가려져서 클릭이 안 먹는" 버튼을 찾습니다 */
  const blocked = [], offscreen = [];
  for (const btn of btns) {
    const hit = await p.evaluate(({x,y}) => {
      const inView = y >= 0 && y <= innerHeight && x >= 0 && x <= innerWidth;
      if (!inView) return { off: true };
      const top = document.elementFromPoint(x, y);
      if (!top) return { ok:false, by:'없음' };
      const btn2 = top.closest('button');
      return { ok: !!btn2, by: btn2 ? (btn2.textContent||'').trim().slice(0,14)
                                     : (top.id || top.className || top.tagName) };
    }, btn);
    const label = (btn.txt || btn.sel || '?').replace(/\s+/g, ' ');
    if (hit.off) offscreen.push(label);
    else if (!hit.ok) blocked.push(`${label} ← ${hit.by} 가 가림`);
  }
  ok('다른 것에 가려져서 못 누르는 버튼이 없다', blocked.length === 0, blocked.join(' / '));
  /* 화면 밖이라 스크롤해야 하는 버튼 — 오류는 아니지만 UX 문제입니다.
     게임 중에 자주 쓰는 버튼이 스크롤 아래에 있으면 플레이어는 그 기능을 모릅니다.
     (실제로 팀장님은 병영을 2채 짓고도 병사를 한 명도 안 뽑았습니다.) */
  /* 화면 밖 패널의 버튼은 "화면 안에도 같은 기능이 있으면" 괜찮습니다.
     병사·용병은 화면 안 병력 창(숫자키 6)에서 고용할 수 있습니다. */
  const inStageAlt = await p.evaluate(() => {
    const dock = document.getElementById('buildDockRow');
    return dock ? [...dock.querySelectorAll('.bdBtn')].map(b => b.textContent) : [];
  });
  const hasTroop = inStageAlt.some(t => /병력/.test(t));
  const unreachable = offscreen.filter(l => !(hasTroop && /병사|용병/.test(l)));
  ok('게임 중 자주 쓰는 기능이 화면 안에서 닿는다', unreachable.length === 0,
     '화면 안에 대체 수단 없음: ' + unreachable.join(' / '));

  /* 병력 창이 실제로 열리고 고용이 되는가 */
  await p.keyboard.press('6'); await p.waitForTimeout(350);
  const tpOpen = await p.evaluate(() => document.getElementById('troopPanel').classList.contains('on'));
  ok('숫자키 6 으로 병력 창이 열린다', tpOpen);
  const tpBtns = await p.locator('#troopBody .tpBtn').count();
  ok('병력 창에 병사·용병 버튼이 다 있다', tpBtns === 4, `${tpBtns}개`);
  await p.evaluate(() => { const S = window.__sg.S, C = window.__sg.C, Sim = window.__sg.Sim;
    S.res.wood = 999; S.res.stone = 999; S.shard = 200;
    S.hero.x = S.base.x; S.hero.y = S.base.y;
    for (let d = 2; d <= 4; d++) {
      for (const [dx, dy] of [[-d,0],[d,0],[0,-d],[0,d]]) {
        const tx = C.BASE_TX + dx, ty = C.BASE_TY + dy;
        if (Sim.canBuildAt(S, tx, ty, 'camp').ok) { Sim.tryBuild(S, tx, ty, 'camp'); return; }
      }
    } });
  await p.waitForTimeout(400);
  await p.evaluate(() => { document.getElementById('buildDockRow').dataset.sig = ''; });
  await p.keyboard.press('6'); await p.waitForTimeout(200);
  await p.keyboard.press('6'); await p.waitForTimeout(350);
  const before2 = await p.evaluate(() => window.__sg.S.soldiers.length);
  await p.locator('#troopBody .tpBtn').first().click({ force:true }).catch(()=>{});
  await p.waitForTimeout(400);
  const after2 = await p.evaluate(() => window.__sg.S.soldiers.length);
  ok('병력 창에서 병사를 실제로 고용할 수 있다', after2 > before2, `${before2} → ${after2}`);
  await p.locator('#troopBody .tpBtn').nth(2).click({ force:true }).catch(()=>{});
  await p.waitForTimeout(400);
  const merc2 = await p.evaluate(() => window.__sg.S.soldiers.filter(x=>x.merc).length);
  ok('병력 창에서 용병도 고용할 수 있다', merc2 > 0, `${merc2}명`);
  await p.evaluate(() => { const b = document.getElementById('btnTroopClose'); if (b) b.click(); });
  await p.waitForTimeout(250);

  /* 전부 눌러봅니다 — 예외가 나면 안 됩니다 */
  for (const btn of btns) {
    if (btn.sel === '#btnStart') continue;
    await p.mouse.click(btn.x, btn.y).catch(()=>{});
    await p.waitForTimeout(110);
    // 화면이 열렸으면 닫습니다
    await p.evaluate(() => {
      for (const id of ['btnGuideClose','btnCraftClose','btnShopClose']) {
        const el = document.getElementById(id);
        if (el && el.offsetParent) el.click();
      }
    });
    await p.waitForTimeout(90);
  }
  ok('게임 화면의 모든 버튼을 눌러도 오류가 없다', errs.length === before,
     errs.slice(before).join(' | ').slice(0, 200));
  ok('버튼을 다 누른 뒤에도 게임이 돌아간다', await alive());
}

/* ── 4. 화면을 아무 순서로 열고 닫기 ── */
{
  const before = errs.length;
  const opens = ['btnGuide','btnCraft','btnShop'];
  const closes = ['btnGuideClose','btnCraftClose','btnShopClose'];
  for (let i = 0; i < opens.length; i++)
    for (let j = 0; j < closes.length; j++) {
      await p.click('#' + opens[i], { force:true }).catch(()=>{});
      await p.waitForTimeout(180);
      await p.click('#' + closes[j], { force:true }).catch(()=>{});
      await p.waitForTimeout(180);
      await p.evaluate(() => {          // 남아 있는 화면은 강제로 닫습니다
        document.querySelectorAll('.screen.on').forEach(s => {
          const b2 = s.querySelector('button.primary'); if (b2) b2.click();
        });
      });
      await p.waitForTimeout(120);
    }
  ok('화면을 뒤섞어 열고 닫아도 오류가 없다', errs.length === before,
     errs.slice(before).join(' | ').slice(0, 200));
  ok('화면을 뒤섞어 여닫은 뒤에도 게임이 돌아간다', await alive());
  const stuck = await p.evaluate(() =>
    [...document.querySelectorAll('.screen.on')].map(s => s.id));
  ok('열린 채로 남은 화면이 없다', stuck.length === 0, stuck.join(','));
}

/* ── 5. 키보드 — 모든 단축키를 아무 상황에서나 ── */
{
  const before = errs.length;
  for (const k of ['q','e',' ','h','1','2','3','4','5','9','Escape','Enter','w','a','s','d','Shift','Tab']) {
    await p.keyboard.press(k).catch(()=>{});
    await p.waitForTimeout(70);
  }
  ok('모든 단축키를 눌러도 오류가 없다', errs.length === before,
     errs.slice(before).join(' | ').slice(0, 200));
  ok('단축키를 다 누른 뒤에도 게임이 돌아간다', await alive());
}

/* ── 6. 죽은 상태·리포트 상태에서 버튼 누르기 ── */
{
  const before = errs.length;
  await p.evaluate(() => { const S = window.__sg.S;
    S.hero.hp = 1;
    S.monsters.push({ x:S.hero.x, y:S.hero.y, hp:9999, maxHp:9999, spd:0, dmg:999, cd:0,
      boss:false, hitFlash:0, dead:false, windup:0, windupTgt:null, vx:0, vy:0, hitStop:0,
      armor:0, kind:'normal', scale:1 }); });
  await p.waitForTimeout(1500);
  const dead = await p.evaluate(() => window.__sg.S.hero.dead);
  for (const id of ['btnHire','btnCraft','btnGuide','btnCancel','btnPause']) {
    await p.click('#' + id, { force:true }).catch(()=>{});
    await p.waitForTimeout(120);
  }
  await p.evaluate(() => { document.querySelectorAll('.screen.on').forEach(s => {
    const b2 = s.querySelector('button.primary'); if (b2) b2.click(); }); });
  await p.waitForTimeout(200);
  await p.evaluate(() => { window.__sg.S.monsters.length = 0; window.__sg.S.hero.respawn = 0.1; });
  await p.waitForTimeout(900);
  ok('쓰러진 상태에서 버튼을 눌러도 오류가 없다', errs.length === before && dead,
     errs.slice(before).join(' | ').slice(0, 160));
  ok('쓰러졌다 살아난 뒤에도 게임이 돌아간다', await alive());
}

/* ── 7. 일시정지 중에 아무거나 눌러도 ── */
{
  const before = errs.length;
  await p.click('#btnPause'); await p.waitForTimeout(250);
  for (const id of ['btnGuide','btnCraft','btnCancel']) {
    await p.click('#' + id, { force:true }).catch(()=>{});
    await p.waitForTimeout(150);
  }
  await p.evaluate(() => { document.querySelectorAll('.screen.on').forEach(s => {
    const b2 = s.querySelector('button.primary'); if (b2) b2.click(); }); });
  await p.click('#btnPause'); await p.waitForTimeout(400);
  ok('일시정지 중에 눌러도 오류가 없고 다시 풀린다', errs.length === before && await alive(),
     errs.slice(before).join(' | ').slice(0, 160));
}

console.log('\n=== 전수 클릭 점검 ===\n');
console.log(R.join('\n'));
const bad = R.filter(x => x.startsWith('❌')).length;
console.log(`\n결과: ${R.length - bad}개 통과, ${bad}개 실패`);
console.log('오류:', errs.length ? [...new Set(errs)].join('\n  ') : '없음');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
