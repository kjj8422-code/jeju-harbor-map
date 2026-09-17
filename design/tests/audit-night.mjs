/* 밤 연출 점검 — 진격 · 전황 게이지 · 일출 · 난이도 · 적 종류
   ------------------------------------------------------------------
   왜 필요한가:
     이번 판에 밤이 통째로 바뀌었습니다.
       · 적이 한꺼번에 생기지 않고 여러 번의 **진격**으로 밀려옵니다
       · 화면 위에 **전황 게이지**가 뜹니다
       · 리포트가 저절로 닫히고 **날이 밝습니다** (버튼을 안 눌러도)
       · **난이도**(초급·중급·상급)가 생겼습니다
       · 적에 **들개·역병 시체·맹호**가 들어왔습니다 (네발짐승 모델)
     이 중 하나라도 조용히 망가지면 "밤이 밋밋해졌다" 로만 드러나고,
     기존 검수는 전부 통과합니다 — 그래서 따로 봅니다.

   실행: node design/tests/audit-night.mjs   (먼저 localhost:8899 로 서버를 띄울 것)
*/
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const URL = process.env.SG_URL || 'http://localhost:8899/samguk-99-3d.html';

const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{ width:1180, height:860 } });
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/CERT|fonts/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });

const R = []; const ok = (n, c, d='') => R.push(`${c?'✅':'❌'} ${n}${d?' — '+d:''}`);
const waitFor = async (fn, sec = 12) => {
  for (let i = 0; i < sec * 8; i++) { if (await p.evaluate(fn)) return true; await p.waitForTimeout(125); }
  return false;
};

await p.goto(URL);
await p.waitForTimeout(1400);

/* ── 난이도 ────────────────────────────────────────── */
ok('시작 화면에 난이도 세 가지가 있다',
   await p.evaluate(() => document.querySelectorAll('#diffRow .diffCard').length === 3),
   (await p.evaluate(() => [...document.querySelectorAll('#diffRow .dn')].map(x=>x.textContent).join('/'))));
ok('처음에는 중급이 골라져 있다',
   await p.evaluate(() => document.querySelector('.diffCard.on')?.dataset.diff === 'normal'));
await p.evaluate(() => document.querySelector('[data-diff="hard"]').click());
await p.waitForTimeout(200);
ok('난이도를 바꾸면 선택이 옮겨간다',
   await p.evaluate(() => document.querySelector('.diffCard.on')?.dataset.diff === 'hard'));
ok('고른 난이도가 저장된다',
   await p.evaluate(() => localStorage.getItem('sg3d_diff') === 'hard'));

await p.evaluate(() => window.__sg.startGame('taesaja'));
await p.waitForTimeout(1400);
const hardS = await p.evaluate(() => { const S = window.__sg.S;
  return { diff: S.diff.id, base: S.base.maxHp, gather: S.diff.gather }; });
ok('상급으로 시작하면 실제로 상급 값이 들어간다',
   hardS.diff === 'hard' && hardS.gather < 1, JSON.stringify(hardS));

await p.evaluate(() => { document.querySelector('[data-diff="normal"]'); });
await p.evaluate(() => { localStorage.setItem('sg3d_diff','normal'); });
await p.reload(); await p.waitForTimeout(1400);
await p.evaluate(() => window.__sg.startGame('taesaja'));
await p.waitForTimeout(1400);
ok('중급 거점 체력이 상급보다 높다',
   await p.evaluate(b => window.__sg.S.base.maxHp > b, hardS.base),
   `중급 ${await p.evaluate(()=>window.__sg.S.base.maxHp)} > 상급 ${hardS.base}`);

/* ── 적 종류 ───────────────────────────────────────── */
const kinds = await p.evaluate(() => {
  const C = window.__sg.C;
  return Object.entries(C.MONSTER_KINDS).map(([k, v]) => ({ k, body: v.body, voice: v.voice, tip: !!v.tip }));
});
ok('적 종류가 7가지로 늘었다', kinds.length === 7, kinds.map(x=>x.k).join(','));
ok('네발짐승과 시체가 들어왔다',
   kinds.some(x => x.body === 'beast') && kinds.some(x => x.body === 'undead'),
   kinds.filter(x=>x.body!=='man').map(x=>`${x.k}:${x.body}`).join(' '));
ok('짐승·시체는 우는 소리가 정해져 있다',
   kinds.filter(x => x.body !== 'man').every(x => !!x.voice),
   kinds.filter(x=>x.voice).map(x=>`${x.k}→${x.voice}`).join(' '));
ok('그 울음소리가 실제로 만들어져 있다',
   await p.evaluate(() => {
     const need = ['howl','groan','roar','surge','drums','dread'];
     return need.every(n => { try { window.__sg.Audio ? window.__sg.Audio.play(n) : 0; return true; } catch(e) { return false; } });
   }));
ok('모든 적에 대응 설명이 있다', kinds.every(x => x.tip));
ok('웨이브 구성 비율의 합이 모두 100% 다',
   await p.evaluate(() => window.__sg.C.WAVES.every(w =>
     Math.abs(w.mix.reduce((a, [, pct]) => a + pct, 0) - 1) < 1e-9)));

/* 일곱 종류를 전부 화면에 세워 모델이 만들어지는지 */
await p.evaluate(() => {
  const { S, C } = window.__sg;
  S.monsters.length = 0;
  Object.keys(C.MONSTER_KINDS).forEach((k, i) => {
    const K = C.MONSTER_KINDS[k];
    S.monsters.push({ x: S.hero.x + (i - 3) * 46, y: S.hero.y - 60, hp: 500, maxHp: 500,
      spd: 0, dmg: 1, cd: 99, boss: false, kind: k, armor: K.armor, scale: K.scale,
      hitFlash: 0, dead: false, windup: 0, windupTgt: null, vx: 0, vy: 0, hitStop: 0, facing: 0 });
  });
});
await p.waitForTimeout(1200);
ok('일곱 종류가 모두 화면에 그려진다',
   await p.evaluate(() => window.__sg.R3.R.monsterMeshes.size === 7),
   `${await p.evaluate(()=>window.__sg.R3.R.monsterMeshes.size)}종`);
ok('짐승은 사람과 다른 몸으로 그려진다',
   await p.evaluate(() => {
     const R3 = window.__sg.R3.R;
     let beast = 0;
     for (const [m, mesh] of R3.monsterMeshes) if (mesh.userData.beast) beast++;
     return beast === 2;   // 들개 · 맹호
   }));
ok('짐승을 그려도 오류가 나지 않는다', errs.length === 0,
   [...new Set(errs)].join(' | ').slice(0, 180));

/* ── 밤 · 진격 · 전황 게이지 ────────────────────────── */
await p.evaluate(() => { const { S, C } = window.__sg;
  S.monsters.length = 0; S.day = 10; S.dayT = C.DAY_SEC - 0.05;
  S.res.wood = 500; S.res.stone = 500; });
ok('예고 단계로 들어간다', await waitFor(() => window.__sg.S.phase === 'warn'), );
/* ★ 예고 중에도 게이지가 떠 있습니다. 그때 "남은 적 0" 이라고 적혀 있으면
   적이 쏟아지기 직전에 0마리라고 말하는 셈이라 게이지를 못 믿게 됩니다. */
ok('예고 중에는 몇 마리가 오는지 미리 알려준다',
   await waitFor(() => /곧 \d+마리/.test(document.getElementById('wbFoe').textContent), 5),
   await p.evaluate(() => document.getElementById('wbFoe').textContent));
ok('예고 중에 "남은 적 0" 이라고 적지 않는다',
   await p.evaluate(() => !/남은 적 0/.test(document.getElementById('wbFoe').textContent)));
ok('밤이 시작된다', await waitFor(() => window.__sg.S.phase === 'night', 14));

const n0 = await p.evaluate(() => { const S = window.__sg.S;
  return { mon: S.monsters.length, total: S.waveTotal, surges: S.surges.length }; });
ok('밤이 열리면 선발대만 먼저 온다', n0.mon > 0 && n0.mon < n0.total,
   `${n0.mon}/${n0.total}마리`);
ok('나머지는 진격으로 예약돼 있다', n0.surges > 0, `${n0.surges}차례`);
ok('전황 게이지가 뜬다',
   await p.evaluate(() => document.getElementById('warBar').classList.contains('on')));
/* ★ 여기서 실제 버그를 잡았습니다 — 밤이 막 열린 순간 "남은 적 0" 이 떴습니다.
   S.waveLeft 가 0 으로 시작하는데 화면이 그 값을 그대로 믿었기 때문입니다.
   "숫자가 적혀 있다" 가 아니라 "숫자가 맞다" 를 재야 잡힙니다. */
/* 화면 갱신은 0.12초마다이므로 DOM 이 따라올 시간을 줍니다 */
await waitFor(() => /남은 적 \d+/.test(document.getElementById('wbFoe').textContent), 6);
ok('전황 게이지에 남은 적이 적힌다',
   await p.evaluate(() => /남은 적 \d+/.test(document.getElementById('wbFoe').textContent)),
   await p.evaluate(() => document.getElementById('wbFoe').textContent));
/* 적이 남아 있는 '동안' 을 잡아서 재야 합니다 —
   장수가 다 잡아버린 뒤에 재면 0 이 맞는 값이 되어 버그를 못 봅니다. */
const foeMatch = await (async () => {
  for (let i = 0; i < 60; i++) {
    const r = await p.evaluate(() => {
      const S = window.__sg.S;
      if (S.phase !== 'night') return null;
      const want = S.monsters.length + S.surges.reduce((a, g) => a + g.kinds.length, 0);
      if (want <= 0) return null;
      const shown = Number((document.getElementById('wbFoe').textContent.match(/\d+/) || [-1])[0]);
      return { want, shown };
    });
    if (r) return r;
    await p.waitForTimeout(120);
  }
  return null;
})();
ok('남은 적 수가 실제 마릿수와 맞는다',
   !!foeMatch && Math.abs(foeMatch.shown - foeMatch.want) <= 2,
   foeMatch ? `화면 ${foeMatch.shown} / 실제 ${foeMatch.want}` : '적이 남은 순간을 못 잡음');

ok('진격 배너가 실제로 뜬다',
   await waitFor(() => document.getElementById('surgeBanner').classList.contains('on'), 20));
ok('배너에 진격 문구가 적힌다',
   await p.evaluate(() => (document.getElementById('sgTitle').textContent || '').length > 3),
   await p.evaluate(() => document.getElementById('sgTitle').textContent));
ok('배너에 방향과 마릿수가 적힌다',
   await p.evaluate(() => /\d+마리/.test(document.getElementById('sgSub').textContent)),
   await p.evaluate(() => document.getElementById('sgSub').textContent));
ok('붉은 섬광이 함께 터진다',
   await p.evaluate(() => document.getElementById('flash').classList.contains('on')));

ok('진격으로 온 무리는 대열을 이룬다',
   await p.evaluate(() => window.__sg.S.monsters.some(m => m.formation && m.group)),
   `대열 유지 ${await p.evaluate(()=>window.__sg.S.monsters.filter(m=>m.formation).length)}마리`);
ok('같은 무리는 같은 속도로 뭉쳐 온다',
   await p.evaluate(() => {
     const g = {};
     for (const m of window.__sg.S.monsters) if (m.group) (g[m.group] = g[m.group] || []).push(m.groupSpd);
     return Object.values(g).every(v => new Set(v.map(x => Math.round(x))).size === 1);
   }));

/* ── 날이 밝아옵니다 ───────────────────────────────── */
const btnBefore = await p.evaluate(() => document.getElementById('btnRepClose').textContent);
await p.evaluate(() => {          // 밤을 끝냅니다
  const S = window.__sg.S, Sim = window.__sg.Sim;
  S.surges.length = 0;
  while (S.monsters.length) Sim.damageMonster(S, S.monsters[0], 99999, 'hero');
});
ok('밤을 끝내면 리포트가 뜬다',
   await waitFor(() => window.__sg.S.phase === 'report', 10));
ok('리포트 버튼이 남은 시간을 알려준다',
   await p.evaluate(() => /초/.test(document.getElementById('btnRepClose').textContent)),
   await p.evaluate(() => document.getElementById('btnRepClose').textContent));
/* ★ 일시정지를 걸면 시간이 멈춰야 합니다.
   "갇히지 않는다" 만 재면 저절로 넘어가는 것도 통과로 셉니다 — 질문을 바꿔야 잡힙니다.
   천천히 읽으려고 멈췄는데 리포트가 날아가면 멈춘 의미가 없습니다. */
/* ⏸ 일시정지 버튼은 리포트 화면에 **덮여서 누를 수 없습니다** — 먼저 그걸 확인합니다.
   (그래서 "멈춰서 읽으면 되지" 가 성립하지 않고, 읽을 시간을 늘리는 수단이
    리포트 안에 있어야 합니다) */
ok('리포트 중에는 일시정지 버튼이 덮여 있다 → 리포트 안에 수단이 있어야 한다',
   await p.evaluate(() => {
     const b = document.getElementById('btnPause'), r = b.getBoundingClientRect();
     return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) !== b;
   }));
ok('리포트에 「잠깐 더 볼게요」 버튼이 있다',
   await p.evaluate(() => !!document.getElementById('btnRepHold')));
await p.click('#btnRepHold');
await p.waitForTimeout(600);
const heldPhase0 = await p.evaluate(() => window.__sg.S.phase);
await p.waitForTimeout(12000);          // 자동 닫힘(8초)보다 넉넉히 더
ok('「잠깐」 을 누르면 리포트가 저절로 닫히지 않는다',
   heldPhase0 === 'report' && await p.evaluate(() => window.__sg.S.phase === 'report'),
   `누른 뒤 12초 → ${await p.evaluate(() => window.__sg.S.phase)}`);
ok('멈춰 있는 동안 버튼이 그렇다고 알려준다',
   await p.evaluate(() => /준비되면/.test(document.getElementById('btnRepClose').textContent)),
   await p.evaluate(() => document.getElementById('btnRepClose').textContent));
await p.click('#btnRepHold');           // 다시 시간이 흐르게
await p.waitForTimeout(400);

ok('누르지 않아도 저절로 날이 밝는다',
   await waitFor(() => window.__sg.S.phase === 'day', 20), '자동으로 낮 복귀');
ok('날이 밝는 연출이 실제로 나온다',
   await p.evaluate(() => document.getElementById('dawn').classList.contains('on')
                       && document.getElementById('dawnWord').classList.contains('on')));
ok('낮으로 돌아오면 전황 게이지가 사라진다',
   await waitFor(() => !document.getElementById('warBar').classList.contains('on'), 6));
ok('낮으로 돌아온 뒤에도 게임이 돈다',
   await (async () => { const t0 = await p.evaluate(() => window.__sg.S.t);
     await p.waitForTimeout(700);
     return await p.evaluate(t => window.__sg.S.t > t, t0); })());
ok('전체 과정에서 오류가 없다', errs.length === 0,
   [...new Set(errs)].join(' | ').slice(0, 200));

console.log('\n=== 밤 연출 점검 ===\n');
console.log(R.join('\n'));
const bad = R.filter(x => x.startsWith('❌')).length;
console.log(`\n결과: ${R.length - bad}개 통과, ${bad}개 실패`);
await b.close();
process.exit(bad ? 1 : 0);
