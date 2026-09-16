/* 정적 전수 점검 — 코드와 HTML 을 기계적으로 대조합니다
   ------------------------------------------------------------------
   왜 필요한가:
     "$('hDayLeft') 가 null 이라 게임이 죽었다" 같은 사고는 사람이 눈으로
     찾기 어렵습니다. 하지만 기계는 1초 만에 찾습니다.
     코드가 부르는 id 와 화면에 있는 id 를 전부 대조합니다.
   실행: node design/tests/audit-static.mjs
*/
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('../../', import.meta.url).pathname;
const html = readFileSync(join(ROOT, 'samguk-99-3d.html'), 'utf8');
const jsFiles = readdirSync(join(ROOT, 'js')).filter(f => f.endsWith('.js'));
const js = Object.fromEntries(jsFiles.map(f => [f, readFileSync(join(ROOT, 'js', f), 'utf8')]));

let pass = 0, fail = 0;
const out = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; out.push(`  ✅ ${name}`); }
  else { fail++; out.push(`  ❌ ${name}${detail ? '\n       ' + detail : ''}`); }
};

console.log('\n=== 정적 전수 점검 ===\n');

/* ── 1. 코드가 부르는 id 가 화면에 전부 있는가 ── */
const htmlIds = new Set([...html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));
// 코드가 만들어 넣는 id (innerHTML 안에서 생성되는 것들)
const madeIds = new Set([...Object.values(js).join('\n').matchAll(/id="?\$\{?|id="([A-Za-z0-9_-]+)"/g)]
  .map(m => m[1]).filter(Boolean));
// skcd0/skcd1... 처럼 번호가 붙는 것들
for (let i = 0; i < 6; i++) madeIds.add('skcd' + i);

const called = new Map();          // id -> [파일:줄]
for (const [f, src] of Object.entries(js)) {
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\$\(\s*'([A-Za-z0-9_-]+)'\s*\)/g)) {
      if (!called.has(m[1])) called.set(m[1], []);
      called.get(m[1]).push(`${f}:${i + 1}`);
    }
    for (const m of line.matchAll(/getElementById\(\s*'([A-Za-z0-9_-]+)'\s*\)/g)) {
      if (!called.has(m[1])) called.set(m[1], []);
      called.get(m[1]).push(`${f}:${i + 1}`);
    }
  });
}
const missing = [...called.keys()].filter(id => !htmlIds.has(id) && !madeIds.has(id));
ok(`코드가 부르는 id ${called.size}개가 모두 화면에 있다`, missing.length === 0,
   missing.map(id => `${id}  ← ${called.get(id).join(', ')}`).join('\n       '));

/* ── 2. innerHTML 로 지워질 수 있는 id 를 나중에 다시 부르는가 ──
   이것이 "11일에서 게임이 멈춘" 사고의 정확한 형태입니다. */
const danger = [];
for (const [f, src] of Object.entries(js)) {
  // innerHTML 템플릿 안에서 만들어지는 id 들
  for (const m of src.matchAll(/innerHTML\s*=\s*`([\s\S]*?)`/g)) {
    for (const idm of m[1].matchAll(/id="([A-Za-z0-9_-]+)"/g)) {
      const id = idm[1];
      if (called.has(id) && !htmlIds.has(id)) danger.push(`${id} (${f}) — innerHTML 로만 생기는데 $() 로 부름`);
    }
  }
}
ok('innerHTML 로만 생기는 id 를 $() 로 부르는 곳이 없다', danger.length === 0,
   danger.join('\n       '));

/* ── 3. 화면 안(#stage) UI 가 전부 data-ui 표시를 달았는가 ── */
const stageStart = html.indexOf('<div id="stage">');
const stageEnd = html.indexOf('<div id="controls">');
const stageHtml = html.slice(stageStart, stageEnd);
/* 부모가 data-ui 를 달았으면 자식은 안 달아도 됩니다(closest 로 찾으므로).
   깊이를 세어 "data-ui 를 단 조상이 있는지" 를 판정합니다. */
const noUi = [];
{
  let depth = 0, guarded = [];          // guarded[d] = 그 깊이에서 data-ui 를 달았는가
  const tokens = stageHtml.matchAll(/<(\/?)div([^>]*)>/g);
  for (const t of tokens) {
    const closing = t[1] === '/', attrs = t[2];
    if (closing) { depth = Math.max(0, depth - 1); guarded.length = depth; continue; }
    const hasUi = /\bdata-ui\b/.test(attrs);
    const idm = attrs.match(/id="([A-Za-z0-9_-]+)"/);
    const covered = guarded.some(Boolean) || hasUi;
    /* 클릭을 아예 안 받는 요소(pointer-events:none)는 표시가 필요 없습니다 */
    const id = idm ? idm[1] : null;
    const cssBlock = id ? (html.match(new RegExp(`#${id}\\{[^}]*\\}`)) || [''])[0] : '';
    const noPointer = /pointer-events\s*:\s*none/.test(cssBlock)
                   || /pointer-events\s*:\s*none/.test(attrs);
    if (id && id !== 'stage' && !covered && !noPointer) noUi.push(id);
    guarded[depth] = hasUi || noPointer;
    depth++;
    if (/\/>$/.test(t[0])) { depth--; guarded.length = depth; }
  }
}
ok('화면 안 UI 가 전부 data-ui 표시를 달았다 (부모 포함)', noUi.length === 0, noUi.join(', '));

/* ── 4. onclick 을 붙이는 버튼이 실제로 화면에 있는가 ── */
const handlers = [];
for (const [f, src] of Object.entries(js))
  for (const m of src.matchAll(/\$\('([A-Za-z0-9_-]+)'\)\.onclick/g)) handlers.push([m[1], f]);
const deadHandlers = handlers.filter(([id]) => !htmlIds.has(id));
ok(`onclick 을 다는 버튼 ${handlers.length}개가 모두 존재한다`, deadHandlers.length === 0,
   deadHandlers.map(([id, f]) => `${id} (${f})`).join(', '));

/* ── 5. 화면에 있는데 아무도 안 쓰는 id (죽은 요소) ── */
const unused = [...htmlIds].filter(id => {
  if (called.has(id)) return false;
  if (html.includes(`for="${id}"`)) return false;
  if (new RegExp(`#${id}\\b`).test(html)) return false;          // CSS 선택자로 쓰임
  if (Object.values(js).some(s => s.includes(`'${id}'`) || new RegExp(`#${id}\\b`).test(s))) return false;
  return true;
});
ok('화면에 쓰이지 않는 id 가 없다', unused.length === 0, unused.join(', '));

/* ── 6. config 의 자원 키가 어디서나 일관되는가 ── */
const cfg = js['config.js'];
const resKeys = [...cfg.matchAll(/^\s{2}(\w+):\s*\{\s*name:'[^']+',\s*icon:/gm)].map(m => m[1]);
const simSrc = js['sim.js'];
const resInit = simSrc.match(/res:\s*\{([^}]*)\}/);
const resInitKeys = resInit ? [...resInit[1].matchAll(/(\w+):/g)].map(m => m[1]) : [];
const missRes = resKeys.filter(k => !resInitKeys.includes(k));
ok(`자원 ${resKeys.length}종이 모두 초기화된다`, missRes.length === 0,
   `빠진 것: ${missRes.join(', ')} / 있는 것: ${resInitKeys.join(', ')}`);
const gotInit = simSrc.match(/got:\s*\{([^}]*)\}/);
const gotKeys = gotInit ? [...gotInit[1].matchAll(/(\w+):/g)].map(m => m[1]) : [];
ok('누적 집계도 자원 수와 맞는다', resKeys.every(k => gotKeys.includes(k)),
   `빠진 것: ${resKeys.filter(k => !gotKeys.includes(k)).join(', ')}`);

/* ── 7. 자원마다 HUD 표시가 있는가 ── */
const noHud = resKeys.filter(k => {
  const cap = 'h' + k[0].toUpperCase() + k.slice(1);
  return !htmlIds.has(cap);
});
ok('자원마다 HUD 칸이 있다', noHud.length === 0, `빠진 것: ${noHud.join(', ')}`);

/* ── 8. 소리 이름이 실제로 존재하는가 ── */
const played = new Set();
for (const src of Object.values(js))
  for (const m of src.matchAll(/sound\(S,\s*'([a-zA-Z]+)'\)/g)) played.add(m[1]);
for (const m of js['main.js'].matchAll(/Audio\.play\('([a-zA-Z]+)'\)/g)) played.add(m[1]);
const recipes = new Set([...js['audio.js'].matchAll(/^\s{2}([a-zA-Z]+):\s*t\s*=>/gm)].map(m => m[1]));
const noSound = [...played].filter(n => !recipes.has(n));
ok(`쓰이는 효과음 ${played.size}종이 모두 정의돼 있다`, noSound.length === 0,
   `없는 소리: ${noSound.join(', ')}`);

/* ── 9. 이벤트를 emit 하는데 아무도 안 받는가 ── */
const emitted = new Set();
for (const m of simSrc.matchAll(/emit\(S,\s*'([a-zA-Z]+)'/g)) emitted.add(m[1]);
const handled = new Set([...js['main.js'].matchAll(/case '([a-zA-Z]+)':/g)].map(m => m[1]));
const ignored = [...emitted].filter(e => !handled.has(e));
// 일부는 일부러 무시합니다
const okIgnored = new Set(['windup','monsterDied','monsterMiss','baseHit','potion','soldiers',
                           'nodeDepleted','actChanged','nodeCleared','essence','switchHero','lastStand']);
const realIgnored = ignored.filter(e => !okIgnored.has(e));
ok('처리되지 않는 이벤트가 없다', realIgnored.length === 0, realIgnored.join(', '));

/* ── 10. CSS 클래스가 코드에서 만드는 것과 맞는가 ── */
const cssClasses = new Set([...html.matchAll(/^\.([A-Za-z][\w-]*)/gm)].map(m => m[1]));
const usedClasses = new Set();
for (const src of Object.values(js)) {
  for (const m of src.matchAll(/className\s*=\s*'([^']+)'/g))
    m[1].split(/\s+/).forEach(c => c && usedClasses.add(c));
  for (const m of src.matchAll(/class="([a-zA-Z][\w -]*)"/g))
    m[1].split(/\s+/).forEach(c => c && usedClasses.add(c));
}
const noCss = [...usedClasses].filter(c => !cssClasses.has(c) && !html.includes(`.${c}`));
ok('코드가 쓰는 CSS 클래스가 모두 정의돼 있다', noCss.length === 0, noCss.join(', '));

console.log(out.join('\n'));
console.log(`\n결과: ${pass}개 통과, ${fail}개 실패\n`);
process.exit(fail ? 1 : 0);
