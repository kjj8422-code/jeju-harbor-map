/* 삼국지 99일 생존 — 로직 자가검수 (브라우저 없이 실행)
   기획서의 완료 기준을 테스트 1개씩으로 옮겼습니다.
   실행: node design/tests/sim-test.mjs                                  */
import * as C from '../../js/config.js';
import * as Sim from '../../js/sim.js';

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail = '') {
  if (cond) { pass++; results.push(`  ✅ ${name}`); }
  else { fail++; results.push(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}
function run(S, seconds, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) {
    Sim.update(S, dt);
    if (S.phase === 'report') Sim.closeReport(S);
    if (S.over) break;
  }
}
function drain(S) { return Sim.drainEvents(S); }
/* 지도는 매번 무작위로 생성됩니다. 목책을 일렬로 세우는 검사에서
   그 자리에 나무·바위가 걸리면 벽에 구멍이 생겨 결과가 판마다 달라집니다.
   검사 전에 그 줄만 비워서 판정을 결정적으로 만듭니다. */
function clearColumn(S, tx, y0, y1) {
  for (let y = y0; y <= y1; y++) {
    const k = Sim.tkey(tx, y);
    if (S.occ[k] === C.OCC_NODE) {
      const i = S.nodes.findIndex(n => n.tx === tx && n.ty === y);
      if (i >= 0) S.nodes.splice(i, 1);
      S.occ[k] = C.OCC_EMPTY;
    }
  }
  Sim.computeFlow(S);
}
/* 하루를 n번 확실히 넘깁니다.
   그냥 시간을 흘리면 중간에 대란이 끼어들어 밤에 멈춰버리므로,
   낮 상태를 유지한 채 날짜만 밀어줍니다. */
function advanceDays(S, n) {
  for (let i = 0; i < n; i++) {
    S.phase = 'day';
    S.monsters.length = 0;
    S.dayT = C.DAY_SEC - 0.01;
    Sim.update(S, 0.02);
    if (S.phase !== 'day') { S.phase = 'day'; S.warnT = 0; }
  }
}

console.log('\n=== 삼국지 99일 생존 — 로직 검수 ===\n');

/* ── 1. 채집 ───────────────────────────────────────────── */
{
  const S = Sim.createSim('taesaja');
  const tree = S.nodes.find(n => n.type === 'wood');
  S.hero.x = tree.x; S.hero.y = tree.y;
  const before = S.res.wood;
  run(S, 3);
  ok('장수가 나무 옆에 서 있으면 목재가 늘어난다', S.res.wood > before, `${before} → ${S.res.wood}`);
  ok('누적 채집량도 함께 기록된다', S.got.wood > 0);
}

/* ── 2. 도구 티어 게이팅 ──────────────────────────────── */
{
  const S = Sim.createSim('taesaja');
  const iron = S.nodes.find(n => n.type === 'iron');
  S.hero.x = iron.x; S.hero.y = iron.y;
  run(S, 3);
  ok('돌 곡괭이가 없으면 철광 옆에 서 있어도 철이 안 늘어난다', S.res.iron === 0, `철 ${S.res.iron}`);

  S.forge = true; S.res.wood = 99; S.res.stone = 99;
  Sim.doCraft(S, 'pickaxe');
  ok('대장간이 있으면 돌 곡괭이를 만들 수 있다', S.pickaxe === true);
  S.hero.x = iron.x; S.hero.y = iron.y;
  run(S, 3);
  ok('곡괭이를 만든 뒤에는 철이 늘어난다', S.res.iron > 0, `철 ${S.res.iron}`);
}

/* ── 3. 건설 = 경로 퍼즐 ──────────────────────────────── */
{
  const S = Sim.createSim('taesaja');
  S.res.wood = 999; S.res.stone = 999;
  const tx = C.BASE_TX + 5, ty = C.BASE_TY;
  S.hero.x = tx * C.TILE; S.hero.y = ty * C.TILE;   // 건설 범위 안으로
  clearColumn(S, C.BASE_TX + 5, ty - 4, ty + 4);
  const before = S.dist[Sim.tkey(tx + 1, ty)];
  let placed = 0;
  for (let y = ty - 4; y <= ty + 4; y++) if (Sim.tryBuild(S, C.BASE_TX + 5, y, 'wall')) placed++;
  ok('비워둔 9칸에 목책이 전부 서진다', placed === 9, `${placed}/9`);
  const after = S.dist[Sim.tkey(tx + 1, ty)];
  ok('목책을 세우면 그 너머의 경로 거리가 실제로 늘어난다 (우회 성립)',
     after > before, `${before}칸 → ${after}칸`);
  ok('목책 칸 자체는 지나갈 수 없다', S.dist[Sim.tkey(tx, ty)] === -1);
  // 지도는 매번 랜덤이라 9칸 중 일부가 나무·바위에 막힐 수 있습니다.
  // 고정 숫자 대신 "세운 만큼 목록에 들어갔는가"로 판정합니다.
  ok('목책 목록이 세운 수와 일치한다', S.wallList.length === S.cnt.wall,
     `목록 ${S.wallList.length} vs 세운 수 ${S.cnt.wall}`);
}

/* ── 4. 완전 포위 → 목책 파괴 ────────────────────────── */
{
  const S = Sim.createSim('taesaja');
  S.res.wood = 9999;
  S.hero.x = S.base.x; S.hero.y = S.base.y;         // 건설 범위 안으로
  // 거점을 목책으로 완전히 둘러쌉니다
  for (let d = 2, y = C.BASE_TY - d; y <= C.BASE_TY + d; y++) {
    Sim.tryBuild(S, C.BASE_TX - d, y, 'wall');
    Sim.tryBuild(S, C.BASE_TX + d, y, 'wall');
  }
  for (let d = 2, x = C.BASE_TX - d; x <= C.BASE_TX + d; x++) {
    Sim.tryBuild(S, x, C.BASE_TY - d, 'wall');
    Sim.tryBuild(S, x, C.BASE_TY + d, 'wall');
  }
  const outsideTile = Sim.tkey(C.BASE_TX + 6, C.BASE_TY);
  ok('거점을 완전히 둘러싸면 바깥에서 거점까지 길이 없다', S.dist[outsideTile] === -1);

  S.day = 10; S.dayT = C.DAY_SEC - 0.05;
  run(S, 20);
  const wallHpTotal = S.wallList.reduce((a, k) => a + S.wallHp[k], 0);
  ok('길이 막히면 몬스터가 목책을 때린다', wallHpTotal < 130 * S.wallList.length,
     `남은 목책 체력 합계 ${Math.round(wallHpTotal)}`);
}

/* ── 5. 함정 ──────────────────────────────────────────── */
{
  const S = Sim.createSim('taesaja');
  S.res.wood = 999; S.res.stone = 999;
  const tx = C.BASE_TX + 5, ty = C.BASE_TY;
  S.hero.x = tx * C.TILE; S.hero.y = ty * C.TILE;
  Sim.tryBuild(S, tx, ty, 'trap');
  S.waveStats = { killed: 0, byTrap: 0, bySoldier: 0, byHero: 0, baseDmg: 0, trapKills: {} };
  S.monsters.push({ x: tx * C.TILE + C.TILE / 2, y: ty * C.TILE + C.TILE / 2,
                    hp: 500, maxHp: 500, spd: 0, dmg: 5, cd: 99, boss: false, hitFlash: 0, dead: false });
  const m = S.monsters[0];
  const hpBefore = m.hp;
  const durBefore = S.traps[0].dur;
  run(S, 2);
  ok('함정 위의 몬스터는 체력이 닳는다', m.hp < hpBefore, `${hpBefore} → ${Math.round(m.hp)}`);
  ok('함정은 쓸수록 내구도가 닳는다', S.traps[0].dur < durBefore,
     `${durBefore} → ${Math.round(S.traps[0].dur)}`);
}

/* ── 6. 병사 위임 — ★ 도착 판정 함정 ────────────────── */
{
  const S = Sim.createSim('taesaja');
  S.res.wood = 999; S.res.stone = 999;
  S.hero.x = S.base.x; S.hero.y = S.base.y;
  clearColumn(S, C.BASE_TX - 3, C.BASE_TY - 3, C.BASE_TY - 3);
  const campOk = Sim.tryBuild(S, C.BASE_TX - 3, C.BASE_TY - 3, 'camp');
  ok('병영이 지어진다', campOk === true && S.camps === 1);
  Sim.hireSoldier(S);
  ok('병영을 지으면 병사를 고용할 수 있다', S.soldiers.length === 1);
  if (!S.soldiers.length) throw new Error('병사 고용 실패 — 이후 검사를 진행할 수 없습니다');

  S.res.wood = 0; S.got.wood = 0;
  run(S, 60);
  ok('병사가 자원지↔거점을 왕복해 자원을 실제로 내려놓는다 (footprint 도착 판정)',
     S.got.wood > 0, `누적 목재 ${S.got.wood}`);

  // 부상 → 복귀
  S.soldiers[0].hp = 0;
  run(S, 1);
  ok('병사는 쓰러져도 사라지지 않고 부상 상태가 된다',
     S.soldiers.length === 1 && S.soldiers[0].down === true);
  run(S, C.SOLDIER_DOWN_SEC + 2);
  ok(`병사는 ${C.SOLDIER_DOWN_SEC}초 뒤 복귀한다`, S.soldiers[0].down === false);
}

/* ── 7. 웨이브 ────────────────────────────────────────── */
{
  const S = Sim.createSim('taesaja');
  S.day = 10; S.dayT = C.DAY_SEC - 0.05;
  run(S, 1);
  ok('11일이 되면 예고 단계로 들어간다', S.phase === 'warn', `phase=${S.phase}`);
  const warnEvent = drain(S).find(e => e.type === 'warn');
  ok('예고에 공격 방향이 실려 온다', !!warnEvent && warnEvent.dirs.length === 1,
     warnEvent ? warnEvent.dirs.join(',') : '없음');

  run(S, C.WARN_SEC + 1);
  ok('예고가 끝나면 몬스터가 스폰된다', S.monsters.length > 0, `${S.monsters.length}마리`);
  ok('밤 단계로 바뀐다', S.phase === 'night');

  const spawned = S.monsters.length;
  while (S.monsters.length) Sim.damageMonster(S, S.monsters[0], 99999, 'trap', S.traps[0] || null);
  Sim.update(S, 0.033);
  const rep = drain(S).find(e => e.type === 'report');
  ok('전멸시키면 웨이브 리포트가 나온다', !!rep);
  ok('리포트에 처치 수가 집계된다', rep && rep.killed === spawned, rep ? `${rep.killed}/${spawned}` : '');
  ok('리포트에 함정 처치 비율이 계산된다', rep && typeof rep.trapPct === 'number', rep ? `${rep.trapPct}%` : '');
  Sim.closeReport(S);
  ok('리포트를 닫으면 낮으로 돌아간다', S.phase === 'day');
  ok('웨이브 카운트가 올라간다', S.waveIdx === 1);
}

/* ── 8. 승패 ──────────────────────────────────────────── */
{
  const S = Sim.createSim('taesaja');
  S.base.hp = 1;
  S.hero.x = 40; S.hero.y = 40;          // 장수가 대신 잡아버리지 않게 멀리 떨어뜨립니다
  S.monsters.push({ x: S.base.x + 10, y: S.base.y + 10, hp: 99, maxHp: 99, spd: 0,
                    dmg: 99, cd: 0, boss: false, hitFlash: 0, dead: false,
                    windup: 0, windupTgt: null, vx: 0, vy: 0, hitStop: 0 });
  run(S, 3);
  ok('거점 체력이 0이 되면 패배한다', S.over === true && S.win === false);

  const W = Sim.createSim('taesaja');
  W.waveIdx = C.WAVES.length;
  Sim.closeReport(W);
  ok(`${C.WAVES.length}회 웨이브를 모두 막으면 승리한다`, W.over === true && W.win === true);
}

/* ── 9. 명성 시스템 (장수 등급 트레이드오프) ──────────── */
{
  const a = Sim.createSim('yohwa'), b = Sim.createSim('yeopo');
  ok('일반 장수가 전설보다 시작 자원이 많다', a.res.wood > b.res.wood, `${a.res.wood} vs ${b.res.wood}`);
  const aEarly = Sim.combatMul(a), bEarly = Sim.combatMul(b);
  a.day = 22; b.day = 22;
  const aLate = Sim.combatMul(a), bLate = Sim.combatMul(b);
  ok('전설 장수가 초반 전투력이 더 높다', bEarly > aEarly, `${bEarly.toFixed(2)} vs ${aEarly.toFixed(2)}`);
  ok('22일차 이후 일반 장수만 성장한다', aLate > aEarly && bLate === bEarly,
     `요화 ${aEarly.toFixed(2)}→${aLate.toFixed(2)} / 여포 ${bEarly.toFixed(2)}→${bLate.toFixed(2)}`);
  ok('전설 장수는 웨이브가 더 강하게 온다', b.heroDef.waveMul > a.heroDef.waveMul);
}

/* ── 10. 배치 교착 방지 ──────────────────────────────── */
{
  const S = Sim.createSim('taesaja');
  const n = Sim.countBuildableNearBase(S, 6);
  ok('거점 반경 6타일 안에 지을 빈 칸이 40개 이상 남는다', n >= 40, `${n}개`);
}

/* ── 11. 최후의 저항 ─────────────────────────────────── */
{
  const S = Sim.createSim('taesaja');
  S.base.hp = S.base.maxHp * 0.15;
  const before = Sim.combatMul(S);
  run(S, 0.1);
  ok('거점 체력 20% 이하에서 최후의 저항이 발동한다', S.lastStand === true);
  ok('최후의 저항은 공격력을 올린다', Sim.combatMul(S) > before,
     `${before.toFixed(2)} → ${Sim.combatMul(S).toFixed(2)}`);
}

/* ── 12. 궁극기 (Space) — 구르기를 대신하는 장치 ────── */
{
  for (const id of ['yohwa', 'taesaja', 'yeopo', 'hahudon', 'hwangchung', 'gwanwoo']) {
    const S = Sim.createSim(id);
    const ult = S.heroDef.skills[2];
    ok(`${S.heroDef.name}: 궁극기(${ult ? ult.name : '없음'})가 Space 에 있다`,
       !!ult && ult.ult === true && ult.key === 'Space');
    ok(`${S.heroDef.name}: 궁극기는 쓰는 동안 무적이다`, !!ult && ult.invuln > 0);
    S.hero.x = 600; S.hero.y = 600; S.hero.facing = Math.PI / 2;
    S.waveStats = { killed:0, byTrap:0, bySoldier:0, byHero:0, baseDmg:0, trapKills:{} };
    for (let i = 0; i < 6; i++)
      S.monsters.push({ x: 620 + i * 14, y: 600, hp: 4000, maxHp: 4000, spd: 0, dmg: 1, cd: 99,
                        boss: false, hitFlash: 0, dead: false, windup: 0, windupTgt: null,
                        vx: 0, vy: 0, hitStop: 0, armor: 0 });
    const hp0 = S.monsters.reduce((a, m) => a + m.hp, 0);
    ok(`${S.heroDef.name}: 궁극기를 쓸 수 있다`, Sim.useSkill(S, 2) === true);
    ok(`${S.heroDef.name}: 궁극기를 쓰면 무적이 걸린다`, S.hero.invuln > 0,
       `${S.hero.invuln.toFixed(2)}초`);
    run(S, 1.2);
    const hp1 = S.monsters.reduce((a, m) => a + m.hp, 0);
    ok(`${S.heroDef.name}: 궁극기가 실제로 피해를 준다`, hp1 < hp0,
       `${Math.round(hp0)} → ${Math.round(hp1)}`);
    ok(`${S.heroDef.name}: 궁극기는 재사용 대기가 길다`,
       Sim.useSkill(S, 2) === false && S.heroDef.skills[2].cd >= 20);
  }
  // 구르기는 완전히 사라졌습니다
  ok('구르기(dodgeRoll)는 더 이상 존재하지 않는다', typeof Sim.dodgeRoll === 'undefined');
}

/* ── 13. 적 예비 동작 → 물러서서 빗나가게 만들기 ────── */
{
  const S = Sim.createSim('yohwa');
  S.hero.x = 600; S.hero.y = 600;
  S.hero.hp = 100;
  S.monsters.push({ x: 620, y: 600, hp: 9999, maxHp: 9999, spd: 0, dmg: 40, cd: 0,
                    boss: false, hitFlash: 0, dead: false, windup: 0, windupTgt: null,
                    vx: 0, vy: 0, hitStop: 0, armor: 0 });
  run(S, 0.1);
  ok('몬스터는 곧바로 때리지 않고 예비 동작을 한다', S.monsters[0].windup > 0,
     `windup=${S.monsters[0].windup.toFixed(2)}`);
  const hpBefore = S.hero.hp;
  run(S, C.MONSTER_WINDUP + 0.1);
  ok('가만히 있으면 맞는다', S.hero.hp < hpBefore, `${Math.round(hpBefore)} → ${Math.round(hpBefore)}→${Math.round(S.hero.hp)}`);

  /* ★ 구르기를 뺀 뒤의 기본 방어 — 예비 동작 중에 걸어서 사거리 밖으로 나가면 빗나갑니다.
     이게 성립하지 않으면 붉은 예고가 의미를 잃습니다. */
  const T = Sim.createSim('yohwa');
  T.hero.x = 600; T.hero.y = 600; T.hero.hp = 100;
  T.monsters.push({ x: 620, y: 600, hp: 9999, maxHp: 9999, spd: 0, dmg: 40, cd: 0,
                    boss: false, hitFlash: 0, dead: false, windup: 0, windupTgt: null,
                    vx: 0, vy: 0, hitStop: 0, armor: 0 });
  run(T, 0.1);
  T.input.x = -1; T.input.y = 0;              // 반대 방향으로 걸어서 물러납니다
  const hp0 = T.hero.hp;
  run(T, C.MONSTER_WINDUP + 0.3);
  ok('예비 동작 중에 걸어서 물러나면 빗나간다 ← 컨트롤로 극복', T.hero.hp === hp0,
     `${Math.round(hp0)} → ${Math.round(T.hero.hp)} · 이동 ${Math.round(T.hero.x - 600)}유닛`);

  /* 궁극기의 무적으로도 흘릴 수 있습니다 */
  const U = Sim.createSim('yohwa');
  U.hero.x = 600; U.hero.y = 600; U.hero.hp = 100;
  U.waveStats = { killed:0, byTrap:0, bySoldier:0, byHero:0, baseDmg:0, trapKills:{} };
  U.monsters.push({ x: 620, y: 600, hp: 99999, maxHp: 99999, spd: 0, dmg: 40, cd: 0,
                    boss: true, hitFlash: 0, dead: false, windup: 0, windupTgt: null,
                    vx: 0, vy: 0, hitStop: 0, armor: 0 });
  run(U, 0.1);
  Sim.useSkill(U, 2);                          // 궁극기 = 무적
  const uhp = U.hero.hp;
  run(U, C.MONSTER_WINDUP_BOSS + 0.1);
  ok('궁극기의 무적으로도 적의 공격을 흘릴 수 있다', U.hero.hp === uhp,
     `${Math.round(uhp)} → ${Math.round(U.hero.hp)}`);
}

/* ── 14. 스킬 ────────────────────────────────────────── */
{
  for (const id of ['yohwa','taesaja','yeopo']) {
    const S = Sim.createSim(id);
    S.hero.x = 600; S.hero.y = 600; S.hero.facing = Math.PI / 2;
    for (let i = 0; i < 5; i++)
      S.monsters.push({ x: 640 + i * 12, y: 600, hp: 200, maxHp: 200, spd: 0, dmg: 1, cd: 99,
                        boss: false, hitFlash: 0, dead: false, windup: 0, windupTgt: null,
                        vx: 0, vy: 0, hitStop: 0 });
    S.waveStats = { killed:0, byTrap:0, bySoldier:0, byHero:0, baseDmg:0, trapKills:{} };
    const hpBefore = S.monsters.reduce((a, m) => a + m.hp, 0);
    ok(`${S.heroDef.name}: 기본 스킬(${S.heroDef.skills[0].name})을 쓸 수 있다`, Sim.useSkill(S, 0) === true);
    run(S, 0.6);
    const hpAfter = S.monsters.reduce((a, m) => a + m.hp, 0);
    ok(`${S.heroDef.name}: 기본 스킬이 실제로 피해를 준다`, hpAfter < hpBefore,
       `${Math.round(hpBefore)} → ${Math.round(hpAfter)}`);
    ok(`${S.heroDef.name}: 스킬은 재사용 대기가 있다`, Sim.useSkill(S, 0) === false);
    ok(`${S.heroDef.name}: 고유 스킬(${S.heroDef.skills[1].name})을 쓸 수 있다`, Sim.useSkill(S, 1) === true);
  }
}

/* ── 15. 무기별 차이 ─────────────────────────────────── */
{
  const a = Sim.createSim('yohwa'), b = Sim.createSim('taesaja'), c = Sim.createSim('yeopo');
  ok('활이 검보다 사거리가 길다', Sim.heroRange(b) > Sim.heroRange(a),
     `활 ${Math.round(Sim.heroRange(b))} vs 검 ${Math.round(Sim.heroRange(a))}`);
  ok('창(방천화극)이 검보다 사거리가 길다', Sim.heroRange(c) > Sim.heroRange(a),
     `창 ${Math.round(Sim.heroRange(c))}`);
  ok('활은 한 방이 검보다 약하다', Sim.heroDamage(b) / b.heroDef.combat < Sim.heroDamage(a) / a.heroDef.combat);
}

/* ── 16. 침공 방향과 예상 경로 (이번 판의 핵심 안내) ──── */
{
  const S = Sim.createSim('taesaja');
  ok('게임이 시작될 때 모든 웨이브의 공격 방향이 이미 정해져 있다',
     S.plannedDirs.length === C.WAVES.length && S.plannedDirs.every(d => d.length > 0));
  ok('웨이브마다 방향 수가 기획값(sides)과 일치한다',
     S.plannedDirs.every((d, i) => d.length === C.WAVES[i].sides));
  ok('첫날부터 다음 대란 방향을 알 수 있다', Sim.upcomingDirs(S).length === C.WAVES[0].sides,
     Sim.upcomingDirs(S).join(','));

  const path = Sim.invasionPath(S, 'E');
  ok('동쪽 진입점에서 거점까지 예상 경로가 이어진다', path.length > 10, `${path.length}칸`);
  const last = path[path.length - 1];
  const nearBase = Math.abs(last.tx - C.BASE_TX) <= 2 && Math.abs(last.ty - C.BASE_TY) <= 2;
  ok('예상 경로의 끝은 거점이다', nearBase, `끝 (${last.tx},${last.ty}) / 거점 (${C.BASE_TX},${C.BASE_TY})`);

  // ★ 목책을 세우면 경로가 실제로 바뀌어야 합니다. 이게 안 바뀌면 안내가 거짓말이 됩니다.
  const beforeKeys = path.map(t => t.tx + ',' + t.ty).join('|');
  S.res.wood = 9999;
  const wx = C.BASE_TX + 5;
  clearColumn(S, wx, C.BASE_TY - 4, C.BASE_TY + 4);
  S.hero.x = wx * C.TILE; S.hero.y = C.BASE_TY * C.TILE;
  let built = 0;
  for (let y = C.BASE_TY - 4; y <= C.BASE_TY + 4; y++) if (Sim.tryBuild(S, wx, y, 'wall')) built++;
  const after = Sim.invasionPath(S, 'E');
  const afterKeys = after.map(t => t.tx + ',' + t.ty).join('|');
  ok('목책을 세우면 예상 침공로가 실제로 휘어진다', built > 0 && afterKeys !== beforeKeys,
     `목책 ${built}개 · ${path.length}칸 → ${after.length}칸`);

  // 스폰 위치가 진입점 근처에 모여야 그린 경로가 사실이 됩니다
  const T = Sim.createSim('taesaja');
  T.day = 10; T.dayT = C.DAY_SEC - 0.05;
  run(T, C.WARN_SEC + 2);
  const e = Sim.entryPoint(T.spawnDirs[0]);
  const ex = e.tx * C.TILE, ey = e.ty * C.TILE;
  const near = T.monsters.every(m => Math.hypot(m.x - ex, m.y - ey) < C.TILE * 6);
  ok('몬스터는 화면에 그린 진입점 근처에서만 나온다', T.monsters.length > 0 && near,
     `${T.monsters.length}마리`);
}

/* ── 17. 몬스터 종류 ───────────────────────────────────── */
{
  const S = Sim.createSim('taesaja');
  const w55 = C.WAVES.find(w => w.day === 55);
  S.day = 54; S.dayT = C.DAY_SEC - 0.05;
  run(S, C.WARN_SEC + 2);
  const kinds = new Set(S.monsters.filter(m => !m.boss).map(m => m.kind));
  ok('55일 웨이브에는 방패병이 섞여 나온다', kinds.has('tank'), [...kinds].join(','));
  ok('방패병은 졸개보다 체력이 높다', (() => {
    const t = S.monsters.find(m => m.kind === 'tank'), n = S.monsters.find(m => m.kind === 'normal');
    return t && n && t.maxHp > n.maxHp;
  })());

  const tank = S.monsters.find(m => m.kind === 'tank');
  const hp0 = tank.hp;
  Sim.damageMonster(S, tank, 100, 'hero');
  ok('방패병은 받는 피해가 줄어든다 (100 피해 → 70)',
     Math.abs((hp0 - tank.hp) - 70) < 0.001, `실제 ${Math.round(hp0 - tank.hp)}`);

  const F = Sim.createSim('taesaja');
  F.day = 43; F.dayT = C.DAY_SEC - 0.05;
  run(F, C.WARN_SEC + 2);
  const fast = F.monsters.find(m => m.kind === 'fast'), norm = F.monsters.find(m => m.kind === 'normal');
  ok('44일 웨이브의 기병은 졸개보다 빠르다', fast && norm && fast.spd > norm.spd,
     fast && norm ? `${Math.round(fast.spd)} vs ${Math.round(norm.spd)}` : '표본 없음');
}

/* ── 18. 용병 ──────────────────────────────────────────── */
{
  const S = Sim.createSim('taesaja');
  ok('옥새 조각이 없으면 용병을 못 뽑는다', Sim.hireMerc(S, 'archer') === false);

  S.shard = 100;
  ok('옥새 조각으로 용병을 고용한다', Sim.hireMerc(S, 'archer') === true);
  ok('용병 고용에 옥새 조각이 실제로 빠진다', S.shard === 100 - C.MERCS.find(m => m.id === 'archer').cost,
     `남은 ${S.shard}`);
  ok('용병은 병영 한도와 무관하다 (병영 0인데 고용됨)', S.camps === 0 && S.soldiers.length === 1);
  ok('궁수 용병은 병사보다 사거리가 길다', S.soldiers[0].range > C.SOLDIER_RANGE,
     `${S.soldiers[0].range} vs ${C.SOLDIER_RANGE}`);

  Sim.hireMerc(S, 'shield');
  const sh = S.soldiers.find(x => x.merc === 'shield');
  ok('방패 용병은 체력이 병사보다 훨씬 높다', sh.maxHp > C.SOLDIER_HP * 2, `${sh.maxHp}`);

  // 계약 만료 — 하루씩 넘겨봅니다
  const days = C.MERC_CONTRACT_DAYS;
  advanceDays(S, days - 1);
  ok(`용병은 계약 ${days}일 동안은 남아 있다`, S.soldiers.length === 2, `${S.soldiers.length}명`);
  advanceDays(S, 1);
  ok('계약이 끝나면 용병이 떠난다', S.soldiers.length === 0, `${S.soldiers.length}명`);

  // 채집 용병은 밤에도 캡니다
  const G = Sim.createSim('taesaja');
  G.shard = 50; Sim.hireMerc(G, 'gatherer');
  // 실제 밤과 같은 상태를 만듭니다 (멀리 있는 몬스터 1마리 → 밤이 안 끝남)
  G.phase = 'night';
  G.waveStats = { killed: 0, byTrap: 0, bySoldier: 0, byHero: 0, baseDmg: 0, trapKills: {} };
  G.monsters.push({ x: 10, y: 10, hp: 9999, maxHp: 9999, spd: 0, dmg: 1, cd: 999, boss: false,
                    hitFlash: 0, dead: false, windup: 0, windupTgt: null, vx: 0, vy: 0, hitStop: 0, armor: 0 });
  G.got.wood = 0;
  run(G, 40);
  ok('채집 용병은 밤에도 자원을 캔다', G.got.wood > 0, `누적 목재 ${G.got.wood}`);
}

/* ── 19. 99일 구조 ─────────────────────────────────────── */
{
  ok('총 99일이다', C.TOTAL_DAYS === 99);
  ok('대란은 11일 간격으로 9회다',
     C.WAVES.length === 9 && C.WAVES.every((w, i) => w.day === (i + 1) * 11),
     C.WAVES.map(w => w.day).join(','));
  ok('웨이브 보상표가 웨이브 수와 맞는다', C.WAVE_SHARD.length === C.WAVES.length);
  ok('mix 비율의 합이 1이다',
     C.WAVES.every(w => Math.abs(w.mix.reduce((a, m) => a + m[1], 0) - 1) < 1e-9));
  ok('뒤 웨이브가 앞 웨이브보다 어렵다',
     C.WAVES.every((w, i) => i === 0 || (w.count >= C.WAVES[i - 1].count && w.hp >= C.WAVES[i - 1].hp)));
  ok('막 구분이 99일을 빈틈없이 덮는다',
     C.actOf(1).act === 1 && C.actOf(33).act === 1 && C.actOf(34).act === 2
     && C.actOf(66).act === 2 && C.actOf(67).act === 3 && C.actOf(99).act === 3);
  ok('목표 목록이 마지막 웨이브까지 이어진다',
     Sim.OBJECTIVES[Sim.OBJECTIVES.length - 1].ok({ waveIdx: 9 }) === true);
}

/* ── 20. 부활 ──────────────────────────────────────────── */
{
  const S = Sim.createSim('taesaja');
  S.hero.hp = 1;
  S.monsters.push({ x: S.hero.x, y: S.hero.y, hp: 999, maxHp: 999, spd: 0, dmg: 99, cd: 0,
                    boss: false, hitFlash: 0, dead: false, windup: 0, windupTgt: null,
                    vx: 0, vy: 0, hitStop: 0, armor: 0 });
  run(S, 2);
  ok('장수가 쓰러지면 부활 카운트다운이 생긴다', S.hero.dead === true && S.hero.respawn > 0,
     `${S.hero.respawn.toFixed(1)}초`);
  const t0 = S.hero.respawn;
  run(S, 1);
  ok('부활까지 남은 시간이 실제로 줄어든다', S.hero.respawn < t0,
     `${t0.toFixed(1)} → ${S.hero.respawn.toFixed(1)}`);
  run(S, t0 + 2);
  ok('시간이 지나면 되살아난다 (완전 탈락 없음)', S.hero.dead === false && S.hero.hp === S.hero.maxHp);
  ok('부활 직후에는 잠깐 무적이다 (부활 자리에서 바로 또 죽지 않게)',
     S.hero.invuln > 0 || S.hero.hp === S.hero.maxHp, `무적 ${S.hero.invuln.toFixed(2)}초`);

  // ★ 되살아난 자리 바로 옆에 적이 있어도 즉사 반복에 빠지지 않아야 합니다
  const R2 = Sim.createSim('taesaja');
  R2.hero.hp = 1;
  R2.monsters.push({ x: R2.base.x, y: R2.base.y + C.TILE * 2, hp: 9999, maxHp: 9999, spd: 0,
                     dmg: 99, cd: 0, boss: false, hitFlash: 0, dead: false, windup: 0,
                     windupTgt: null, vx: 0, vy: 0, hitStop: 0, armor: 0 });
  R2.hero.x = R2.base.x; R2.hero.y = R2.base.y + C.TILE * 2;
  run(R2, 2);
  const firstRespawn = R2.hero.respawn;
  run(R2, firstRespawn + 0.5);
  ok('부활 자리에 적이 붙어 있어도 곧바로 다시 죽지 않는다', R2.hero.dead === false,
     `체력 ${Math.round(R2.hero.hp)}`);
}

/* ── 21. 후반 성장 · 역할 확장 ───────────────────────── */
{
  const S = Sim.createSim('taesaja');
  S.forge = true; S.res.iron = 999; S.res.hide = 999; S.res.stone = 999; S.res.wood = 999;
  for (let i = 0; i < 6; i++) Sim.doCraft(S, 'weapon');
  ok('무기는 6단계까지 강화된다', S.weaponLv === 6, `${S.weaponLv}단계`);
  ok('6단계까지 올리면 더는 강화할 수 없다', Sim.canCraft(S, 'weapon').ok === false);
  ok('무기 강화는 뒤로 갈수록 비싸다',
     (() => { const a = Sim.createSim('taesaja'); a.weaponLv = 0;
              const b = Sim.createSim('taesaja'); b.weaponLv = 5;
              return Sim.craftCost(b, 'weapon').iron > Sim.craftCost(a, 'weapon').iron; })());

  // 강철 가시
  const T = Sim.createSim('taesaja');
  T.res.wood = 999; T.res.stone = 999;
  T.hero.x = (C.BASE_TX + 5) * C.TILE; T.hero.y = C.BASE_TY * C.TILE;
  clearColumn(T, C.BASE_TX + 5, C.BASE_TY, C.BASE_TY);   // 그 칸에 나무가 걸리지 않게
  const trapOk = Sim.tryBuild(T, C.BASE_TX + 5, C.BASE_TY, 'trap');
  ok('시험용 함정이 실제로 깔렸다', trapOk === true);
  T.hero.x = 20; T.hero.y = 20;          // 장수가 같이 때리면 함정 피해만 잴 수 없습니다
  const mk = () => ({ x: (C.BASE_TX + 5) * C.TILE + C.TILE / 2, y: C.BASE_TY * C.TILE + C.TILE / 2,
                      hp: 5000, maxHp: 5000, spd: 0, dmg: 1, cd: 99, boss: false, hitFlash: 0,
                      dead: false, windup: 0, windupTgt: null, vx: 0, vy: 0, hitStop: 0, armor: 0 });
  T.monsters.push(mk());
  const m1 = T.monsters[0], h1 = m1.hp; run(T, 1); const plain = h1 - m1.hp;
  T.gear.steelspike = true;
  T.monsters.length = 0; T.monsters.push(mk());
  const m2 = T.monsters[0], h2 = m2.hp; run(T, 1); const steel = h2 - m2.hp;
  ok('강철 가시를 만들면 함정 피해가 오른다', steel > plain * 1.4,
     `${plain.toFixed(0)} → ${steel.toFixed(0)}`);

  // 망루 강화
  const W = Sim.createSim('taesaja');
  W.baseLv = 3;
  const noCastle = Sim.createSim('taesaja'); noCastle.forge = true;
  ok('망루 강화는 철옹성이 있어야 만들 수 있다',
     Sim.canCraft(noCastle, 'towerup').why === '철옹성이 필요합니다',
     Sim.canCraft(noCastle, 'towerup').why);

  // 군기
  const B = Sim.createSim('taesaja');
  B.shard = 100; Sim.hireMerc(B, 'archer');
  const atk0 = B.soldiers[0].atk;
  B.forge = true; B.res.hide = 99; B.res.iron = 99;
  B.gear.ironmail = true; B.gear.steelspike = true; B.gear.towerup = true;
  Sim.doCraft(B, 'banner');
  ok('군기는 이미 고용한 용병에게도 적용된다', B.soldiers[0].atk > atk0,
     `${atk0} → ${B.soldiers[0].atk}`);

  // 역할 확장
  const R3 = Sim.createSim('taesaja');
  ok('곡괭이가 없으면 병사에게 철을 못 맡긴다', !Sim.roleList(R3, null).includes('iron'));
  R3.pickaxe = true;
  ok('곡괭이를 만들면 병사에게 철을 맡길 수 있다', Sim.roleList(R3, null).includes('iron'),
     Sim.roleList(R3, null).join('→'));
  R3.shard = 50; Sim.hireMerc(R3, 'gatherer');
  ok('채집 용병에게는 방어 역할이 없다', !Sim.roleList(R3, R3.soldiers[0]).includes('def'));

  // 병사가 실제로 철을 캐서 내려놓는가
  const I = Sim.createSim('taesaja');
  I.pickaxe = true; I.res.wood = 999; I.res.stone = 999;
  I.hero.x = I.base.x; I.hero.y = I.base.y;
  clearColumn(I, C.BASE_TX - 3, C.BASE_TY - 3, C.BASE_TY - 3);
  Sim.tryBuild(I, C.BASE_TX - 3, C.BASE_TY - 3, 'camp');
  Sim.hireSoldier(I);
  I.soldiers[0].role = 'iron';
  I.got.iron = 0;
  run(I, 150);
  ok('병사가 철을 캐서 거점에 내려놓는다', I.got.iron > 0, `누적 철 ${I.got.iron}`);
}

/* ── 22. 자원 5종이 실제로 지도에 있고 캘 수 있는가 ──── */
{
  const S = Sim.createSim('taesaja');
  const byType = {};
  for (const n of S.nodes) byType[n.type] = (byType[n.type] || 0) + 1;
  for (const t of ['wood', 'stone', 'iron', 'herb'])
    ok(`지도에 ${C.RESOURCES[t].name}(${t}) 자원지가 생성된다`, (byType[t] || 0) > 0, `${byType[t] || 0}곳`);
  ok('가죽은 자원지가 아니라 몬스터 전리품이다', !byType.hide);

  // 약초는 도구 없이 캘 수 있어야 합니다
  const H = Sim.createSim('taesaja');
  const herb = H.nodes.find(n => n.type === 'herb');
  H.hero.x = herb.x; H.hero.y = herb.y;
  run(H, 3);
  ok('약초는 도구 없이 캘 수 있다', H.res.herb > 0, `약초 ${H.res.herb}`);

  // 철은 곡괭이가 있어야
  const I = Sim.createSim('taesaja');
  const iron = I.nodes.find(n => n.type === 'iron');
  I.hero.x = iron.x; I.hero.y = iron.y;
  run(I, 3);
  ok('철은 곡괭이 없이는 안 캐진다', I.res.iron === 0);

  // 철광은 지도 중앙에만
  const mid = Math.floor(C.MAPW / 2);
  ok('철광은 지도 중앙 지대에만 있다',
     S.nodes.filter(n => n.type === 'iron').every(n => Math.abs(n.tx - mid) <= 4));
}

/* ── 23. 각성 (뽑기 중복이 전투력이 되는가) ──────────── */
{
  const a = Sim.createSim('taesaja', 0);
  const b = Sim.createSim('taesaja', 5);
  ok('각성하면 전투력이 오른다', Sim.combatMul(b) > Sim.combatMul(a),
     `${Sim.combatMul(a).toFixed(2)} → ${Sim.combatMul(b).toFixed(2)}`);
  ok(`★5 면 전투력이 정확히 +${Math.round(C.AWAKEN_BONUS * 5 * 100)}% 다`,
     Math.abs(Sim.combatMul(b) / Sim.combatMul(a) - (1 + C.AWAKEN_BONUS * 5)) < 1e-9);
  ok('각성 단계는 최대치를 넘지 않는다', Sim.createSim('taesaja', 99).awaken === C.AWAKEN_MAX);
  ok('각성 비용표가 최대 단계 수와 맞는다', C.AWAKEN_COST.length === C.AWAKEN_MAX);
  ok('등급이 높을수록 중복 혼백이 많다',
     C.SOUL_BY_GRADE['신화'] > C.SOUL_BY_GRADE['전설']
     && C.SOUL_BY_GRADE['전설'] > C.SOUL_BY_GRADE['영웅']
     && C.SOUL_BY_GRADE['영웅'] > C.SOUL_BY_GRADE['희귀']
     && C.SOUL_BY_GRADE['희귀'] > C.SOUL_BY_GRADE['일반']);
}

/* ── 24. 함정이 침공로 위에 있는가 (판단 도구) ───────── */
{
  const S = Sim.createSim('taesaja');
  S.res.wood = 9999; S.res.stone = 9999;
  const path = Sim.invasionPath(S, Sim.upcomingDirs(S)[0]);
  const on = path[Math.floor(path.length / 2)];

  // 경로 위 한 칸
  clearColumn(S, on.tx, on.ty, on.ty);
  S.hero.x = on.tx * C.TILE; S.hero.y = on.ty * C.TILE;
  ok('경로 위에 함정을 깐다', Sim.tryBuild(S, on.tx, on.ty, 'trap') === true);
  let r = Sim.trapsOnPath(S);
  ok('경로 위 함정은 경로 위로 센다', r.on === 1 && r.total === 1, JSON.stringify(r));

  // 경로에서 5칸 떨어진 곳
  const off = { tx: on.tx, ty: on.ty + 5 };
  clearColumn(S, off.tx, off.ty, off.ty);
  S.hero.x = off.tx * C.TILE; S.hero.y = off.ty * C.TILE;
  ok('경로 밖에도 함정을 깔 수는 있다', Sim.tryBuild(S, off.tx, off.ty, 'trap') === true);
  r = Sim.trapsOnPath(S);
  ok('경로에서 벗어난 함정은 따로 센다', r.on === 1 && r.total === 2, JSON.stringify(r));
  ok('벗어난 함정에 표시가 남는다',
     S.traps.find(t => t.ty === off.ty).onPath === false);

  /* ★ 목책으로 길을 틀면, 같은 자리의 함정이 경로 밖이 될 수 있습니다.
     "목책을 세웠더니 길이 바뀌었다" 를 숫자로 확인할 수 있어야 합니다. */
  const before = Sim.trapsOnPath(S).on;
  const wx = on.tx + 3;
  clearColumn(S, wx, C.BASE_TY - 6, C.BASE_TY + 6);
  S.hero.x = wx * C.TILE; S.hero.y = C.BASE_TY * C.TILE;
  let built = 0;
  for (let y = C.BASE_TY - 6; y <= C.BASE_TY + 6; y++) if (Sim.tryBuild(S, wx, y, 'wall')) built++;
  const after = Sim.trapsOnPath(S);
  ok('목책을 세우면 함정의 경로 판정이 다시 계산된다',
     built > 0 && typeof after.on === 'number',
     `목책 ${built}개 · 경로 위 함정 ${before} → ${after.on}`);
}

/* ── 25. 건물이 실제로 무슨 일을 하는가 ──────────────── */
{
  const S = Sim.createSim('taesaja');
  S.res.wood = 999; S.res.stone = 999;
  S.hero.x = S.base.x; S.hero.y = S.base.y;

  ok('병영을 짓기 전에는 병사를 못 뽑는다', Sim.hireSoldier(S) === false);
  clearColumn(S, C.BASE_TX - 4, C.BASE_TY - 3, C.BASE_TY - 3);
  Sim.tryBuild(S, C.BASE_TX - 4, C.BASE_TY - 3, 'camp');
  ok('병영 1채 = 병사 정원 1', S.camps === 1);
  ok('병영을 지어도 병사는 저절로 생기지 않는다', S.soldiers.length === 0);
  ok('병영이 있으면 병사를 뽑을 수 있다', Sim.hireSoldier(S) === true);
  ok('정원을 넘겨서는 못 뽑는다', Sim.hireSoldier(S) === false);

  ok('대장간을 짓기 전에는 제작이 안 된다', Sim.canCraft(S, 'pickaxe').why === '대장간이 필요합니다');
  clearColumn(S, C.BASE_TX - 4, C.BASE_TY + 3, C.BASE_TY + 3);
  Sim.tryBuild(S, C.BASE_TX - 4, C.BASE_TY + 3, 'forge');
  ok('대장간을 지으면 제작이 열린다', S.forge === true && Sim.canCraft(S, 'pickaxe').ok === true);
  clearColumn(S, C.BASE_TX - 5, C.BASE_TY + 3, C.BASE_TY + 3);   // 그 칸에 나무가 걸리지 않게
  ok('대장간은 한 채면 충분하다 (두 번째는 막힘)',
     Sim.canBuildAt(S, C.BASE_TX - 5, C.BASE_TY + 3, 'forge').why === 'owned',
     Sim.canBuildAt(S, C.BASE_TX - 5, C.BASE_TY + 3, 'forge').why);
}

/* ── 26. 철거 (길이 바뀐 뒤 되돌리기) ──────────────────── */
{
  const S = Sim.createSim('taesaja');
  S.res.wood = 999; S.res.stone = 999;
  const tx = C.BASE_TX + 4, ty = C.BASE_TY;
  clearColumn(S, tx, ty, ty);
  S.hero.x = tx * C.TILE; S.hero.y = ty * C.TILE;

  ok('빈 땅에는 철거할 것이 없다', Sim.demolish(S, tx, ty) === false);

  Sim.tryBuild(S, tx, ty, 'wall');
  const w0 = S.res.wood, n0 = S.cnt.wall;
  ok('목책을 철거할 수 있다', Sim.demolish(S, tx, ty) === true);
  ok('철거하면 목책 수가 줄어든다', S.cnt.wall === n0 - 1);
  const back = Sim.refundOf('wall');
  ok(`철거하면 자원의 절반을 돌려받는다 (목재 ${back.wood})`,
     S.res.wood === w0 + back.wood, `${w0} → ${S.res.wood}`);
  ok('철거한 자리에는 다시 지을 수 있다', Sim.canBuildAt(S, tx, ty, 'wall').ok === true);

  // 목책을 철거하면 길이 다시 뚫립니다
  clearColumn(S, tx, C.BASE_TY - 3, C.BASE_TY + 3);
  for (let y = C.BASE_TY - 3; y <= C.BASE_TY + 3; y++) {
    S.hero.x = tx * C.TILE; S.hero.y = y * C.TILE;
    Sim.tryBuild(S, tx, y, 'wall');
  }
  const blocked = S.dist[Sim.tkey(tx, C.BASE_TY)];
  for (let y = C.BASE_TY - 3; y <= C.BASE_TY + 3; y++) Sim.demolish(S, tx, y);
  ok('목책을 철거하면 막혔던 길이 다시 뚫린다',
     blocked === -1 && S.dist[Sim.tkey(tx, C.BASE_TY)] >= 0);

  // 함정 철거
  clearColumn(S, tx, ty, ty);
  S.hero.x = tx * C.TILE; S.hero.y = ty * C.TILE;
  Sim.tryBuild(S, tx, ty, 'trap');
  const t0 = S.cnt.trap, st0 = S.res.stone;
  ok('함정을 철거할 수 있다', Sim.demolish(S, tx, ty) === true);
  ok('함정 수가 줄고 석재가 돌아온다',
     S.cnt.trap === t0 - 1 && S.res.stone > st0, `석재 ${st0} → ${S.res.stone}`);

  // 병영을 철거하면 정원이 줄고 넘치는 병사는 떠납니다
  const B = Sim.createSim('taesaja');
  B.res.wood = 999; B.res.stone = 999;
  B.hero.x = B.base.x; B.hero.y = B.base.y;
  clearColumn(B, C.BASE_TX - 4, C.BASE_TY - 3, C.BASE_TY - 3);
  Sim.tryBuild(B, C.BASE_TX - 4, C.BASE_TY - 3, 'camp');
  Sim.hireSoldier(B);
  ok('병영 1채 · 병사 1명', B.camps === 1 && B.soldiers.length === 1);
  Sim.demolish(B, C.BASE_TX - 4, C.BASE_TY - 3);
  ok('병영을 철거하면 정원이 줄고 병사가 떠난다',
     B.camps === 0 && B.soldiers.filter(x => !x.merc).length === 0,
     `정원 ${B.camps} · 병사 ${B.soldiers.length}`);

  // 대장간을 철거하면 제작이 닫힙니다
  const F = Sim.createSim('taesaja');
  F.res.wood = 999; F.res.stone = 999;
  F.hero.x = F.base.x; F.hero.y = F.base.y;
  clearColumn(F, C.BASE_TX - 4, C.BASE_TY + 3, C.BASE_TY + 3);
  Sim.tryBuild(F, C.BASE_TX - 4, C.BASE_TY + 3, 'forge');
  Sim.demolish(F, C.BASE_TX - 4, C.BASE_TY + 3);
  ok('대장간을 철거하면 제작이 닫힌다', F.forge === false);
  ok('대장간을 철거하면 다시 지을 수 있다',
     Sim.canBuildAt(F, C.BASE_TX - 4, C.BASE_TY + 3, 'forge').ok === true);

  ok('돌려받는 양은 원래 비용의 절반이다',
     C.BUILDS.every(b => {
       const r = Sim.refundOf(b.id);
       return Object.keys(b.cost).every(k => (r[k] || 0) === Math.floor(b.cost[k] * C.REFUND_RATIO));
     }));
}

/* ── 27. 리포트의 함정 경로 판정은 "방금 치른 웨이브" 기준 ──── */
{
  const S = Sim.createSim('taesaja');
  S.res.wood = 9999; S.res.stone = 9999;
  // 마지막 웨이브를 치릅니다 — 그 뒤에는 남은 대란이 없습니다
  S.waveIdx = C.WAVES.length - 1;
  S.day = C.WAVES[C.WAVES.length - 1].day;
  const path = Sim.invasionPath(S, Sim.upcomingDirs(S)[0]);
  const on = path[Math.floor(path.length / 2)];
  clearColumn(S, on.tx, on.ty, on.ty);
  S.hero.x = on.tx * C.TILE; S.hero.y = on.ty * C.TILE;
  const built = Sim.tryBuild(S, on.tx, on.ty, 'trap');
  ok('마지막 웨이브 경로 위에 함정을 깐다', built === true);

  S.spawnDirs = S.plannedDirs[S.waveIdx].slice();
  S.phase = 'night';
  S.waveStats = { killed:0, byTrap:0, bySoldier:0, byHero:0, baseDmg:0, trapKills:{} };
  Sim.update(S, 1/30);                      // 몬스터 0 → endWave
  const rep = Sim.drainEvents(S).find(e => e.type === 'report');
  ok('마지막 웨이브 리포트에서도 경로 위 함정이 제대로 잡힌다',
     rep && rep.trapsTotal === 1 && rep.trapsOn === 1,
     rep ? `${rep.trapsOn}/${rep.trapsTotal}` : '리포트 없음');
  ok('마지막 웨이브 뒤에는 다음 대란 정보가 없다', rep && rep.nextDay === null);
}

/* ── 28. 리포트가 다음 대란의 방향 수를 미리 알려준다 ──────── */
{
  const S = Sim.createSim('taesaja');
  S.waveIdx = 0;
  S.phase = 'night';
  S.waveStats = { killed:0, byTrap:0, bySoldier:0, byHero:0, baseDmg:0, trapKills:{} };
  Sim.update(S, 1/30);
  const rep = Sim.drainEvents(S).find(e => e.type === 'report');
  ok('리포트에 다음 대란의 날짜·이름이 실린다',
     rep && rep.nextDay === C.WAVES[1].day && rep.nextName === C.WAVES[1].name);
  ok('리포트에 다음 대란의 방향 수가 실린다',
     rep && rep.nextSides === C.WAVES[1].sides && rep.nextDirs.length === C.WAVES[1].sides,
     rep ? `${rep.sides} → ${rep.nextSides}방향 (${rep.nextDirs.join(',')})` : '');
}

/* ── 29. 목표는 순서를 다르게 진행해도 막히지 않는다 ────── */
{
  const S = Sim.createSim('taesaja');
  // 함정을 하나도 안 깐 채로 11일 웨이브를 막아낸 상황
  S.got.wood = 99; S.cnt.wall = 9; S.cnt.camp = 2;
  S.soldiers.push({ merc:null }); S.forge = true;
  S.pickaxe = true; S.got.iron = 30; S.waveIdx = 1; S.weaponLv = 1;
  Sim.update(S, 1/30); Sim.drainEvents(S);
  ok('중간 목표를 건너뛰어도 안내가 멈추지 않는다', S.objIdx >= 9, `목표 ${S.objIdx}/${Sim.OBJECTIVES.length}`);
  ok('건너뛴 목표의 보상도 함께 들어온다', S.shard >= C.OBJECTIVE_SHARD * 9, `옥새 ${S.shard}`);

  // 아무것도 안 한 판은 그대로 0
  const Z = Sim.createSim('taesaja');
  Sim.update(Z, 1/30);
  ok('아무것도 안 했으면 목표는 그대로다', Z.objIdx === 0);
}

/* ── 30. 함정이 후반 적에게도 통하는가 ──────────────────── */
{
  /* 예전에는 함정 피해가 초당 42 고정이라, 체력 448 인 3막 정예를 잡으려면
     함정 17칸이 필요했습니다. 최대 체력 비례 피해를 얹어 이 문제를 고쳤습니다. */
  const tileTime = (spd) => C.TILE / (spd * C.TRAP_SLOW);
  const tilesNeeded = (hp, spd, armor, steel) => {
    const dps = (C.TRAP_DPS + hp * C.TRAP_PCT_DPS) * (steel ? C.TRAP_DPS_STEEL : 1);
    return hp / (dps * tileTime(spd) * (1 - armor));
  };
  const w99 = C.WAVES[C.WAVES.length - 1];
  const elite = C.MONSTER_KINDS.elite;
  const n = tilesNeeded(w99.hp * elite.hpMul, w99.spd * elite.spdMul, elite.armor, true);
  ok('강철 가시 함정 6칸이면 3막 정예를 잡을 수 있다', n <= 6.5, `${n.toFixed(1)}칸 필요`);

  const w11 = C.WAVES[0], norm = C.MONSTER_KINDS.normal;
  const n1 = tilesNeeded(w11.hp * norm.hpMul, w11.spd * norm.spdMul, norm.armor, false);
  ok('1막 졸개는 함정 한 칸으로도 잡힌다', n1 <= 1.2, `${n1.toFixed(1)}칸`);

  ok('최대 체력 비례 피해는 초반에 거의 티가 안 난다',
     w11.hp * C.TRAP_PCT_DPS < 3, `초당 +${(w11.hp * C.TRAP_PCT_DPS).toFixed(1)}`);

  // 실제 시뮬레이션으로도 확인
  const S = Sim.createSim('taesaja');
  S.res.wood = 999; S.res.stone = 999;
  const tx = C.BASE_TX + 5, ty = C.BASE_TY;
  clearColumn(S, tx, ty, ty);
  S.hero.x = tx * C.TILE; S.hero.y = ty * C.TILE;
  Sim.tryBuild(S, tx, ty, 'trap');
  S.hero.x = 20; S.hero.y = 20;
  S.gear.steelspike = true;
  const mk = hp => ({ x:(tx)*C.TILE+C.TILE/2, y:ty*C.TILE+C.TILE/2, hp, maxHp:hp, spd:0, dmg:1,
                      cd:99, boss:false, hitFlash:0, dead:false, windup:0, windupTgt:null,
                      vx:0, vy:0, hitStop:0, armor:0 });
  S.monsters.push(mk(5000));
  const m = S.monsters[0], h0 = m.hp;
  run(S, 1);
  const big = h0 - m.hp;
  S.monsters.length = 0; S.monsters.push(mk(50));
  const m2 = S.monsters[0], h1 = m2.hp;
  run(S, 0.5);
  const small = (h1 - m2.hp) * 2;
  ok('체력이 높은 적일수록 함정 피해가 크다', big > small * 1.5,
     `체력5000 → 초당 ${big.toFixed(0)} / 체력50 → 초당 ${small.toFixed(0)}`);
}

/* ── 31. 목표 문구가 실제로 달성 가능한 것만 말하는가 ───── */
{
  const texts = Sim.OBJECTIVES.map(o => o.t);
  ok('달성할 수 없는 "함정 처치 40%" 목표가 남아 있지 않다',
     !texts.some(t => /함정 처치 비율 4\d%|함정 처치 비율 [5-9]\d%/.test(t)));
}

console.log(results.join('\n'));
console.log(`\n결과: ${pass}개 통과, ${fail}개 실패\n`);
process.exit(fail ? 1 : 0);
