/* ==================================================================
   부팅 · 조작 · 화면 연결
   규칙(sim) ↔ 화면(render3d) 을 이어주고, 입력을 받습니다.
   ================================================================== */

import * as C from './config.js';
import * as Sim from './sim.js';
import * as R3 from './render3d.js';
import * as Models from './models.js';

const $ = id => document.getElementById(id);
let S = null, selHero = 1, paused = false, uiOpen = true;
let buildSel = null, soundOn = true;
let wallet = Number(localStorage.getItem('sg3d_shard') || 0);

/* ---------------- 소리 ---------------- */
let AC = null;
function refreshSkillBar() {
  if (!S) return;
  const bar = $('skillBar');
  if (!bar) return;
  const defs = S.heroDef.skills || [];
  if (bar.dataset.hero !== S.heroDef.id) {
    bar.dataset.hero = S.heroDef.id;
    bar.innerHTML = defs.map((sk, i) =>
      `<button class="skillBtn" data-slot="${i}" title="${sk.desc}">
         <span class="k">${sk.key}</span><span class="n">${sk.name}</span>
         <span class="cd" id="skcd${i}"></span></button>`).join('')
      + `<button class="skillBtn dodge" data-dodge="1" title="적의 공격 예비 동작 중에 구르면 빗나갑니다">
           <span class="k">Space</span><span class="n">회피</span>
           <span class="cd" id="skcdD"></span></button>`;
    bar.querySelectorAll('[data-slot]').forEach(b =>
      b.onclick = () => doSkill(Number(b.dataset.slot)));
    bar.querySelector('[data-dodge]').onclick = doDodge;
  }
  for (let i = 0; i < defs.length; i++) {
    const el = $('skcd' + i);
    if (!el) continue;
    const cd = Math.max(0, S.hero.skillCd[i]);
    el.textContent = cd > 0 ? cd.toFixed(1) : '';
    el.parentElement.classList.toggle('ready', cd <= 0);
  }
  const dEl = $('skcdD');
  if (dEl) {
    const cd = Math.max(0, S.hero.dodgeCd);
    dEl.textContent = cd > 0 ? cd.toFixed(1) : '';
    dEl.parentElement.classList.toggle('ready', cd <= 0);
  }
}

const SOUND = {
  dodge:[520,.12,'sine',.03], skill:[700,.18,'triangle',.045],
  windup:[210,.1,'sine',.014], heroHit:[180,.12,'square',.035],
  build:[420,.06,'triangle',.03], deny:[160,.1,'sine',.03], hire:[520,.07,'triangle',.03],
  craft:[660,.09,'triangle',.03], warn:[180,.5,'sawtooth',.05], nightStart:[120,.6,'sawtooth',.06],
  swing:[300,.04,'square',.02], die:[240,.05,'square',.022], bossDie:[520,.25,'square',.03],
  heroDown:[140,.3,'sawtooth',.04], wallBreak:[150,.12,'square',.03], report:[700,.12,'triangle',.03],
  objective:[760,.09,'triangle',.03], lastStand:[220,.4,'sawtooth',.05],
  win:[660,.4,'triangle',.05], lose:[120,.4,'sawtooth',.05]
};
function beep(name) {
  if (!soundOn || !SOUND[name]) return;
  const [f, d, type, vol] = SOUND[name];
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d);
    o.connect(g); g.connect(AC.destination);
    o.start(); o.stop(AC.currentTime + d);
  } catch (e) { /* 소리 실패는 게임에 영향 없음 */ }
}

/* ---------------- 화면 알림 ---------------- */
function toast(msg) {
  const box = $('toast');
  const el = document.createElement('div');
  el.className = 'toastItem'; el.innerHTML = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2600);
  while (box.children.length > 4) box.firstChild.remove();
}

const floaters = [];
function addFloater(x, y, text, color) {
  const el = document.createElement('div');
  el.className = 'fxItem';
  el.textContent = text;
  el.style.color = color;
  $('fxLayer').appendChild(el);
  floaters.push({ el, x, y, life: 1.1, rise: 0 });
  if (floaters.length > 40) { const f = floaters.shift(); f.el.remove(); }
}
function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt; f.rise += dt * 0.9;
    if (f.life <= 0) { f.el.remove(); floaters.splice(i, 1); continue; }
    const p = R3.worldToScreen(f.x, f.y, 1.3 + f.rise);
    if (!p.visible) { f.el.style.display = 'none'; continue; }
    f.el.style.display = '';
    f.el.style.left = p.x + 'px';
    f.el.style.top = p.y + 'px';
    f.el.style.opacity = Math.min(1, f.life);
  }
}

/* ---------------- 체력 바 (화면에 겹쳐 그립니다) ----------------
   3D 물체로 만들면 적 25마리에 draw call 50번이 추가됩니다.
   화면 위에 얇은 막대를 겹쳐 그리면 draw call 0으로 같은 정보를 줍니다. */
const hpBars = new Map();
function getHpBar(key) {
  let b = hpBars.get(key);
  if (!b) {
    const el = document.createElement('div');
    el.className = 'hpBar';
    el.innerHTML = '<i></i>';
    $('fxLayer').appendChild(el);
    b = { el, fill: el.firstChild };
    hpBars.set(key, b);
  }
  return b;
}
function updateHpBars() {
  if (!S) return;
  const live = new Set();

  // 적 — 체력이 가득하면 숨깁니다 (화면이 지저분해지지 않게)
  for (const m of S.monsters) {
    const ratio = Math.max(0, m.hp / m.maxHp);
    if (ratio >= 0.999 && !m.boss) continue;
    live.add(m);
    const b = getHpBar(m);
    const p = R3.worldToScreen(m.x, m.y, m.boss ? 3.4 : 2.1);
    if (!p.visible) { b.el.style.display = 'none'; continue; }
    b.el.style.display = '';
    b.el.style.left = p.x + 'px';
    b.el.style.top = p.y + 'px';
    b.el.className = 'hpBar' + (m.boss ? ' boss' : '');
    b.fill.style.width = (ratio * 100) + '%';
    b.fill.style.background = m.boss ? '#E0B44A' : ratio > 0.4 ? '#C6412F' : '#8C2B1F';
  }

  // 장수 — 항상 표시 (내 상태를 눈을 안 옮기고 보게)
  if (!S.hero.dead) {
    live.add(S.hero);
    const b = getHpBar(S.hero);
    const p = R3.worldToScreen(S.hero.x, S.hero.y, 2.35);
    if (p.visible) {
      b.el.style.display = '';
      b.el.style.left = p.x + 'px';
      b.el.style.top = p.y + 'px';
      const ratio = Math.max(0, S.hero.hp / S.hero.maxHp);
      b.el.className = 'hpBar hero' + (S.hero.invuln > 0 ? ' invuln' : '');
      b.fill.style.width = (ratio * 100) + '%';
      b.fill.style.background = S.hero.guard > 0 ? '#5B8FC7' : ratio > 0.35 ? '#5FAE72' : '#C6412F';
    } else b.el.style.display = 'none';
  }

  for (const [k, b] of hpBars) {
    if (!live.has(k)) { b.el.remove(); hpBars.delete(k); }
  }
}

/* ---------------- 시작 ---------------- */
function startGame() {
  for (const [, b] of hpBars) b.el.remove();
  hpBars.clear();
  S = Sim.createSim(C.GENERALS[selHero].id);
  R3.buildWorld(S);
  buildSel = null; paused = false;
  closeAll();
  refreshBuildCards(); refreshSoldiers(); refreshHUD(); refreshObjective();
  const bar0 = $('skillBar'); if (bar0) bar0.dataset.hero = '';
  refreshSkillBar();
  toast('<b>1일차</b> — 33일을 버티면 승리합니다');
}

/* ---------------- 이벤트 처리 ---------------- */
function handleEvents() {
  for (const e of Sim.drainEvents(S)) {
    switch (e.type) {
      case 'toast': toast(e.msg); break;
      case 'fx': addFloater(e.x, e.y, e.text, e.color); break;
      case 'sound': beep(e.name); break;
      case 'build':
        if (e.kind === 'wall') R3.addWall(e.tx, e.ty);
        else if (e.kind === 'trap') R3.addTrap(e.tx, e.ty);
        else R3.addStruct(S.structs[S.structs.length - 1]);
        refreshBuildCards();
        break;
      case 'wallBroken': R3.removeWall(e.tx, e.ty); break;
      case 'trapBroken': R3.removeTrap(e.tx, e.ty); break;
      case 'nodeDepleted': R3.refreshNodes(S); break;
      case 'soldiers': refreshSoldiers(); break;
      case 'objective': refreshObjective(); break;
      case 'warn':
        $('waveAlert').style.display = 'block';
        $('waTitle').textContent = e.name;
        $('waSub').innerHTML = `${e.note}<br>공격 방향: ${e.dirs.map(Sim.dirName).join(' · ')}`;
        break;
      case 'nightStart':
        $('waveAlert').style.display = 'none';
        toast(`<b style="color:#C6412F">${e.name}</b> — 몬스터 ${e.count}마리`);
        break;
      case 'shot': R3.spawnArrow(e.from, e.to); break;
      case 'dodge': R3.spawnShockwave(e.x, e.y, 90, 0x9fd8ff, 0.3); break;
      case 'dodgeSuccess': R3.shakeCamera(0.05); break;
      case 'heroHit': R3.shakeCamera(0.28); break;
      case 'heroSwing': if (e.weapon !== 'bow') R3.shakeCamera(0.05); break;
      case 'monsterSwing': R3.shakeCamera(0.06); break;
      case 'skillFx':
        if (e.kind === 'arc' || e.kind === 'spin') {
          R3.spawnShockwave(e.x, e.y, e.range, S.heroDef.color === '#E08B3C' ? 0xE08B3C : 0xffe0a0, 0.45);
          R3.shakeCamera(0.34);
        } else if (e.kind === 'pierce') {
          R3.spawnBeam(e.x, e.y, e.facing, e.range, 0x9fd8ff);
          R3.shakeCamera(0.2);
        } else if (e.kind === 'guard') {
          R3.spawnAura(0x5B8FC7, e.dur);
        } else if (e.kind === 'frenzy') {
          R3.spawnAura(0xE08B3C, e.dur);
          R3.shakeCamera(0.2);
        }
        break;
      case 'report': showReport(e); break;
      case 'end': showEnd(e); break;
      case 'day': refreshHUD(); break;
    }
  }
}

/* ---------------- HUD ---------------- */
function refreshHUD() {
  if (!S) return;
  $('hDay').innerHTML = `Day ${S.day} <span>/ ${C.TOTAL_DAYS}</span>`;
  $('hPhase').textContent = S.phase === 'night' ? '밤 · 방어'
    : S.phase === 'warn' ? '해질녘 · 대란 임박' : '봄 · 개척기';
  $('hBaseHp').textContent = Math.max(0, Math.round(S.base.hp));
  $('hBaseBar').style.width = Math.max(0, S.base.hp / S.base.maxHp) * 100 + '%';
  $('hHeroName').textContent = S.heroDef.name + (S.hero.dead ? ' (부활 중)' : '');
  $('hHeroBar').style.width = Math.max(0, S.hero.hp / S.hero.maxHp) * 100 + '%';
  $('hWood').textContent = Math.floor(S.res.wood);
  $('hStone').textContent = Math.floor(S.res.stone);
  $('hIron').textContent = Math.floor(S.res.iron);
  const wounded = S.soldiers.filter(s => s.down).length;
  $('hSol').textContent = S.soldiers.length + (wounded ? ` (부상 ${wounded})` : '');
  $('hSolMax').textContent = S.camps;
  $('hShard').textContent = wallet + S.shard;

  const nw = Sim.nextWave(S);
  $('hNext').innerHTML = nw
    ? (S.phase === 'night'
        ? `<span style="color:#E0B44A">전투 중 — 남은 ${S.monsters.length}</span>`
        : `다음 대란 D-${nw.day - S.day} · ${nw.name}`)
    : '<span style="color:#5FAE72">모든 대란 격퇴</span>';

  $('perf').textContent = `${R3.stats ? '' : ''}${R3.R.stats.fps}fps · draw ${R3.R.stats.calls} · 삼각형 ${(R3.R.stats.tris / 1000).toFixed(0)}k`
    + (R3.R.quality.shadows ? '' : ' · 그림자 OFF');
}

function refreshObjective() {
  const o = Sim.currentObjective(S);
  $('objective').innerHTML = o ? `목표 — ${o.t}` : '목표 — Day 33까지 거점을 지켜내세요';
}

function refreshBuildCards() {
  const row = $('buildRow');
  row.innerHTML = '';
  for (const b of C.BUILDS) {
    const can = S ? Sim.canAfford(S, b.cost) : false;
    const locked = b.id === 'forge' && S && S.forge;
    const el = document.createElement('button');
    el.className = 'bcard' + (buildSel === b.id ? ' on' : '');
    el.disabled = !can || locked;
    el.innerHTML = `<div class="e">${b.icon}</div><div class="n">${b.name}</div>`
      + `<div class="c">${Sim.costText(b.cost)}</div>`
      + `<div class="c" style="color:#7d7466;">${b.desc}</div>`
      + (locked ? '<div class="lock">이미 보유</div>' : can ? '' : '<div class="lock">자원 부족</div>');
    el.onclick = () => {
      buildSel = buildSel === b.id ? null : b.id;
      refreshBuildCards();
      R3.setBuildMode(!!buildSel);
      $('modeTag').innerHTML = buildSel
        ? '🧱 <b style="color:var(--gold)">건설 모드</b> — 땅을 눌러 위치를 잡고 확인'
        : '🖱 드래그 = 카메라 회전 · 휠 = 확대';
      if (!buildSel) cancelBuild();
      else toast(`땅을 눌러 <b>${b.name}</b> 위치를 잡으세요`);
    };
    row.appendChild(el);
  }
}

function refreshSoldiers() {
  const row = $('sldRow');
  row.innerHTML = '';
  if (!S || !S.soldiers.length) {
    row.innerHTML = '<span style="font-size:11.5px;color:#7d7466;">고용한 병사가 없습니다.</span>';
    return;
  }
  const NAME = { wood: '목재', stone: '석재', def: '방어' };
  const COLOR = { wood: '#5FAE72', stone: '#9E9384', def: '#C6412F' };
  S.soldiers.forEach((s, i) => {
    const el = document.createElement('button');
    el.className = 'sldChip';
    el.style.borderColor = COLOR[s.role];
    el.innerHTML = s.down
      ? `병사 ${i + 1} · <b style="color:#C6412F">부상 회복 중</b>`
      : `병사 ${i + 1} · <b style="color:${COLOR[s.role]}">${NAME[s.role]}</b>`;
    el.onclick = () => Sim.cycleRole(S, i);
    row.appendChild(el);
  });
}

function refreshCraft() {
  const box = $('craftList');
  box.innerHTML = '';
  for (const c of C.CRAFTS) {
    const owned = c.id === 'pickaxe' && S.pickaxe;
    const lv = c.id === 'weapon' ? S.weaponLv : 0;
    const el = document.createElement('button');
    el.className = 'gcard';
    el.style.borderTopColor = '#E0B44A';
    el.innerHTML = `<div class="gr" style="color:#E0B44A">${c.icon} 제작</div>`
      + `<div class="nm">${c.name}${c.id === 'weapon' ? ` <span style="font-size:12px;color:#9E9384">${lv}/${c.max}</span>` : ''}</div>`
      + `<div class="ds">${c.desc}</div>`
      + `<div class="stat"><span>필요 자원</span><b>${Sim.costText(c.cost)}</b></div>`
      + (owned ? '<div class="stat"><span style="color:#5FAE72">보유 중</span><b></b></div>' : '');
    el.onclick = () => { Sim.doCraft(S, c.id); refreshCraft(); refreshBuildCards(); };
    box.appendChild(el);
  }
}

/* ---------------- 오버레이 ---------------- */
function openScreen(id) { closeAll(); $(id).classList.add('on'); uiOpen = true; }
function closeAll() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  uiOpen = false;
}

function showReport(e) {
  $('repTitle').textContent = `Day ${e.day} — ${e.name} 리포트`;
  $('repSub').innerHTML = `${e.note} · 막아냈습니다.`;
  $('repKill').textContent = `${e.killed}마리`;
  $('repTrap').textContent = `${e.trapPct}%`;
  $('repSold').textContent = `${e.soldPct}%`;
  $('repMvp').textContent = e.mvp;
  $('repDmg').textContent = e.baseDmg;
  $('repShard').textContent = `+${e.reward}`;
  let adv = `<h3>다음 판을 위한 조언</h3>${e.advice}`;
  if (e.trapPct < 25) {
    adv += `<div style="margin-top:8px;color:#E0B44A;font-weight:700;">지금 함정 처치 비율 ${e.trapPct}%. `
      + `목책으로 <b>길을 좁히고</b> 그 좁은 길목에만 함정을 까면 이 숫자가 뜁니다. `
      + `이 수치가 오르는 걸 직접 확인하는 게 이 프로토타입의 목적입니다.</div>`;
  } else if (e.trapPct >= 55) {
    adv += `<div style="margin-top:8px;color:#5FAE72;font-weight:700;">함정 처치 비율 ${e.trapPct}% — 경로 유도가 제대로 먹혔습니다.</div>`;
  }
  $('repAdvice').innerHTML = adv;
  openScreen('scReport');
}

function showEnd(e) {
  wallet += S.shard;
  localStorage.setItem('sg3d_shard', String(wallet));
  const best = Math.max(Number(localStorage.getItem('sg3d_best') || 0), e.day);
  localStorage.setItem('sg3d_best', String(best));
  if (e.win) localStorage.setItem('sg3d_wins', String(Number(localStorage.getItem('sg3d_wins') || 0) + 1));

  $('endTitle').innerHTML = e.win
    ? '<span style="color:#E0B44A">1막 완주</span>'
    : '<span style="color:#C6412F">거점 함락</span>';
  $('endSub').innerHTML = e.win
    ? 'Day 33까지 버텨냈습니다. 실제 서비스라면 여기서 2막(34~66일)이 열립니다.'
    : `Day ${e.day}일차에 거점이 무너졌습니다. 져도 기록은 남습니다.`;
  $('endStats').innerHTML = '<h3>기록</h3>'
    + `<div class="repRow"><span>버틴 일차</span><b>Day ${e.day} / 33</b></div>`
    + `<div class="repRow"><span>최고 기록</span><b>Day ${best}</b></div>`
    + `<div class="repRow"><span>막아낸 대란</span><b>${e.waveIdx} / 3</b></div>`
    + `<div class="repRow"><span>장수</span><b>${e.hero} (${e.grade})</b></div>`
    + `<div class="repRow" style="border-bottom:none;"><span>세운 목책 · 함정</span><b>${e.walls} · ${e.traps}</b></div>`;
  $('endNote').innerHTML = '<h3>기획 검증 체크</h3>이번 판에서 아래 중 하나라도 느끼셨나요?<ul>'
    + '<li><b>장면 A</b> — 함정 배치를 바꿨더니 리포트의 함정 처치 비율이 눈에 띄게 뛰었다</li>'
    + '<li><b>장면 B</b> — "그때 자원을 더 모을걸" 하는 후회가 들었다</li>'
    + '<li><b>장면 C</b> — 거점 체력이 바닥일 때 최후의 저항으로 막아냈다</li></ul>'
    + '하나도 안 나왔다면 시스템을 더 붙이지 말고 1막 핵심 루프를 다시 설계해야 합니다.';
  openScreen('scEnd');
}

/* ---------------- 시작 화면 ---------------- */
function renderHeroCards() {
  const box = $('heroCards');
  box.innerHTML = '';
  C.GENERALS.forEach((g, i) => {
    const el = document.createElement('button');
    el.className = 'gcard' + (i === selHero ? ' on' : '');
    el.style.borderTopColor = g.color;
    el.innerHTML = `<div class="gr" style="color:${g.color}">${g.grade} · ${g.tag}</div>`
      + `<div class="nm">${g.name}</div><div class="ds">${g.desc}</div>`
      + `<div class="stat"><span>전투 스탯</span><b>${Math.round(g.combat * 100)}%</b></div>`
      + `<div class="stat"><span>시작 자원</span><b class="${g.startRes > 1 ? 'up' : 'down'}">${Math.round(g.startRes * 100)}%</b></div>`
      + `<div class="stat"><span>웨이브 강도</span><b class="${g.waveMul > 1 ? 'down' : 'up'}">${Math.round(g.waveMul * 100)}%</b></div>`
      + `<div class="stat"><span>22일 이후 성장</span><b class="${g.lateGrow > 0 ? 'up' : ''}">${g.lateGrow > 0 ? '+' + Math.round(g.lateGrow * 100) + '%' : '없음'}</b></div>`
      + `<div class="stat" style="border-top:none;"><span style="color:${g.color}">${g.skill}</span><b></b></div>`;
    el.onclick = () => { selHero = i; renderHeroCards(); };
    box.appendChild(el);
  });
  const best = Number(localStorage.getItem('sg3d_best') || 0);
  const wins = Number(localStorage.getItem('sg3d_wins') || 0);
  $('bestRec').innerHTML = best ? `최고 기록 <b style="color:#E0B44A">Day ${best}</b> · 완주 ${wins}회` : '';
}

/* ---------------- 가챠 (목업) ---------------- */
const GACHA = [
  { g: '일반', p: .55, c: '#9aa7b0', pool: ['주창','부첨','장익','마대','왕평','유봉','곽준','요화'] },
  { g: '희귀', p: .30, c: '#5B8FC7', pool: ['태사자','장료','서황','감녕'] },
  { g: '영웅', p: .12, c: '#9B6FC9', pool: ['하후돈','황충','위연','방덕'] },
  { g: '전설', p: .027, c: '#E08B3C', pool: ['조운','장비','관우','허저'] },
  { g: '신화', p: .003, c: '#E0B44A', pool: ['여포','제갈량','조조'] }
];
const getDex = () => { try { return JSON.parse(localStorage.getItem('sg3d_dex') || '[]'); } catch { return []; } };

function pull() {
  const total = wallet + (S ? S.shard : 0);
  if (total < 10) { toast('옥새 조각이 부족합니다 (10 필요)'); return; }
  if (S && S.shard >= 10) S.shard -= 10; else wallet -= 10;
  localStorage.setItem('sg3d_shard', String(wallet));

  let pity = Number(localStorage.getItem('sg3d_pity') || 0) + 1;
  let pick;
  if (pity >= 180) pick = GACHA[4];
  else if (pity >= 90) pick = GACHA[Math.random() < .1 ? 4 : 3];
  else {
    const r = Math.random(); let acc = 0;
    pick = GACHA.find(g => (acc += g.p) >= r) || GACHA[0];
  }
  if (pick.g === '전설' || pick.g === '신화') pity = 0;
  localStorage.setItem('sg3d_pity', String(pity));

  const name = pick.pool[Math.floor(Math.random() * pick.pool.length)];
  const dex = getDex(), key = `${pick.g} ${name}`, dup = dex.includes(key);
  if (!dup) { dex.push(key); localStorage.setItem('sg3d_dex', JSON.stringify(dex)); }
  const playable = ['요화','태사자','여포'].includes(name);

  const box = $('pullResult');
  box.style.display = 'block';
  box.style.borderColor = pick.c;
  box.innerHTML = `<div style="font-size:44px;">${pick.g === '신화' ? '🐉' : pick.g === '전설' ? '⚔️' : pick.g === '영웅' ? '🏹' : '🛡️'}</div>`
    + `<div style="font-size:13px;font-weight:800;color:${pick.c}">${pick.g}</div>`
    + `<div style="font-size:22px;font-weight:900;">${name}</div>`
    + `<div style="font-size:11.5px;color:#9E9384;margin-top:6px;">`
    + (dup ? '중복 — 실제 서비스에서는 각성 재료로 전환됩니다'
           : playable ? '이 프로토타입에서 플레이 가능한 장수입니다'
                      : '프로토타입 미구현 — 도감에만 기록됩니다') + '</div>';
  $('shopShard').textContent = wallet + (S ? S.shard : 0);
  $('pityLeft').textContent = Math.max(0, 90 - pity);
  $('dexList').innerHTML = dex.length ? dex.map(x => '· ' + x).join('<br>') : '아직 없습니다.';
  beep('craft');
  refreshHUD();
}

/* ==================================================================
   조작
   ================================================================== */
const keys = {};
const stickVec = { x: 0, y: 0 };

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (!keys[k]) {                       // 꾹 눌러도 한 번만 발동합니다
    if (k === ' ' || k === 'shift') doDodge();
    if (k === 'q') doSkill(0);
    if (k === 'e') doSkill(1);
  }
  keys[k] = true;
  if (e.key === 'Escape') { buildSel = null; refreshBuildCards(); R3.setBuildMode(false); cancelBuild(); }
  if (e.key === 'Enter' && pending) confirmBuild();
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
});

function doDodge() {
  if (!S || uiOpen || paused || S.over) return;
  applyInput();                          // 지금 누르고 있는 방향으로 구릅니다
  Sim.dodgeRoll(S);
  handleEvents();
  refreshSkillBar();
}
function doSkill(slot) {
  if (!S || uiOpen || paused || S.over) return;
  Sim.useSkill(S, slot);
  handleEvents();
  refreshSkillBar();
}
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

/** 입력을 카메라 기준 방향으로 바꿉니다 — 3D에서는 이게 없으면 조작이 뒤집힙니다 */
function applyInput() {
  let ix = 0, iz = 0;
  if (keys['a'] || keys['arrowleft']) ix -= 1;
  if (keys['d'] || keys['arrowright']) ix += 1;
  if (keys['w'] || keys['arrowup']) iz -= 1;
  if (keys['s'] || keys['arrowdown']) iz += 1;
  ix += stickVec.x; iz += stickVec.y;

  const len = Math.hypot(ix, iz);
  if (len < 0.01) { S.input.x = 0; S.input.y = 0; return; }
  if (len > 1) { ix /= len; iz /= len; }

  /* 카메라는 target 기준 (sin(yaw), cos(yaw)) 방향에 서서 안쪽을 봅니다.
     따라서 화면의 "앞"은 그 반대인 (-sin, -cos) 입니다.
     예전 식은 부호가 뒤집혀 W를 누르면 카메라 쪽(뒤)으로 갔습니다. */
  const yaw = R3.getCameraYaw();
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  S.input.x = ix * cos + iz * sin;
  S.input.y = -ix * sin + iz * cos;
}

/* 조이스틱 */
(function () {
  const el = $('stick'), knob = $('knob'), R = 36;
  let active = false;
  const setKnob = (dx, dy) => { knob.style.left = (56 + dx) + 'px'; knob.style.top = (56 + dy) + 'px'; };
  function onMove(e) {
    if (!active) return;
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) { dx = dx / len * R; dy = dy / len * R; }
    setKnob(dx, dy);
    stickVec.x = dx / R; stickVec.y = dy / R;
    e.preventDefault();
  }
  const stop = () => { active = false; stickVec.x = stickVec.y = 0; setKnob(0, 0); };
  el.addEventListener('pointerdown', e => { active = true; el.setPointerCapture(e.pointerId); onMove(e); });
  el.addEventListener('pointermove', onMove);
  ['pointerup','pointercancel','pointerleave'].forEach(t => el.addEventListener(t, stop));
})();

/* 화면 드래그 — 건설 모드면 위치 잡기, 아니면 카메라 회전 */
(function () {
  const stage = $('stage');
  let dragging = false, lastX = 0, lastY = 0;

  /* 확인 버튼·HUD 같은 겹쳐진 UI에서 시작한 입력은 땅 조준으로 넘기지 않습니다.
     이게 없으면 "설치" 버튼을 누르는 순간 그 버튼 밑의 땅을 다시 조준해버립니다. */
  const fromUI = e => !!(e.target && e.target.closest &&
    e.target.closest('#buildConfirm, #hud, #minimapWrap, #objective, #buildHint'));

  stage.addEventListener('pointerdown', e => {
    if (!S || S.over || fromUI(e)) return;
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    stage.setPointerCapture(e.pointerId);
    if (buildSel) aimAt(e.clientX, e.clientY);
  });

  stage.addEventListener('pointermove', e => {
    if (!S || fromUI(e)) return;
    if (buildSel && !dragging && !pending) { aimAt(e.clientX, e.clientY); return; }
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (buildSel) aimAt(e.clientX, e.clientY);     // 끌어서 위치를 옮깁니다
    else R3.orbitCamera(dx, dy);
  });

  ['pointerup','pointercancel'].forEach(t => stage.addEventListener(t, e => {
    if (fromUI(e)) return;
    if (!dragging) return;
    dragging = false;
    // 손을 떼면 그 자리에 고정하고 "설치할까요?"를 묻습니다
    if (buildSel && aim) { pending = true; showConfirm(); }
  }));

  stage.addEventListener('wheel', e => {
    e.preventDefault();
    R3.zoomCamera(e.deltaY * 0.012);
  }, { passive: false });

  // 모바일 핀치 확대
  let pinchDist = 0;
  stage.addEventListener('touchmove', e => {
    if (e.touches.length !== 2) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                         e.touches[0].clientY - e.touches[1].clientY);
    if (pinchDist) R3.zoomCamera((pinchDist - d) * 0.05);
    pinchDist = d;
  }, { passive: true });
  stage.addEventListener('touchend', () => { pinchDist = 0; });

  function aimAt(cx, cy) {
    const t = R3.screenToTile(cx, cy);
    if (!t || !Sim.inMap(t.tx, t.ty)) { aim = null; R3.hideGhost(); hideConfirm(); return; }
    aim = t;
    pending = false;
    hideConfirm();
    refreshGhost();
  }
})();

/* ── 설치 확정 흐름 ──
   바로 지어버리면 잘못 놓고 후회합니다.
   위치를 잡아 보여주고, 확인을 눌러야 실제로 지어집니다.
   (급할 땐 "바로 설치"를 켜면 확인 없이 지어집니다) */
let aim = null, pending = false, instantBuild = false;

function refreshGhost() {
  if (!S || !buildSel || !aim) { R3.hideGhost(); return; }
  const chk = Sim.canBuildAt(S, aim.tx, aim.ty, buildSel);
  R3.showGhost(aim.tx, aim.ty, chk.ok, buildSel, pending);
  const hint = $('buildHint');
  if (hint) {
    const why = { occupied: '이미 무언가 있습니다', far: '너무 멉니다 — 가까이 가세요',
                  cost: '자원이 부족합니다', owned: '이미 지었습니다', out: '지도 밖입니다' };
    hint.textContent = chk.ok ? '' : (why[chk.why] || '');
    hint.style.display = chk.ok ? 'none' : '';
  }
}

function showConfirm() {
  if (instantBuild) { confirmBuild(); return; }
  const chk = Sim.canBuildAt(S, aim.tx, aim.ty, buildSel);
  const box = $('buildConfirm');
  if (!box) return;
  box.style.display = 'flex';
  $('btnConfirmBuild').disabled = !chk.ok;
  refreshGhost();
}
function hideConfirm() {
  const box = $('buildConfirm');
  if (box) box.style.display = 'none';
}
function confirmBuild() {
  if (!aim || !buildSel) return;
  const built = Sim.tryBuild(S, aim.tx, aim.ty, buildSel);
  handleEvents();
  pending = false;
  hideConfirm();
  if (built) { aim = null; R3.hideGhost(); }
  else refreshGhost();
}
function cancelBuild() {
  pending = false; aim = null;
  hideConfirm(); R3.hideGhost();
}

/* ---------------- 버튼 ---------------- */
$('btnStart').onclick = () => startGame();
$('btnAgain').onclick = () => { renderHeroCards(); openScreen('scTitle'); };
$('btnRepClose').onclick = () => { Sim.closeReport(S); handleEvents(); if (!S.over) closeAll(); };
$('btnCancel').onclick = () => { buildSel = null; refreshBuildCards(); R3.setBuildMode(false); cancelBuild(); };
if ($('btnConfirmBuild')) $('btnConfirmBuild').onclick = confirmBuild;
if ($('btnCancelBuild')) $('btnCancelBuild').onclick = cancelBuild;
if ($('chkInstant')) $('chkInstant').onchange = e => { instantBuild = e.target.checked; };
$('btnHire').onclick = () => Sim.hireSoldier(S);
$('btnCraft').onclick = () => {
  if (!S) return;
  if (!S.forge) { toast('먼저 <b>대장간</b>을 지어야 합니다'); return; }
  refreshCraft(); openScreen('scCraft');
};
$('btnCraftClose').onclick = () => closeAll();
$('btnShop').onclick = () => {
  $('shopShard').textContent = wallet + (S ? S.shard : 0);
  $('pityLeft').textContent = Math.max(0, 90 - Number(localStorage.getItem('sg3d_pity') || 0));
  const dex = getDex();
  $('dexList').innerHTML = dex.length ? dex.map(x => '· ' + x).join('<br>') : '아직 없습니다.';
  openScreen('scShop');
};
$('btnShopClose').onclick = () => { if (S && !S.over) closeAll(); else openScreen(S && S.over ? 'scEnd' : 'scTitle'); };
$('btnPull').onclick = pull;
$('btnPause').onclick = () => {
  paused = !paused;
  $('btnPause').textContent = paused ? '▶ 계속하기' : '⏸ 일시정지';
};
$('btnSound').onclick = () => { soundOn = !soundOn; $('btnSound').textContent = soundOn ? '🔊' : '🔇'; };

/* ==================================================================
   메인 루프 — 고정 타임스텝
   프레임이 흔들려도 물리·AI가 일정하게 돌도록 합니다.
   ================================================================== */
const STEP = 1 / 60;
let acc = 0, last = 0;

function frame(ts) {
  const raw = last ? Math.min((ts - last) / 1000, 0.25) : 0;
  last = ts;

  if (S) {
    if (!uiOpen && !paused && !S.over) {
      applyInput();
      acc += raw;
      let guard = 0;
      while (acc >= STEP && guard++ < 8) { Sim.update(S, STEP); acc -= STEP; }
      handleEvents();
    }
    R3.sync(S, raw);
    updateFloaters(raw);
    updateHpBars();
    hudTimer += raw;
    if (hudTimer > 0.12) { hudTimer = 0; refreshHUD(); refreshSkillBar(); }
  }
  requestAnimationFrame(frame);
}
let hudTimer = 0;

/* ---------------- 부팅 ---------------- */
R3.initRenderer($('stage'));
R3.attachMinimap($('minimap'));

/* models/manifest.json 에 등록된 3D 모델이 있으면 먼저 읽어옵니다.
   없으면 아무 일도 없이 지나가고 도형으로 그립니다. */
$('btnStart').disabled = true;
Models.load().then(m => {
  $('btnStart').disabled = false;
  if (m.size) toast(`3D 모델 ${m.size}종을 불러왔습니다`);
}).catch(() => { $('btnStart').disabled = false; });
renderHeroCards();
refreshBuildCards();
refreshSoldiers();
requestAnimationFrame(frame);

// 개발자 검수용
window.__sg = { get S() { return S; }, Sim, R3, C, startGame };
