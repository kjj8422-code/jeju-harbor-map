/* 다시 시작 점검 — 지난 판의 물체가 새 판에 남아 있지 않은지
   ------------------------------------------------------------------
   왜 필요한가:
     팀장님이 찾으신 버그입니다 — "게임을 다시 시작하니까 병영이 안 사라지고 그대로 있어".
     원인이 둘이었습니다.
       ① buildWorld 가 structMeshes 를 Map 에서 비우기만 하고 scene 에서는 안 뺐습니다.
          Map 을 비우면 지울 방법조차 없어지므로 지난 판의 병영이 영영 남습니다.
       ② 시설을 그릴 때 structs 배열의 '마지막' 것을 그렸습니다. 한 프레임에 시설이
          둘 이상 생기면 같은 것을 두 번 그리고 나머지는 Map 에 등록조차 안 됐습니다.
     ⑦ 긴 플레이 점검에도 "다시 시작" 항목이 있었지만 "조작이 되는가" 만 봤지
     "지난 판이 지워졌는가" 는 안 봤습니다. 그래서 통과하면서도 못 잡았습니다.

   확인하는 것:
     · 시설·병사·함정·몬스터 메시가 새 판에 하나도 안 남는가
     · 한 프레임에 시설을 여러 채 지어도 전부 제대로 등록되는가 (지울 수 있는가)
     · 화면 위 체력바 같은 DOM 요소가 쌓이지 않는가

   실행: node design/tests/audit-restart.mjs   (먼저 localhost:8899 로 서버를 띄울 것)
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL = process.env.SG_URL || 'http://localhost:8899/samguk-99-3d.html';

const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{ width:1180, height:900 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });

const R = []; const ok = (n, c, d='') => R.push(`${c?'✅':'❌'} ${n}${d?' — '+d:''}`);

/* 지도는 판마다 무작위라 나무·바위 InstancedMesh 개수는 매번 다릅니다.
   그래서 그것을 뺀 나머지(장수·거점·시설·병사·몬스터 그룹)만 셉니다. */
const snap = () => p.evaluate(() => {
  const R3 = window.__sg.R3.R, S = window.__sg.S;
  return {
    solid: R3.scene.children.filter(o => !o.isInstancedMesh).length,
    maps: { monster: R3.monsterMeshes.size, soldier: R3.soldierMeshes.size,
            trap: R3.trapMeshes.size, struct: R3.structMeshes.size },
    sim: { structs: S.structs.length, traps: S.traps.length,
           soldiers: S.soldiers.length, monsters: S.monsters.length },
    hp: document.querySelectorAll('.hpBar').length,
    down: document.querySelectorAll('.downTimer').length
  };
});

await p.goto(URL);
await p.waitForTimeout(1500);
await p.evaluate(() => window.__sg.startGame('taesaja'));
await p.waitForTimeout(1200);
const fresh = await snap();
ok('새 판은 시설·병사·몬스터가 하나도 없이 시작한다',
   Object.values(fresh.maps).every(v => v === 0), JSON.stringify(fresh.maps));

/* 한 프레임에 시설을 여러 채 짓습니다 — ②번 버그를 정면으로 겨냥합니다 */
const built = await p.evaluate(() => {
  const { S, Sim, C } = window.__sg;
  S.res.wood = 9999; S.res.stone = 9999; S.res.iron = 999; S.res.hide = 999;
  const n = { camp: 0, forge: 0, trap: 0, wall: 0 };
  for (let i = 0; i < C.MAPW && n.camp  < 4; i++) for (let j = 0; j < C.MAPH && n.camp  < 4; j++) if (Sim.tryBuild(S, i, j, 'camp'))  n.camp++;
  for (let i = 0; i < C.MAPW && n.forge < 1; i++) for (let j = 0; j < C.MAPH && n.forge < 1; j++) if (Sim.tryBuild(S, i, j, 'forge')) n.forge++;
  for (let i = 0; i < C.MAPW && n.trap  < 6; i++) for (let j = 0; j < C.MAPH && n.trap  < 6; j++) if (Sim.tryBuild(S, i, j, 'trap'))  n.trap++;
  for (let i = 0; i < C.MAPW && n.wall  < 8; i++) for (let j = 0; j < C.MAPH && n.wall  < 8; j++) if (Sim.tryBuild(S, i, j, 'wall'))  n.wall++;
  for (let k = 0; k < 3; k++) Sim.hireSoldier(S);
  return n;
});
await p.waitForTimeout(1400);
const full = await snap();
ok('한 프레임에 여러 채를 지어도 전부 화면에 등록된다',
   full.maps.struct === full.sim.structs && full.sim.structs === built.camp + built.forge,
   `지은 것 ${full.sim.structs}채 / 등록 ${full.maps.struct}채`);
ok('함정·병사도 전부 등록된다',
   full.maps.trap === full.sim.traps && full.maps.soldier === full.sim.soldiers,
   `함정 ${full.maps.trap}/${full.sim.traps} · 병사 ${full.maps.soldier}/${full.sim.soldiers}`);
ok('시설을 지으면 화면 물체가 실제로 늘어난다', full.solid > fresh.solid,
   `${fresh.solid} → ${full.solid}`);

/* 같은 장수로 다시 시작 */
await p.evaluate(() => window.__sg.startGame('taesaja'));
await p.waitForTimeout(1500);
const again = await snap();
ok('다시 시작하면 지난 판의 병영·대장간이 사라진다', again.maps.struct === 0 && again.sim.structs === 0,
   `${again.maps.struct}채 남음`);
ok('다시 시작하면 지난 판의 함정·병사·몬스터도 사라진다',
   again.maps.trap === 0 && again.maps.soldier === 0 && again.maps.monster === 0,
   JSON.stringify(again.maps));
ok('다시 시작한 화면에 지난 판의 물체가 남지 않는다', again.solid === fresh.solid,
   `${fresh.solid}개로 돌아와야 하는데 ${again.solid}개`);
ok('체력바가 쌓이지 않는다', again.hp <= fresh.hp, `${fresh.hp} → ${again.hp}`);
ok('복귀 타이머가 남지 않는다', again.down === 0, `${again.down}개`);

/* 다른 장수로 한 번 더 — 장수 모델이 겹쳐 남지 않는지 */
await p.evaluate(() => window.__sg.startGame('gwanu'));
await p.waitForTimeout(1500);
const third = await snap();
ok('장수를 바꿔 시작해도 물체가 늘지 않는다', third.solid === fresh.solid,
   `${fresh.solid} → ${third.solid}`);

/* 세 판을 돌린 뒤에도 게임이 살아 있는가 */
const t0 = await p.evaluate(() => window.__sg.S.t);
await p.waitForTimeout(600);
ok('세 판을 이어 돌려도 게임이 멈추지 않는다',
   await p.evaluate(t => window.__sg.S.t > t, t0));
ok('오류가 하나도 없다', errs.length === 0, [...new Set(errs)].join(' | ').slice(0, 200));

console.log('\n=== 다시 시작 점검 ===\n');
console.log(R.join('\n'));
const bad = R.filter(x => x.startsWith('❌')).length;
console.log(`\n결과: ${R.length - bad}개 통과, ${bad}개 실패`);
await b.close();
process.exit(bad ? 1 : 0);
