/* 모바일 실전 점검 — 폰으로 **한 판을 실제로 해봅니다**
   ------------------------------------------------------------------
   ⑩ 모바일 점검이 "배치가 맞는가" 를 본다면, 이 검수는
   **"엄지만으로 끝까지 되는가"** 를 봅니다. 키보드·마우스를 한 번도 쓰지 않습니다.

   이걸 만들면서 찾은 것:
     · setPointerCapture 가 던지면 조이스틱이 통째로 먹통이 됐습니다
       ("No active pointer with the given id" — 폰에서 손가락 여러 개 쓰면 실제로 납니다)
     · 상단 버튼 40x32, 건설 버튼 33x43, 화면 버튼 높이 30px —
       손가락으로 누르기엔 작았습니다 (애플 권장 44x44)

   그리고 **검수 자체가 두 번 틀렸습니다**:
     · 이동은 카메라 기준(yaw)인데 월드 방향을 그대로 넣어서 엉뚱한 데로 걸었습니다
     · 병력 창을 연 **뒤** 에 병영을 늘려서, 잠긴 버튼을 누르고 "고용 안 됨" 이라 했습니다
   검수가 틀리면 없는 버그를 쫓습니다 — 실패가 나오면 게임부터 의심하지 말 것.

   실행: node design/tests/audit-mobile-play.mjs   (먼저 localhost:8899 로 서버를 띄울 것)
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL = process.env.SG_URL || 'http://localhost:8899/samguk-99-3d.html';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
         + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true,
                                 userAgent: UA, deviceScaleFactor:2 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/CERT|fonts/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

const R = [];
const ok = (n, c, d='') => R.push(`${c?'✅':'❌'} ${n}${d?' — '+d:''}`);
const note = (n, v) => R.push(`   · ${n}: ${v}`);

/* 손가락 하나로 조이스틱을 잡고 끄는 도우미 */
const stickHold = async (dx,dy) => {
  const r = await (await p.$('#stick')).boundingBox();
  await p.evaluate(([cx,cy,dx,dy])=>{
    const el=document.getElementById('stick');
    const mk=(t,x,y)=>el.dispatchEvent(new PointerEvent(t,{pointerId:1,clientX:x,clientY:y,bubbles:true,pointerType:'touch',isPrimary:true}));
    mk('pointerdown',cx,cy); mk('pointermove',cx+dx,cy+dy);
  },[r.x+r.width/2, r.y+r.height/2, dx, dy]);
};
const stickRelease = () => p.evaluate(()=>document.getElementById('stick')
  .dispatchEvent(new PointerEvent('pointerup',{pointerId:1,bubbles:true,pointerType:'touch'})));

await p.goto(URL);
await p.waitForTimeout(1600);

/* ── 터치 타깃 크기 (애플 권장 44pt) ── */
const small = await p.evaluate(() => {
  const out=[];
  for (const e of document.querySelectorAll('#stage button, #controls button, #skillBar button, .scX, .topbar button')) {
    const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden') continue;
    const r=e.getBoundingClientRect(); if(r.width<1) continue;
    if (r.width<44 || r.height<44) out.push(`${e.id||e.className||e.textContent.trim().slice(0,8)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return out;
});
ok('누르는 버튼이 손가락에 충분히 크다 (44x44 권장)', small.length===0, small.join(' · ')||'전부 통과');

/* ── 확대/축소가 잠겨 있는가 (게임 중 두 번 탭하면 확대되면 안 됩니다) ── */
const zoom = await p.evaluate(() => {
  const m = document.querySelector('meta[name=viewport]');
  return m ? m.content : '(없음)';
});
ok('화면 확대가 잠겨 있다 (두 번 탭해도 안 커짐)', /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(zoom), zoom);

await p.tap('#btnStart'); await p.waitForTimeout(2400);
ok('게임 시작', await p.evaluate(()=>!!window.__sg.S));

/* ── 실제로 며칠 살아보기 ── */
const day0 = await p.evaluate(()=>window.__sg.S.day);
// 1) 나무 쪽으로 걸어가 채집
await p.evaluate(()=>{ const {S}=window.__sg; const n=S.nodes.find(x=>x.type==='wood');
  window.__tgt = n ? {x:n.x,y:n.y} : null; });
// 조이스틱을 **잡은 채로** 방향만 계속 바꿉니다 (사람이 하듯이)
{
  const r = await (await p.$('#stick')).boundingBox();
  const cx=r.x+r.width/2, cy=r.y+r.height/2;
  await p.evaluate(([cx,cy])=>{ const el=document.getElementById('stick');
    el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:cx,clientY:cy,bubbles:true,pointerType:'touch',isPrimary:true})); },[cx,cy]);
  for (let i=0;i<30;i++){
    const d = await p.evaluate(()=>{ const {S}=window.__sg; if(!window.__tgt) return null;
      return { dx: window.__tgt.x-S.hero.x, dy: window.__tgt.y-S.hero.y }; });
    if (!d) break;
    const L=Math.hypot(d.dx,d.dy); if (L<34) break;
    /* ★ 이동은 **카메라 기준** 입니다 (applyInput 이 yaw 로 돌립니다).
       월드 방향을 그대로 밀어넣으면 엉뚱한 데로 걸어갑니다 — 역회전을 먹입니다. */
    await p.evaluate(([cx,cy,wx,wy])=>{
      const yaw = window.__sg.R3.getCameraYaw();
      const sin=Math.sin(yaw), cos=Math.cos(yaw);
      const ix = wx*cos - wy*sin, iz = wx*sin + wy*cos;
      const el=document.getElementById('stick');
      el.dispatchEvent(new PointerEvent('pointermove',
        {pointerId:1,clientX:cx+ix*36,clientY:cy+iz*36,bubbles:true,pointerType:'touch',isPrimary:true}));
    },[cx,cy,d.dx/L,d.dy/L]);
    await p.waitForTimeout(280);
  }
  await stickRelease();
  note('나무까지 거리', await p.evaluate(()=>{ const {S}=window.__sg;
    return window.__tgt? Math.round(Math.hypot(window.__tgt.x-S.hero.x, window.__tgt.y-S.hero.y)) : -1; }));
}
const wood0 = await p.evaluate(()=>window.__sg.S.res.wood);
await p.waitForTimeout(3000);
const wood1 = await p.evaluate(()=>window.__sg.S.res.wood);
ok('조이스틱으로 걸어가 실제로 채집이 된다', wood1 > wood0, `목재 ${wood0} → ${wood1}`);

/* 2) 두 손가락 — 조이스틱을 잡은 채로 화면을 쓸어 카메라 회전 */
const yaw0 = await p.evaluate(()=>window.__sg.R3.R.cam.yaw);
await stickHold(30,-30);
await p.evaluate(()=>{
  const st=document.getElementById('stage');
  const mk=(t,x,y)=>st.dispatchEvent(new PointerEvent(t,{pointerId:2,clientX:x,clientY:y,bubbles:true,pointerType:'touch',isPrimary:false}));
  mk('pointerdown',300,400); mk('pointermove',230,400); mk('pointermove',180,400); mk('pointerup',180,400);
});
await p.waitForTimeout(500);
const yaw1 = await p.evaluate(()=>window.__sg.R3.R.cam.yaw);
const stillMoving = await p.evaluate(()=>{ const k=document.getElementById('knob');
  return Math.abs(parseFloat(k.style.left) - document.getElementById('stick').offsetWidth/2) > 5; });
await stickRelease();
ok('걸으면서 동시에 카메라를 돌릴 수 있다 (두 손가락)', Math.abs(yaw1-yaw0)>0.05 && stillMoving,
   `회전 ${(yaw1-yaw0).toFixed(2)} · 조이스틱 유지 ${stillMoving}`);

/* 3) 건설 — 목책 3개를 탭으로 */
await p.evaluate(()=>{ const S=window.__sg.S; S.res.wood=400; S.res.stone=400; });
let walls=0;
for (let n=0;n<8 && walls<3;n++){
  await (await p.$('#buildDockRow .bdBtn:nth-child(1)')).tap();
  await p.waitForTimeout(250);
  const pts=[[195,430],[240,430],[150,430],[195,380],[260,470],[130,470],[300,430],[90,430]];
  const [x,y]=pts[n];
  await p.touchscreen.tap(x,y); await p.waitForTimeout(320);
  if (await p.evaluate(()=>getComputedStyle(document.getElementById('buildConfirm')).display!=='none')) {
    if (!await p.evaluate(()=>document.getElementById('btnConfirmBuild').disabled)) {
      await p.tap('#btnConfirmBuild'); await p.waitForTimeout(300);
      walls = await p.evaluate(()=>window.__sg.S.cnt.wall);
    } else { await p.tap('#btnCancelBuild'); await p.waitForTimeout(150); }
  }
}
ok('탭만으로 목책을 여러 개 짓는다', walls>=2, `${walls}개`);

/* 4) 병력 창 — 탭으로 열고 고용
   (창을 연 **뒤** 에 병영을 늘리면 버튼이 잠긴 채로 그려져 있습니다 — 먼저 세팅합니다) */
await p.evaluate(()=>{ const S=window.__sg.S; S.camps=2; S.res.wood=300; S.res.stone=300; });
await p.waitForTimeout(300);
await (await p.$('#buildDockRow .bdBtn:nth-child(5)')).tap();
await p.waitForTimeout(400);
const troopOpen = await p.evaluate(()=>document.getElementById('troopPanel').classList.contains('on'));
ok('병력 창이 탭으로 열린다', troopOpen);
if (troopOpen) {
  const inView = await p.evaluate(()=>{ const r=document.getElementById('troopPanel').getBoundingClientRect();
    return r.top>=0 && r.bottom<=innerHeight+1 && r.left>=0 && r.right<=innerWidth+1; });
  ok('병력 창이 화면 안에 다 들어온다', inView);
  await (await p.$('#troopBody [data-hire="soldier"]')).tap();
  await p.waitForTimeout(300);
  ok('병력 창에서 병사를 고용할 수 있다',
     await p.evaluate(()=>window.__sg.S.soldiers.length>0),
     `${await p.evaluate(()=>window.__sg.S.soldiers.length)}명`);
  await p.tap('#btnTroopClose'); await p.waitForTimeout(250);
}

/* 5) 밤까지 가서 실제로 싸우기 */
await p.evaluate(()=>{ const {S,C}=window.__sg; S.day=10; S.dayT=C.DAY_SEC-0.05; });
for (let i=0;i<200;i++){ if (await p.evaluate(()=>window.__sg.S.phase==='night')) break; await p.waitForTimeout(120); }
ok('밤이 시작된다', await p.evaluate(()=>window.__sg.S.phase==='night'));
// 적 쪽으로 걸어가 스킬을 탭
{
  const r = await (await p.$('#stick')).boundingBox();
  const cx=r.x+r.width/2, cy=r.y+r.height/2;
  await p.evaluate(([cx,cy])=>{ const el=document.getElementById('stick');
    el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:cx,clientY:cy,bubbles:true,pointerType:'touch',isPrimary:true})); },[cx,cy]);
  for (let i=0;i<60;i++){
    const d = await p.evaluate(()=>{ const S=window.__sg.S; const m=S.monsters.find(x=>!x.dead); if(!m) return null;
      return { dx:m.x-S.hero.x, dy:m.y-S.hero.y, n:S.monsters.length, k:S.waveStats?.killed||0 }; });
    if (!d) break;
    if (d.k>0) break;
    const L=Math.hypot(d.dx,d.dy);
    await p.evaluate(([cx,cy,wx,wy])=>{
      const yaw = window.__sg.R3.getCameraYaw();
      const sin=Math.sin(yaw), cos=Math.cos(yaw);
      const ix = wx*cos - wy*sin, iz = wx*sin + wy*cos;
      const el=document.getElementById('stick');
      el.dispatchEvent(new PointerEvent('pointermove',
        {pointerId:1,clientX:cx+ix*36,clientY:cy+iz*36,bubbles:true,pointerType:'touch',isPrimary:true}));
    },[cx,cy, L>1? d.dx/L:0, L>1? d.dy/L:0]);
    await p.waitForTimeout(250);
    if (i%6===5) { const sk=await p.$$('#skillBar .skillBtn'); if (sk.length) await sk[(i/6|0)%sk.length].tap(); }
  }
  await stickRelease();
}
const killed = await p.evaluate(()=>window.__sg.S.waveStats?.killed||0);
ok('탭·조이스틱만으로 적을 잡을 수 있다', killed>0, `${killed}마리 처치`);

/* 6) 밤 → 리포트 → 다음 날 */
await p.evaluate(()=>{ const {S,Sim}=window.__sg; S.surges.length=0;
  while(S.monsters.length) Sim.damageMonster(S,S.monsters[0],99999,'hero'); });
for (let i=0;i<80;i++){ if (await p.evaluate(()=>window.__sg.S.phase==='report')) break; await p.waitForTimeout(150); }
ok('리포트가 뜬다', await p.evaluate(()=>window.__sg.S.phase==='report'));
const repFit = await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
ok('리포트에 가로 스크롤이 없다', repFit);

await p.tap('#btnRepClose'); await p.waitForTimeout(800);
ok('탭으로 다음 날로 넘어간다', await p.evaluate(()=>window.__sg.S.phase==='day'),
   await p.evaluate(()=>`${window.__sg.S.day}일`));

/* 7) 성능 */
const fps = await p.evaluate(()=>window.__sg.R3.R.stats.fps);
ok('폰에서 돌아가는 속도 (참고값)', true, `${fps} fps (소프트웨어 렌더링 기준)`);

/* 8) 화면 회전 */
await p.setViewportSize({ width:844, height:390 });
await p.waitForTimeout(1200);
const land = await p.evaluate(()=>({
  scroll: document.documentElement.scrollHeight<=innerHeight+1 && document.documentElement.scrollWidth<=innerWidth+1,
  stick: (()=>{const r=document.getElementById('stick').getBoundingClientRect();
    return r.bottom<=innerHeight+1 && r.right<=innerWidth+1;})(),
  running: !!window.__sg.S }));
ok('플레이 중 가로로 돌려도 배치가 깨지지 않는다', land.scroll && land.stick && land.running, JSON.stringify(land));
await p.setViewportSize({ width:390, height:844 });
await p.waitForTimeout(1000);
ok('다시 세로로 돌려도 정상이다',
   await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
const t0=await p.evaluate(()=>window.__sg.S.t); await p.waitForTimeout(1000);
ok('회전 뒤에도 게임이 계속 돈다', await p.evaluate(t=>window.__sg.S.t>t,t0));

ok('전체 과정에서 오류 없음', errs.length===0, [...new Set(errs)].slice(0,3).join(' | '));



console.log('\n=== 모바일 실전 점검 ===\n');
console.log(R.join('\n'));
const bad = R.filter(x => x.startsWith('❌')).length;
console.log(`\n결과: ${R.filter(x=>x.startsWith('✅')).length}개 통과, ${bad}개 실패`);
await b.close();
process.exit(bad ? 1 : 0);
