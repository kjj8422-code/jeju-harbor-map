/* 건설 조작 검수 — 실제 사람이 하는 그대로 마우스로 눌러봅니다.
   ------------------------------------------------------------------
   왜 이 파일이 따로 있나:
     로직 검수(sim-test.mjs)는 Sim.tryBuild 를 직접 불러서 확인합니다.
     그런데 실제로 막혔던 원인은 로직이 아니라 **화면 조작**이었습니다.
     건설 바를 #stage 안으로 옮기면서 fromUI 가드에 #buildDock 을 빠뜨렸고,
     그 결과 버튼을 누르면 stage 가 setPointerCapture 를 걸어버려
     버튼의 click 이 아예 발생하지 않았습니다. 로직은 멀쩡한데 못 짓는 상태였습니다.
     → 그래서 "사람이 누르는 경로" 를 그대로 눌러보는 검수를 따로 둡니다.

   실행: node design/tests/ui-build-test.mjs   (먼저 localhost:8899 로 서버를 띄울 것)
   ① 건설 바 버튼을 마우스로 누른다  ② 땅을 누른다  ③ 확인을 누른다             */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL = process.env.SG_URL || 'http://localhost:8899/samguk-99-3d.html';
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:1200,height:900} });
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{ if(m.type()==='error'&&!/CERT|fonts/.test(m.text())) errs.push('CONSOLE: '+m.text()); });
await p.addInitScript(()=>{ window.__forceHQ=true; try{localStorage.clear();}catch(e){} });
await p.goto(URL);
await p.waitForTimeout(2200);
await p.click('#btnStart'); await p.waitForTimeout(2500);

const R=[]; const ok=(n,c,d='')=>{R.push(`${c?'✅':'❌'} ${n}${d?' — '+d:''}`);};

// 카메라를 위에서 보게 해서 장수 주변 땅이 화면 가운데 오도록
await p.evaluate(()=>{ const R3=window.__sg.R3; R3.R.cam.pitch=1.05; R3.R.cam.dist=16; });
await p.waitForTimeout(1200);
await p.evaluate(()=>{ window.__sg.S.res.wood=999; window.__sg.S.res.stone=999; });
await p.waitForTimeout(300);

// ① 건설 바의 "목책" 을 마우스로 클릭
const btn = p.locator('#buildDock .bdBtn').first();
await btn.click();
await p.waitForTimeout(400);
const st1 = await p.evaluate(()=>({
  sel: !!document.querySelector('#buildDock .bdBtn.on'),
  confirmOpen: getComputedStyle(document.getElementById('buildConfirm')).display !== 'none',
  ghost: !!(window.__sg.R3.R.ghostGroup && window.__sg.R3.R.ghostGroup.visible)
}));
ok('건설 바를 클릭하면 목책이 선택된다', st1.sel);
ok('건설 바를 클릭했을 뿐인데 확인창이 뜨지 않는다', !st1.confirmOpen,
   st1.confirmOpen ? '버튼 밑의 땅이 조준돼 버림' : '');

// ② 장수 근처 땅(화면 가운데)을 클릭
const box = await p.locator('#stage').boundingBox();
const cx = box.x + box.width/2, cy = box.y + box.height/2 - 40;
await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.up();
await p.waitForTimeout(500);
const st2 = await p.evaluate(()=>({
  confirmOpen: getComputedStyle(document.getElementById('buildConfirm')).display !== 'none',
  btnDisabled: document.getElementById('btnConfirmBuild').disabled,
  hint: document.getElementById('buildHint').textContent
}));
ok('땅을 클릭하면 "여기에 지을까요?" 가 뜬다', st2.confirmOpen, st2.hint||'');
ok('설치 버튼이 눌릴 수 있는 상태다', st2.confirmOpen && !st2.btnDisabled, st2.hint||'');

// ③ 확인
const before = await p.evaluate(()=>window.__sg.S.cnt.wall);
if (st2.confirmOpen && !st2.btnDisabled) {
  await p.click('#btnConfirmBuild');
  await p.waitForTimeout(500);
}
const after = await p.evaluate(()=>window.__sg.S.cnt.wall);
ok('확인을 누르면 목책이 실제로 지어진다', after > before, `${before} → ${after}`);

// ④ 숫자키 경로도 확인 — 빈 칸을 찾아서 누릅니다(지도가 매번 달라서)
await p.keyboard.press('2'); await p.waitForTimeout(300);
const tBefore = await p.evaluate(()=>window.__sg.S.cnt.trap);
let placed = false, tried = [];
for (const [dx,dy] of [[70,0],[-70,30],[0,90],[110,-40],[-110,-30],[40,120],[-40,-90],[140,60]]) {
  await p.mouse.move(cx+dx, cy+dy); await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(280);
  const st = await p.evaluate(()=>({
    open: getComputedStyle(document.getElementById('buildConfirm')).display !== 'none',
    dis: document.getElementById('btnConfirmBuild').disabled,
    hint: document.getElementById('buildHint').textContent.trim() }));
  tried.push(st.dis ? (st.hint||'?') : 'OK');
  if (st.open && !st.dis) { await p.click('#btnConfirmBuild'); await p.waitForTimeout(350); placed = true; break; }
}
const tAfter = await p.evaluate(()=>window.__sg.S.cnt.trap);
ok('숫자키 2 → 땅 클릭 → 확인으로 함정이 지어진다', tAfter > tBefore,
   `${tBefore} → ${tAfter} · 시도 ${tried.join('/')}`);

// ⑤ "바로 설치" 경로
await p.evaluate(()=>{ const c=document.getElementById('chkInstant'); c.checked=true; c.dispatchEvent(new Event('change')); });
await p.keyboard.press('1'); await p.waitForTimeout(300);
const w2 = await p.evaluate(()=>window.__sg.S.cnt.wall);
let w3 = w2;
for (const [dx,dy] of [[-70,0],[-70,60],[-120,-40],[30,-90],[90,90]]) {
  await p.mouse.move(cx+dx, cy+dy); await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(350);
  w3 = await p.evaluate(()=>window.__sg.S.cnt.wall);
  if (w3 > w2) break;
}
ok('"바로 설치" 를 켜면 클릭만으로 지어진다', w3 > w2, `${w2} → ${w3}`);

// ⑥ 우클릭 취소가 여전히 되는가
await p.evaluate(()=>{ const c=document.getElementById('chkInstant'); c.checked=false; c.dispatchEvent(new Event('change')); });
await p.locator('#buildDock .bdBtn').first().click(); await p.waitForTimeout(250);
await p.mouse.click(cx, cy, {button:'right'}); await p.waitForTimeout(300);
ok('우클릭으로 건설 모드가 풀린다',
   await p.evaluate(()=>!document.querySelector('#buildDock .bdBtn.on')));

// ⑦ 건설 바를 눌러도 장수가 헛스윙하지 않는가 (클릭 공격이 새지 않아야 함)
const swing0 = await p.evaluate(()=>window.__sg.S.hero.swing);
await p.locator('#buildDock .bdBtn').nth(2).click(); await p.waitForTimeout(120);
const swing1 = await p.evaluate(()=>window.__sg.S.hero.swing);
ok('건설 바 클릭이 장수의 공격으로 새지 않는다', !(swing1 > swing0 + 0.1), `${swing0} → ${swing1}`);


console.log('\n=== 건설 조작 검수 ===\n');
console.log(R.join('\n'));
const bad = R.filter(x=>x.startsWith('❌')).length;
console.log(`\n결과: ${R.length-bad}개 통과, ${bad}개 실패`);
console.log('에러:', errs.length?errs.join('\n'):'없음');
await b.close();
process.exit(R.some(x=>x.startsWith('❌')) ? 1 : 0);
