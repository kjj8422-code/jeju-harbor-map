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

function emit(S, type, data) {
  // ★ data 를 먼저 펼치고 type 을 나중에 씁니다.
  //   순서가 반대면 data 안의 type 필드가 이벤트 종류를 덮어써서
  //   화면이 그 이벤트를 영영 못 알아봅니다 (실제로 스킬 이펙트가 이래서 안 나왔습니다).
  S.events.push({ ...data, type });
}
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
  /* ※ 예전 문구는 "함정 처치 비율 40% 이상" 이었습니다.
     자동 플레이로 재보니 22일에는 최선을 다해도 1% 였습니다 —
     적이 약해서 장수 혼자 93% 를 잡아버리기 때문입니다.
     달성할 수 없는 숫자를 목표로 걸면 플레이어가 자기 탓을 합니다. 지웠습니다.
     함정이 실제로 일하기 시작하는 구간은 3막(77일~)이고, 그때 30% 안팎이 나옵니다. */
  { t: '22일 <b>산적 무리</b>를 막아내세요. 리포트에서 <b>함정이 몇 마리를 잡았는지</b> 확인해 보세요.',
    ok: S => S.waveIdx >= 2 },
  { t: '33일 <b>산적 두목</b>을 쓰러뜨리고 <b>1막(개척기)</b>을 완주하세요.',
    ok: S => S.waveIdx >= 3 },

  /* ── 2막 확장기 ── */
  { t: '성을 <b>석성</b>으로 올리세요. (석재 60 · 목재 40) 2막부터는 성벽이 버텨줘야 합니다.',
    ok: S => S.baseLv >= 2 },
  { t: '<b>용병</b>을 1명 고용하세요. 옥새 조각으로 즉시 머릿수를 늘릴 수 있습니다.',
    ok: S => S.mercHired >= 1 },
  { t: '44일 <b>오환 기병대</b>를 막아내세요. 기병은 함정을 빨리 빠져나갑니다.',
    ok: S => S.waveIdx >= 4 },
  { t: '<b>가죽 갑옷</b>을 만드세요. (가죽 8 · 목재 5) 최대 체력이 늘어납니다.',
    ok: S => S.gear.leather },
  { t: '55일 <b>남만 상군</b>을 막아내세요. 방패병은 목책을 오래 두드립니다.',
    ok: S => S.waveIdx >= 5 },
  { t: '66일 <b>맹획</b>을 쓰러뜨리고 <b>2막(확장기)</b>을 완주하세요.',
    ok: S => S.waveIdx >= 6 },

  /* ── 3막 결전기 ── */
  { t: '성을 <b>철옹성</b>으로 올리세요. (석재 120 · 철 30) 망루가 적을 자동으로 쏩니다.',
    ok: S => S.baseLv >= 3 },
  { t: '<b>가시함정</b>을 8개까지 늘리세요. 3막은 사방에서 옵니다.',
    ok: S => S.cnt.trap >= 8 },
  { t: '77일 <b>위군 선봉</b>을 막아내세요.',
    ok: S => S.waveIdx >= 7 },
  { t: '88일 <b>조조의 정예</b>를 막아내세요. 네 방향입니다.',
    ok: S => S.waveIdx >= 8 },
  { t: '99일 <b>최후의 대란</b>을 이겨내고 완주하세요.',
    ok: S => S.waveIdx >= 9 }
];

/* ==================================================================
   생성
   ================================================================== */
export function createSim(heroId, awaken = 0) {
  const heroDef = C.GENERALS.find(g => g.id === heroId) || C.GENERALS[1];
  const mul = heroDef.startRes;

  const S = {
    heroDef,
    awaken: Math.max(0, Math.min(C.AWAKEN_MAX, awaken)),   // 각성 ★ 단계
    phase: 'day',            // day | warn | night | report | over
    day: 1, dayT: 0, warnT: 0, t: 0,
    over: false, win: false,

    res: { wood: Math.round(60 * mul), stone: Math.round(30 * mul), iron: 0, herb: 0, hide: 0, essence: 0 },
    got: { wood: 0, stone: 0, iron: 0, herb: 0, hide: 0, essence: 0 },
    cnt: { wall: 0, trap: 0, camp: 0 },
    shard: 0,

    hero: {
      x: C.BASE_TX * C.TILE + C.TILE / 2,
      y: (C.BASE_TY + 3) * C.TILE,
      hp: C.HERO_HP, maxHp: C.HERO_HP,
      cd: 0, dead: false, respawn: 0, gp: 0,
      facing: 0, moving: false, swing: 0, swingKind: 'attack',
      // 회피
      invuln: 0,
      // 스킬
      skillCd: [0, 0, 0],
      guard: 0, guardReduce: 0,          // 철벽
      frenzy: 0, frenzyAtk: 1, frenzyMove: 1,   // 무쌍난무
      volley: 0, volleyT: 0,             // 연사
      gatherTarget: null
    },
    base: {
      x: C.BASE_TX * C.TILE + C.TILE / 2,
      y: C.BASE_TY * C.TILE + C.TILE / 2,
      hp: C.BASE_LEVELS[0].maxHp, maxHp: C.BASE_LEVELS[0].maxHp
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
    /* ★ 공격 방향을 게임이 시작될 때 전부 정해 둡니다.
       5초 전에야 알려주면 목책을 세울 시간이 없습니다.
       첫날부터 "어디로 온다"를 알아야 어디를 막을지 판단할 수 있습니다. */
    plannedDirs: [],
    mercHired: 0,
    waveIdx: 0, waveStats: null,
    objIdx: 0,
    pickaxe: false, weaponLv: 0, forge: false, camps: 0,
    // 장비 — 만든 것만 true 가 됩니다
    gear: { ironpick:false, huntknife:false, torch:false, leather:false, ironmail:false,
            steelspike:false, towerup:false, banner:false },
    potions: 0,
    baseLv: 1, baseTowerCd: 0,
    lastStand: false,
    trapSeq: 0,
    input: { x: 0, y: 0 },
    events: []
  };

  S.plannedDirs = C.WAVES.map((w, i) => planDirs(w, i));
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

  /* 나무는 숲을 이룹니다 */
  for (let c = 0; c < 14; c++) {
    const cx = ri(2, C.MAPW - 3), cy = ri(2, C.MAPH - 3);
    const n = ri(4, 9);
    for (let i = 0; i < n; i++)
      addNode(S, clamp(cx + ri(-2, 2), 1, C.MAPW - 2), clamp(cy + ri(-2, 2), 1, C.MAPH - 2), 'wood');
  }

  /* 바위도 무리지어 놓습니다 — 채석장처럼.
     예전에는 30개를 지도 전체에 흩뿌려서, 하나 캐고 다음 바위까지 한참 걸어야 했습니다.
     총량이 모자랐던 것은 아니고(자동 플레이로 재보면 99일 수급은 넉넉합니다),
     "어디로 가면 돌을 캘 수 있는지" 가 한눈에 안 보이는 게 문제였습니다.
     무리지어 놓으면 미니맵의 회색 점 뭉치가 그대로 목적지가 됩니다. */
  for (let c = 0; c < 11; c++) {
    const cx = ri(2, C.MAPW - 3), cy = ri(2, C.MAPH - 3);
    const n = ri(3, 6);
    for (let i = 0; i < n; i++)
      addNode(S, clamp(cx + ri(-2, 2), 1, C.MAPW - 2), clamp(cy + ri(-2, 2), 1, C.MAPH - 2), 'stone');
  }

  // 철광은 지도 정중앙 8칸 폭에만 — 양 팀이 반드시 만나는 지점
  const mid = Math.floor(C.MAPW / 2);
  for (let m = 0; m < 18; m++) addNode(S, ri(mid - 4, mid + 4), ri(4, C.MAPH - 5), 'iron');

  // 약초 — 들판 곳곳에. 도구 없이 바로 캘 수 있어 초반 목표가 하나 늘어납니다
  for (let h = 0; h < 26; h++) addNode(S, ri(2, C.MAPW - 3), ri(2, C.MAPH - 3), 'herb');

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

/* ==================================================================
   침공 방향과 예상 경로
   ================================================================== */
/** 웨이브별 공격 방향을 미리 정합니다.
    동쪽은 거점에서 가장 먼 정면이라 항상 포함하고, 나머지는 웨이브마다 돌립니다. */
export function planDirs(w, idx) {
  const extra = ['N', 'S', 'W'];
  const dirs = ['E'];
  for (let j = 1; j < w.sides; j++) dirs.push(extra[(idx + j - 1) % 3]);
  return dirs;
}

/** 각 방향의 대표 진입점(타일). 실제 스폰은 이 점 주변에 몰립니다. */
export function entryPoint(side) {
  if (side === 'E') return { tx: C.MAPW - 2, ty: C.BASE_TY };
  if (side === 'W') return { tx: 1, ty: C.BASE_TY };
  if (side === 'N') return { tx: C.BASE_TX, ty: 1 };
  return { tx: C.BASE_TX, ty: C.MAPH - 2 };
}

/** 진입점에서 거점까지 몬스터가 실제로 걸어갈 길을 흐름장을 따라 뽑아냅니다.
    목책을 하나 놓을 때마다 이 길이 즉시 바뀌므로, 화면에 그려주면
    "내가 놓은 목책이 적의 길을 어떻게 바꿨는가"가 눈으로 보입니다. */
export function invasionPath(S, side) {
  const e = entryPoint(side);
  let tx = e.tx, ty = e.ty;
  if (!inMap(tx, ty)) return [];
  const path = [{ tx, ty }];
  const seen = new Set([tkey(tx, ty)]);
  for (let i = 0; i < 500; i++) {
    const k = tkey(tx, ty);
    if (S.dist[k] <= 0) break;                 // 거점에 닿았습니다
    const fx2 = S.flowX[k], fy2 = S.flowY[k];
    if (!fx2 && !fy2) break;                   // 길이 막혔습니다
    tx += Math.round(fx2); ty += Math.round(fy2);
    if (!inMap(tx, ty)) break;
    const nk = tkey(tx, ty);
    if (seen.has(nk)) break;
    seen.add(nk); path.push({ tx, ty });
  }
  return path;
}

/** 다음 웨이브가 지나갈 칸들의 집합. 함정을 어디에 깔지 판단하는 근거가 됩니다. */
export function pathTileSet(S) {
  const set = new Set();
  for (const d of upcomingDirs(S))
    for (const t of invasionPath(S, d)) set.add(tkey(t.tx, t.ty));
  return set;
}

/** 깔아둔 함정 중 몇 개가 실제 침공로 위에 있는가.
    "목책을 세웠더니 길이 바뀌었는데, 그래서 내 함정은 지금 쓸모가 있나?" 에 답하는 숫자입니다.
    경로에서 한 칸 옆으로 비껴도 몬스터는 밟지 않습니다. */
export function trapsOnPath(S) {
  const set = pathTileSet(S);
  let on = 0, total = 0;
  for (const t of S.traps) {
    if (t.dur <= 0) continue;
    total++;
    if (set.has(tkey(t.tx, t.ty))) { t.onPath = true; on++; }
    else t.onPath = false;
  }
  return { on, total };
}

/** 다음 웨이브의 방향들. 아직 남은 웨이브가 없으면 빈 배열. */
export function upcomingDirs(S) {
  const w = nextWave(S);
  if (!w) return [];
  const i = C.WAVES.indexOf(w);
  return S.plannedDirs[i] || [];
}

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
  m *= 1 + C.AWAKEN_BONUS * (S.awaken || 0);   // 각성 — 뽑기 중복이 실력으로 쌓입니다
  if (S.lastStand) m *= 1.5;
  return m;
}
export const weaponOf = S => C.WEAPON[S.heroDef.weapon] || C.WEAPON.sword;
export const heroRange = S =>
  C.HERO_RANGE * weaponOf(S).range * (S.heroDef.id === 'taesaja' ? 1.3 : 1);
export const heroCd = S =>
  C.HERO_CD * weaponOf(S).cd * (S.heroDef.id === 'yeopo' ? 0.8 : 1) * S.hero.frenzyAtk;
export const heroDamage = S => C.HERO_ATK * combatMul(S) * weaponOf(S).dmg;

/* ==================================================================
   건설 · 제작 · 병사
   ================================================================== */
/* ==================================================================
   정수(精髓) — 모자란 자원을 대신합니다
   ------------------------------------------------------------------
   "돌이 없어서 아무것도 못 짓는" 막힘이 이 게임에서 가장 답답한 순간입니다.
   정수 1개가 일반 자원 6을 대신하므로, 캐다 보면 막힘이 저절로 풀립니다.
   가죽·정수 자체는 정수로 대신할 수 없습니다(그러면 무한 증식이 됩니다).
   ================================================================== */
const SUBSTITUTABLE = { wood: 1, stone: 1, iron: 1, herb: 1 };

/** 이 비용을 내려면 정수가 몇 개 필요한가 (0 이면 정수 없이 됨, -1 이면 불가) */
export function essenceNeeded(S, cost) {
  let need = 0;
  for (const k in cost) {
    const short = cost[k] - S.res[k];
    if (short <= 0) continue;
    if (!SUBSTITUTABLE[k]) return -1;              // 가죽은 정수로 못 삽니다
    need += Math.ceil(short / C.ESSENCE_WORTH);
  }
  return need;
}

export function canAfford(S, cost) {
  for (const k in cost) if (S.res[k] < cost[k]) return false;
  return true;
}

/** 정수를 보태서라도 낼 수 있는가 */
export function canAffordWithEssence(S, cost) {
  if (canAfford(S, cost)) return { ok: true, essence: 0 };
  const n = essenceNeeded(S, cost);
  if (n < 0 || n > S.res.essence) return { ok: false, essence: n };
  return { ok: true, essence: n };
}

function pay(S, cost) {
  /* 모자란 만큼만 정수로 채웁니다 — 있는 자원부터 씁니다 */
  let used = 0;
  for (const k in cost) {
    const short = cost[k] - S.res[k];
    if (short > 0 && SUBSTITUTABLE[k]) {
      const n = Math.ceil(short / C.ESSENCE_WORTH);
      S.res.essence -= n; used += n;
      S.res[k] += n * C.ESSENCE_WORTH;
    }
    S.res[k] -= cost[k];
  }
  if (used > 0) {
    fx(S, S.hero.x, S.hero.y - 34, `⭐ -${used}`, '#E0B44A');
    toast(S, `모자란 자원을 <b style="color:#E0B44A">정수 ${used}개</b>로 메웠습니다`);
  }
}

export function costText(cost) {
  const names = { wood: '목재', stone: '석재', iron: '철' };
  return Object.keys(cost).map(k => `${names[k]} ${cost[k]}`).join(' · ');
}

/** 이 칸에 지을 수 있는지 — 화면의 미리보기도 같은 함수를 씁니다 */
/** 이 칸에 자원지가 있으면 그 자원지를 돌려줍니다 (없으면 null) */
export function nodeAt(S, tx, ty) {
  if (!inMap(tx, ty) || S.occ[tkey(tx, ty)] !== C.OCC_NODE) return null;
  return S.nodes.find(n => n.tx === tx && n.ty === ty) || null;
}

/** 자원지를 밀고 지을 때 돌려받는 자원 (남은 양의 절반) */
export function clearYield(n) {
  if (!n || n.amt <= 0) return null;
  return { type: n.type, amt: Math.max(1, Math.floor(n.amt * 0.5)) };
}

export function canBuildAt(S, tx, ty, buildId) {
  if (!S || S.over || !buildId || !inMap(tx, ty)) return { ok: false, why: 'out' };
  const occ = S.occ[tkey(tx, ty)];
  /* ★ 예전에는 나무·바위가 있는 칸에 영원히 아무것도 못 지었습니다.
     거점 반경 7칸의 11% 가 그렇게 막혀 있어서, 목책을 한 줄로 세우려 해도
     하필 나무가 걸리면 그 자리에 구멍이 났습니다.
     이제 **밀어내고 지을 수 있습니다** — 남은 자원의 절반을 챙기고 자원지는 사라집니다.
     "이 나무를 벨까, 자원으로 남길까" 라는 선택이 생깁니다. */
  if (occ !== C.OCC_EMPTY && occ !== C.OCC_NODE) return { ok: false, why: 'occupied' };
  const cx = tx * C.TILE + C.TILE / 2, cy = ty * C.TILE + C.TILE / 2;
  if (Math.hypot(cx - S.hero.x, cy - S.hero.y) > C.BUILD_RANGE) return { ok: false, why: 'far' };
  const def = C.BUILDS.find(b => b.id === buildId);
  if (!def) return { ok: false, why: 'out' };
  if (def.id === 'forge' && S.forge) return { ok: false, why: 'owned' };
  const aff = canAffordWithEssence(S, def.cost);
  if (!aff.ok) return { ok: false, why: 'cost' };
  return { ok: true, why: '', essence: aff.essence };
}

const BUILD_DENY = {
  out: '지도 밖입니다', occupied: '이미 무언가 있습니다',
  far: '너무 멉니다 — 가까이 가세요', owned: '이미 보유한 시설입니다', cost: '자원이 부족합니다'
};

export function tryBuild(S, tx, ty, buildId) {
  const chk = canBuildAt(S, tx, ty, buildId);
  if (!chk.ok) {
    if (chk.why === 'far' || chk.why === 'cost') {
      toast(S, BUILD_DENY[chk.why]);
      sound(S, 'deny');
    }
    return false;
  }
  const k = tkey(tx, ty);

  /* 자원지를 밀어내고 짓는 경우 — 남은 자원의 절반을 챙깁니다 */
  const node = nodeAt(S, tx, ty);
  if (node) {
    const got = clearYield(node);
    if (got) {
      S.res[got.type] += got.amt; S.got[got.type] += got.amt;
      fx(S, node.x, node.y - 14, `${C.RESOURCES[got.type].icon} +${got.amt}`, '#C7D9A8');
    }
    const i = S.nodes.indexOf(node);
    if (i >= 0) S.nodes.splice(i, 1);
    S.occ[k] = C.OCC_EMPTY;
    emit(S, 'nodeCleared', { tx, ty, type: node.type });
  }

  const def = C.BUILDS.find(b => b.id === buildId);
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
    if (def.id === 'camp') {
      S.camps++; S.cnt.camp++;
      // 병영을 지었다고 병사가 생기는 게 아니라는 점을 그 자리에서 알려줍니다
      toast(S, `병영 완성 — 병사 정원 <b>${S.soldiers.length}/${S.camps}</b>. `
             + '아래 <b>＋ 병사 고용</b>을 눌러야 들어옵니다');
    }
    if (def.id === 'forge') {
      S.forge = true;
      toast(S, '대장간 완성 — <b>🔨 제작·성</b> 버튼에서 <b>돌 곡괭이</b>부터 만드세요');
    }
    emit(S, 'build', { kind: def.id, tx, ty });
  }
  sound(S, 'build');
  fx(S, tx * C.TILE + C.TILE / 2, ty * C.TILE, def.name, '#E0B44A');
  return true;
}

/* ==================================================================
   철거 — 잘못 놓은 것, 길이 바뀌어 쓸모없어진 것을 되돌립니다
   ================================================================== */
export function canDemolish(S, tx, ty) {
  if (!inMap(tx, ty)) return { ok:false, why:'out' };
  const k = tkey(tx, ty);
  const o = S.occ[k];
  if (o === C.OCC_WALL) return { ok:true, kind:'wall' };
  if (o === C.OCC_TRAP) return { ok:true, kind:'trap' };
  if (o === C.OCC_STRUCT) {
    const st = S.structs.find(x => x.tx === tx && x.ty === ty);
    return st ? { ok:true, kind:st.type } : { ok:false, why:'none' };
  }
  return { ok:false, why:'none' };
}

/** 돌려받는 자원 — 원래 비용의 절반(내림) */
export function refundOf(kind) {
  const def = C.BUILDS.find(b => b.id === kind);
  if (!def) return {};
  const out = {};
  for (const r in def.cost) {
    const n = Math.floor(def.cost[r] * C.REFUND_RATIO);
    if (n > 0) out[r] = n;
  }
  return out;
}

export function demolish(S, tx, ty) {
  const chk = canDemolish(S, tx, ty);
  if (!chk.ok) { toast(S, '여기에는 철거할 것이 없습니다'); sound(S, 'deny'); return false; }
  const k = tkey(tx, ty), kind = chk.kind;

  if (kind === 'wall') {
    S.occ[k] = C.OCC_EMPTY; S.wallHp[k] = 0; S.cnt.wall--;
    computeFlow(S);
    emit(S, 'wallBroken', { tx, ty });
  } else if (kind === 'trap') {
    const i = S.trapAt[k] - 1;
    if (i >= 0 && S.traps[i]) S.traps[i].dur = 0;
    S.trapAt[k] = 0; S.occ[k] = C.OCC_EMPTY; S.cnt.trap--;
    emit(S, 'trapBroken', { tx, ty });
  } else {
    const i = S.structs.findIndex(x => x.tx === tx && x.ty === ty);
    if (i >= 0) S.structs.splice(i, 1);
    S.occ[k] = C.OCC_EMPTY;
    if (kind === 'camp') {
      S.camps--; S.cnt.camp--;
      // 정원이 줄면 넘치는 병사는 떠납니다
      while (S.soldiers.filter(x => !x.merc).length > S.camps) {
        const idx = S.soldiers.map(x => !x.merc).lastIndexOf(true);
        if (idx < 0) break;
        S.soldiers.splice(idx, 1);
        toast(S, '병영이 줄어 병사 한 명이 떠났습니다');
      }
      emit(S, 'soldiers');
    }
    if (kind === 'forge') S.forge = false;
    emit(S, 'structRemoved', { tx, ty, kind });
  }

  const back = refundOf(kind);
  for (const r in back) { S.res[r] += back[r]; }
  const def = C.BUILDS.find(b => b.id === kind);
  fx(S, tx * C.TILE + C.TILE / 2, ty * C.TILE,
     `${def ? def.name : ''} 철거 ${costText(back) ? '+' + costText(back) : ''}`, '#C7D9A8');
  sound(S, 'wallBreak');
  emit(S, 'demolished', { tx, ty, kind, refund: back });
  return true;
}

export function hireSoldier(S) {
  if (S.over) return false;
  if (S.soldiers.length >= S.camps) {
    toast(S, S.camps === 0 ? '먼저 <b>병영</b>을 지어야 합니다' : '병영을 더 지어야 병사를 늘릴 수 있습니다');
    return false;
  }
  if (!canAffordWithEssence(S, C.SOLDIER_COST).ok) { toast(S, `자원이 부족합니다 — ${costText(C.SOLDIER_COST)}`); return false; }
  pay(S, C.SOLDIER_COST);
  S.soldiers.push({
    x: S.base.x + rnd(-40, 40), y: S.base.y + rnd(20, 50),
    role: 'wood', hp: C.SOLDIER_HP, maxHp: C.SOLDIER_HP,
    cd: 0, carry: 0, node: null, gp: 0, down: false, downT: 0,
    merc: null, name: '병사', icon: '🗡️', contract: 0,
    atk: C.SOLDIER_ATK * (S.gear.banner ? C.BANNER_ATK : 1),
    cdMax: C.SOLDIER_CD, range: C.SOLDIER_RANGE,
    gather: C.SOLDIER_GATHER_RATE, carryMax: C.SOLDIER_CARRY, armor: 0, noFight: false
  });
  if (S.gear.banner) {
    const so = S.soldiers[S.soldiers.length - 1];
    so.maxHp = Math.round(so.maxHp * C.BANNER_HP); so.hp = so.maxHp;
  }
  sound(S, 'hire');
  toast(S, '병사를 고용했습니다 — 눌러서 역할을 바꾸세요');
  emit(S, 'soldiers');
  return true;
}

/* ==================================================================
   용병 — 병영 한도와 무관하게, 옥새 조각으로 즉시 고용합니다.
   대신 계약 일수가 지나면 떠납니다. 옥새 조각을 쓸 곳이 생기고,
   "지금 당장 손이 모자란다"는 문제를 돈으로 푸는 길이 열립니다.
   ================================================================== */
export function canHireMerc(S, id) {
  const def = C.MERCS.find(m => m.id === id);
  if (!def) return { ok: false, why: 'none' };
  if (S.shard < def.cost) return { ok: false, why: 'shard', need: def.cost };
  return { ok: true, def };
}

export function hireMerc(S, id) {
  if (S.over) return false;
  const chk = canHireMerc(S, id);
  if (!chk.ok) {
    toast(S, `옥새 조각이 부족합니다 — <b>${chk.need}</b> 필요`);
    sound(S, 'deny');
    return false;
  }
  const def = chk.def;
  S.shard -= def.cost;
  S.mercHired++;
  S.soldiers.push({
    x: S.base.x + rnd(-40, 40), y: S.base.y + rnd(20, 50),
    role: def.role,
    hp: Math.round(def.hp * (S.gear.banner ? C.BANNER_HP : 1)),
    maxHp: Math.round(def.hp * (S.gear.banner ? C.BANNER_HP : 1)),
    cd: 0, carry: 0, node: null, gp: 0, down: false, downT: 0,
    merc: def.id, name: def.name, icon: def.icon,
    contract: C.MERC_CONTRACT_DAYS,
    atk: def.atk * (S.gear.banner ? C.BANNER_ATK : 1),
    cdMax: def.cd || C.SOLDIER_CD, range: def.range || C.SOLDIER_RANGE,
    gather: def.gather, carryMax: def.carry, armor: def.armor || 0,
    noFight: def.id === 'gatherer'
  });
  sound(S, 'hire');
  toast(S, `<b>${def.name}</b> 고용 — ${C.MERC_CONTRACT_DAYS}일 계약`);
  emit(S, 'soldiers');
  return true;
}

/** 하루가 지날 때 계약 일수를 깎고, 끝난 용병은 떠납니다. */
function tickContracts(S) {
  let left = false;
  for (let i = S.soldiers.length - 1; i >= 0; i--) {
    const s = S.soldiers[i];
    if (!s.merc) continue;
    s.contract--;
    if (s.contract <= 0) {
      S.soldiers.splice(i, 1);
      toast(S, `<b>${s.name}</b>의 계약이 끝났습니다`);
      left = true;
    } else if (s.contract === 3) {
      toast(S, `<b>${s.name}</b> 계약 <b>3일</b> 남았습니다`);
    }
  }
  if (left) emit(S, 'soldiers');
}

/** 맡길 수 있는 역할 목록.
    철은 돌 곡괭이가 있어야 나옵니다 — 장수만 중앙까지 오가는 부담을 병사가 나눠 집니다.
    채집 용병은 싸우지 않으므로 '방어'가 없습니다. */
export function roleList(S, s) {
  const r = ['wood', 'stone', 'herb'];
  if (S.pickaxe) r.push('iron');
  if (!s || !s.noFight) r.push('def');
  return r;
}

export function cycleRole(S, i) {
  const s = S.soldiers[i];
  if (!s) return;
  const list = roleList(S, s);
  const at = list.indexOf(s.role);
  s.role = list[(at + 1) % list.length];
  s.node = null;
  emit(S, 'soldiers');
}

/** 이미 만들었는가 */
export function hasCraft(S, id) {
  if (id === 'pickaxe') return S.pickaxe;
  if (id === 'weapon') return S.weaponLv >= (C.CRAFTS.find(x => x.id === 'weapon').max || 3);
  if (id === 'potion') return false;            // 소모품은 계속 만들 수 있습니다
  return !!S.gear[id];
}

/** 만들 수 있는지와 그 이유 — 화면이 "왜 안 되는지"를 보여줄 수 있게 */
/** 무기 강화는 단계가 오를수록 비쌉니다 — 후반 성장에 값을 매겨야 합니다 */
export function craftCost(S, id) {
  const c = C.CRAFTS.find(x => x.id === id);
  if (!c) return {};
  if (id !== 'weapon') return c.cost;
  const lv = S.weaponLv;                    // 0 → 1단계를 만들 때
  return lv < 3 ? { iron: 5 } : { iron: 8 + (lv - 3) * 6, hide: 4 + (lv - 3) * 3 };
}

export function canCraft(S, id) {
  const c = C.CRAFTS.find(x => x.id === id);
  if (!c) return { ok:false, why:'없는 항목' };
  if (!S.forge) return { ok:false, why:'대장간이 필요합니다' };
  if (hasCraft(S, id)) return { ok:false, why:'이미 보유' };
  if (id === 'towerup' && S.baseLv < 3) return { ok:false, why:'철옹성이 필요합니다' };
  if (c.need && !hasCraft(S, c.need)) {
    const pre = C.CRAFTS.find(x => x.id === c.need);
    return { ok:false, why:`먼저 ${pre ? pre.name : c.need} 필요` };
  }
  const aff = canAffordWithEssence(S, craftCost(S, id));
  if (!aff.ok) return { ok:false, why: aff.essence > 0 ? `자원 부족 (정수 ${aff.essence}개로도 가능)` : '자원 부족' };
  return { ok:true, why:'', essence: aff.essence };
}

export function doCraft(S, id) {
  const c = C.CRAFTS.find(x => x.id === id);
  const chk = canCraft(S, id);
  if (!chk.ok) { toast(S, chk.why); sound(S, 'deny'); return false; }
  pay(S, craftCost(S, id));

  switch (id) {
    case 'pickaxe':
      S.pickaxe = true;
      toast(S, '돌 곡괭이 완성 — 지도 <b>중앙의 철광</b>을 캘 수 있습니다');
      break;
    case 'weapon':
      S.weaponLv++;
      toast(S, `무기 강화 ${S.weaponLv}단계 — 공격력 +${25 * S.weaponLv}%`);
      break;
    case 'banner':
      S.gear.banner = true;
      // 이미 고용해둔 병사·용병에게도 바로 적용됩니다
      for (const so of S.soldiers) {
        so.atk = (so.atk || C.SOLDIER_ATK) * C.BANNER_ATK;
        so.maxHp = Math.round(so.maxHp * C.BANNER_HP);
        so.hp = Math.min(so.maxHp, so.hp * C.BANNER_HP);
      }
      toast(S, '군기 — 병사·용병의 공격과 체력이 올랐습니다');
      break;
    case 'potion':
      S.potions++;
      toast(S, `치유약 ${S.potions}개 — <b>H</b> 키로 마십니다`);
      break;
    case 'leather':
      S.gear.leather = true;
      S.hero.maxHp += 40; S.hero.hp += 40;
      toast(S, '가죽 갑옷 — 최대 체력 +40');
      break;
    default:
      S.gear[id] = true;
      toast(S, `${c.name} 완성 — ${c.effect}`);
  }
  sound(S, 'craft');
  emit(S, 'crafted', { id });
  return true;
}

/** 치유약 마시기 */
export function usePotion(S) {
  if (S.potions <= 0 || S.hero.dead) return false;
  if (S.hero.hp >= S.hero.maxHp) { toast(S, '체력이 이미 가득합니다'); return false; }
  S.potions--;
  S.hero.hp = Math.min(S.hero.maxHp, S.hero.hp + C.POTION_HEAL);
  fx(S, S.hero.x, S.hero.y - 26, `+${C.POTION_HEAL}`, '#5FAE72');
  emit(S, 'potion', {});
  sound(S, 'potion');
  return true;
}

/* ==================================================================
   성(거점) 업그레이드
   ================================================================== */
export function nextBaseLevel(S) {
  return C.BASE_LEVELS.find(b => b.lv === S.baseLv + 1) || null;
}
export function canUpgradeBase(S) {
  const nx = nextBaseLevel(S);
  if (!nx) return { ok:false, why:'최고 단계입니다' };
  if (!canAffordWithEssence(S, nx.cost).ok) return { ok:false, why:'자원 부족' };
  if (isNight(S)) return { ok:false, why:'밤에는 공사할 수 없습니다' };
  return { ok:true, why:'' };
}
export function upgradeBase(S) {
  const chk = canUpgradeBase(S);
  const nx = nextBaseLevel(S);
  if (!chk.ok) { toast(S, chk.why); sound(S, 'deny'); return false; }
  pay(S, nx.cost);
  S.baseLv = nx.lv;
  const gain = nx.maxHp - S.base.maxHp;
  S.base.maxHp = nx.maxHp;
  S.base.hp = Math.min(S.base.maxHp, S.base.hp + gain);   // 올린 만큼 채워줍니다
  toast(S, `거점이 <b>${nx.name}</b>(이)가 되었습니다 — ${nx.desc}`);
  sound(S, 'upgrade');
  emit(S, 'baseUpgraded', { lv: S.baseLv });
  return true;
}

/** 3단계 망루의 자동 공격 */
function updateBaseTower(S, dt) {
  if (S.baseLv < 3) return;
  S.baseTowerCd -= dt;
  if (S.baseTowerCd > 0) return;
  let best = null, bd = C.BASE_TOWER_RANGE * C.BASE_TOWER_RANGE;
  for (const m of S.monsters) {
    const d = dist2(S.base.x, S.base.y, m.x, m.y);
    if (d < bd) { bd = d; best = m; }
  }
  if (!best) return;
  S.baseTowerCd = C.BASE_TOWER_CD * (S.gear.towerup ? C.TOWER_UP_CD : 1);
  emit(S, 'towerShot', { from:{ x:S.base.x, y:S.base.y }, to:{ x:best.x, y:best.y } });
  damageMonster(S, best, C.BASE_TOWER_DMG * (S.gear.towerup ? C.TOWER_UP_DMG : 1), 'soldier', null);
}

/** 마우스 클릭 타격 — 쿨다운이 돌아왔으면 즉시 한 대 칩니다.
    자동 공격도 그대로 돌아가므로, 클릭은 "직접 때리는 손맛"을 위한 것입니다. */
export function clickAttack(S) {
  const h = S.hero;
  if (S.over || h.dead || h.cd > 0) return false;

  const R = heroRange(S);
  let best = null, bd = R * R;
  for (const m of S.monsters) {
    const d = dist2(h.x, h.y, m.x, m.y);
    if (d < bd) { bd = d; best = m; }
  }
  h.cd = heroCd(S);
  h.swing = 0.24; h.swingKind = 'attack';
  sound(S, 'swing');

  if (!best) {                       // 허공을 휘둘러도 동작은 나갑니다
    emit(S, 'heroSwing', { x: h.x, y: h.y, weapon: S.heroDef.weapon, miss: true });
    return true;
  }
  h.facing = Math.atan2(best.x - h.x, best.y - h.y);
  knockback(best, h.x, h.y, C.KNOCKBACK);
  const crit = Math.random() < (C.CRIT_CHANCE + (S.heroDef.critBonus || 0));
  const dmg = heroDamage(S) * (crit ? C.CRIT_MUL : 1);
  damageMonster(S, best, dmg, 'hero', null, false, crit);
  if (S.heroDef.lifesteal) {
    const heal = dmg * S.heroDef.lifesteal * (h.guard > 0 ? 2 : 1);
    h.hp = Math.min(h.maxHp, h.hp + heal);
    fx(S, h.x, h.y - 26, `+${Math.round(heal)}`, '#5FAE72');
  }
  if (S.heroDef.weapon === 'bow') emit(S, 'shot', { from:{x:h.x,y:h.y}, to:{x:best.x,y:best.y} });
  emit(S, 'heroSwing', { x: h.x, y: h.y, target:{x:best.x,y:best.y}, weapon: S.heroDef.weapon });
  return true;
}


/* ==================================================================
   스킬
   ================================================================== */
export function useSkill(S, slot) {
  const h = S.hero;
  const def = S.heroDef.skills[slot];
  if (S.over || h.dead || !def || h.skillCd[slot] > 0) return false;

  h.skillCd[slot] = def.cd;
  h.swing = def.ult ? 0.6 : 0.32; h.swingKind = def.type;
  const dmgBase = heroDamage(S);
  /* 궁극기는 쓰는 동안 무적입니다.
     구르기를 뺀 대신, "위험할 때 눌러서 흘리는" 역할을 궁극기가 받습니다. */
  if (def.invuln) h.invuln = Math.max(h.invuln, def.invuln);
  let ultHeal = 0;

  switch (def.type) {
    case 'arc': {          // 참격 — 전방 부채꼴
      const R = def.range * C.TILE * 2;
      let hit = 0;
      for (const m of [...S.monsters]) {
        if (dist2(h.x, h.y, m.x, m.y) > R * R) continue;
        const ang = Math.atan2(m.x - h.x, m.y - h.y);
        let diff = Math.abs(((ang - h.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (diff > def.arc / 2) continue;
        knockback(m, h.x, h.y, C.KNOCKBACK_SKILL * def.knock);
        damageMonster(S, m, dmgBase * def.dmg, 'hero', null, true);
        hit++;
      }
      emit(S, 'skillFx', { kind: 'arc', x: h.x, y: h.y, facing: h.facing, range: R, hit, ult: !!def.ult });
      break;
    }
    case 'spin': {         // 회선 — 360도
      const R = def.range * C.TILE * 2;
      let hit = 0;
      for (const m of [...S.monsters]) {
        if (dist2(h.x, h.y, m.x, m.y) > R * R) continue;
        knockback(m, h.x, h.y, C.KNOCKBACK_SKILL * def.knock);
        damageMonster(S, m, dmgBase * def.dmg, 'hero', null, true);
        if (def.lifesteal) ultHeal += dmgBase * def.dmg * def.lifesteal;
        hit++;
      }
      emit(S, 'skillFx', { kind: 'spin', x: h.x, y: h.y, range: R, hit, ult: !!def.ult });
      break;
    }
    case 'pierce': {       // 관통사 — 직선
      const R = def.range * C.TILE * 2, W = def.width * C.TILE;
      const fx0 = Math.sin(h.facing), fy0 = Math.cos(h.facing);
      let hit = 0;
      for (const m of [...S.monsters]) {
        const rx = m.x - h.x, ry = m.y - h.y;
        const along = rx * fx0 + ry * fy0;
        if (along < 0 || along > R) continue;
        const perp = Math.abs(rx * fy0 - ry * fx0);
        if (perp > W) continue;
        damageMonster(S, m, dmgBase * def.dmg, 'hero', null, true);
        hit++;
      }
      emit(S, 'skillFx', { kind: 'pierce', x: h.x, y: h.y, facing: h.facing, range: R, hit, ult: !!def.ult });
      break;
    }
    case 'multi':          // 연사 — 여러 발을 나눠 쏩니다
      h.volley = def.shots; h.volleyT = 0;
      emit(S, 'skillFx', { kind: 'multi', x: h.x, y: h.y, ult: !!def.ult });
      break;
    case 'guard':          // 철벽
      h.guard = def.dur; h.guardReduce = def.reduce;
      emit(S, 'skillFx', { kind: 'guard', x: h.x, y: h.y, dur: def.dur });
      break;
    case 'frenzy':         // 무쌍난무
      h.frenzy = def.dur; h.frenzyAtk = def.atkSpd; h.frenzyMove = def.moveSpd;
      emit(S, 'skillFx', { kind: 'frenzy', x: h.x, y: h.y, dur: def.dur });
      break;
  }
  if (ultHeal > 0) {
    h.hp = Math.min(h.maxHp, h.hp + ultHeal);
    fx(S, h.x, h.y - 30, `+${Math.round(ultHeal)}`, '#5FAE72');
  }
  toast(S, def.ult
    ? `<b style="color:${S.heroDef.color};font-size:15px">${def.name}</b> <span style="color:#9fd8ff">— 무적</span>`
    : `<b style="color:${S.heroDef.color}">${def.name}</b>`);
  sound(S, def.ult ? 'ult' : 'skill');
  return true;
}

function knockback(m, fromX, fromY, power) {
  if (m.boss) power *= 0.25;    // 보스는 잘 안 밀립니다
  const dx = m.x - fromX, dy = m.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  m.vx = (dx / d) * power;
  m.vy = (dy / d) * power;
}

/* 장수가 맞을 때 — 무적·철벽을 거칩니다 */
function damageHero(S, amt, from) {
  const h = S.hero;
  if (h.invuln > 0) { fx(S, h.x, h.y - 20, '무적!', '#9fd8ff'); emit(S, 'invulnBlock'); return false; }
  if (h.guard > 0) amt *= (1 - h.guardReduce);
  if (S.gear.ironmail) amt *= 0.8;
  h.hp -= amt;
  fx(S, h.x, h.y - 16, `-${Math.round(amt)}`, '#E0554A');
  emit(S, 'heroHit', { x: h.x, y: h.y, dmg: amt });
  if (h.hp <= 0 && !h.dead) {
    h.dead = true;
    h.respawn = C.RESPAWN_BASE + S.day * 0.2;
    h.volley = 0; h.guard = 0; h.frenzy = 0; h.frenzyAtk = 1; h.frenzyMove = 1;
    toast(S, `<b>${S.heroDef.name}</b> 쓰러짐 — ${Math.round(h.respawn)}초 후 부활 (탈락은 없습니다)`);
    sound(S, 'heroDown');
  }
  return true;
}

/* ==================================================================
   웨이브
   ================================================================== */
export const waveForDay = day => C.WAVES.find(w => w.day === day) || null;
export const dirName = d => ({ E: '동쪽', W: '서쪽', N: '북쪽', S: '남쪽' })[d];

function startWarn(S, w) {
  S.phase = 'warn'; S.warnT = 0;
  S.spawnDirs = (S.plannedDirs[C.WAVES.indexOf(w)] || planDirs(w, 0)).slice();
  emit(S, 'warn', { name: w.name, note: w.note, dirs: S.spawnDirs.slice() });
  sound(S, 'warn');
}

/* 스폰은 대표 진입점 ±4칸 안에 모입니다.
   가장자리 전체에 흩뿌리면 화면에 그린 "예상 경로"가 거짓말이 됩니다. */
function edgePoint(side) {
  const e = entryPoint(side);
  const cx = e.tx * C.TILE + C.TILE / 2, cy = e.ty * C.TILE + C.TILE / 2;
  const spread = C.TILE * 4;
  if (side === 'E' || side === 'W')
    return { x: cx, y: clamp(cy + rnd(-spread, spread), C.TILE * 1.5, C.WORLD_H - C.TILE * 1.5) };
  return { x: clamp(cx + rnd(-spread, spread), C.TILE * 1.5, C.WORLD_W - C.TILE * 1.5), y: cy };
}

function makeMonster(x, y, hp, spd, dmg, boss, kind) {
  const K = C.MONSTER_KINDS[kind] || C.MONSTER_KINDS.normal;
  return { x, y, hp, maxHp: hp, spd, dmg, cd: 0, boss: !!boss,
           kind: boss ? 'boss' : (kind || 'normal'),
           armor: boss ? 0.10 : K.armor,
           scale: boss ? 1 : K.scale,
           breach: null, hitFlash: 0, facing: 0, dead: false,
           windup: 0, windupTgt: null, vx: 0, vy: 0, hitStop: 0 };
}

/** mix 비율대로 종류 목록을 만들고 섞습니다. 한 종류가 뭉쳐 오면 방어가 단조로워집니다. */
function kindList(w, count) {
  const mix = w.mix && w.mix.length ? w.mix : [['normal', 1]];
  const list = [];
  for (const [kind, pct] of mix) {
    const n = Math.round(count * pct);
    for (let i = 0; i < n; i++) list.push(kind);
  }
  while (list.length < count) list.push(mix[0][0]);
  list.length = count;
  for (let i = list.length - 1; i > 0; i--) { const j = ri(0, i); const t = list[i]; list[i] = list[j]; list[j] = t; }
  return list;
}

function spawnWave(S, w) {
  S.phase = 'night';
  S.waveStats = { killed: 0, byTrap: 0, bySoldier: 0, byHero: 0, baseDmg: 0, trapKills: {} };
  const mul = S.heroDef.waveMul;
  const count = Math.round(w.count * mul);
  const kinds = kindList(w, count);
  for (let i = 0; i < count; i++) {
    const p = edgePoint(S.spawnDirs[i % S.spawnDirs.length]);
    const K = C.MONSTER_KINDS[kinds[i]] || C.MONSTER_KINDS.normal;
    S.monsters.push(makeMonster(p.x, p.y,
      w.hp * mul * K.hpMul, w.spd * K.spdMul, w.dmg * K.dmgMul, false, kinds[i]));
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
  /* ★ 함정 경로 판정은 waveIdx 를 올리기 **전에** 재야 합니다.
     올린 뒤에 재면 "다음 웨이브" 기준이 되고, 마지막 웨이브에서는 다음이 없어
     모든 함정이 '경로 밖'으로 찍힙니다(실제로는 36% 를 잡았는데 0/12 로 나왔습니다). */
  const tpNow = trapsOnPath(S);
  S.waveIdx++;
  // 통계가 없는 상태로 들어올 수 있습니다(검수 코드가 phase 를 직접 바꾸는 경우 등).
  const st = S.waveStats || { killed: 0, byTrap: 0, bySoldier: 0, byHero: 0, baseDmg: 0, trapKills: {} };
  const reward = C.WAVE_SHARD[S.waveIdx - 1] || 15;
  S.shard += reward;

  let mvp = '없음 (함정이 한 마리도 못 잡았습니다)', mvpKills = 0;
  for (const no in st.trapKills) {
    if (st.trapKills[no] > mvpKills) { mvpKills = st.trapKills[no]; mvp = `가시함정 #${no}`; }
  }
  const trapPct = st.killed ? Math.round(st.byTrap / st.killed * 100) : 0;
  const soldPct = st.killed ? Math.round(st.bySoldier / st.killed * 100) : 0;

  const nw = C.WAVES[S.waveIdx] || null;
  S.phase = 'report';
  emit(S, 'report', {
    day: w.day, name: w.name, note: w.note, advice: w.advice,
    killed: st.killed, trapPct, soldPct, mvp,
    trapsOn: tpNow.on, trapsTotal: tpNow.total,
    sides: w.sides,
    nextName: nw ? nw.name : null, nextDay: nw ? nw.day : null,
    nextSides: nw ? nw.sides : null,
    nextDirs: nw ? (S.plannedDirs[S.waveIdx] || []).map(dirName) : [],
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
      tickContracts(S);
      if (S.day > C.TOTAL_DAYS) { endGame(S, true); return; }
      // 막이 바뀌면 무엇이 달라지는지 그 자리에서 알려줍니다
      const actNow = C.actOf(S.day), actPrev = C.actOf(S.day - 1);
      if (actNow.act !== actPrev.act) {
        toast(S, `<b style="color:#E0B44A">${actNow.act}막 ${actNow.name}</b> — ${actNow.lesson}`);
        if (actNow.act === 3)
          toast(S, '이제 <b style="color:#E0554A">사방</b>에서 옵니다 — 거점을 빙 둘러싸고 '
                 + '<b>문을 몇 개만</b> 내어 그 길목에 함정을 까세요');
        emit(S, 'actChanged', { act: actNow.act, name: actNow.name });
      }
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
  updateBaseTower(S, dt);
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
  /* ★ 예전에는 "지금 목표" 하나만 봤습니다.
     그래서 플레이어가 순서를 다르게 진행하면 안내가 통째로 멈췄습니다 —
     예를 들어 함정 없이 11일을 막아내면 "가시함정 2개" 목표에서 영원히 멈추고,
     그 뒤 22개 목표를 하나도 못 봅니다.
     자동 플레이 7회차에서 성 3단계·무기 6단계까지 간 판이 목표는 2/23 이었습니다.
     → 뒤쪽에 이미 달성된 목표가 있으면 거기까지 건너뜁니다. */
  const before = S.objIdx;
  let last = S.objIdx - 1;
  for (let i = S.objIdx; i < OBJECTIVES.length; i++)
    if (OBJECTIVES[i].ok(S)) last = i;
  if (last < S.objIdx) return;

  const skipped = last - S.objIdx;          // 건너뛴 목표 수
  S.objIdx = last + 1;
  const gained = S.objIdx - before;
  S.shard += C.OBJECTIVE_SHARD * gained;
  toast(S, skipped > 0
    ? `목표 <b>${gained}개</b> 달성 — 옥새 조각 <b>+${C.OBJECTIVE_SHARD * gained}</b>`
    : `목표 달성 — 옥새 조각 <b>+${C.OBJECTIVE_SHARD}</b>`);
  sound(S, 'objective');
  emit(S, 'objective', { index: S.objIdx, gained });
}
export const currentObjective = S => OBJECTIVES[S.objIdx] || null;

/* ==================================================================
   "지금 뭘 해야 하지" — 할 일을 계산해 돌려줍니다
   ------------------------------------------------------------------
   목표 한 줄만으로는 부족합니다. 플레이어가 실제로 묻는 것은
   "지금 당장 뭘 눌러야 하나" 이고, 그 답은 상황마다 다릅니다.
   여기서 우선순위대로 뽑아 화면에 버튼으로 띄웁니다.

   각 항목: { id, icon, text, act, cost, ready, why }
     act — 'build:wall' / 'craft:pickaxe' / 'upgrade' / 'hire' / 'gather:stone' / 'screen:craft'
   ================================================================== */
export function todoList(S, max = 3) {
  if (!S || S.over) return [];
  const out = [];
  const add = (id, icon, text, act, cost, note) => {
    if (out.length >= max || out.some(o => o.id === id)) return;
    const aff = cost ? canAffordWithEssence(S, cost) : { ok: true, essence: 0 };
    out.push({ id, icon, text, act, cost: cost || null,
               ready: aff.ok, essence: aff.essence || 0, note: note || '' });
  };

  const night = isNight(S);
  const nw = nextWave(S);
  const dday = nw ? nw.day - S.day : 99;

  /* ① 밤이면 싸우는 게 먼저입니다 */
  if (night && S.monsters.length) {
    add('fight', '⚔️', `적 ${S.monsters.length}마리를 막으세요`, 'none', null,
        '거점에 닿기 전에 잡으세요');
  }

  /* ② 막혀 있는 진입 장벽부터 */
  if (!S.forge) add('forge', '🔨', '대장간을 지으세요', 'build:forge',
                    C.BUILDS.find(b => b.id === 'forge').cost, '장비 제작이 열립니다');
  else if (!S.pickaxe) add('pickaxe', '⛏️', '돌 곡괭이를 만드세요', 'craft:pickaxe',
                    craftCost(S, 'pickaxe'), '철을 캘 수 있게 됩니다');

  /* ③ 대란이 가까우면 방어 준비 */
  if (nw && dday <= 4) {
    const tp = trapsOnPath(S);
    if (tp.on < 4) add('trap', '🔻', `함정을 침공로 위에 까세요 (지금 ${tp.on}개)`, 'build:trap',
                       C.BUILDS.find(b => b.id === 'trap').cost, `${dday}일 뒤 ${nw.name}`);
    if (S.cnt.wall < 12) add('wall', '🧱', '목책으로 길을 좁히세요', 'build:wall',
                       C.BUILDS.find(b => b.id === 'wall').cost, '적을 한 길로 몰아갑니다');
  }

  /* ④ 병력 */
  if (S.camps === 0) add('camp', '⛺', '병영을 지으세요', 'build:camp',
                    C.BUILDS.find(b => b.id === 'camp').cost, '병사를 둘 자리가 생깁니다');
  else if (S.soldiers.filter(x => !x.merc).length < S.camps)
    add('hire', '🗡️', `병사를 고용하세요 (${S.soldiers.filter(x => !x.merc).length}/${S.camps})`,
        'hire', C.SOLDIER_COST, '채집을 맡길 수 있습니다');

  /* ⑤ 성 · 장비 */
  const nx = nextBaseLevel(S);
  if (nx && S.day >= 18) add('upgrade', '🏯', `성을 ${nx.name}(으)로 올리세요`, 'upgrade',
                    nx.cost, `거점 체력 ${S.base.maxHp} → ${nx.maxHp}`);
  for (const id of ['weapon', 'leather', 'ironmail', 'steelspike', 'towerup', 'banner', 'ironpick']) {
    const c = C.CRAFTS.find(x => x.id === id);
    if (!c || hasCraft(S, id) || !S.forge) continue;
    if (c.need && !hasCraft(S, c.need)) continue;
    add('craft_' + id, c.icon, `${c.name}을(를) 만드세요`, 'craft:' + id, craftCost(S, id), c.effect);
  }

  /* ⑥ 그래도 빈자리가 있으면 — 가장 모자란 자원을 캐러 */
  if (out.length < max) {
    const want = {};
    for (const o of out) for (const k in (o.cost || {})) want[k] = (want[k] || 0) + o.cost[k];
    let lack = null, worst = 0;
    for (const k in want) {
      const d = want[k] - S.res[k];
      if (d > worst) { worst = d; lack = k; }
    }
    if (!lack) { lack = ['stone', 'wood', 'herb'].sort((a, b) => S.res[a] - S.res[b])[0]; worst = 0; }
    const R = C.RESOURCES[lack];
    add('gather_' + lack, R.icon, `${R.name}을(를) 캐세요`, 'gather:' + lack, null,
        worst > 0 ? `${Math.ceil(worst)} 더 필요합니다` : R.from);
  }

  /* ⑦ 치유약은 항상 아래에 */
  if (out.length < max && S.forge && S.potions < 3)
    add('potion', '🧪', '치유약을 만들어 두세요', 'craft:potion', craftCost(S, 'potion'),
        `현재 ${S.potions}개 · H 키로 마십니다`);

  return out;
}

/** 이 자원을 캘 수 있는 가장 가까운 자원지 */
export function nearestNodeOf(S, type) {
  let best = null, bd = Infinity;
  for (const n of S.nodes) {
    if (n.type !== type || n.amt <= 0) continue;
    if (type === 'iron' && !S.pickaxe) continue;
    const d = dist2(S.hero.x, S.hero.y, n.x, n.y);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/* ---------------- 장수 ---------------- */
function updateHero(S, dt) {
  const h = S.hero;
  if (h.dead) {
    h.respawn -= dt;
    if (h.respawn <= 0) {
      h.dead = false; h.hp = h.maxHp;
      h.x = S.base.x; h.y = S.base.y + C.TILE * 2;
      h.invuln = Math.max(h.invuln, C.RESPAWN_INVULN);   // 부활 직후 잠깐 무적
      h.cd = 0;
      toast(S, `<b>${S.heroDef.name}</b> 부활 — ${C.RESPAWN_INVULN}초간 무적`);
      emit(S, 'respawn');
    }
    return;
  }

  // 타이머들
  h.cd -= dt;
  if (h.swing > 0) h.swing -= dt;
  if (h.invuln > 0) h.invuln -= dt;
  for (let i = 0; i < h.skillCd.length; i++) if (h.skillCd[i] > 0) h.skillCd[i] -= dt;
  if (h.guard > 0 && (h.guard -= dt) <= 0) { h.guard = 0; h.guardReduce = 0; }
  if (h.frenzy > 0 && (h.frenzy -= dt) <= 0) { h.frenzy = 0; h.frenzyAtk = 1; h.frenzyMove = 1; }

  const spd = C.HERO_SPD * (S.lastStand ? 1.2 : 1) * h.frenzyMove;

  // ── 회피 중에는 구르는 방향으로만 움직입니다 (입력 무시) ──


  const iv = S.input;
  h.moving = !!(iv.x || iv.y);
  if (h.moving) {
    h.x = clamp(h.x + iv.x * spd * dt, 8, C.WORLD_W - 8);
    h.y = clamp(h.y + iv.y * spd * dt, 8, C.WORLD_H - 8);
    h.facing = Math.atan2(iv.x, iv.y);
  }

  // ── 연사(스킬) — 남은 화살을 간격을 두고 쏩니다 ──
  if (h.volley > 0) {
    h.volleyT -= dt;
    if (h.volleyT <= 0) {
      h.volleyT = 0.12;
      const sk = S.heroDef.skills[0];
      let t = null, td = heroRange(S) * 1.3;
      td *= td;
      for (const m of S.monsters) {
        const d = dist2(h.x, h.y, m.x, m.y);
        if (d < td) { td = d; t = m; }
      }
      if (t) {
        h.facing = Math.atan2(t.x - h.x, t.y - h.y);
        emit(S, 'shot', { from: { x: h.x, y: h.y }, to: { x: t.x, y: t.y } });
        damageMonster(S, t, heroDamage(S) * (sk.dmg || 1), 'hero', null);
        sound(S, 'swing');
      }
      h.volley--;
    }
  }

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
      h.swing = 0.24; h.swingKind = 'attack';
      knockback(best, h.x, h.y, C.KNOCKBACK);
      const crit = Math.random() < (C.CRIT_CHANCE + (S.heroDef.critBonus || 0));
      const dmg = heroDamage(S) * (crit ? C.CRIT_MUL : 1);
      damageMonster(S, best, dmg, 'hero', null, false, crit);
      if (S.heroDef.lifesteal) {
        const heal = dmg * S.heroDef.lifesteal * (h.guard > 0 ? 2 : 1);
        h.hp = Math.min(h.maxHp, h.hp + heal);
        fx(S, h.x, h.y - 26, `+${Math.round(heal)}`, '#5FAE72');
      }
      sound(S, 'swing');
      if (S.heroDef.weapon === 'bow') emit(S, 'shot', { from: { x: h.x, y: h.y }, to: { x: best.x, y: best.y } });
      emit(S, 'heroSwing', { x: h.x, y: h.y, target: { x: best.x, y: best.y }, weapon: S.heroDef.weapon });
    }
    h.gatherTarget = null;
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
    h.gp += C.GATHER_RATE[node.type] * (S.gear.ironpick ? 1.6 : 1) * dt;
    while (h.gp >= 1 && node.amt > 0) {
      h.gp -= 1; node.amt--; S.res[node.type]++; S.got[node.type]++;
      // 정수 — 무엇을 캐든 낮은 확률로 함께 나옵니다
      if (Math.random() < (C.ESSENCE_CHANCE[node.type] || 0)) {
        S.res.essence++; S.got.essence++;
        fx(S, node.x, node.y - 22, '⭐ 정수 +1', '#E0B44A');
        emit(S, 'essence', { x: node.x, y: node.y });
        sound(S, 'coin');
      }
      if (node.amt <= 0) { node.regrow = S.t + C.NODE_REGROW_SEC; emit(S, 'nodeDepleted', { node }); }
    }
    if (Math.random() < dt * 3) fx(S, node.x, node.y - 10, '+', '#C7D9A8');
    h.gatherTarget = node;
  } else { h.gp = 0; h.gatherTarget = null; }
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

    // 채집 용병은 싸우지 않고 밤에도 계속 캡니다 (그게 이 용병을 뽑는 이유입니다)
    if (!s.noFight && (s.role === 'def' || night)) {
      const rng = s.range || C.SOLDIER_RANGE;
      let tgt = null, bd = 150 * 150;
      for (const m of S.monsters) {
        if (dist2(m.x, m.y, S.base.x, S.base.y) > 150 * 150) continue;
        const d = dist2(s.x, s.y, m.x, m.y);
        if (d < bd) { bd = d; tgt = m; }
      }
      if (tgt) {
        // 궁수는 사거리 안에 들어오면 더 다가가지 않습니다
        moveToward(s, tgt.x, tgt.y, 95, dt, Math.max(30, rng - 12));
        if (dist2(s.x, s.y, tgt.x, tgt.y) < rng * rng && s.cd <= 0) {
          s.cd = s.cdMax || C.SOLDIER_CD;
          if (rng > 70) emit(S, 'shot', { from: { x: s.x, y: s.y }, to: { x: tgt.x, y: tgt.y } });
          damageMonster(S, tgt, (s.atk || C.SOLDIER_ATK) * (S.lastStand ? 1.5 : 1), 'soldier', null);
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

    if (s.carry >= (s.carryMax || C.SOLDIER_CARRY)) {
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
        s.gp += (s.gather || C.SOLDIER_GATHER_RATE) * dt;
        while (s.gp >= 1 && s.node.amt > 0) {
          s.gp -= 1; s.node.amt--; s.carry++;
          if (Math.random() < (C.ESSENCE_CHANCE[s.node.type] || 0) * 0.6) {
            S.res.essence++; S.got.essence++;
            fx(S, s.node.x, s.node.y - 22, '⭐ +1', '#E0B44A');
          }
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

    // 히트스톱 — 맞는 순간 아주 짧게 얼어붙습니다 ("때린 맛")
    if (m.hitStop > 0) { m.hitStop -= dt; continue; }

    // 넉백 — 밀려나는 힘이 남아 있으면 먼저 반영합니다
    if (m.vx || m.vy) {
      m.x = clamp(m.x + m.vx * dt, 6, C.WORLD_W - 6);
      m.y = clamp(m.y + m.vy * dt, 6, C.WORLD_H - 6);
      const decay = Math.exp(-dt * 7);
      m.vx *= decay; m.vy *= decay;
      if (Math.abs(m.vx) < 3) m.vx = 0;
      if (Math.abs(m.vy) < 3) m.vy = 0;
    }

    // ── 예비 동작 중 — 팔을 치켜든 상태. 이 사이에 구르면 빗나갑니다 ──
    if (m.windup > 0) {
      m.windup -= dt;
      if (m.windup <= 0) resolveMonsterAttack(S, m);
      continue;
    }

    const tx = clamp(Math.floor(m.x / C.TILE), 0, C.MAPW - 1);
    const ty = clamp(Math.floor(m.y / C.TILE), 0, C.MAPH - 1);
    const k = tkey(tx, ty);
    let slowMul = 1;

    const ti = S.trapAt[k];
    if (ti > 0) {
      const tr = S.traps[ti - 1];
      if (tr && tr.dur > 0) {
        slowMul = C.TRAP_SLOW;
        const steel = S.gear.steelspike ? C.TRAP_DPS_STEEL : 1;
        // 고정 피해 + 최대 체력 비례 — 후반의 단단한 적에게도 통하게
        const dps = C.TRAP_DPS + m.maxHp * C.TRAP_PCT_DPS;
        damageMonster(S, m, dps * steel * dt, 'trap', tr);
        tr.dur -= C.TRAP_WEAR / (S.gear.steelspike ? C.TRAP_DUR_STEEL : 1) * dt;
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
        // 곧바로 때리지 않고 예비 동작을 시작합니다
        m.windup = m.boss ? C.MONSTER_WINDUP_BOSS : C.MONSTER_WINDUP;
        m.windupTgt = tgt;
        emit(S, 'windup', { x: m.x, y: m.y, boss: m.boss, dur: m.windup });
        sound(S, 'windup');
      }
      continue;
    }

    // 거점 공격 — 가장자리 기준
    const baseEdge = Math.hypot(m.x - S.base.x, m.y - S.base.y) - C.BASE_FOOTPRINT;
    if (baseEdge <= 24) {
      m.facing = Math.atan2(S.base.x - m.x, S.base.y - m.y);
      if (m.cd <= 0) {
        m.windup = m.boss ? C.MONSTER_WINDUP_BOSS : C.MONSTER_WINDUP;
        m.windupTgt = 'base';
        emit(S, 'windup', { x: m.x, y: m.y, boss: m.boss, dur: m.windup });
      }
      continue;
    }

    // 관우의 위압 — 가까이 있는 적이 느려집니다
    if (S.heroDef.slowAura && !S.hero.dead &&
        dist2(m.x, m.y, S.hero.x, S.hero.y) < 220 * 220) {
      slowMul *= (1 - S.heroDef.slowAura);
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

/** 예비 동작이 끝났습니다. 아직 닿는 곳에 있어야 맞습니다. */
function resolveMonsterAttack(S, m) {
  m.cd = 1.1;
  const tgt = m.windupTgt;
  m.windupTgt = null;
  if (!tgt) return;

  emit(S, 'monsterSwing', { x: m.x, y: m.y });

  if (tgt === 'base') {
    const edge = Math.hypot(m.x - S.base.x, m.y - S.base.y) - C.BASE_FOOTPRINT;
    if (edge > 40) return;                     // 밀려나서 못 닿았습니다
    S.base.hp -= m.dmg;
    if (S.waveStats) S.waveStats.baseDmg += m.dmg;
    fx(S, S.base.x + rnd(-18, 18), S.base.y - 18, `-${m.dmg}`, '#E0554A');
    emit(S, 'baseHit', { dmg: m.dmg });
    return;
  }

  // 사거리를 벗어났으면 헛스윙 — 회피로 피한 경우입니다
  if (dist2(m.x, m.y, tgt.x, tgt.y) > 52 * 52) {
    fx(S, m.x, m.y - 14, '빗나감', '#9E9384');
    emit(S, 'monsterMiss', { x: m.x, y: m.y });
    return;
  }

  if (tgt === S.hero) { damageHero(S, m.dmg, m); return; }

  // 병사·용병 (방패 용병은 받는 피해가 줄어듭니다)
  if (tgt.down) return;
  tgt.hp -= m.dmg * (1 - (tgt.armor || 0));
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

export function damageMonster(S, m, amt, src, trap, heavy, crit) {
  if (m.dead) return;
  if (m.armor) amt *= 1 - m.armor;      // 방패병·정예는 피해를 덜 받습니다
  m.hp -= amt;
  m.hitFlash = 0.12;

  // 맞은 자리에 피해 숫자 — 타격감의 절반은 이 숫자에서 나옵니다
  if (src !== 'trap' || Math.random() < 0.25) {
    emit(S, 'hitNumber', {
      x: m.x, y: m.y, amount: Math.max(1, Math.round(amt)),
      crit: !!crit, src
    });
  }
  if (src === 'hero') emit(S, 'hitSpark', { x: m.x, y: m.y, crit: !!crit });

  // 장수가 때렸을 때만 잠깐 얼립니다 (함정 지속 피해까지 얼면 어색합니다)
  if (src === 'hero') m.hitStop = C.HITSTOP;

  /* ★ 평타로는 적의 공격이 끊기지 않습니다.
     끊기게 하면 가만히 서서 때리기만 해도 안 맞아서 회피가 필요 없어집니다.
     스킬(무거운 일격)로만 끊을 수 있고, 보스는 아예 안 끊깁니다(슈퍼아머). */
  if (heavy && !m.boss) { m.windup = 0; m.windupTgt = null; }
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
  // 가죽 — 밤에 싸운 결과가 낮의 장비로 이어집니다
  const hide = C.HIDE_PER_KILL * (S.gear.huntknife ? 2 : 1) * (m.boss ? 6 : 1);
  S.res.hide += hide; S.got.hide += hide;
  fx(S, m.x, m.y - 24, `가죽 +${hide}`, '#c99a6b');

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
