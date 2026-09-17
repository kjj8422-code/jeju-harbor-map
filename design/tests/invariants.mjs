/* 불변식 감시 — "절대 깨지면 안 되는 규칙" 을 판이 도는 내내 지켜봅니다
   ==================================================================
   왜 이 방식이 필요한가:
     팀장님이 찾으신 버그들(용병 무한 고용, 다시 시작해도 남는 병영, 멈춘 게임)은
     전부 제가 **질문을 안 했기 때문에** 남아 있었습니다.
     시나리오 검수는 제가 생각해낸 상황만 봅니다. 생각 못 한 건 영원히 안 보입니다.

     그래서 반대로 접근합니다 — 상황을 상상하는 대신,
     **"이건 어떤 경우에도 참이어야 한다"** 를 잔뜩 적어두고
     자동 플레이가 99일을 도는 동안 매 순간 확인합니다.
     제가 상상 못 한 경로로 들어가도 규칙이 깨지면 그 자리에서 잡힙니다.

   실행: node design/tests/invariants.mjs [판수]
*/
import * as C from '../../js/config.js';
import * as Sim from '../../js/sim.js';

const RUNS = Number(process.argv[2] || 1);
const viol = new Map();     // 규칙 → 처음 깨진 상황

function violate(rule, detail) {
  if (!viol.has(rule)) viol.set(rule, detail);
}

/* ── 규칙 목록 ─────────────────────────────────────────
   하나하나가 "이건 말이 안 된다" 는 문장입니다. */
function check(S, where) {
  const at = s => `${where} · ${s}`;

  // 자원
  for (const k of Object.keys(C.RESOURCES)) {
    if (!(S.res[k] >= 0)) violate('자원이 음수가 되지 않는다', at(`${k}=${S.res[k]}`));
    if (!Number.isFinite(S.res[k])) violate('자원이 숫자로 남는다', at(`${k}=${S.res[k]}`));
    if (S.got[k] < 0) violate('누적 채집량이 줄지 않는다', at(`${k}=${S.got[k]}`));
  }
  if (S.shard < 0) violate('옥새 조각이 음수가 되지 않는다', at(`${S.shard}`));
  if (S.potions < 0) violate('치유약이 음수가 되지 않는다', at(`${S.potions}`));

  // 장수
  const h = S.hero;
  if (h.hp > h.maxHp + 0.001) violate('장수 체력이 최대치를 넘지 않는다', at(`${h.hp}/${h.maxHp}`));
  if (!h.dead && h.hp <= 0) violate('체력이 0 이하면 쓰러진 상태다', at(`hp=${h.hp} dead=${h.dead}`));
  if (h.dead && h.respawn < 0) violate('부활 시간이 음수로 흐르지 않는다', at(`${h.respawn}`));
  if (h.x < 0 || h.y < 0 || h.x > C.WORLD_W || h.y > C.WORLD_H)
    violate('장수가 지도 밖으로 나가지 않는다', at(`(${h.x|0},${h.y|0})`));

  // 거점
  if (S.base.hp > S.base.maxHp + 0.001) violate('거점 체력이 최대치를 넘지 않는다', at(`${S.base.hp}/${S.base.maxHp}`));
  if (S.baseLv < 1 || S.baseLv > C.BASE_LEVELS.length) violate('성 단계가 범위를 벗어나지 않는다', at(`${S.baseLv}`));
  if (!S.over && S.base.hp <= 0) violate('거점이 부서졌으면 게임이 끝나 있다', at(`hp=${S.base.hp}`));

  // 병사 · 용병  ← 팀장님이 찾으신 구멍이 이 줄들입니다
  const regs = S.soldiers.filter(x => !x.merc);
  const mercs = S.soldiers.filter(x => x.merc);
  if (regs.length > S.camps) violate('병사 수가 병영 수를 넘지 않는다', at(`병사 ${regs.length} > 병영 ${S.camps}`));
  if (mercs.length > Sim.mercCap(S)) violate('용병 수가 정원을 넘지 않는다', at(`용병 ${mercs.length} > 정원 ${Sim.mercCap(S)}`));
  for (const s of S.soldiers) {
    if (s.hp > s.maxHp + 0.001) violate('병사 체력이 최대치를 넘지 않는다', at(`${s.name} ${s.hp}/${s.maxHp}`));
    if (s.merc && s.contract < 0) violate('계약이 끝난 용병은 남아 있지 않는다', at(`${s.name} ${s.contract}일`));
    if (s.carry < 0) violate('병사가 음수를 나르지 않는다', at(`${s.name} ${s.carry}`));
    if (s.carryMax && s.carry > s.carryMax + 0.001)
      violate('병사가 최대 적재량보다 많이 나르지 않는다', at(`${s.name} ${s.carry}/${s.carryMax}`));
  }

  // 몬스터
  for (const m of S.monsters) {
    if (m.dead) violate('죽은 몬스터가 목록에 남지 않는다', at(`${m.kind}`));
    if (m.hp > m.maxHp + 0.001) violate('몬스터 체력이 최대치를 넘지 않는다', at(`${m.kind} ${m.hp}/${m.maxHp}`));
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y))
      violate('몬스터 좌표가 숫자로 남는다', at(`${m.kind} (${m.x},${m.y})`));
    if (m.x < -50 || m.y < -50 || m.x > C.WORLD_W + 50 || m.y > C.WORLD_H + 50)
      violate('몬스터가 지도에서 크게 벗어나지 않는다', at(`${m.kind} (${m.x|0},${m.y|0})`));
    if (m.kind !== 'boss' && !C.MONSTER_KINDS[m.kind])
      violate('몬스터 종류가 정의된 것만 나온다', at(`${m.kind}`));
  }

  // 격자와 실제 물건이 어긋나지 않는가
  let wallN = 0, trapN = 0, structN = 0, nodeN = 0;
  for (let i = 0; i < S.occ.length; i++) {
    if (S.occ[i] === C.OCC_WALL) wallN++;
    else if (S.occ[i] === C.OCC_TRAP) trapN++;
    else if (S.occ[i] === C.OCC_STRUCT) structN++;
    else if (S.occ[i] === C.OCC_NODE) nodeN++;
  }
  const liveTraps = S.traps.filter(t => t.dur > 0).length;
  if (trapN !== liveTraps)
    violate('격자의 함정 수와 살아있는 함정 수가 일치한다', at(`격자 ${trapN} ≠ 목록 ${liveTraps}`));
  if (structN !== S.structs.length)
    violate('격자의 시설 수와 시설 목록이 일치한다', at(`격자 ${structN} ≠ 목록 ${S.structs.length}`));
  if (nodeN !== S.nodes.length)
    violate('격자의 자원지 수와 자원지 목록이 일치한다', at(`격자 ${nodeN} ≠ 목록 ${S.nodes.length}`));
  if (S.cnt.wall !== wallN) violate('목책 개수 집계가 실제와 맞는다', at(`집계 ${S.cnt.wall} ≠ 실제 ${wallN}`));
  if (S.cnt.trap !== trapN) violate('함정 개수 집계가 실제와 맞는다', at(`집계 ${S.cnt.trap} ≠ 실제 ${trapN}`));
  if (S.cnt.camp !== S.structs.filter(x => x.type === 'camp').length)
    violate('병영 개수 집계가 실제와 맞는다', at(`집계 ${S.cnt.camp}`));
  if (S.camps !== S.structs.filter(x => x.type === 'camp').length)
    violate('병영 정원이 실제 병영 수와 맞는다', at(`camps ${S.camps} ≠ ${S.structs.filter(x=>x.type==='camp').length}`));
  if (S.forge !== S.structs.some(x => x.type === 'forge'))
    violate('대장간 보유 여부가 실제와 맞는다', at(`forge=${S.forge}`));

  // 자원지
  for (const n of S.nodes) {
    if (n.amt < 0) violate('자원지 잔량이 음수가 되지 않는다', at(`${n.type} ${n.amt}`));
    if (n.amt > n.max + 0.001) violate('자원지가 최대 매장량을 넘지 않는다', at(`${n.type} ${n.amt}/${n.max}`));
  }
  // 함정
  for (const t of S.traps) {
    if (t.dur <= 0 && S.occ[t.ty * C.MAPW + t.tx] === C.OCC_TRAP)
      violate('닳아 없어진 함정이 격자에 남지 않는다', at(`(${t.tx},${t.ty}) ${t.dur}`));
    if (t.dur > 0 && S.trapAt[t.ty * C.MAPW + t.tx] === 0)
      violate('함정 위치 색인이 실제 함정을 가리킨다', at(`(${t.tx},${t.ty})`));
  }

  // 제작 · 성장
  if (S.weaponLv > C.WEAPON_COST.length) violate('무기 강화가 최대 단계를 넘지 않는다', at(`★${S.weaponLv}`));
  if (S.weaponLv < 0) violate('무기 강화 단계가 음수가 되지 않는다', at(`${S.weaponLv}`));
  if (S.gear.ironmail && !S.gear.leather) violate('중갑은 갑옷 없이 생기지 않는다', at(''));
  if (S.gear.steelspike && S.baseLv < 2) violate('강철 가시는 석성 없이 생기지 않는다', at(`성 ${S.baseLv}`));
  if (S.gear.banner && S.baseLv < 3) violate('군기는 철옹성 없이 생기지 않는다', at(`성 ${S.baseLv}`));
  if (S.pickaxe === false && S.got.iron > 0) violate('곡괭이 없이 철이 모이지 않는다', at(`철 ${S.got.iron}`));

  // 날짜 · 웨이브
  if (S.day < 1 || S.day > C.TOTAL_DAYS + 1) violate('날짜가 범위를 벗어나지 않는다', at(`${S.day}일`));
  if (S.waveIdx < 0 || S.waveIdx > C.WAVES.length) violate('웨이브 번호가 범위를 벗어나지 않는다', at(`${S.waveIdx}`));
  if (S.phase === 'day' && S.monsters.length && !S.over)
    violate('낮에는 몬스터가 남아 있지 않는다', at(`${S.monsters.length}마리`));
  if (S.surges && S.surges.length && S.phase !== 'night')
    violate('밤이 아닐 때 진격이 예약돼 있지 않다', at(`${S.phase} · ${S.surges.length}차례`));
  if (S.phase === 'night' && S.waveTotal <= 0)
    violate('밤에는 이번 웨이브 총원이 정해져 있다', at(`${S.waveTotal}`));
}

/* ── 자동 플레이 (사람처럼 캐고 짓고 싸웁니다) ────────── */
function playOne(heroId, diffId, seedNote) {
  const S = Sim.createSim(heroId, 0, diffId);
  const DT = 1 / 30;
  const where = `${heroId}/${diffId}`;
  let steps = 0;

  check(S, `${where} 시작`);

  while (!S.over && steps < 200000) {
    steps++;
    if (S.phase === 'report') { Sim.closeReport(S); check(S, `${where} ${S.day}일 리포트직후`); continue; }

    // 아무거나 눌러보는 손 — 사람이 하는 짓을 흉내 냅니다
    const r = Math.random();
    if (r < 0.02) Sim.hireSoldier(S);
    else if (r < 0.035) Sim.hireMerc(S, ['gatherer','archer','shield'][(Math.random()*3)|0]);
    else if (r < 0.05) Sim.upgradeBase(S);
    else if (r < 0.08) Sim.doCraft(S, ['pickaxe','weapon','leather','ironmail','steelspike','banner','potion','huntknife'][(Math.random()*8)|0]);
    else if (r < 0.12) {
      const tx = (Math.random() * C.MAPW) | 0, ty = (Math.random() * C.MAPH) | 0;
      Sim.tryBuild(S, tx, ty, ['wall','trap','camp','forge'][(Math.random()*4)|0]);
    } else if (r < 0.13) {
      const st = S.structs[(Math.random() * S.structs.length) | 0];
      if (st) Sim.demolish(S, st.tx, st.ty);
    } else if (r < 0.14 && S.soldiers.length) {
      const s = S.soldiers[(Math.random() * S.soldiers.length) | 0];
      if (s) Sim.cycleRole(S, s);
    } else if (r < 0.15) Sim.usePotion(S);
    else if (r < 0.18) Sim.useSkill(S, (Math.random() * 3) | 0);

    // 가까운 자원지나 적 쪽으로 걸어갑니다
    let tgt = null, bd = Infinity;
    const pool = S.phase === 'night' ? S.monsters : S.nodes;
    for (const o of pool) {
      const d = (o.x - S.hero.x) ** 2 + (o.y - S.hero.y) ** 2;
      if (d < bd) { bd = d; tgt = o; }
    }
    if (tgt) {
      const dx = tgt.x - S.hero.x, dy = tgt.y - S.hero.y, L = Math.hypot(dx, dy) || 1;
      S.input.x = dx / L; S.input.y = dy / L;
    } else { S.input.x = 0; S.input.y = 0; }

    Sim.update(S, DT);
    Sim.drainEvents(S);
    if (steps % 7 === 0) check(S, `${where} ${S.day}일 ${S.phase}`);
  }
  check(S, `${where} 끝(${S.day}일)`);
  return { day: S.day, win: S.win, steps };
}

console.log(`\n=== 불변식 감시 — ${RUNS}판 × 장수 ${C.GENERALS.length}명 × 난이도 3 ===\n`);
let n = 0;
for (let r = 0; r < RUNS; r++)
  for (const g of C.GENERALS)
    for (const d of ['easy', 'normal', 'hard']) {
      const res = playOne(g.id, d);
      n++;
      process.stdout.write(`\r  ${n}판 검사… (${g.name}/${d} → ${res.day}일 ${res.win ? '완주' : '함락'})          `);
    }
console.log(`\n\n${n}판 동안 규칙을 지켜봤습니다.`);

if (!viol.size) {
  console.log('\n✅ 깨진 규칙 없음');
  process.exit(0);
}
console.log(`\n❌ 깨진 규칙 ${viol.size}건\n`);
for (const [rule, detail] of viol) console.log(`  · ${rule}\n      처음 깨진 곳: ${detail}`);
process.exit(1);
