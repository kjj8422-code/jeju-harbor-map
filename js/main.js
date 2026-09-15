/* ==================================================================
   부팅 · 조작 · 화면 연결
   규칙(sim) ↔ 화면(render3d) 을 이어주고, 입력을 받습니다.
   ================================================================== */

import * as C from './config.js';
import * as Sim from './sim.js';
import * as R3 from './render3d.js';
import * as Models from './models.js';
import * as Audio from './audio.js';

const $ = id => document.getElementById(id);
let S = null, selHero = 1, paused = false, uiOpen = true;
let buildSel = null, soundOn = true;
let wallet = Number(localStorage.getItem('sg3d_shard') || 0);

/* 뽑아서 열린 장수들 — 기본 3명은 항상 열려 있습니다 */
function unlockedHeroes() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('sg3d_heroes') || '[]'); } catch (e) { saved = []; }
  return new Set([...C.FREE_HEROES, ...saved]);
}
function unlockHero(id) {
  const set = unlockedHeroes();
  if (set.has(id)) return false;
  const saved = [...set].filter(x => !C.FREE_HEROES.includes(x));
  saved.push(id);
  localStorage.setItem('sg3d_heroes', JSON.stringify(saved));
  return true;
}

/* ---------------- 소리 ----------------
   실제 합성은 js/audio.js 가 합니다. 여기서는 "언제 어떤 소리를 낼지"만 정합니다. */
let soundOnMusic = true;

/* 브라우저는 사용자가 한 번이라도 누르기 전에는 소리를 못 냅니다(자동재생 차단).
   그래서 첫 입력 때 오디오를 깨웁니다. */
function wakeAudio() {
  Audio.ensure();
  if (soundOnMusic) Audio.startMusic();
  window.removeEventListener('pointerdown', wakeAudio);
  window.removeEventListener('keydown', wakeAudio);
}
window.addEventListener('pointerdown', wakeAudio);
window.addEventListener('keydown', wakeAudio);

/** 무기에 맞는 타격음을 고릅니다 — 검·활·극이 서로 다르게 들려야 합니다 */
function hitSoundFor(crit) {
  if (crit) return 'hitCrit';
  const w = S ? S.heroDef.weapon : 'sword';
  return w === 'bow' ? 'hitBow' : w === 'halberd' ? 'hitHalberd' : 'hitSword';
}

function refreshSkillBar() {
  if (!S) return;
  const bar = $('skillBar');
  if (!bar) return;
  const defs = S.heroDef.skills || [];
  if (bar.dataset.hero !== S.heroDef.id) {
    bar.dataset.hero = S.heroDef.id;
    bar.innerHTML = defs.map((sk, i) =>
      `<button class="skillBtn${sk.ult ? ' ult' : ''}" data-slot="${i}" title="${sk.desc}">
         <span class="k">${sk.key}</span><span class="n">${sk.name}</span>
         <span class="cd" id="skcd${i}"></span></button>`).join('');
    bar.querySelectorAll('[data-slot]').forEach(b =>
      b.onclick = () => doSkill(Number(b.dataset.slot)));
  }
  for (let i = 0; i < defs.length; i++) {
    const el = $('skcd' + i);
    if (!el) continue;
    const cd = Math.max(0, S.hero.skillCd[i]);
    el.textContent = cd > 0 ? cd.toFixed(1) : '';
    el.parentElement.classList.toggle('ready', cd <= 0);
  }
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

function addDamageNumber(e) {
  const el = document.createElement('div');
  el.className = 'dmgNum' + (e.crit ? ' crit' : '') + (e.src === 'trap' ? ' trap' : '');
  el.textContent = (e.crit ? '' : '-') + e.amount + (e.crit ? '!' : '');
  $('fxLayer').appendChild(el);
  floaters.push({ el, x: e.x + (Math.random() - 0.5) * 14, y: e.y + (Math.random() - 0.5) * 10,
                  life: e.crit ? 1.2 : 0.9, rise: 0 });
  if (floaters.length > 60) { const f = floaters.shift(); f.el.remove(); }
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
    b = { el, fill: el.firstChild, mode: 'hp' };
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
    if (b.mode !== 'hp') { b.mode = 'hp'; b.el.textContent = ''; b.el.appendChild(b.fill); }
    b.el.className = 'hpBar' + (m.boss ? ' boss' : '');
    b.fill.style.width = (ratio * 100) + '%';
    b.fill.style.background = m.boss ? '#E0B44A' : ratio > 0.4 ? '#C6412F' : '#8C2B1F';
  }

  // 병사·용병 — 다쳤을 때만. 쓰러진 병사는 복귀까지 남은 초를 머리 위에 띄웁니다.
  for (const so of S.soldiers) {
    const ratio = Math.max(0, so.hp / so.maxHp);
    if (!so.down && ratio >= 0.999) continue;
    live.add(so);
    const b = getHpBar(so);
    const p = R3.worldToScreen(so.x, so.y, 1.9);
    if (!p.visible) { b.el.style.display = 'none'; continue; }
    b.el.style.display = '';
    b.el.style.left = p.x + 'px';
    b.el.style.top = p.y + 'px';
    const mode = so.down ? 'down' : 'hp';
    if (b.mode !== mode) {                       // 모드가 바뀔 때만 DOM 을 손댑니다
      b.mode = mode;
      if (mode === 'down') { b.el.className = 'downTimer'; b.el.textContent = ''; }
      else { b.el.className = 'hpBar' + (so.merc ? ' merc' : ''); b.el.textContent = ''; b.el.appendChild(b.fill); }
    }
    if (mode === 'down') {
      b.el.textContent = `🩹 ${so.name} 복귀 ${so.downT.toFixed(1)}초`;
    } else {
      b.fill.style.width = (ratio * 100) + '%';
      b.fill.style.background = so.merc ? '#5B8FC7' : '#5FAE72';
    }
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

/* ---------------- 부활 카운트다운 ----------------
   쓰러진 다음 "언제 돌아오는지" 를 모르면 그냥 멈춘 것처럼 느껴집니다.
   남은 초를 크게 보여주고, 탈락이 아니라는 것을 같이 적어둡니다. */
let respawnTotal = 0;
function updateRespawnBox() {
  const box = $('respawnBox');
  if (!box || !S) return;
  const h = S.hero;
  if (!h.dead) { if (box.style.display !== 'none') box.style.display = 'none'; respawnTotal = 0; return; }
  if (!respawnTotal) respawnTotal = Math.max(0.1, h.respawn);
  box.style.display = 'block';
  $('respawnSec').textContent = Math.max(0, h.respawn).toFixed(1);
  $('respawnBar').style.width = Math.min(100, (1 - h.respawn / respawnTotal) * 100) + '%';
}

/* ---------------- 시작 ---------------- */
function startGame() {
  for (const [, b] of hpBars) b.el.remove();
  hpBars.clear();
  S = Sim.createSim(C.GENERALS[selHero].id, awakenOf(C.GENERALS[selHero].id));
  R3.buildWorld(S);
  buildSel = null; paused = false;
  closeAll();
  refreshBuildCards(); refreshSoldiers(); refreshHUD(); refreshObjective();
  const bar0 = $('skillBar'); if (bar0) bar0.dataset.hero = '';
  refreshSkillBar();
  refreshMercs();
  Audio.ensure(); if (soundOnMusic) Audio.startMusic();
  toast('<b>1일차</b> — 99일을 버티면 승리합니다');
  const d0 = Sim.upcomingDirs(S).map(Sim.dirName).join(' · ');
  toast(`첫 대란은 <b>11일</b> · <b style="color:#E0554A">${d0}</b>에서 옵니다 — 바닥의 붉은 화살표가 그 길입니다`);
}

/* ---------------- 이벤트 처리 ---------------- */
function handleEvents() {
  for (const e of Sim.drainEvents(S)) {
    switch (e.type) {
      case 'toast': toast(e.msg); break;
      case 'fx': addFloater(e.x, e.y, e.text, e.color); break;
      case 'sound': Audio.play(e.name); break;
      case 'build':
        if (e.kind === 'wall') R3.addWall(e.tx, e.ty);
        else if (e.kind === 'trap') R3.addTrap(e.tx, e.ty);
        else R3.addStruct(S.structs[S.structs.length - 1]);
        if (e.kind === 'wall') R3.markPathDirty();   // 목책이 길을 바꿉니다
        refreshBuildCards();
        break;
      case 'wallBroken': R3.removeWall(e.tx, e.ty); R3.markPathDirty(); Audio.play('wallBreak'); break;
      case 'structRemoved': R3.removeStruct(e.tx, e.ty); break;
      case 'demolished': refreshBuildCards(); refreshSoldiers(); refreshHUD(); break;
      case 'trapBroken': R3.removeTrap(e.tx, e.ty); break;
      case 'nodeDepleted': R3.refreshNodes(S); break;
      case 'soldiers': refreshSoldiers(); break;
      case 'objective': refreshObjective(); break;
      case 'warn':
        $('waveAlert').style.display = 'block';
        $('waTitle').textContent = e.name;
        $('waSub').innerHTML = `${e.note}<br>공격 방향: <b>${e.dirs.map(Sim.dirName).join(' · ')}</b>`
          + `<br><span style="font-size:11px;opacity:.8">바닥의 붉은 화살표가 적이 걸어올 길입니다</span>`;
        break;
      case 'nightStart':
        $('waveAlert').style.display = 'none';
        toast(`<b style="color:#C6412F">${e.name}</b> — 몬스터 ${e.count}마리`);
        break;
      case 'shot': R3.spawnArrow(e.from, e.to); Audio.play('shoot'); break;
      case 'towerShot': R3.spawnArrow(e.from, e.to); break;
      case 'hitNumber':
        addDamageNumber(e);
        if (e.src === 'trap') Audio.play('hitTrap');
        break;
      case 'hitSpark':
        R3.spawnHitSpark(e.x, e.y, e.crit);
        Audio.play(hitSoundFor(e.crit));
        if (e.crit) R3.shakeCamera(0.22);
        break;
      case 'baseUpgraded': R3.rebuildBase(S); refreshHUD(); break;
      case 'crafted': refreshCraft(); refreshBuildCards(); break;
      case 'invulnBlock': R3.shakeCamera(0.05); Audio.play('block'); break;
      case 'heroHit': R3.shakeCamera(0.28); Audio.play('heroHit'); break;
      case 'heroSwing':
        Audio.play(e.weapon === 'bow' ? 'shoot' : e.weapon === 'halberd' ? 'swingBig' : 'swing');
        if (e.weapon !== 'bow') R3.shakeCamera(0.05);
        break;
      case 'monsterSwing': R3.shakeCamera(0.06); break;
      case 'skillFx':
        if (e.kind === 'arc' || e.kind === 'spin') {
          const col = S.heroDef.color === '#E08B3C' ? 0xE08B3C : 0xffe0a0;
          R3.spawnShockwave(e.x, e.y, e.range, e.ult ? 0xFFD98A : col, e.ult ? 0.8 : 0.45);
          if (e.ult) {                       // 궁극기는 파동을 세 겹으로 겹칩니다
            R3.spawnShockwave(e.x, e.y, e.range * 0.62, 0xffffff, 0.55);
            R3.spawnShockwave(e.x, e.y, e.range * 1.25, col, 1.0);
            R3.spawnAura(0x9fd8ff, 1.3);
          }
          R3.shakeCamera(e.ult ? 0.85 : 0.34);
        } else if (e.kind === 'pierce') {
          R3.spawnBeam(e.x, e.y, e.facing, e.range, e.ult ? 0xFFD98A : 0x9fd8ff);
          if (e.ult) { R3.spawnAura(0x9fd8ff, 1.2); R3.spawnShockwave(e.x, e.y, e.range * 0.3, 0xffffff, 0.5); }
          R3.shakeCamera(e.ult ? 0.6 : 0.2);
        } else if (e.kind === 'multi') {
          if (e.ult) { R3.spawnAura(0x9fd8ff, 1.3); R3.shakeCamera(0.4); }
        } else if (e.kind === 'guard') {
          R3.spawnAura(0x5B8FC7, e.dur);
        } else if (e.kind === 'frenzy') {
          R3.spawnAura(0xE08B3C, e.dur);
          R3.shakeCamera(0.2);
        }
        break;
      case 'report': showReport(e); break;
      case 'end': showEnd(e); break;
      case 'day': refreshHUD(); refreshSoldiers(); break;
      case 'respawn': Audio.play('respawn'); break;
      case 'baseHit': Audio.play('hitWall'); break;
    }
  }
}

/* ---------------- HUD ---------------- */
function refreshHUD() {
  if (!S) return;
  const act = C.actOf(S.day);
  $('hDay').innerHTML = `Day ${S.day} <span>/ ${C.TOTAL_DAYS} · ${act.act}막 ${act.name}</span>`;
  $('hPhase').textContent = S.phase === 'night' ? '밤 · 방어'
    : S.phase === 'warn' ? '해질녘 · 대란 임박' : '낮 · 채집과 건설';
  Audio.setPhase(S.phase === 'night' || S.phase === 'warn' ? 'night' : 'day');

  /* ★ 다음 날까지 얼마나 남았는지.
     이게 없으면 "지금 캐도 되나, 지어도 되나" 를 판단할 수 없습니다. */
  const dt = $('dayTimer');
  if (S.phase === 'day') {
    dt.classList.remove('night');
    const left = Math.max(0, C.DAY_SEC - S.dayT);
    $('hDayLeft').textContent = left.toFixed(1);
    $('hDayBar').style.width = (S.dayT / C.DAY_SEC * 100) + '%';
    dt.querySelector('.dt').innerHTML = `다음 날까지 <b id="hDayLeft">${left.toFixed(1)}</b>초`;
  } else if (S.phase === 'warn') {
    dt.classList.add('night');
    const left = Math.max(0, C.WARN_SEC - S.warnT);
    $('hDayBar').style.width = (S.warnT / C.WARN_SEC * 100) + '%';
    dt.querySelector('.dt').innerHTML =
      `<b style="color:#E0554A">몰려오기까지 ${left.toFixed(1)}초</b>`;
  } else {
    dt.classList.add('night');
    $('hDayBar').style.width = '100%';
    dt.querySelector('.dt').innerHTML =
      `<b style="color:#E0554A">전투 중</b> — 남은 적 ${S.monsters.length}`;
  }
  $('hBaseHp').textContent = Math.max(0, Math.round(S.base.hp));
  $('hBaseBar').style.width = Math.max(0, S.base.hp / S.base.maxHp) * 100 + '%';
  $('hHeroName').textContent = S.heroDef.name
    + (S.hero.dead ? ` — 부활까지 ${Math.max(0, S.hero.respawn).toFixed(1)}초` : '');
  $('hHeroBar').style.width = Math.max(0, S.hero.hp / S.hero.maxHp) * 100 + '%';
  $('hWood').textContent = Math.floor(S.res.wood);
  $('hStone').textContent = Math.floor(S.res.stone);
  $('hIron').textContent = Math.floor(S.res.iron);
  $('hHerb').textContent = Math.floor(S.res.herb);
  $('hHide').textContent = Math.floor(S.res.hide);
  $('hPotion').textContent = S.potions;
  $('hBaseLv').textContent = (C.BASE_LEVELS.find(b => b.lv === S.baseLv) || {}).name || '';
  const wounded = S.soldiers.filter(s => s.down).length;
  const mercN = S.soldiers.filter(s => s.merc).length;
  const regular = S.soldiers.length - mercN;
  $('hSol').textContent = regular + (mercN ? ` +용병 ${mercN}` : '') + (wounded ? ` (부상 ${wounded})` : '');
  $('hSolMax').textContent = S.camps;
  $('hShard').textContent = wallet + S.shard;

  const nw = Sim.nextWave(S);
  $('hNext').innerHTML = nw
    ? (S.phase === 'night'
        ? `<span style="color:#E0B44A">전투 중 — 남은 ${S.monsters.length}</span>`
        : `다음 대란 D-${nw.day - S.day} · ${nw.name}`)
    : '<span style="color:#5FAE72">모든 대란 격퇴</span>';

  // ★ 침공 방향을 첫날부터 보여줍니다 — 이게 없으면 어디를 막을지 판단할 수 없습니다
  const dirs = Sim.upcomingDirs(S);
  $('hDirs').innerHTML = dirs.length
    ? `침공 방향 <b>${dirs.map(Sim.dirName).join(' · ')}</b>`
      + `<br><span style="opacity:.75">바닥의 붉은 화살표 = 적이 걸어올 길</span>`
    : '남은 대란 없음';

  /* ★ 깔아둔 함정 중 몇 개가 실제로 그 길 위에 있는가.
     목책을 옮겨 길이 바뀌면 이 숫자가 바로 변합니다 — 판단의 근거가 됩니다. */
  refreshObjective();          // 부족분이 실시간으로 보이게

  const tp = Sim.trapsOnPath(S);
  const ti = $('trapInfo');
  if (!dirs.length) {
    // 남은 대란이 없으면 "침공로" 자체가 없습니다. 0/n 으로 겁주지 않습니다.
    ti.className = '';
    ti.textContent = '';
  } else if (!tp.total) {
    ti.className = '';
    ti.textContent = '함정 없음 — 붉은 화살표 위에 까세요';
  } else {
    const good = tp.on === tp.total;
    ti.className = tp.on === 0 ? 'bad' : good ? 'good' : '';
    ti.innerHTML = `함정 <b>${tp.on}/${tp.total}</b> 개가 침공로 위`
      + (tp.on === 0 ? ' — 한 마리도 못 잡습니다' : good ? ' ✓' : '');
  }

  $('perf').textContent = `${R3.stats ? '' : ''}${R3.R.stats.fps}fps · draw ${R3.R.stats.calls} · 삼각형 ${(R3.R.stats.tris / 1000).toFixed(0)}k`
    + (R3.R.quality.shadows ? '' : ' · 그림자 OFF');
}

/* 현재 목표가 "무언가를 짓거나 만들라" 면, 그 비용과 부족분을 함께 보여줍니다.
   자동 플레이를 돌려보니 "지금 뭐가 모자란지" 를 모르면 엉뚱한 자원만 캐다가
   성도 못 올리고 함정도 못 깝니다. 사람도 똑같이 헤맵니다. */
function objectiveCost(S2, idx) {
  const o = Sim.OBJECTIVES[idx];
  if (!o) return null;
  const t = o.t;
  if (t.includes('병사를 고용')) return C.SOLDIER_COST;
  if (/석성|철옹성/.test(t)) { const nx = Sim.nextBaseLevel(S2); return nx ? nx.cost : null; }
  for (const c of C.CRAFTS) if (t.includes(c.name)) return Sim.craftCost(S2, c.id);
  for (const b of C.BUILDS) if (t.includes(b.name)) return b.cost;
  return null;
}

function refreshObjective() {
  const o = Sim.currentObjective(S);
  if (!o) { $('objective').innerHTML = `목표 — Day ${C.TOTAL_DAYS}까지 거점을 지켜내세요`; return; }
  const cost = S ? objectiveCost(S, S.objIdx) : null;
  let need = '';
  if (cost) {
    const parts = [];
    for (const r in cost) {
      const have = Math.floor(S.res[r]), want = cost[r];
      const R = C.RESOURCES[r];
      parts.push(`<span class="oNeed${have >= want ? ' ok' : ''}">${R.icon} ${have}/${want}</span>`);
    }
    if (parts.length) need = `<div class="oCost">필요 ${parts.join(' ')}</div>`;
  }
  $('objective').innerHTML = `목표 — ${o.t}${need}`;
}

/* 화면 안 건설 바 — 마우스를 화면 밖으로 내리지 않고 고를 수 있게 합니다.
   숫자키 1~4 가 그대로 대응합니다. */
function refreshBuildDock() {
  const row = $('buildDockRow');
  if (!row) return;
  const sig = C.BUILDS.map(b =>
    `${b.id}${buildSel === b.id ? '*' : ''}${S && Sim.canAfford(S, b.cost) ? '1' : '0'}`
    + `${b.id === 'forge' && S && S.forge ? 'L' : ''}`).join('|')
    + (buildSel === DEMOLISH ? '|X*' : '|X');
  if (row.dataset.sig === sig) return;          // 바뀐 게 없으면 DOM 을 손대지 않습니다
  row.dataset.sig = sig;
  row.innerHTML = '';
  C.BUILDS.forEach((b, i) => {
    const can = S ? Sim.canAfford(S, b.cost) : false;
    const locked = b.id === 'forge' && S && S.forge;
    const el = document.createElement('button');
    el.className = 'bdBtn' + (buildSel === b.id ? ' on' : '');
    el.disabled = !can || locked;
    el.title = b.desc;
    el.innerHTML = `<span class="num">${i + 1}</span><span class="ic">${b.icon}</span>`
      + `<span class="tx"><b class="nm">${b.name}</b>`
      + `<span class="cs${can ? '' : ' lack'}">${locked ? '이미 보유' : Sim.costText(b.cost)}</span></span>`;
    el.onclick = () => selectBuild(b.id);
    row.appendChild(el);
  });

  /* 철거 — 목책을 옮기면 적의 길이 바뀌고, 예전 함정이 길에서 벗어납니다.
     치울 수 없으면 그 자원이 영원히 묶입니다. 절반을 돌려받고 다시 놓게 합니다. */
  const del = document.createElement('button');
  del.className = 'bdBtn del' + (buildSel === DEMOLISH ? ' on' : '');
  del.title = '목책·함정·건물을 부수고 자원의 절반을 돌려받습니다 (숫자키 5)';
  del.innerHTML = `<span class="num">5</span><span class="ic">⛏️</span>`
    + `<span class="tx"><b class="nm">철거</b><span class="cs">절반 회수</span></span>`;
  del.onclick = () => selectBuild(DEMOLISH);
  row.appendChild(del);
}

const DEMOLISH = '__demolish';

/** 건설 카드 선택 — 화면 안 바와 화면 밖 카드가 같은 함수를 씁니다 */
function selectBuild(id) {
  buildSel = buildSel === id ? null : id;
  refreshBuildCards();
  R3.setBuildMode(!!buildSel);
  $('modeTag').innerHTML = buildSel
    ? '🧱 <b style="color:var(--gold)">건설 모드</b> — 땅을 눌러 위치를 잡고 확인'
    : '🖱 드래그 = 카메라 회전 · 휠 = 확대';
  if (!buildSel) cancelBuild();
  else if (buildSel === DEMOLISH) {
    $('modeTag').innerHTML = '⛏️ <b style="color:#e39184">철거 모드</b> — 부술 것을 누르세요';
    toast('부술 것을 누르세요 — <b>자원의 절반</b>을 돌려받습니다');
  } else {
    const b = C.BUILDS.find(x => x.id === buildSel);
    toast(`땅을 눌러 <b>${b.name}</b> 위치를 잡으세요`
        + (b.id === 'trap' ? ' — <b style="color:#E0554A">붉은 화살표 위</b>에 놓아야 잡습니다' : ''));
  }
  Audio.play(buildSel ? 'build' : 'deny');
}

/* 예전에는 화면 밖에도 같은 카드를 한 벌 더 그렸습니다.
   화면 안 바가 생긴 뒤로는 중복이라 없앴습니다 — 설명은 📖 안내와 버튼 툴팁에 있습니다. */
function refreshBuildCards() { refreshBuildDock(); }

function refreshSoldiers() {
  const row = $('sldRow');
  row.innerHTML = '';
  refreshMercs();
  if (!S || !S.soldiers.length) {
    row.innerHTML = '<span style="font-size:11.5px;color:#7d7466;">고용한 병사가 없습니다.</span>';
    return;
  }
  const NAME = { wood: '목재', stone: '석재', herb: '약초', iron: '철', def: '방어' };
  const COLOR = { wood: '#5FAE72', stone: '#9E9384', herb: '#6fbf7a', iron: '#c98a4b', def: '#C6412F' };
  S.soldiers.forEach((s, i) => {
    const el = document.createElement('button');
    el.className = 'sldChip' + (s.merc ? ' merc' : '');
    el.style.borderColor = s.merc ? '#5B8FC7' : COLOR[s.role];
    const label = s.merc ? `${s.icon} ${s.name}` : `병사 ${i + 1}`;
    const body = s.down
      ? `<b style="color:#C6412F">부상 ${s.downT.toFixed(0)}초</b>`
      : `<b style="color:${s.merc ? '#5B8FC7' : COLOR[s.role]}">${NAME[s.role]}</b>`;
    el.innerHTML = `${label} · ${body}`
      + (s.merc ? `<span class="ct">계약 ${s.contract}일 남음</span>` : '');
    const canCycle = !s.merc || s.merc === 'gatherer';
    el.title = canCycle ? `눌러서 역할을 바꿉니다 (${Sim.roleList(S, s).map(r => NAME[r]).join(' → ')})`
                        : '전투 용병은 역할이 고정입니다';
    el.onclick = () => { if (canCycle) { Sim.cycleRole(S, i); Audio.play('build'); } };
    row.appendChild(el);
  });
}

/* ---------------- 용병 ---------------- */
function totalShard() { return wallet + (S ? S.shard : 0); }

/** 옥새 조각은 저장분(wallet)과 이번 판(S.shard)에 나뉘어 있습니다.
    화면에는 합쳐서 보여주므로, 쓸 때도 합쳐서 쓸 수 있게 먼저 모아줍니다. */
function pullShardIntoRun(need) {
  if (!S) return false;
  if (S.shard >= need) return true;
  const short = need - S.shard;
  if (wallet < short) return false;
  wallet -= short; S.shard += short;
  localStorage.setItem('sg3d_shard', String(wallet));
  return true;
}

function refreshMercs() {
  const row = $('mercRow');
  if (!row) return;
  row.innerHTML = '';
  C.MERCS.forEach(m => {
    const have = totalShard();
    const el = document.createElement('button');
    el.className = 'mercCard';
    el.disabled = !S || S.over || have < m.cost;
    el.innerHTML = `<div class="mh"><span class="mn">${m.icon} ${m.name}</span>
        <span class="mc">🔶 ${m.cost}</span></div>
      <div class="md">${m.desc}</div>
      <div class="mt">💡 ${m.tip}</div>`;
    el.onclick = () => {
      if (!S) return;
      if (!pullShardIntoRun(m.cost)) { toast(`옥새 조각이 부족합니다 — <b>${m.cost}</b> 필요`); Audio.play('deny'); return; }
      Sim.hireMerc(S, m.id);
      handleEvents(); refreshSoldiers(); refreshHUD();
    };
    row.appendChild(el);
  });
}

function refreshCraft() {
  if (!S) return;
  // 성 업그레이드
  const nx = Sim.nextBaseLevel(S);
  const upChk = Sim.canUpgradeBase(S);
  $('baseUpgrade').innerHTML = nx
    ? `<div class="gRow">
         <div class="gHead"><span class="gIcon">🏯</span>
           <b>${S.baseLv}단계 → ${nx.lv}단계 ${nx.name}</b>
           <span class="gHave">체력 ${S.base.maxHp} → ${nx.maxHp}</span></div>
         <div class="gLine"><span class="gTag">필요</span>${costChips(nx.cost)}</div>
         <div class="gLine"><span class="gTag">효과</span>${nx.desc}</div>
         <button class="btn ${upChk.ok ? 'gold' : ''}" id="btnUpgradeBase"
           ${upChk.ok ? '' : 'disabled'} style="margin-top:6px;">
           ${upChk.ok ? '🏯 성 올리기' : upChk.why}</button>
       </div>`
    : `<div class="gRow done"><div class="gHead"><span class="gIcon">🏯</span>
         <b>철옹성 — 최고 단계입니다</b></div></div>`;
  const ub = $('btnUpgradeBase');
  if (ub) ub.onclick = () => { Sim.upgradeBase(S); handleEvents(); refreshCraft(); refreshHUD(); };

  // 장비 — 종류별로 묶어서
  const groups = {};
  for (const c of C.CRAFTS) (groups[c.group] = groups[c.group] || []).push(c);

  $('craftList').innerHTML = Object.entries(groups).map(([g, list]) => `
    <div class="craftGroup"><h4>${g}</h4>${list.map(c => {
      const owned = Sim.hasCraft(S, c.id);
      const chk = Sim.canCraft(S, c.id);
      const extra = c.id === 'weapon' ? ` <span class="gHave">${S.weaponLv}/${c.max}단계</span>`
                  : c.id === 'potion' ? ` <span class="gHave">보유 ${S.potions}개</span>` : '';
      return `<button class="craftItem${owned ? ' done' : ''}" data-craft="${c.id}"
                ${chk.ok ? '' : 'disabled'}>
        <div class="gHead"><span class="gIcon">${c.icon}</span><b>${c.name}</b>${extra}
          <span class="gHave">${owned ? '보유 중' : (chk.ok ? '만들 수 있음' : chk.why)}</span></div>
        <div class="gLine"><span class="gTag">필요</span>${costChips(Sim.craftCost(S, c.id))}</div>
        <div class="gLine"><span class="gTag">효과</span>${c.effect}</div>
      </button>`;
    }).join('')}</div>`).join('');

  $('craftList').querySelectorAll('[data-craft]').forEach(b => {
    b.onclick = () => { Sim.doCraft(S, b.dataset.craft); handleEvents(); refreshCraft(); refreshBuildCards(); refreshHUD(); };
  });
}

/* ---------------- 안내 화면 ----------------
   "무엇을 캐야 하고, 무엇을 지으려면 무엇이 필요한가"를 한 곳에서 봅니다.
   초보자가 가장 자주 막히는 지점이라 별도 화면으로 뺐습니다. */
function resChip(key, amount) {
  const r = C.RESOURCES[key];
  const have = S ? Math.floor(S.res[key]) : 0;
  const enough = !amount || have >= amount;
  return `<span class="resChip${enough ? '' : ' lack'}" title="${r.name}">`
    + `${r.icon} ${r.name}${amount ? ` <b>${amount}</b>` : ''}`
    + (amount ? `<i>보유 ${have}</i>` : '') + '</span>';
}
function costChips(cost) {
  return Object.entries(cost || {}).map(([k, v]) => resChip(k, v)).join('');
}

function refreshGuide() {
  // 1) 자원 — 어디서 얻고 어디에 쓰는가
  $('guideRes').innerHTML = Object.entries(C.RESOURCES).map(([k, r]) => {
    const have = S ? Math.floor(S.res[k]) : 0;
    const got = S ? Math.floor(S.got[k]) : 0;
    return `<div class="gRow">
      <div class="gHead"><span class="gIcon">${r.icon}</span>
        <b style="color:${r.color}">${r.name}</b>
        <span class="gHave">보유 ${have}${got ? ` · 누적 ${got}` : ''}</span></div>
      <div class="gLine"><span class="gTag">어디서</span>${r.from}</div>
      <div class="gLine"><span class="gTag">어디에</span>${r.use}</div>
    </div>`;
  }).join('');

  // 2) 건설 — 무엇이 필요한가
  $('guideBuild').innerHTML = C.BUILDS.map(b => `
    <div class="gRow">
      <div class="gHead"><span class="gIcon">${b.icon}</span><b>${b.name}</b></div>
      <div class="gLine"><span class="gTag">필요</span>${costChips(b.cost)}</div>
      <div class="gLine"><span class="gTag">효과</span>${b.desc}</div>
    </div>`).join('');

  // 3) 제작 — 순서와 효과
  $('guideCraft').innerHTML = C.CRAFTS.map(c => {
    const chk = S ? Sim.canCraft(S, c.id) : { ok:false, why:'' };
    const owned = S ? Sim.hasCraft(S, c.id) : false;
    return `<div class="gRow${owned ? ' done' : ''}">
      <div class="gHead"><span class="gIcon">${c.icon}</span><b>${c.name}</b>
        <span class="gHave">${owned ? '보유 중' : (chk.ok ? '제작 가능' : chk.why)}</span></div>
      <div class="gLine"><span class="gTag">필요</span>${costChips(S ? Sim.craftCost(S, c.id) : c.cost)}</div>
      <div class="gLine"><span class="gTag">효과</span>${c.effect}</div>
    </div>`;
  }).join('');

  // 4-b) 적의 종류
  const MONDAY = { normal:'1막부터', fast:'44일~', tank:'55일~', elite:'77일~' };
  $('guideMon').innerHTML = Object.entries(C.MONSTER_KINDS).map(([k, m]) => `
    <div class="gRow">
      <div class="gHead"><span class="gIcon">👹</span>
        <b style="color:#${m.color.toString(16).padStart(6, '0')}">${m.name}</b>
        <span class="gHave">${MONDAY[k] || ''}</span></div>
      <div class="gLine"><span class="gTag">특징</span>체력 ×${m.hpMul} · 속도 ×${m.spdMul} · 공격 ×${m.dmgMul}${m.armor ? ` · 받는 피해 -${Math.round(m.armor * 100)}%` : ''}</div>
      <div class="gLine"><span class="gTag">대응</span>${
        k === 'fast' ? '함정 한 칸으로는 못 잡습니다. 함정을 두세 칸 이어 까세요.'
        : k === 'tank' ? '목책이 오래 버텨야 합니다. 성을 올리고 방패 용병을 세우세요.'
        : k === 'elite' ? '예비 동작을 회피로 흘리고 스킬로 끊으세요. 정면으로 맞으면 아픕니다.'
        : '기본 몬스터입니다. 함정과 병사로 충분히 정리됩니다.'}</div>
    </div>`).join('');

  // 4-c) 병사와 용병
  $('guideMerc').innerHTML = `
    <div class="gRow">
      <div class="gHead"><span class="gIcon">🗡️</span><b>병사</b>
        <span class="gHave">목재 10 · 석재 5</span></div>
      <div class="gLine"><span class="gTag">조건</span>병영 1채당 1명까지</div>
      <div class="gLine"><span class="gTag">특징</span>눌러서 목재 → 석재 → 방어 순으로 역할을 바꿉니다. 떠나지 않습니다.</div>
    </div>`
    + C.MERCS.map(m => `
    <div class="gRow">
      <div class="gHead"><span class="gIcon">${m.icon}</span><b>${m.name}</b>
        <span class="gHave">옥새 조각 ${m.cost}</span></div>
      <div class="gLine"><span class="gTag">조건</span>병영 한도와 무관 · ${C.MERC_CONTRACT_DAYS}일 계약</div>
      <div class="gLine"><span class="gTag">특징</span>${m.desc}</div>
      <div class="gLine"><span class="gTag">추천</span>${m.tip}</div>
    </div>`).join('');

  // 4-d) 99일의 흐름
  $('guideActs').innerHTML = C.ACTS.map(a => {
    const ws = C.WAVES.filter(w => w.act === a.act);
    const cur = S && S.day >= a.from && S.day <= a.to;
    return `<div class="gRow${cur ? ' done' : ''}">
      <div class="gHead"><span class="gIcon">📜</span><b>${a.act}막 ${a.name}</b>
        <span class="gHave">${a.from}~${a.to}일${cur ? ' · 현재' : ''}</span></div>
      <div class="gLine"><span class="gTag">배울 것</span>${a.lesson}</div>
      <div class="gLine"><span class="gTag">대란</span>${ws.map(w => `${w.day}일 ${w.name}`).join(' · ')}</div>
    </div>`;
  }).join('');

  // 4) 성 단계
  $('guideBase').innerHTML = C.BASE_LEVELS.map(b => {
    const cur = S && S.baseLv === b.lv;
    return `<div class="gRow${cur ? ' done' : ''}">
      <div class="gHead"><span class="gIcon">🏯</span><b>${b.lv}단계 ${b.name}</b>
        <span class="gHave">${cur ? '현재' : ''}체력 ${b.maxHp}</span></div>
      <div class="gLine"><span class="gTag">필요</span>${b.cost ? costChips(b.cost) : '기본'}</div>
      <div class="gLine"><span class="gTag">효과</span>${b.desc}</div>
    </div>`;
  }).join('');
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
  $('repOnPath').innerHTML = e.trapsTotal
    ? `<b style="color:${e.trapsOn === e.trapsTotal ? '#5FAE72' : e.trapsOn === 0 ? '#C6412F' : '#E0B44A'}">`
      + `${e.trapsOn}/${e.trapsTotal}</b>`
    : '<b style="color:#9E9384">함정 없음</b>';
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
  /* ★ 다음 대란이 몇 방향인지 미리 알려줍니다.
     자동 플레이에서 방향이 늘어나는 순간 깔아둔 함정 12개가 통째로 길 밖이 됐습니다.
     "다시 배치해야 한다" 를 리포트에서 미리 말해줘야 합니다. */
  if (e.nextDay) {
    const more = e.nextSides > e.sides;
    adv += `<div style="margin-top:10px;padding-top:9px;border-top:1px solid var(--line);">`
      + `<b style="color:${more ? '#E0554A' : 'var(--gold)'}">다음 대란 — ${e.nextDay}일 ${e.nextName}</b><br>`
      + `공격 방향 <b>${e.nextDirs.join(' · ')}</b> (${e.nextSides}방향)`
      + (more
          ? `<div style="margin-top:5px;color:#E0554A;font-weight:700;">방향이 ${e.sides} → ${e.nextSides}개로 늘어납니다. `
            + `새 길이 열리므로 <b>지금 깔아둔 함정 상당수가 길 밖이 됩니다.</b> `
            + `바닥의 붉은 화살표를 다시 보고, 벗어난 함정은 <b>⛏️ 철거</b>로 회수해 옮기세요.</div>`
          : `<div style="margin-top:5px;color:var(--dim);">방향은 그대로입니다. 지금 배치를 유지하면 됩니다.</div>`)
      + `</div>`;
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

  const act = C.actOf(Math.min(e.day, C.TOTAL_DAYS));
  $('endTitle').innerHTML = e.win
    ? '<span style="color:#E0B44A">99일 완주</span>'
    : '<span style="color:#C6412F">거점 함락</span>';
  $('endSub').innerHTML = e.win
    ? `Day ${C.TOTAL_DAYS}까지 버텨냈습니다. 9번의 대란을 전부 막아냈습니다.`
    : `Day ${e.day}일차 (${act.act}막 ${act.name})에 거점이 무너졌습니다. 져도 기록은 남습니다.`;
  $('endStats').innerHTML = '<h3>기록</h3>'
    + `<div class="repRow"><span>버틴 일차</span><b>Day ${e.day} / ${C.TOTAL_DAYS}</b></div>`
    + `<div class="repRow"><span>최고 기록</span><b>Day ${best}</b></div>`
    + `<div class="repRow"><span>막아낸 대란</span><b>${e.waveIdx} / ${C.WAVES.length}</b></div>`
    + `<div class="repRow"><span>장수</span><b>${e.hero} (${e.grade})</b></div>`
    + `<div class="repRow" style="border-bottom:none;"><span>세운 목책 · 함정</span><b>${e.walls} · ${e.traps}</b></div>`;
  $('endNote').innerHTML = '<h3>기획 검증 체크</h3>이번 판에서 아래 중 하나라도 느끼셨나요?<ul>'
    + '<li><b>장면 A</b> — 함정 배치를 바꿨더니 리포트의 함정 처치 비율이 눈에 띄게 뛰었다</li>'
    + '<li><b>장면 B</b> — "그때 자원을 더 모을걸" 하는 후회가 들었다</li>'
    + '<li><b>장면 C</b> — 거점 체력이 바닥일 때 최후의 저항으로 막아냈다</li>'
    + '<li><b>장면 D</b> — 목책을 옮겼더니 바닥의 붉은 침공로가 내가 원하는 길목으로 휘었다</li></ul>'
    + '하나도 안 나왔다면 시스템을 더 붙이지 말고 핵심 루프를 다시 설계해야 합니다.';
  openScreen('scEnd');
}

/* ---------------- 시작 화면 ---------------- */
function renderHeroCards() {
  const box = $('heroCards');
  const open = unlockedHeroes();
  box.innerHTML = '';
  // 잠긴 장수도 보여줍니다 — 뽑을 이유가 눈에 보여야 가챠가 의미를 가집니다
  if (!open.has(C.GENERALS[selHero].id)) selHero = 0;
  C.GENERALS.forEach((g, i) => {
    const locked = !open.has(g.id);
    const el = document.createElement('button');
    el.className = 'gcard' + (i === selHero ? ' on' : '') + (locked ? ' locked' : '');
    el.style.borderTopColor = g.color;
    el.innerHTML = (locked ? '<div class="lockTag">🔒 가챠로 획득</div>' : '')
      + `<div class="gTop">${heroPortrait(g, 52)}<div class="gTopTx">`
      + `<div class="gr" style="color:${g.color}">${g.grade} · ${g.tag}`
      + (awakenOf(g.id) ? ` <span style="color:var(--gold)">${'★'.repeat(awakenOf(g.id))}</span>` : '')
      + `</div>`
      + `<div class="nm">${g.name}</div></div></div>`
      + `<div class="ds">${g.desc}</div>`
      + (g.look && g.look.note ? `<div class="gNote">${g.look.note}</div>` : '')
      + `<div class="stat"><span>전투 스탯</span><b>${Math.round(g.combat * (1 + C.AWAKEN_BONUS * awakenOf(g.id)) * 100)}%</b>`
      + (awakenOf(g.id) ? `<span style="color:var(--good);font-size:10px;"> ★${awakenOf(g.id)}</span>` : '') + `</div>`
      + `<div class="stat"><span>시작 자원</span><b class="${g.startRes > 1 ? 'up' : 'down'}">${Math.round(g.startRes * 100)}%</b></div>`
      + `<div class="stat"><span>웨이브 강도</span><b class="${g.waveMul > 1 ? 'down' : 'up'}">${Math.round(g.waveMul * 100)}%</b></div>`
      + `<div class="stat"><span>22일 이후 성장</span><b class="${g.lateGrow > 0 ? 'up' : ''}">${g.lateGrow > 0 ? '+' + Math.round(g.lateGrow * 100) + '%' : '없음'}</b></div>`
      + `<div class="stat" style="border-top:none;"><span style="color:${g.color}">${g.skill}</span><b></b></div>`;
    el.onclick = () => {
      if (locked) { toast(`<b>${g.name}</b>은(는) 가챠로 뽑아야 열립니다`); return; }
      selHero = i; renderHeroCards();
    };
    box.appendChild(el);
  });
  const best = Number(localStorage.getItem('sg3d_best') || 0);
  const wins = Number(localStorage.getItem('sg3d_wins') || 0);
  $('bestRec').innerHTML = best ? `최고 기록 <b style="color:#E0B44A">Day ${best}</b> · 완주 ${wins}회` : '';
}

/* ==================================================================
   뽑기 · 보석 상점 (프로토타입)
   ------------------------------------------------------------------
   ※ 실제 결제는 붙어 있지 않습니다. 보석 충전 버튼은 그냥 지급합니다.
   ※ 확률은 아래 GACHA 배열 하나에서만 나오고, 화면의 확률표도 같은 값을
     그대로 적어둡니다. 두 곳이 어긋나면 그게 바로 확률 조작이 됩니다.
   ================================================================== */
const GACHA = [
  { g: '일반', p: .55,  c: '#9aa7b0', pool: ['주창','부첨','장익','마대','왕평','유봉','곽준','요화'] },
  { g: '희귀', p: .30,  c: '#5B8FC7', pool: ['태사자','장료','서황','감녕'] },
  { g: '영웅', p: .12,  c: '#9B6FC9', pool: ['하후돈','황충','위연','방덕'] },   // 하후돈·황충은 플레이 가능
  { g: '전설', p: .027, c: '#E08B3C', pool: ['관우','조운','장비','허저'] },     // 관우는 플레이 가능
  { g: '신화', p: .003, c: '#E0B44A', pool: ['여포','제갈량','조조'] }
];
/* 도감 저장 구조
   예전에는 ['전설 관우', ...] 문자열 배열이라 "몇 장 나왔는지"를 셀 수 없었습니다.
   {"전설 관우": 3} 형태로 바꾸고, 예전 저장본은 자동으로 변환합니다. */
function getDex() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem('sg3d_dex') || '{}'); } catch { raw = {}; }
  if (Array.isArray(raw)) {                       // 옛 저장본 변환
    const o = {};
    for (const k of raw) o[k] = (o[k] || 0) + 1;
    localStorage.setItem('sg3d_dex', JSON.stringify(o));
    return o;
  }
  return raw || {};
}
const saveDex = d => localStorage.setItem('sg3d_dex', JSON.stringify(d));

let souls = Number(localStorage.getItem('sg3d_souls') || 0);
const saveSouls = () => localStorage.setItem('sg3d_souls', String(souls));

function getAwaken() {
  try { return JSON.parse(localStorage.getItem('sg3d_awaken') || '{}') || {}; } catch { return {}; }
}
function awakenOf(id) { return Number(getAwaken()[id] || 0); }
function doAwaken(id) {
  const lv = awakenOf(id);
  if (lv >= C.AWAKEN_MAX) { toast('이미 <b>★5</b> 입니다'); Audio.play('deny'); return; }
  const cost = C.AWAKEN_COST[lv];
  if (souls < cost) { toast(`혼백이 부족합니다 — <b>${cost}</b> 필요 (보유 ${souls})`); Audio.play('deny'); return; }
  souls -= cost; saveSouls();
  const a = getAwaken(); a[id] = lv + 1;
  localStorage.setItem('sg3d_awaken', JSON.stringify(a));
  const g = C.GENERALS.find(x => x.id === id);
  toast(`<b style="color:${g.color}">${g.name}</b> 각성 <b>★${lv + 1}</b> — 전투력 +${Math.round(C.AWAKEN_BONUS * (lv + 1) * 100)}%`);
  Audio.play('objective');
  refreshShop(); renderHeroCards();
}

let gems = Number(localStorage.getItem('sg3d_gem') || 0);
const saveGems = () => localStorage.setItem('sg3d_gem', String(gems));

/** 한 번 뽑습니다. 천장은 뽑기 전체에 걸쳐 누적됩니다. */
function rollOnce() {
  let pity = Number(localStorage.getItem('sg3d_pity') || 0) + 1;
  let pick;
  if (pity >= C.GACHA_PITY_HARD) pick = GACHA[4];
  else if (pity >= C.GACHA_PITY) pick = GACHA[Math.random() < .1 ? 4 : 3];
  else {
    const r = Math.random(); let acc = 0;
    pick = GACHA.find(g => (acc += g.p) >= r) || GACHA[0];
  }
  if (pick.g === '전설' || pick.g === '신화') pity = 0;
  localStorage.setItem('sg3d_pity', String(pity));

  const name = pick.pool[Math.floor(Math.random() * pick.pool.length)];
  const dex = getDex(), key = `${pick.g} ${name}`;
  const dup = !!dex[key];
  dex[key] = (dex[key] || 0) + 1;
  saveDex(dex);

  // 중복은 혼백으로 바뀝니다 — 같은 카드가 또 나와도 각성 재료가 쌓입니다
  let soul = 0;
  if (dup) { soul = C.SOUL_BY_GRADE[pick.g] || 2; souls += soul; saveSouls(); }

  const hero = C.GENERALS.find(h => h.name === name);
  let newlyUnlocked = false;
  if (hero) newlyUnlocked = unlockHero(hero.id);
  return { pick, name, dup, soul, playable: !!hero, newlyUnlocked, count: dex[key] };
}

const gradeIcon = g => g === '신화' ? '🐉' : g === '전설' ? '⚔️' : g === '영웅' ? '🏹' : g === '희귀' ? '🗡️' : '🛡️';

function resultLine(r) {
  return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06);">
      <span style="font-size:20px;">${gradeIcon(r.pick.g)}</span>
      <b style="color:${r.pick.c};min-width:38px;font-size:11.5px;">${r.pick.g}</b>
      <b style="font-size:14px;">${r.name}</b>
      <span style="margin-left:auto;font-size:11px;color:${r.newlyUnlocked ? '#5FAE72' : r.soul ? '#c9a3e8' : '#9E9384'};">
        ${r.newlyUnlocked ? '새 장수 해금!'
          : r.soul ? `중복 ×${r.count} → 혼백 +${r.soul}`
          : '도감 등록'}</span>
    </div>`;
}

function showPulls(results) {
  const box = $('pullResult');
  box.style.display = 'block';
  const best = results.reduce((a, b) => (GACHA.indexOf(b.pick) > GACHA.indexOf(a.pick) ? b : a));
  box.style.borderColor = best.pick.c;
  const unlocked = results.filter(r => r.newlyUnlocked);
  const gained = results.reduce((a, r) => a + (r.soul || 0), 0);
  box.innerHTML = results.map(resultLine).join('')
    + (unlocked.length
        ? `<div style="margin-top:8px;font-size:12px;color:#5FAE72;font-weight:800;">
             ${unlocked.map(r => r.name).join(' · ')} — 출전 화면에서 고를 수 있습니다</div>`
        : '')
    + (gained
        ? `<div style="margin-top:6px;font-size:12px;color:#c9a3e8;font-weight:800;">
             중복 ${results.filter(r => r.soul).length}장 → 혼백 <b>+${gained}</b> (보유 ${souls})
             <span style="color:var(--dim);font-weight:600;">— 아래에서 장수를 각성시키세요</span></div>`
        : '');
  if (unlocked.length) renderHeroCards();
  Audio.play(best.pick.g === '전설' || best.pick.g === '신화' ? 'objective' : 'craft');
  refreshShop();
  refreshHUD();
}

function pullShard() {
  if (totalShard() < C.GACHA_COST_SHARD) { toast('옥새 조각이 부족합니다 (10 필요)'); Audio.play('deny'); return; }
  if (S && pullShardIntoRun(C.GACHA_COST_SHARD)) S.shard -= C.GACHA_COST_SHARD;
  else { wallet -= C.GACHA_COST_SHARD; localStorage.setItem('sg3d_shard', String(wallet)); }
  showPulls([rollOnce()]);
}

function pullGem(times) {
  const cost = times === 10 ? C.GACHA_COST_GEM10 : C.GACHA_COST_GEM;
  if (gems < cost) { toast(`보석이 부족합니다 (<b>${cost}</b> 필요)`); Audio.play('deny'); return; }
  gems -= cost; saveGems();
  const out = [];
  for (let i = 0; i < times; i++) out.push(rollOnce());
  showPulls(out);
}

function buyPack(pk) {
  gems += pk.gem + pk.bonus; saveGems();
  Audio.play('coin');
  toast(`💎 <b>${pk.gem + pk.bonus}</b> 지급 — <span style="color:#9E9384">프로토타입이라 실제 결제는 없습니다</span>`);
  refreshShop();
}

function claimFreeGem() {
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('sg3d_freegem') === today) { toast('오늘은 이미 받았습니다'); Audio.play('deny'); return; }
  localStorage.setItem('sg3d_freegem', today);
  gems += C.GEM_FREE_DAILY; saveGems();
  Audio.play('coin');
  toast(`🎁 무료 보석 <b>${C.GEM_FREE_DAILY}</b> 지급`);
  refreshShop();
}

function refreshShop() {
  $('shopShard').textContent = totalShard();
  $('shopGem').textContent = gems;
  $('pityLeft').textContent = Math.max(0, C.GACHA_PITY - Number(localStorage.getItem('sg3d_pity') || 0));

  const packs = $('packRow');
  if (packs && !packs.dataset.built) {
    packs.dataset.built = '1';
    C.GEM_PACKS.forEach(pk => {
      const el = document.createElement('button');
      el.className = 'packCard';
      el.innerHTML = `<div class="pg">💎 ${pk.gem + pk.bonus}</div>
        <div class="pb">${pk.bonus ? `+${pk.bonus} ${pk.tag}` : (pk.tag || '')}</div>
        <div class="pp">${pk.price}</div>`;
      el.onclick = () => buyPack(pk);
      packs.appendChild(el);
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const free = $('btnFreeGem');
  if (free) {
    const done = localStorage.getItem('sg3d_freegem') === today;
    free.disabled = done;
    free.textContent = done ? '🎁 오늘 수령 완료' : `🎁 오늘의 무료 보석 +${C.GEM_FREE_DAILY}`;
  }

  $('shopSoul').textContent = souls;

  /* ── 출전 가능한 장수 카드 — 각성 버튼까지 여기서 ── */
  const unlocked = unlockedHeroes();
  const dex = getDex();
  $('playableList').innerHTML = C.GENERALS.map(g => {
    const have = unlocked.has(g.id);
    const lv = awakenOf(g.id);
    const cost = lv < C.AWAKEN_MAX ? C.AWAKEN_COST[lv] : null;
    const cnt = dex[`${g.grade} ${g.name}`] || 0;
    return `<div class="heroDex${have ? '' : ' locked'}" style="border-top-color:${g.color}">
      ${heroFace(g, have)}
      <div class="hdBody">
        <div class="hdTop"><b class="hdName">${g.name}</b>
          <span class="hdGrade" style="color:${g.color}">${g.grade}</span>
          <span class="hdStar">${'★'.repeat(lv)}${'☆'.repeat(C.AWAKEN_MAX - lv)}</span></div>
        <div class="hdTag">${g.tag}${cnt ? ` · 뽑은 횟수 ${cnt}` : ''}</div>
        <div class="hdSkill">${g.skill}</div>
        ${g.look && g.look.note ? `<div class="hdNote">${g.look.note}</div>` : ''}
        ${have
          ? (lv >= C.AWAKEN_MAX
              ? '<div class="hdMax">각성 완료 — 전투력 +30%</div>'
              : `<button class="btn awBtn" data-awaken="${g.id}" ${souls >= cost ? '' : 'disabled'}>
                   ★${lv + 1} 각성 — 혼백 ${cost}</button>
                 <div class="hdNow">현재 전투력 +${Math.round(C.AWAKEN_BONUS * lv * 100)}%</div>`)
          : '<div class="hdLock">🔒 뽑아야 열립니다</div>'}
      </div>
    </div>`;
  }).join('');
  $('playableList').querySelectorAll('[data-awaken]').forEach(b =>
    b.onclick = () => doAwaken(b.dataset.awaken));

  /* ── 전체 도감 (플레이 불가 인물 포함) ── */
  const keys = Object.keys(dex).sort();
  const GC = { 일반:'#9aa7b0', 희귀:'#5B8FC7', 영웅:'#9B6FC9', 전설:'#E08B3C', 신화:'#E0B44A' };
  const total = GACHA.reduce((a, g) => a + g.pool.length, 0);
  $('dexList').innerHTML = keys.length
    ? `<div class="dexCount">수집 <b>${keys.length}</b> / ${total}종 · 총 <b>${keys.reduce((a,k)=>a+dex[k],0)}</b>장</div>`
      + '<div class="dexGrid">' + keys.map(k => {
          const grade = k.split(' ')[0], name = k.slice(grade.length + 1);
          return `<div class="dexCard" style="border-color:${GC[grade] || '#3a342c'}">
            <div class="dg" style="color:${GC[grade]}">${gradeIcon(grade)}</div>
            <div class="dn">${name}</div>
            <div class="dc">×${dex[k]}</div></div>`;
        }).join('') + '</div>'
    : '아직 없습니다. 뽑기를 돌려보세요.';
}

/* ==================================================================
   장수 초상 — SVG 로 그립니다 (이미지 파일 0장)
   ------------------------------------------------------------------
   왜 그림 파일을 안 쓰나:
     ① 이 프로젝트는 빌드가 없고 저장소에 그림을 넣으면 무거워집니다
     ② 남의 그림은 상업적 이용 라이선스를 일일이 확인해야 합니다
     ③ 3D 장수와 도감이 **같은 look 데이터**를 읽으면 둘이 절대 어긋나지 않습니다
   그래서 투구·수염·안대·갑옷을 config 의 look 대로 조립해 그립니다.
   나중에 진짜 일러스트가 생기면 look.portrait 에 경로만 넣으면 됩니다.
   ================================================================== */
const WEAPON_ICON = { sword: '🗡️', bow: '🏹', halberd: '🔱' };

function heroPortrait(g, size = 58) {
  const L = g.look || {};
  const skin = L.skin || '#e8c9a0';
  const hair = L.hair || '#1f1812';
  const cloth = L.cloth || g.color;
  const acc = g.accent || g.color;
  const P = [];

  // 배경 — 등급 색 그라데이션
  P.push(`<defs><linearGradient id="bg${g.id}" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${g.color}"/><stop offset="1" stop-color="${acc}"/></linearGradient></defs>`);
  P.push(`<rect width="100" height="120" fill="url(#bg${g.id})"/>`);
  P.push(`<ellipse cx="50" cy="28" rx="46" ry="34" fill="#fff" opacity="0.16"/>`);

  // 몸통·갑옷
  P.push(`<path d="M18 120 Q22 84 50 80 Q78 84 82 120 Z" fill="${cloth}"/>`);
  if (L.shoulder) {
    P.push(`<ellipse cx="22" cy="92" rx="13" ry="10" fill="${acc}" stroke="rgba(0,0,0,.25)"/>`);
    P.push(`<ellipse cx="78" cy="92" rx="13" ry="10" fill="${acc}" stroke="rgba(0,0,0,.25)"/>`);
  }
  if (L.armor === 'scale') {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++)
      P.push(`<circle cx="${34 + c * 8}" cy="${94 + r * 8}" r="3.4" fill="rgba(0,0,0,.18)"/>`);
  } else if (L.armor === 'heavy') {
    P.push(`<path d="M34 90 H66 V118 H34 Z" fill="rgba(255,255,255,.15)" stroke="rgba(0,0,0,.25)"/>`);
  }

  // 목·얼굴
  P.push(`<rect x="44" y="70" width="12" height="14" fill="${skin}"/>`);
  P.push(`<ellipse cx="50" cy="52" rx="21" ry="24" fill="${skin}"/>`);

  // 수염
  if (L.beard === 'long')
    P.push(`<path d="M36 62 Q50 118 64 62 Q50 76 36 62 Z" fill="${hair}"/>`);
  else if (L.beard === 'white')
    P.push(`<path d="M34 60 Q50 96 66 60 Q50 74 34 60 Z" fill="#ded8ca"/>`);
  else
    P.push(`<path d="M38 64 Q50 78 62 64 Q50 72 38 64 Z" fill="${hair}" opacity=".85"/>`);

  // 눈
  if (L.eyepatch) {
    P.push(`<circle cx="58" cy="50" r="2.6" fill="#1a1410"/>`);
    P.push(`<path d="M28 44 L72 40" stroke="#15120f" stroke-width="3.5" fill="none"/>`);
    P.push(`<ellipse cx="42" cy="49" rx="7" ry="6" fill="#15120f"/>`);
  } else {
    P.push(`<circle cx="42" cy="50" r="2.6" fill="#1a1410"/>`);
    P.push(`<circle cx="58" cy="50" r="2.6" fill="#1a1410"/>`);
  }
  // 눈썹
  P.push(`<path d="M36 43 Q42 40 47 43" stroke="${hair}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);
  P.push(`<path d="M53 43 Q58 40 64 43" stroke="${hair}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);

  // 투구
  if (L.helm === 'horned') {
    P.push(`<path d="M27 40 Q50 16 73 40 L73 32 Q50 8 27 32 Z" fill="${acc}" stroke="rgba(0,0,0,.3)"/>`);
    P.push(`<path d="M27 34 Q16 16 24 10 Q34 18 33 34 Z" fill="${acc}"/>`);
    P.push(`<path d="M73 34 Q84 16 76 10 Q66 18 67 34 Z" fill="${acc}"/>`);
    P.push(`<path d="M50 18 L46 2 L54 2 Z" fill="#C6412F"/>`);
  } else if (L.helm === 'crest') {
    P.push(`<path d="M27 40 Q50 18 73 40 Z" fill="${acc}" stroke="rgba(0,0,0,.3)"/>`);
    P.push(`<path d="M46 20 Q50 4 54 20 Z" fill="#C6412F"/>`);
  } else if (L.helm === 'hood') {
    P.push(`<path d="M24 46 Q26 14 50 14 Q74 14 76 46 Q64 30 50 30 Q36 30 24 46 Z" fill="${cloth}"/>`);
  } else if (L.helm === 'cap') {
    P.push(`<path d="M29 40 Q50 22 71 40 Z" fill="${acc}" stroke="rgba(0,0,0,.25)"/>`);
    P.push(`<rect x="27" y="38" width="46" height="4" rx="2" fill="rgba(0,0,0,.28)"/>`);
  } else {
    P.push(`<path d="M29 42 Q50 24 71 42 Z" fill="${acc}" stroke="rgba(0,0,0,.25)"/>`);
  }
  // 머리카락이 투구 밖으로
  if (L.helm !== 'hood')
    P.push(`<path d="M30 44 Q30 62 26 70 Q34 62 33 46 Z M70 44 Q70 62 74 70 Q66 62 67 46 Z" fill="${hair}"/>`);

  // 장비 — 방패 / 화살통
  if (L.shield) {
    P.push(`<ellipse cx="17" cy="100" rx="14" ry="17" fill="${cloth}" stroke="rgba(0,0,0,.3)" stroke-width="2"/>`);
    P.push(`<circle cx="17" cy="100" r="4.5" fill="${acc}"/>`);
  }
  if (L.quiver) {
    P.push(`<rect x="76" y="76" width="11" height="30" rx="4" fill="#6b4a2c" transform="rotate(14 81 91)"/>`);
    for (let i = 0; i < 3; i++)
      P.push(`<rect x="${77 + i * 3.4}" y="68" width="2" height="12" fill="#d8cdb6" transform="rotate(14 81 74)"/>`);
  }

  return `<svg class="hdSvg" viewBox="0 0 100 120" width="${size}" height="${Math.round(size * 1.2)}"
      role="img" aria-label="${g.name} 초상" preserveAspectRatio="xMidYMid slice">${P.join('')}</svg>`;
}

function heroFace(g, have) {
  return `<div class="hdFace${have ? '' : ' off'}">${heroPortrait(g)}
      <span class="hdWeapon">${WEAPON_ICON[g.weapon] || ''}</span></div>`;
}

/* ==================================================================
   조작
   ================================================================== */
const keys = {};
const stickVec = { x: 0, y: 0 };

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (!keys[k]) {                       // 꾹 눌러도 한 번만 발동합니다
    if (k === ' ') doSkill(2);            // Space = 궁극기
    // 숫자키로 건설 카드를 고릅니다 — 화면 밖으로 마우스를 내릴 필요가 없습니다
    if (k >= '1' && k <= '9' && S && !uiOpen && !S.over) {
      const n = Number(k);
      if (n === C.BUILDS.length + 1) selectBuild(DEMOLISH);
      else { const b = C.BUILDS[n - 1]; if (b) selectBuild(b.id); }
    }
    if (k === 'q') doSkill(0);
    if (k === 'e') doSkill(1);
    if (k === 'h') { Sim.usePotion(S); handleEvents(); refreshHUD(); }
  }
  keys[k] = true;
  if (e.key === 'Escape') { buildSel = null; refreshBuildCards(); R3.setBuildMode(false); cancelBuild(); }
  if (e.key === 'Enter' && pending) confirmBuild();
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
});

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

  /* 화면 위에 겹쳐 놓은 UI에서 시작한 입력은 땅 조준으로 넘기지 않습니다.
     이게 없으면 "설치" 버튼을 누르는 순간 그 버튼 밑의 땅을 다시 조준해버립니다.

     ★ #buildDock 이 빠져 있어서 건설이 통째로 막혔던 적이 있습니다.
       건설 바가 #stage 안에 있으니, 버튼을 누르면 pointerdown 이 stage 까지 올라와
       setPointerCapture 가 걸리고 → 버튼의 click 이 아예 발생하지 않았습니다.
       화면 안에 UI를 새로 얹을 때는 반드시 이 목록에 넣어야 합니다. */
  const fromUI = e => !!(e.target && e.target.closest &&
    e.target.closest('#buildDock, #buildConfirm, #hud, #minimapWrap, #objective, #buildHint'));

  /* ★ 마우스 오른쪽 버튼 = 취소.
     건설 중이면 배치를 물리고, 아무것도 안 하고 있으면 건설 카드 선택 자체를 풉니다.
     브라우저 기본 메뉴는 막습니다. */
  stage.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!S) return;
    /* 한 번에 건설 모드에서 완전히 빠져나옵니다.
       조준만 푸는 2단계로 만들었더니, 마우스가 화면 위에 있으면 pointermove 가
       곧바로 다시 조준을 잡아서 두 번 눌러야 풀렸습니다. 취소는 한 번에 끝나야 합니다. */
    const had = !!(buildSel || aim || pending);
    buildSel = null;
    cancelBuild();
    refreshBuildCards();
    R3.setBuildMode(false);
    $('modeTag').innerHTML = '🖱 드래그 = 카메라 회전 · 휠 = 확대';
    if (had) Audio.play('deny');
  });

  stage.addEventListener('pointerdown', e => {
    if (!S || S.over || fromUI(e)) return;
    if (e.button === 2) return;                   // 오른쪽 버튼은 contextmenu 가 처리합니다
    // 건설 모드가 아닐 때의 좌클릭 = 직접 타격
    if (!buildSel && e.button === 0 && !uiOpen && !paused) {
      Sim.clickAttack(S);
      handleEvents();
    }
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
  if (buildSel === DEMOLISH) {
    const d = Sim.canDemolish(S, aim.tx, aim.ty);
    R3.showGhost(aim.tx, aim.ty, d.ok, 'demolish', pending);
    const hint = $('buildHint');
    if (hint) {
      if (d.ok) {
        const def = C.BUILDS.find(b => b.id === d.kind);
        const back = Sim.refundOf(d.kind);
        hint.innerHTML = `⛏️ ${def ? def.name : ''} 철거 — ${Sim.costText(back) || '회수 없음'} 돌려받습니다`;
        hint.style.background = 'rgba(150,110,20,.92)';
      } else {
        hint.textContent = '여기에는 철거할 것이 없습니다';
        hint.style.background = 'rgba(140,30,20,.9)';
      }
      hint.style.display = '';
    }
    return;
  }
  const chk = Sim.canBuildAt(S, aim.tx, aim.ty, buildSel);
  R3.showGhost(aim.tx, aim.ty, chk.ok, buildSel, pending);
  const hint = $('buildHint');
  if (hint) {
    const why = { occupied: '이미 무언가 있습니다', far: '너무 멉니다 — 가까이 가세요',
                  cost: '자원이 부족합니다', owned: '이미 지었습니다', out: '지도 밖입니다' };
    if (!chk.ok) {
      hint.textContent = why[chk.why] || '';
      hint.style.background = 'rgba(140,30,20,.9)';
      hint.style.display = '';
    } else if (buildSel === 'trap') {
      /* ★ 함정은 "침공로 위인가" 가 전부입니다.
         한 칸만 비껴도 한 마리도 못 잡으므로, 놓기 전에 알려줍니다. */
      const onPath = Sim.pathTileSet(S).has(Sim.tkey(aim.tx, aim.ty));
      hint.innerHTML = onPath ? '✓ 침공로 위입니다 — 적이 이 칸을 밟습니다'
                              : '⚠ 침공로에서 벗어났습니다 — 붉은 화살표 위로 옮기세요';
      hint.style.background = onPath ? 'rgba(30,110,60,.9)' : 'rgba(150,110,20,.92)';
      hint.style.display = '';
    } else {
      hint.style.display = 'none';
    }
  }
}

function showConfirm() {
  if (instantBuild) { confirmBuild(); return; }
  const chk = buildSel === DEMOLISH
    ? Sim.canDemolish(S, aim.tx, aim.ty)
    : Sim.canBuildAt(S, aim.tx, aim.ty, buildSel);
  const box = $('buildConfirm');
  if (!box) return;
  box.style.display = 'flex';
  box.querySelector('.t').textContent = buildSel === DEMOLISH ? '여기를 부술까요?' : '여기에 지을까요?';
  $('btnConfirmBuild').textContent = buildSel === DEMOLISH ? '⛏️ 철거 (Enter)' : '✔ 설치 (Enter)';
  $('btnConfirmBuild').disabled = !chk.ok;
  refreshGhost();
}
function hideConfirm() {
  const box = $('buildConfirm');
  if (box) box.style.display = 'none';
}
function confirmBuild() {
  if (!aim || !buildSel) return;
  const built = buildSel === DEMOLISH
    ? Sim.demolish(S, aim.tx, aim.ty)
    : Sim.tryBuild(S, aim.tx, aim.ty, buildSel);
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
$('btnCraft').onclick = () => { if (!S) return; refreshCraft(); openScreen('scCraft'); };
$('btnGuide').onclick = () => { refreshGuide(); openScreen('scGuide'); };
$('btnGuideClose').onclick = () => closeAll();
$('btnCraftClose').onclick = () => closeAll();
function openShop(fromTitle) {
  $('pullResult').style.display = 'none';
  refreshShop();
  $('scShop').dataset.from = fromTitle ? 'title' : '';
  openScreen('scShop');
}
$('btnShop').onclick = () => openShop(false);
$('btnTitleShop').onclick = () => openShop(true);
$('btnShopClose').onclick = () => {
  if ($('scShop').dataset.from === 'title') { renderHeroCards(); openScreen('scTitle'); return; }
  if (S && !S.over) closeAll(); else openScreen(S && S.over ? 'scEnd' : 'scTitle');
};
$('btnPull').onclick = pullShard;
$('btnPullGem').onclick = () => pullGem(1);
$('btnPull10').onclick = () => pullGem(10);
$('btnFreeGem').onclick = claimFreeGem;
$('btnPause').onclick = () => {
  paused = !paused;
  $('btnPause').textContent = paused ? '▶ 계속하기' : '⏸ 일시정지';
};
$('btnSound').onclick = () => {
  soundOn = !soundOn;
  Audio.setSfx(soundOn);
  $('btnSound').textContent = soundOn ? '🔊 효과음' : '🔇 효과음';
};
$('btnMusic').onclick = () => {
  soundOnMusic = !soundOnMusic;
  Audio.setMusic(soundOnMusic);
  $('btnMusic').textContent = soundOnMusic ? '🎵 음악' : '🎵̶ 음악 끔';
};

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
    updateRespawnBox();
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
