/* ==================================================================
   삼국지 99일 생존 — 게임 규칙(시뮬레이션)
   ------------------------------------------------------------------
   ★ 이 파일에는 화면을 그리는 코드가 한 줄도 없습니다.
     DOM도, Three.js도 참조하지 않습니다.
     그래서 브라우저 없이 node 로 게임을 수십 초 "돌려서" 검증할 수 있습니다.
     화면에 알릴 일은 전부 S.events 에 쌓아두고, 화면 담당이 가져갑니다.
   ================================================================== */

import * as C from './config.js';

/* ---------------- 작은 도구들 ---------------- */
export const tkey = (tx, ty) => ty * C.MAPW + tx;
export const inMap = (tx, ty) => tx >= 0 && ty >= 0 && tx < C.MAPW && ty < C.MAPH;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));

function emit(S, type, data) { S.events.push({ type, ...data }); }
export function drainEvents(S) { const e = S.events; S.events = []; return e; }

function fx(S, x, y, text, color) { emit(S, 'fx', { x, y, text, color: color || '#fff' }); }
function toast(S, msg) { emit(S, 'toast', { msg }); }
function sound(S, name) { emit(S, 'sound', { name }); }

/* ---------------- 목표(튜토리얼) 체인 ---------------- */
export const OBJECTIVES = [
  { t: '나무 옆에 서 있으면 <b>자동으로 채집</b>됩니다. 목재 30을 모으세요.',
    ok: S => S.got.wood >= 30 },
  { t: '건설 카드에서 <b>목책</b>을 고르고 땅을 클릭해 4개를 세우세요.',
    ok: S => S.cnt.wall >= 4 },
  { t: '<b>병영</b>을 1채 지으세요. (목재 25 · 석재 15)',
    ok: S => S.cnt.camp >= 1 },
  { t: '<b>병사를 고용</b>하고 눌러서 역할을 바꿔보세요. 반복 노동은 병사 몫입니다.',
    ok: S => S.soldiers.length >= 1 },
  { t: '<b>대장간</b>을 지으세요. (목재 30 · 석재 25)',
    ok: S => S.forge },
  { t: '제작소에서 <b>돌 곡괭이</b>를 만드세요. 철광을 캐려면 필요합니다.',
    ok: S => S.pickaxe },
  { t: '지도 <b>중앙의 철광</b>에서 철 5를 캐세요. 중앙은 양 팀이 만나는 곳입니다.',
    ok: S => S.got.iron >= 5 },
  { t: '<b>가시함정</b>을 2개 설치하세요. 목책으로 좁힌 길목에 까는 게 정석입니다.',
    ok: S => S.cnt.trap >= 2 },
  { t: '11일 <b>황건적의 습격</b>을 막아내세요.',
    ok: S => S.waveIdx >= 1 },
  { t: '제작소에서 <b>무기 강화</b>를 1회 하세요. (철 5)',
    ok: S => S.weaponLv >= 1 },
  { t: '22일 <b>산적 무리</b>를 막아내세요. 함정 처치 비율 40% 이상이 목표입니다.',
    ok: S => S.waveIdx >= 2 },
  { t: '33일 <b>산적 두목</b>을 쓰러뜨리고 1막을 완주하세요.',
    ok: S => S.waveIdx >= 3 }
];

/* ==================================================================
   생성
   ================================================================== */
export function createSim(heroId) {
  const heroDef = C.GENERALS.find(g => g.id === heroId) || C.GENERALS[1];
  const mul = heroDef.startRes;

  const S = {
    heroDef,
    phase: 'day',            // day | warn | night | report | over
    day: 1, dayT: 0, warnT: 0, t: 0,
    over: false, win: false,

    res: { wood: Math.round(60 * mul), stone: Math.round(30 * mul), iron: 0 },
    got: { wood: 0, stone: 0, iron: 0 },
    cnt: { wall: 0, trap: 0, camp: 0 },
    shard: 0,

    hero: {
      x: C.BASE_TX * C.TILE + C.TILE / 2,
      y: (C.BASE_TY + 3) * C.TILE,
      hp: C.HERO_HP, maxHp: C.HERO_HP,
      cd: 0, dead: false, respawn: 0, gp: 0,
      facing: 0, moving: false, swing: 0
    },
    base: {
      x: C.BASE_TX * C.TILE + C.TILE / 2,
      y: C.BASE_TY * C.TILE + C.TILE / 2,
      hp: C.BASE_HP, maxHp: C.BASE_HP
    },

    occ: new Uint8Array(C.MAPW * C.MAPH),
    wallHp: new Float32Array(C.MAPW * C.MAPH),
    trapAt: new Int16Array(C.MAPW * C.MAPH),
    dist: new Int32Array(C.MAPW * C.MAPH),
    flowX: new Float32Array(C.MAPW * C.MAPH),
    flowY: new Float32Array(C.MAPW * C.MAPH),
    wallList: [],

    nodes: [], traps: [], structs: [], monsters: [], soldiers: [],
    spawnDirs: [],
    waveIdx: 0, waveStats: null,
    objIdx: 0,
    pickaxe: false, weaponLv: 0, forge: false, camps: 0,
    lastStand: false,
    trapSeq: 0,
    input: { x: 0, y: 0 },
    events: []
  };

  buildMap(S);
  computeFlow(S);
  return S;
}

/* ---------------- 지도 생성 ---------------- */
function buildMap(S) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (inMap(C.BASE_TX + dx, C.BASE_TY + dy))
        S.occ[tkey(C.BASE_TX + dx, C.BASE_TY + dy)] = C.OCC_BASE;

  for (let c = 0; c < 16; c++) {
    const cx = ri(2, C.MAPW - 3), cy = ri(2, C.MAPH - 3);
    const n = ri(4, 9);
    for (let i = 0; i < n; i++)
      addNode(S, clamp(cx + ri(-2, 2), 1, C.MAPW - 2), clamp(cy + ri(-2, 2), 1, C.MAPH - 2), 'wood');
  }
  for (let r = 0; r < 30; r++) addNode(S, ri(2, C.MAPW - 3), ri(2, C.MAPH - 3), 'stone');

  // 철광은 지도 정중앙 8칸 폭에만 — 양 팀이 반드시 만나는 지점
  const mid = Math.floor(C.MAPW / 2);
  for (let m = 0; m < 14; m++) addNode(S, ri(mid - 4, mid + 4), ri(4, C.MAPH - 5), 'iron');

  // 시작 자원 보장
  addNode(S, C.BASE_TX + 3, C.BASE_TY - 2, 'wood');
  addNode(S, C.BASE_TX + 3, C.BASE_TY + 2, 'wood');
  addNode(S, C.BASE_TX - 3, C.BASE_TY - 1, 'wood');
  addNode(S, C.BASE_TX - 2, C.BASE_TY + 3, 'stone');
}

function addNode(S, tx, ty, type) {
  if (!inMap(tx, ty)) return;
  const k = tkey(tx, ty);
  if (S.occ[k] !== C.OCC_EMPTY) return;
  // 거점 앞 5x5는 건설 공간으로 비워둡니다 (배치 교착 방지)
  if (Math.abs(tx - C.BASE_TX) <= 2 && Math.abs(ty - C.BASE_TY) <= 2) return;
  S.occ[k] = C.OCC_NODE;
  const max = C.NODE_MAX[type];
  S.nodes.push({ tx, ty, x: tx * C.TILE + C.TILE / 2, y: ty * C.TILE + C.TILE / 2,
                 type, amt: max, max, regrow: 0 });
}

/** 거점 주변에 지을 자리가 충분한지 — 배치 교착이 없는지 확인합니다 */
export function countBuildableNearBase(S, radius = 6) {
  let n = 0;
  for (let ty = C.BASE_TY - radius; ty <= C.BASE_TY + radius; ty++)
    for (let tx = C.BASE_TX - radius; tx <= C.BASE_TX + radius; tx++)
      if (inMap(tx, ty) && S.occ[tkey(tx, ty)] === C.OCC_EMPTY) n++;
  return n;
}

/* ---------------- 경로 흐름장 ----------------
   거점에서 BFS로 거리를 재고 각 칸의 진행 방향을 저장합니다.
   목책을 세우면 다시 계산되어 몬스터가 실제로 돌아갑니다. */
const DIR4 = [[1,0],[-1,0],[0,1],[0,-1]];
const DIR8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

export function computeFlow(S) {
  const d = S.dist, occ = S.occ, N = C.MAPW * C.MAPH;
  S.wallList = [];
  for (let i = 0; i < N; i++) { d[i] = -1; if (occ[i] === C.OCC_WALL) S.wallList.push(i); }

  const q = []; let qh = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const tx = C.BASE_TX + dx, ty = C.BASE_TY + dy;
    if (!inMap(tx, ty)) continue;
    const k = tkey(tx, ty);
    if (d[k] < 0) { d[k] = 0; q.push(k); }
  }
  while (qh < q.length) {
    const k = q[qh++], cx = k % C.MAPW, cy = (k / C.MAPW) | 0, cd = d[k];
    for (let j = 0; j < 4; j++) {
      const nx = cx + DIR4[j][0], ny = cy + DIR4[j][1];
      if (!inMap(nx, ny)) continue;
      const nk = tkey(nx, ny);
      if (d[nk] >= 0 || occ[nk] === C.OCC_WALL) continue;
      d[nk] = cd + 1; q.push(nk);
    }
  }
  for (let k = 0; k < N; k++) {
    S.flowX[k] = 0; S.flowY[k] = 0;
    if (d[k] < 0) continue;
    const tx = k % C.MAPW, ty = (k / C.MAPW) | 0;
    let best = d[k], bx = 0, by = 0;
    for (let m = 0; m < 8; m++) {
      const ox = DIR8[m][0], oy = DIR8[m][1];
      const nx = tx + ox, ny = ty + oy;
      if (!inMap(nx, ny)) continue;
      const nd = d[tkey(nx, ny)];
      if (nd < 0) continue;
      if (ox && oy && (occ[tkey(tx + ox, ty)] === C.OCC_WALL || occ[tkey(tx, ty + oy)] === C.OCC_WALL)) continue;
      if (nd < best) { best = nd; bx = ox; by = oy; }
    }
    const len = Math.hypot(bx, by) || 1;
    S.flowX[k] = bx / len; S.flowY[k] = by / len;
  }
}

/* ==================================================================
   배율
   ================================================================== */
export function combatMul(S) {
  let m = S.heroDef.combat;
  if (S.day >= 22) m *= 1 + S.heroDef.lateGrow;
  m *= 1 + 0.25 * S.weaponLv;
  if (S.lastStand) m *= 1.5;
  return m;
}
export const heroRange = S => C.HERO_RANGE * (S.heroDef.id === 'taesaja' ? 1.3 : 1);
export const heroCd = S => C.HERO_CD * (S.heroDef.id === 'yeopo' ? 0.8 : 1);

/* ==================================================================
   건설 · 제작 · 병사
   ================================================================== */
export function canAfford(S, cost) {
  for (const k in cost) if (S.res[k] < cost[k]) return false;
  return true;
}
function pay(S, cost) { for (const k in cost) S.res[k] -= cost[k]; }

export function costText(cost) {
  const names = { wood: '목재', stone: '석재', iron: '철' };
  return Object.keys(cost).map(k => `${names[k]} ${cost[k]}`).join(' · ');
}

export function tryBuild(S, tx, ty, buildId) {
  if (S.over || !buildId || !inMap(tx, ty)) return false;
  const k = tkey(tx, ty);
  if (S.occ[k] !== C.OCC_EMPTY) return false;

  const def = C.BUILDS.find(b => b.id === buildId);
  if (!def) return false;
  if (def.id === 'forge' && S.forge) { toast(S, '대장간은 1채만 지을 수 있습니다'); return false; }
  if (!canAfford(S, def.cost)) { toast(S, `자원이 부족합니다 — ${costText(def.cost)}`); sound(S, 'deny'); return false; }

  pay(S, def.cost);
  if (def.id === 'wall') {
    S.occ[k] = C.OCC_WALL; S.wallHp[k] = def.hp; S.cnt.wall++;
    computeFlow(S);
    emit(S, 'build', { kind: 'wall', tx, ty });
  } else if (def.id === 'trap') {
    S.trapSeq++;
    S.traps.push({ tx, ty, x: tx * C.TILE + C.TILE / 2, y: ty * C.TILE + C.TILE / 2,
                   dur: def.dur, maxDur: def.dur, kills: 0, no: S.trapSeq });
    S.trapAt[k] = S.traps.length;
    S.occ[k] = C.OCC_TRAP; S.cnt.trap++;
    emit(S, 'build', { kind: 'trap', tx, ty });
  } else {
    S.structs.push({ tx, ty, x: tx * C.TILE + C.TILE / 2, y: ty * C.TILE + C.TILE / 2, type: def.id });
    S.occ[k] = C.OCC_STRUCT;
    if (def.id === 'camp') { S.camps++; S.cnt.camp++; }
    if (def.id === 'forge') { S.forge = true; toast(S, '제작소가 열렸습니다 — <b>돌 곡괭이</b>를 만드세요'); }
    emit(S, 'build', { kind: def.id, tx, ty });
  }
  sound(S, 'build');
  fx(S, tx * C.TILE + C.TILE / 2, ty * C.TILE, def.name, '#E0B44A');
  return true;
}

export function hireSoldier(S) {
  if (S.over) return false;
  if (S.soldiers.length >= S.camps) {
    toast(S, S.camps === 0 ? '먼저 <b>병영</b>을 지어야 합니다' : '병영을 더 지어야 병사를 늘릴 수 있습니다');
    return false;
  }
  if (!canAfford(S, C.SOLDIER_COST)) { toast(S, `자원이 부족합니다 — ${costText(C.SOLDIER_COST)}`); return false; }
  pay(S, C.SOLDIER_COST);
  S.soldiers.push({
    x: S.base.x + rnd(-40, 40), y: S.base.y + rnd(20, 50),
    role: 'wood', hp: C.SOLDIER_HP, maxHp: C.SOLDIER_HP,
    cd: 0, carry: 0, node: null, gp: 0, down: false, downT: 0
  });
  sound(S, 'hire');
  toast(S, '병사를 고용했습니다 — 눌러서 역할을 바꾸세요');
  emit(S, 'soldiers');
  return true;
}

export function cycleRole(S, i) {
  const s = S.soldiers[i];
  if (!s) return;
  s.role = s.role === 'wood' ? 'stone' : s.role === 'stone' ? 'def' : 'wood';
  s.node = null;
  emit(S, 'soldiers');
}

export function doCraft(S, id) {
  const c = C.CRAFTS.find(x => x.id === id);
  if (!c) return false;
  if (!S.forge) { toast(S, '먼저 <b>대장간</b>을 지어야 합니다'); return false; }
  if (id === 'pickaxe' && S.pickaxe) { toast(S, '이미 가지고 있습니다'); return false; }
  if (id === 'weapon' && S.weaponLv >= c.max) { toast(S, '최대 강화 단계입니다'); return false; }
  if (!canAfford(S, c.cost)) { toast(S, `자원이 부족합니다 — ${costText(c.cost)}`); return false; }
  pay(S, c.cost);
  if (id === 'pickaxe') { S.pickaxe = true; toast(S, '돌 곡괭이 완성 — 지도 <b>중앙의 철광</b>을 캘 수 있습니다'); }
  if (id === 'weapon') { S.weaponLv++; toast(S, `무기 강화 ${S.weaponLv}단계 — 공격력 +${25 * S.weaponLv}%`); }
  sound(S, 'craft');
  return true;
}

/* ==================================================================
   웨이브
   ================================================================== */
export const waveForDay = day => C.WAVES.find(w => w.day === day) || null;
export const dirName = d => ({ E: '동쪽', W: '서쪽', N: '북쪽', S: '남쪽' })[d];

function startWarn(S, w) {
  S.phase = 'warn'; S.warnT = 0;
  S.spawnDirs = ['E', 'N', 'S', 'W'].slice(0, w.sides);
  emit(S, 'warn', { name: w.name, note: w.note, dirs: S.spawnDirs.slice() });
  sound(S, 'warn');
}

function edgePoint(side) {
  if (side === 'E') return { x: C.WORLD_W - C.TILE * 1.5, y: rnd(C.TILE * 2, C.WORLD_H - C.TILE * 2) };
  if (side === 'W') return { x: C.TILE * 1.5, y: rnd(C.TILE * 2, C.WORLD_H - C.TILE * 2) };
  if (side === 'N') return { x: rnd(C.TILE * 2, C.WORLD_W - C.TILE * 2), y: C.TILE * 1.5 };
  return { x: rnd(C.TILE * 2, C.WORLD_W - C.TILE * 2), y: C.WORLD_H - C.TILE * 1.5 };
}

function makeMonster(x, y, hp, spd, dmg, boss) {
  return { x, y, hp, maxHp: hp, spd, dmg, cd: 0, boss: !!boss,
           breach: null, hitFlash: 0, facing: 0, dead: false };
}

function spawnWave(S, w) {
  S.phase = 'night';
  S.waveStats = { killed: 0, byTrap: 0, bySoldier: 0, byHero: 0, baseDmg: 0, trapKills: {} };
  const mul = S.heroDef.waveMul;
  const count = Math.round(w.count * mul);
  for (let i = 0; i < count; i++) {
    const p = edgePoint(S.spawnDirs[i % S.spawnDirs.length]);
    S.monsters.push(makeMonster(p.x, p.y, w.hp * mul, w.spd, w.dmg, false));
  }
  if (w.boss) {
    const bp = edgePoint(S.spawnDirs[0]);
    S.monsters.push(makeMonster(bp.x, bp.y, w.boss.hp * mul, w.boss.spd, w.boss.dmg, true));
  }
  emit(S, 'nightStart', { name: w.name, count: S.monsters.length });
  sound(S, 'nightStart');
}

function endWave(S) {
  const w = C.WAVES[S.waveIdx];
  S.waveIdx++;
  const st = S.waveStats;
  const reward = C.WAVE_SHARD[S.waveIdx - 1] || 15;
  S.shard += reward;

  let mvp = '없음 (함정이 한 마리도 못 잡았습니다)', mvpKills = 0;
  for (const no in st.trapKills) {
    if (st.trapKills[no] > mvpKills) { mvpKills = st.trapKills[no]; mvp = `가시함정 #${no}`; }
  }
  const trapPct = st.killed ? Math.round(st.byTrap / st.killed * 100) : 0;
  const soldPct = st.killed ? Math.round(st.bySoldier / st.killed * 100) : 0;

  S.phase = 'report';
  emit(S, 'report', {
    day: w.day, name: w.name, note: w.note, advice: w.advice,
    killed: st.killed, trapPct, soldPct, mvp,
    baseDmg: Math.round(st.baseDmg), reward
  });
  sound(S, 'report');
}

export function closeReport(S) {
  if (S.waveIdx >= C.WAVES.length) { endGame(S, true); return; }
  S.phase = 'day';
}

function endGame(S, win) {
  S.over = true; S.win = win; S.phase = 'over';
  S.shard += win ? C.WIN_SHARD : C.LOSE_SHARD;
  emit(S, 'end', { win, day: S.day, waveIdx: S.waveIdx, shard: S.shard,
                   walls: S.cnt.wall, traps: S.cnt.trap, hero: S.heroDef.name, grade: S.heroDef.grade });
  sound(S, win ? 'win' : 'lose');
}

/* ==================================================================
   매 프레임 갱신
   ================================================================== */
export function update(S, dt) {
  if (S.over || S.phase === 'report') return;
  S.t += dt;

  if (S.phase === 'day') {
    S.dayT += dt;
    if (S.dayT >= C.DAY_SEC) {
      S.dayT = 0; S.day++;
      if (S.day > C.TOTAL_DAYS) { endGame(S, true); return; }
      if (S.day === 22 && S.heroDef.lateGrow > 0)
        toast(S, `<b>${S.heroDef.name} 성장</b> — 공격력 +${Math.round(S.heroDef.lateGrow * 100)}%`);
      const w = waveForDay(S.day);
      if (w) startWarn(S, w);
      emit(S, 'day', { day: S.day });
    }
  } else if (S.phase === 'warn') {
    S.warnT += dt;
    if (S.warnT >= C.WARN_SEC) spawnWave(S, waveForDay(S.day));
  } else if (S.phase === 'night') {
    if (S.monsters.length === 0) { endWave(S); return; }
  }

  updateHero(S, dt);
  updateSoldiers(S, dt);
  updateMonsters(S, dt);
  cleanupTraps(S);

  if (!S.lastStand && S.base.hp <= S.base.maxHp * 0.2 && S.base.hp > 0) {
    S.lastStand = true;
    toast(S, '<b style="color:#C6412F">최후의 저항</b> — 공격력 +50%, 이동 속도 +20%');
    sound(S, 'lastStand');
    emit(S, 'lastStand');
  }
  if (S.base.hp <= 0) { endGame(S, false); return; }

  for (const n of S.nodes) if (n.amt <= 0 && S.t >= n.regrow) n.amt = n.max;
  updateObjective(S);
}

function updateObjective(S) {
  const o = OBJECTIVES[S.objIdx];
  if (o && o.ok(S)) {
    S.objIdx++;
    S.shard += C.OBJECTIVE_SHARD;
    toast(S, `목표 달성 — 옥새 조각 <b>+${C.OBJECTIVE_SHARD}</b>`);
    sound(S, 'objective');
    emit(S, 'objective', { index: S.objIdx });
  }
}
export const currentObjective = S => OBJECTIVES[S.objIdx] || null;

/* ---------------- 장수 ---------------- */
function updateHero(S, dt) {
  const h = S.hero;
  if (h.dead) {
    h.respawn -= dt;
    if (h.respawn <= 0) {
      h.dead = false; h.hp = h.maxHp;
      h.x = S.base.x; h.y = S.base.y + C.TILE * 2;
      toast(S, `<b>${S.heroDef.name}</b> 부활`);
      emit(S, 'respawn');
    }
    return;
  }

  const spd = C.HERO_SPD * (S.lastStand ? 1.2 : 1);
  const iv = S.input;
  h.moving = !!(iv.x || iv.y);
  if (h.moving) {
    h.x = clamp(h.x + iv.x * spd * dt, 8, C.WORLD_W - 8);
    h.y = clamp(h.y + iv.y * spd * dt, 8, C.WORLD_H - 8);
    h.facing = Math.atan2(iv.x, iv.y);
  }

  h.cd -= dt;
  if (h.swing > 0) h.swing -= dt;

  const R = heroRange(S);
  let best = null, bd = R * R;
  for (const m of S.monsters) {
    const d = dist2(h.x, h.y, m.x, m.y);
    if (d < bd) { bd = d; best = m; }
  }
  if (best) {
    h.facing = Math.atan2(best.x - h.x, best.y - h.y);
    if (h.cd <= 0) {
      h.cd = heroCd(S);
      h.swing = 0.22;
      damageMonster(S, best, C.HERO_ATK * combatMul(S), 'hero', null);
      sound(S, 'swing');
      emit(S, 'heroSwing', { x: h.x, y: h.y, target: { x: best.x, y: best.y } });
    }
    return;   // 전투 중에는 채집하지 않습니다
  }

  h.hp = Math.min(h.maxHp, h.hp + C.HERO_REGEN * dt);

  let node = null, nd2 = C.GATHER_RANGE * C.GATHER_RANGE;
  for (const n of S.nodes) {
    if (n.amt <= 0) continue;
    if (n.type === 'iron' && !S.pickaxe) continue;
    const d2 = dist2(h.x, h.y, n.x, n.y);
    if (d2 < nd2) { nd2 = d2; node = n; }
  }
  if (node) {
    h.gp += C.GATHER_RATE[node.type] * dt;
    while (h.gp >= 1 && node.amt > 0) {
      h.gp -= 1; node.amt--; S.res[node.type]++; S.got[node.type]++;
      if (node.amt <= 0) { node.regrow = S.t + C.NODE_REGROW_SEC; emit(S, 'nodeDepleted', { node }); }
    }
    if (Math.random() < dt * 3) fx(S, node.x, node.y - 10, '+', '#C7D9A8');
    emit(S, 'gathering', { x: node.x, y: node.y, type: node.type });
  } else h.gp = 0;
}

/* ---------------- 병사 ---------------- */
function updateSoldiers(S, dt) {
  const night = S.phase === 'night' || S.phase === 'warn';

  for (const s of S.soldiers) {
    if (s.down) {
      s.downT -= dt;
      if (s.downT <= 0) {
        s.down = false; s.hp = s.maxHp;
        s.x = S.base.x + rnd(-30, 30); s.y = S.base.y + C.TILE * 2;
        emit(S, 'soldiers');
      }
      continue;
    }
    if (s.hp <= 0) {
      s.down = true; s.downT = C.SOLDIER_DOWN_SEC; s.carry = 0; s.node = null;
      fx(S, s.x, s.y - 10, '부상', '#E0554A');
      emit(S, 'soldiers');
      continue;
    }
    s.cd -= dt;

    if (s.role === 'def' || night) {
      let tgt = null, bd = 150 * 150;
      for (const m of S.monsters) {
        if (dist2(m.x, m.y, S.base.x, S.base.y) > 150 * 150) continue;
        const d = dist2(s.x, s.y, m.x, m.y);
        if (d < bd) { bd = d; tgt = m; }
      }
      if (tgt) {
        moveToward(s, tgt.x, tgt.y, 95, dt, 30);
        if (dist2(s.x, s.y, tgt.x, tgt.y) < C.SOLDIER_RANGE * C.SOLDIER_RANGE && s.cd <= 0) {
          s.cd = C.SOLDIER_CD;
          damageMonster(S, tgt, C.SOLDIER_ATK * (S.lastStand ? 1.5 : 1), 'soldier', null);
        }
      } else {
        moveToward(s, S.base.x, S.base.y + C.TILE * 2, 85, dt, 10);
        s.hp = Math.min(s.maxHp, s.hp + 5 * dt);
      }
      continue;
    }

    if (!s.node || s.node.amt <= 0) {
      let bn = null, bnd = Infinity;
      for (const n of S.nodes) {
        if (n.type !== s.role || n.amt <= 0) continue;
        const dd = dist2(s.x, s.y, n.x, n.y);
        if (dd < bnd) { bnd = dd; bn = n; }
      }
      s.node = bn;
    }

    if (s.carry >= C.SOLDIER_CARRY) {
      moveToward(s, S.base.x, S.base.y, 90, dt, 26);
      // ★ 도착 판정은 거점 중심이 아니라 "거점 가장자리"까지의 거리로 잽니다.
      //   중심 거리로 재면 3x3 크기의 거점 벽에 붙어도 영원히 도착 판정이 안 납니다.
      const edge = Math.hypot(s.x - S.base.x, s.y - S.base.y) - C.BASE_FOOTPRINT;
      if (edge <= 10) {
        S.res[s.role] += s.carry; S.got[s.role] += s.carry;
        fx(S, S.base.x, S.base.y - 20, `+${s.carry}`, '#C7D9A8');
        s.carry = 0;
      }
    } else if (s.node) {
      moveToward(s, s.node.x, s.node.y, 90, dt, 22);
      if (dist2(s.x, s.y, s.node.x, s.node.y) < 26 * 26) {
        s.gp += C.SOLDIER_GATHER_RATE * dt;
        while (s.gp >= 1 && s.node.amt > 0) {
          s.gp -= 1; s.node.amt--; s.carry++;
          if (s.node.amt <= 0) { s.node.regrow = S.t + C.NODE_REGROW_SEC; emit(S, 'nodeDepleted', { node: s.node }); }
        }
      }
    } else {
      moveToward(s, S.base.x, S.base.y + C.TILE * 2, 70, dt, 20);
    }
  }
}

function moveToward(e, tx, ty, spd, dt, stopAt) {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d <= (stopAt || 2)) return;
  e.x = clamp(e.x + dx / d * spd * dt, 6, C.WORLD_W - 6);
  e.y = clamp(e.y + dy / d * spd * dt, 6, C.WORLD_H - 6);
  e.facing = Math.atan2(dx, dy);
}

/* ---------------- 몬스터 ---------------- */
function updateMonsters(S, dt) {
  for (let i = S.monsters.length - 1; i >= 0; i--) {
    const m = S.monsters[i];
    if (m.dead) continue;
    m.cd -= dt;
    if (m.hitFlash > 0) m.hitFlash -= dt;

    const tx = clamp(Math.floor(m.x / C.TILE), 0, C.MAPW - 1);
    const ty = clamp(Math.floor(m.y / C.TILE), 0, C.MAPH - 1);
    const k = tkey(tx, ty);
    let slowMul = 1;

    const ti = S.trapAt[k];
    if (ti > 0) {
      const tr = S.traps[ti - 1];
      if (tr && tr.dur > 0) {
        slowMul = C.TRAP_SLOW;
        damageMonster(S, m, C.TRAP_DPS * dt, 'trap', tr);
        tr.dur -= C.TRAP_WEAR * dt;
        if (tr.dur <= 0) {
          S.trapAt[k] = 0; S.occ[k] = C.OCC_EMPTY;
          fx(S, tr.x, tr.y, '함정 파손', '#9E9384');
          emit(S, 'trapBroken', { tx: tr.tx, ty: tr.ty });
        }
        if (m.dead) continue;
      }
    }

    // 눈앞의 장수·병사 먼저
    let tgt = null, bd = 38 * 38;
    if (!S.hero.dead) {
      const dh = dist2(m.x, m.y, S.hero.x, S.hero.y);
      if (dh < bd) { bd = dh; tgt = S.hero; }
    }
    for (const so of S.soldiers) {
      if (so.down) continue;
      const ds = dist2(m.x, m.y, so.x, so.y);
      if (ds < bd) { bd = ds; tgt = so; }
    }
    if (tgt) {
      m.facing = Math.atan2(tgt.x - m.x, tgt.y - m.y);
      if (m.cd <= 0) {
        m.cd = 1.1;
        tgt.hp -= m.dmg;
        emit(S, 'monsterSwing', { x: m.x, y: m.y });
        if (tgt === S.hero) {
          fx(S, S.hero.x, S.hero.y - 16, `-${m.dmg}`, '#E0554A');
          if (S.hero.hp <= 0 && !S.hero.dead) {
            S.hero.dead = true;
            S.hero.respawn = C.RESPAWN_BASE + S.day * 0.2;
            toast(S, `<b>${S.heroDef.name}</b> 쓰러짐 — ${Math.round(S.hero.respawn)}초 후 부활 (탈락은 없습니다)`);
            sound(S, 'heroDown');
          }
        }
      }
      continue;
    }

    // 거점 공격 — 가장자리 기준
    const baseEdge = Math.hypot(m.x - S.base.x, m.y - S.base.y) - C.BASE_FOOTPRINT;
    if (baseEdge <= 24) {
      m.facing = Math.atan2(S.base.x - m.x, S.base.y - m.y);
      if (m.cd <= 0) {
        m.cd = 1.1;
        S.base.hp -= m.dmg;
        if (S.waveStats) S.waveStats.baseDmg += m.dmg;
        fx(S, S.base.x + rnd(-18, 18), S.base.y - 18, `-${m.dmg}`, '#E0554A');
        emit(S, 'baseHit', { dmg: m.dmg });
      }
      continue;
    }

    // 이동 — 길이 있으면 흐름장, 막혔으면 목책 파괴
    const d = S.dist[k];
    if (d < 0) {
      const w = nearestWall(S, m.x, m.y);
      if (w) {
        moveToward(m, w.x, w.y, m.spd * slowMul, dt, 24);
        if (dist2(m.x, m.y, w.x, w.y) < 30 * 30 && m.cd <= 0) {
          m.cd = 1.1;
          S.wallHp[w.k] -= m.dmg * C.WALL_DMG_MUL;
          fx(S, w.x, w.y - 8, '쿵', '#C89B62');
          if (S.wallHp[w.k] <= 0) {
            S.occ[w.k] = C.OCC_EMPTY; S.wallHp[w.k] = 0;
            computeFlow(S);
            fx(S, w.x, w.y, '목책 파괴', '#E0554A');
            emit(S, 'wallBroken', { tx: w.k % C.MAPW, ty: (w.k / C.MAPW) | 0 });
            sound(S, 'wallBreak');
          }
        }
      } else {
        moveToward(m, S.base.x, S.base.y, m.spd * slowMul, dt, 10);
      }
    } else {
      const fxv = S.flowX[k], fyv = S.flowY[k];
      if (fxv === 0 && fyv === 0) {
        moveToward(m, S.base.x, S.base.y, m.spd * slowMul, dt, 10);
      } else {
        m.x = clamp(m.x + fxv * m.spd * slowMul * dt, 6, C.WORLD_W - 6);
        m.y = clamp(m.y + fyv * m.spd * slowMul * dt, 6, C.WORLD_H - 6);
        m.facing = Math.atan2(fxv, fyv);
      }
    }

    // 서로 겹치지 않게
    for (let j = i - 1; j >= 0; j--) {
      const o = S.monsters[j];
      if (o.dead) continue;
      const ddx = m.x - o.x, ddy = m.y - o.y;
      const dd = ddx * ddx + ddy * ddy;
      if (dd < 320 && dd > 0.01) {
        const dl = Math.sqrt(dd), push = (18 - dl) * 0.5;
        if (push > 0) {
          m.x += ddx / dl * push; m.y += ddy / dl * push;
          o.x -= ddx / dl * push; o.y -= ddy / dl * push;
        }
      }
    }
  }
}

function nearestWall(S, x, y) {
  let best = null, bd = Infinity;
  for (const k of S.wallList) {
    if (S.occ[k] !== C.OCC_WALL) continue;
    const tx = k % C.MAPW, ty = (k / C.MAPW) | 0;
    const wx = tx * C.TILE + C.TILE / 2, wy = ty * C.TILE + C.TILE / 2;
    const d = dist2(x, y, wx, wy);
    if (d < bd) { bd = d; best = { k, x: wx, y: wy }; }
  }
  return best;
}

export function damageMonster(S, m, amt, src, trap) {
  if (m.dead) return;
  m.hp -= amt;
  m.hitFlash = 0.12;
  if (m.hp > 0) return;

  m.dead = true;
  const st = S.waveStats;
  if (st) {
    st.killed++;
    if (src === 'trap') {
      st.byTrap++;
      if (trap) { st.trapKills[trap.no] = (st.trapKills[trap.no] || 0) + 1; trap.kills++; }
    } else if (src === 'soldier') st.bySoldier++;
    else st.byHero++;
  }
  fx(S, m.x, m.y - 12, m.boss ? '두목 처치!' : '처치', m.boss ? '#E0B44A' : '#E0554A');
  emit(S, 'monsterDied', { x: m.x, y: m.y, boss: m.boss });
  sound(S, m.boss ? 'bossDie' : 'die');
  const idx = S.monsters.indexOf(m);
  if (idx >= 0) S.monsters.splice(idx, 1);
}

function cleanupTraps(S) {
  for (let i = 0; i < S.traps.length; i++) {
    const t = S.traps[i];
    if (t.dur <= 0 && S.trapAt[tkey(t.tx, t.ty)] === i + 1) {
      S.trapAt[tkey(t.tx, t.ty)] = 0;
      S.occ[tkey(t.tx, t.ty)] = C.OCC_EMPTY;
    }
  }
}

/* ---------------- 화면이 물어보는 것들 ---------------- */
export function nextWave(S) {
  for (let i = 0; i < C.WAVES.length; i++)
    if (C.WAVES[i].day >= S.day && S.waveIdx <= i) return C.WAVES[i];
  return null;
}
export const isNight = S => S.phase === 'night' || S.phase === 'warn';
