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
  const before = S.dist[Sim.tkey(tx + 1, ty)];
  for (let y = ty - 4; y <= ty + 4; y++) Sim.tryBuild(S, C.BASE_TX + 5, y, 'wall');
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
  Sim.tryBuild(S, C.BASE_TX - 3, C.BASE_TY - 3, 'camp');
  Sim.hireSoldier(S);
  ok('병영을 지으면 병사를 고용할 수 있다', S.soldiers.length === 1);

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
  W.waveIdx = 3;
  Sim.closeReport(W);
  ok('3회 웨이브를 모두 막으면 승리한다', W.over === true && W.win === true);
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

/* ── 12. 회피 (컨트롤로 극복하는 핵심) ───────────────── */
{
  const S = Sim.createSim('yohwa');
  S.hero.x = 600; S.hero.y = 600;
  const before = { x: S.hero.x, y: S.hero.y };
  S.input.x = 1; S.input.y = 0;
  ok('회피를 쓸 수 있다', Sim.dodgeRoll(S) === true);
  ok('회피 중에는 무적이다', S.hero.invuln > 0);
  run(S, C.DODGE_TIME + 0.05);
  const moved = Math.hypot(S.hero.x - before.x, S.hero.y - before.y);
  ok('회피하면 실제로 굴러서 이동한다', moved > C.DODGE_DIST * 0.7, `${Math.round(moved)} 유닛`);
  ok('회피는 재사용 대기가 있다', Sim.dodgeRoll(S) === false);
}

/* ── 13. 적 예비 동작 → 회피로 빗나가게 만들기 ──────── */
{
  const S = Sim.createSim('yohwa');
  S.hero.x = 600; S.hero.y = 600;
  S.hero.hp = 100;
  S.monsters.push({ x: 620, y: 600, hp: 9999, maxHp: 9999, spd: 0, dmg: 40, cd: 0,
                    boss: false, hitFlash: 0, dead: false, windup: 0, windupTgt: null,
                    vx: 0, vy: 0, hitStop: 0 });
  run(S, 0.1);
  ok('몬스터는 곧바로 때리지 않고 예비 동작을 한다', S.monsters[0].windup > 0,
     `windup=${S.monsters[0].windup.toFixed(2)}`);
  const hpBefore = S.hero.hp;
  run(S, C.MONSTER_WINDUP + 0.1);
  ok('가만히 있으면 맞는다', S.hero.hp < hpBefore, `${Math.round(hpBefore)} → ${Math.round(S.hero.hp)}`);

  // 이번에는 예비 동작 중에 굴러서 피합니다
  const T = Sim.createSim('yohwa');
  T.hero.x = 600; T.hero.y = 600; T.hero.hp = 100;
  T.monsters.push({ x: 620, y: 600, hp: 9999, maxHp: 9999, spd: 0, dmg: 40, cd: 0,
                    boss: false, hitFlash: 0, dead: false, windup: 0, windupTgt: null,
                    vx: 0, vy: 0, hitStop: 0 });
  run(T, 0.1);
  T.input.x = -1; T.input.y = 0;
  Sim.dodgeRoll(T);
  const hp0 = T.hero.hp;
  run(T, C.MONSTER_WINDUP + 0.3);
  ok('예비 동작 중에 구르면 빗나간다 ← 컨트롤로 극복', T.hero.hp === hp0,
     `${Math.round(hp0)} → ${Math.round(T.hero.hp)}`);
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

console.log(results.join('\n'));
console.log(`\n결과: ${pass}개 통과, ${fail}개 실패\n`);
process.exit(fail ? 1 : 0);
