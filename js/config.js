/* ==================================================================
   삼국지 99일 생존 — 설정값 모음
   밸런스를 만지려면 이 파일만 고치면 됩니다. 다른 파일은 건드릴 필요 없습니다.
   숫자는 전부 2D 프로토타입에서 자동 플레이로 검증된 값 그대로입니다.
   ================================================================== */

/* ---------- 지도 · 시간 ---------- */
export const TILE = 28;                 // 타일 한 칸(게임 단위)
export const MAPW = 46, MAPH = 34;      // 지도 크기(타일 수)
export const WORLD_W = MAPW * TILE;
export const WORLD_H = MAPH * TILE;
export const DAY_SEC = 8;               // 하루 길이(초)
export const TOTAL_DAYS = 99;           // 전체 99일 (3막 × 33일)
export const WARN_SEC = 5;              // 웨이브 예고 시간

/* 3막 구조 — 기획서의 99일 체제를 그대로 옮겼습니다.
   막이 바뀌면 적의 구성이 바뀌고, 플레이어가 배워야 할 것도 바뀝니다. */
export const ACTS = [
  { act:1, from:1,  to:33, name:'개척기',
    lesson:'목책으로 길을 좁히고 함정을 까는 법을 배웁니다.' },
  { act:2, from:34, to:66, name:'확장기',
    lesson:'기병은 빠르고 방패병은 단단합니다. 한 가지 방어로는 막히지 않습니다.' },
  { act:3, from:67, to:99, name:'결전기',
    lesson:'사방에서 몰려옵니다. 병력·성·함정을 모두 굴려야 버팁니다.' }
];
export const actOf = day => ACTS.find(a => day >= a.from && day <= a.to) || ACTS[2];

/* 3D 환산 비율 — 1게임단위 = 0.1 three단위.
   이렇게 해야 장수 키가 약 2유닛(사람 크기)이 되어 조명·그림자·텍스처 밀도가 자연스럽습니다.
   시뮬레이션은 게임 단위를 그대로 쓰고, 화면에 그릴 때만 이 값을 곱합니다. */
export const RENDER_SCALE = 0.1;

/* ---------- 거점 ---------- */
export const BASE_TX = 9, BASE_TY = 17;
export const BASE_HP = 1300;
export const BASE_FOOTPRINT = TILE * 1.5;   // 거점 반지름(도착 판정에 사용)

/* ---------- 장수 ---------- */
export const HERO_ATK = 16;
export const HERO_CD = 0.5;
export const HERO_RANGE = 46;
export const WEAPON = {
  sword:   { range:1.0,  dmg:1.15, cd:1.0,  name:'검',        scale:1.55 },
  bow:     { range:2.4,  dmg:0.85, cd:1.05, name:'활',        scale:1.45 },
  halberd: { range:1.55, dmg:1.0,  cd:1.12, name:'방천화극',  scale:1.6 }
};
export const HERO_SPD = 152;
export const HERO_HP = 100;
export const HERO_REGEN = 6;            // 초당 회복(주변에 적이 없을 때)
export const RESPAWN_BASE = 8;          // 부활 시간(초) — 일차가 지날수록 증가
/* 부활 직후 무적 — 이게 없으면 되살아나는 순간 옆에 있던 적에게 바로 또 맞아
   죽고, 죽고, 죽는 늪에 빠집니다. 되살아난 사람에게 숨 돌릴 틈을 줍니다. */
export const RESPAWN_INVULN = 1.6;
export const GATHER_RANGE = 58;        // 가까이만 가면 캐지도록 넉넉하게

/* 건설 가능 범위 — 장수 주변에만 지을 수 있습니다.
   이게 있어야 "어디에 지을 수 있는지"를 화면에 그려 보여줄 수 있고,
   장수의 위치가 전략적 의미를 갖습니다. 넉넉하게 7칸. */
export const BUILD_RANGE = 7 * 28;

/* ---------- 회피 (컨트롤로 극복하는 핵심 장치) ---------- */
export const DODGE_DIST = 130;          // 구르는 거리
export const DODGE_TIME = 0.28;         // 구르는 시간(초)
export const DODGE_INVULN = 0.38;       // 무적 시간(초) — 구르는 시간보다 살짝 깁니다
export const DODGE_CD = 1.1;            // 재사용 대기

/* ---------- 적 공격 예비 동작 ----------
   몬스터가 곧바로 때리지 않고 0.45초 동안 팔을 치켜듭니다.
   그 사이에 구르면 피해집니다. 이게 없으면 회피가 의미를 잃습니다. */
export const MONSTER_WINDUP = 0.45;
export const MONSTER_WINDUP_BOSS = 0.7;

/* ---------- 타격감 ---------- */
/* ---------- 치명타 ---------- */
export const CRIT_CHANCE = 0.12;
export const CRIT_MUL = 1.9;

export const KNOCKBACK = 90;            // 맞았을 때 밀려나는 세기
export const KNOCKBACK_SKILL = 210;
export const HITSTOP = 0.055;           // 맞는 순간 잠깐 멈추는 시간

/* ---------- 병사 ---------- */
export const SOLDIER_HP = 110;
export const SOLDIER_ATK = 10;
export const SOLDIER_CD = 0.9;
export const SOLDIER_RANGE = 36;
export const SOLDIER_CARRY = 8;
export const SOLDIER_DOWN_SEC = 15;     // 부상 후 복귀까지
export const SOLDIER_COST = { wood: 10, stone: 5 };

/* ---------- 용병 ----------
   병사는 자원으로 고용하고 병영 한도에 묶입니다.
   용병은 '옥새 조각'으로 고용하고 한도가 없는 대신 계약 일수가 지나면 떠납니다.
   → 급할 때 즉시 머릿수를 늘리는 수단이자, 옥새 조각을 쓰는 곳이 됩니다. */
export const MERC_CONTRACT_DAYS = 18;   // 계약 기간(일)
export const MERCS = [
  { id:'gatherer', name:'채집 용병', icon:'🧺', cost:6,
    hp:90, atk:5, gather:4.2, carry:14, role:'wood',
    desc:'싸우지 않고 자원만 캡니다. 병사보다 두 배 빠르고 한 번에 더 많이 나릅니다.',
    tip:'낮이 짧게 느껴진다면 이 용병부터 뽑으세요.' },
  { id:'archer', name:'궁수 용병', icon:'🏹', cost:10,
    hp:95, atk:16, range:120, cd:1.0, gather:1.6, carry:8, role:'def',
    desc:'멀리서 화살을 쏩니다. 목책 뒤에 세워두면 안전하게 싸웁니다.',
    tip:'길목을 좁힌 뒤 그 뒤에 배치하는 게 가장 효율적입니다.' },
  { id:'shield', name:'방패 용병', icon:'🛡️', cost:12,
    hp:260, atk:12, cd:0.9, gather:1.4, carry:8, role:'def', armor:0.35,
    desc:'체력이 매우 높고 받는 피해가 35% 줄어듭니다. 적을 자기 쪽으로 붙잡아 둡니다.',
    tip:'방패병이 몰려오는 55일·88일에 특히 값어치를 합니다.' }
];

/* ---------- 타일 점유 상태 ---------- */
export const OCC_EMPTY = 0, OCC_NODE = 1, OCC_BASE = 2;
export const OCC_WALL = 3, OCC_TRAP = 4, OCC_STRUCT = 5;

/* ---------- 장수 3종 (명성 시스템) ---------- */
export const GENERALS = [
  { id:'yohwa', name:'요화', grade:'일반', free:true, color:'#9aa7b0', accent:'#c9d3da',
    combat:1.00, startRes:1.30, waveMul:0.90, lateGrow:0.30,
    tag:'대기만성형 · 검',
    weapon:'sword',
    desc:'검을 쓰는 방패잡이. 초반이 고된 대신 시작 자원이 가장 많고, 22일차부터 공격력이 30% 오릅니다.',
    skill:'대기만성 — 22일차부터 공격력 +30%',
    skills:[
      { key:'Q', name:'참격', cd:6, desc:'전방을 크게 베어 여러 적을 한 번에 밀쳐냅니다',
        type:'arc', range:1.7, arc:2.1, dmg:2.2, knock:1.0 },
      { key:'E', name:'철벽', cd:16, desc:'4초간 받는 피해가 60% 줄고 주변 적을 끌어당깁니다',
        type:'guard', dur:4, reduce:0.6 }
    ] },
  { id:'taesaja', name:'태사자', grade:'희귀', free:true, color:'#5B8FC7', accent:'#8fb8e0',
    combat:1.10, startRes:1.15, waveMul:0.95, lateGrow:0.20,
    tag:'균형형 · 활',
    weapon:'bow',
    desc:'활을 쓰는 명궁. 멀리서 안전하게 싸울 수 있습니다. 처음 잡아보기에 가장 편한 장수.',
    skill:'강궁 — 공격 사거리 +30%',
    skills:[
      { key:'Q', name:'연사', cd:6, desc:'화살 3발을 빠르게 쏩니다',
        type:'multi', shots:3, dmg:0.9, interval:0.12 },
      { key:'E', name:'관통사', cd:16, desc:'직선상의 모든 적을 꿰뚫는 강력한 일격',
        type:'pierce', range:4.2, width:0.55, dmg:3.4 }
    ] },
  { id:'yeopo', name:'여포', grade:'전설', free:true, color:'#E08B3C', accent:'#f0b878',
    combat:1.40, startRes:0.85, waveMul:1.15, lateGrow:0.00,
    tag:'초반 압도형 · 방천화극',
    weapon:'halberd',
    desc:'방천화극을 든 최강의 무장. 초반 전투력이 압도적이지만 시작 자원이 적고 몬스터가 15% 더 강하게 몰려옵니다.',
    skill:'무쌍 — 공격 속도 +25%',
    skills:[
      { key:'Q', name:'회선', cd:6, desc:'제자리에서 360도 휘둘러 주변을 전부 쓸어버립니다',
        type:'spin', range:1.9, dmg:2.0, knock:1.2 },
      { key:'E', name:'무쌍난무', cd:16, desc:'4초간 공격 속도와 이동 속도가 크게 오릅니다',
        type:'frenzy', dur:4, atkSpd:0.45, moveSpd:1.35 }
    ] },

  /* ── 아래 셋은 가챠로 뽑아야 열립니다 (출전 후보 확장) ── */
  { id:'hahudon', name:'하후돈', grade:'영웅', color:'#9B6FC9', accent:'#c3a3e8',
    combat:1.18, startRes:1.05, waveMul:1.0, lateGrow:0.12,
    tag:'흡혈형 · 검', weapon:'sword',
    desc:'때릴 때마다 체력을 조금씩 되찾습니다. 오래 버티는 싸움에 강합니다.',
    skill:'발형 — 타격 시 피해의 12%를 회복',
    lifesteal: 0.12,
    skills:[
      { key:'Q', name:'혈전', cd:6, desc:'전방을 베며 회복량이 크게 늘어납니다',
        type:'arc', range:1.6, arc:2.0, dmg:2.0, knock:0.8 },
      { key:'E', name:'불굴', cd:16, desc:'5초간 받는 피해가 절반이 되고 회복이 두 배',
        type:'guard', dur:5, reduce:0.5 }
    ] },
  { id:'hwangchung', name:'황충', grade:'영웅', color:'#5FAE72', accent:'#9fdcae',
    combat:1.15, startRes:1.0, waveMul:1.0, lateGrow:0.18,
    tag:'명중형 · 활', weapon:'bow',
    desc:'노장의 활 솜씨. 치명타가 자주 터집니다.',
    skill:'백발백중 — 치명타 확률 +18%',
    critBonus: 0.18,
    skills:[
      { key:'Q', name:'속사', cd:6, desc:'화살 4발을 연달아 쏩니다',
        type:'multi', shots:4, dmg:0.85, interval:0.1 },
      { key:'E', name:'천지사', cd:16, desc:'직선상의 모든 적을 꿰뚫는 강력한 일격',
        type:'pierce', range:4.6, width:0.6, dmg:3.8 }
    ] },
  { id:'gwanwoo', name:'관우', grade:'전설', color:'#C6412F', accent:'#f09a86',
    combat:1.35, startRes:0.9, waveMul:1.1, lateGrow:0.05,
    tag:'광역형 · 청룡언월도', weapon:'halberd',
    desc:'청룡언월도를 든 무신. 한 번에 여러 적을 쓸어버립니다.',
    skill:'위압 — 주변 적의 이동 속도 20% 감소',
    slowAura: 0.2,
    skills:[
      { key:'Q', name:'월참', cd:6, desc:'반달 모양으로 크게 베어 넘깁니다',
        type:'arc', range:2.1, arc:2.6, dmg:2.4, knock:1.1 },
      { key:'E', name:'청룡강림', cd:16, desc:'제자리에서 두 바퀴 휘둘러 주변을 쓸어버립니다',
        type:'spin', range:2.3, dmg:2.6, knock:1.4 }
    ] }
];

/** 기본 제공 장수 (가챠 없이 바로 쓸 수 있는 장수) */
export const FREE_HEROES = GENERALS.filter(g => g.free).map(g => g.id);

/* ---------- 몬스터 종류 ----------
   같은 방어가 모든 적에게 통하면 전략이 사라집니다.
   기병은 함정을 빨리 지나가고, 방패병은 목책을 오래 두드립니다. */
export const MONSTER_KINDS = {
  normal: { name:'졸개',   hpMul:1.0, spdMul:1.0,  dmgMul:1.0, armor:0,    scale:1.0,  color:0xE0554A },
  fast:   { name:'기병',   hpMul:0.7, spdMul:1.5,  dmgMul:0.9, armor:0,    scale:0.92, color:0xE08B3C },
  tank:   { name:'방패병', hpMul:2.3, spdMul:0.68, dmgMul:1.2, armor:0.30, scale:1.28, color:0x7D8A96 },
  elite:  { name:'정예',   hpMul:3.2, spdMul:0.95, dmgMul:1.6, armor:0.15, scale:1.38, color:0x9B6FC9 }
};

/* ---------- 웨이브 (99일 · 11일마다 9회) ----------
   mix 는 [종류, 비율] 목록입니다. 비율의 합은 1 이 되게 적습니다. */
export const WAVES = [
  { day:11, act:1, name:'황건적의 습격', note:'튜토리얼 웨이브 · 소수 약체',
    count:10, hp:34, spd:70, dmg:6, sides:1,
    mix:[['normal',1]],
    advice:'성벽이 없어도 막을 수 있는 웨이브입니다. 다음 22일은 다릅니다 — 지금 목책을 세우세요.' },
  { day:22, act:1, name:'산적 무리', note:'다수 약체 · 성벽의 필요성을 배우는 구간',
    count:18, hp:46, spd:78, dmg:8, sides:2,
    mix:[['normal',1]],
    advice:'함정 처치 비율이 30% 아래라면 배치가 잘못된 겁니다. 목책으로 길을 좁히고 그 길목에 함정을 까세요.' },
  { day:33, act:1, name:'산적 두목', note:'1막 보스 · 함정의 가치를 배우는 구간',
    count:20, hp:56, spd:85, dmg:10, sides:2,
    mix:[['normal',0.8],['fast',0.2]],
    boss:{ hp:600, dmg:22, spd:55, name:'산적 두목' },
    advice:'보스는 체력이 높습니다. 함정 위를 오래 걷게 만드는 쪽이 정면으로 때리는 쪽보다 효율이 큽니다.' },

  { day:44, act:2, name:'오환 기병대', note:'2막 시작 · 빠른 적이 처음 등장합니다',
    count:22, hp:62, spd:92, dmg:12, sides:2,
    mix:[['normal',0.45],['fast',0.55]],
    advice:'기병은 함정을 금방 빠져나갑니다. 함정 한 칸보다 두세 칸을 잇는 쪽이 낫습니다.' },
  { day:55, act:2, name:'남만 상군', note:'단단한 방패병 · 목책이 오래 버텨야 합니다',
    count:24, hp:78, spd:74, dmg:14, sides:3,
    mix:[['normal',0.5],['tank',0.5]],
    advice:'방패병은 목책을 오래 두드립니다. 성을 석성 이상으로 올리고 병사를 길목에 세우세요.' },
  { day:66, act:2, name:'맹획', note:'2막 보스 · 세 방향 동시 공격',
    count:26, hp:88, spd:82, dmg:15, sides:3,
    mix:[['normal',0.4],['fast',0.3],['tank',0.3]],
    boss:{ hp:1500, dmg:30, spd:52, name:'맹획' },
    advice:'세 방향을 한 사람이 다 막을 수는 없습니다. 병사와 용병에게 길목 하나씩을 맡기세요.' },

  { day:77, act:3, name:'위군 선봉', note:'3막 시작 · 정예가 섞여 들어옵니다',
    count:30, hp:105, spd:88, dmg:17, sides:3,
    mix:[['normal',0.4],['fast',0.25],['tank',0.25],['elite',0.1]],
    advice:'정예 한 마리가 졸개 셋보다 아픕니다. 회피로 예비 동작을 흘리고 스킬로 끊으세요.' },
  { day:88, act:3, name:'조조의 정예', note:'사방에서 몰려옵니다',
    count:32, hp:120, spd:90, dmg:18, sides:4,
    mix:[['normal',0.4],['fast',0.25],['tank',0.2],['elite',0.15]],
    advice:'네 방향입니다. 철옹성의 망루가 없으면 손이 모자랍니다.' },
  { day:99, act:3, name:'최후의 대란', note:'최종 보스 · 99일의 끝',
    count:36, hp:140, spd:90, dmg:20, sides:4,
    mix:[['normal',0.35],['fast',0.25],['tank',0.2],['elite',0.2]],
    boss:{ hp:2300, dmg:34, spd:58, name:'여포(적)' },
    advice:'마지막입니다. 치유약을 아끼지 말고, 보스는 함정 위로 끌어들이세요.' }
];

/* ---------- 건설 ---------- */
export const BUILDS = [
  { id:'wall',  name:'목책',     icon:'🧱', cost:{ wood:8 }, hp:130,
    desc:'몬스터 경로를 막습니다. 장수와 병사는 넘어다닐 수 있습니다.' },
  { id:'trap',  name:'가시함정', icon:'🔻', cost:{ wood:5, stone:10 }, dur:200,
    desc:'밟고 지나가는 몬스터를 크게 늦추고 지속 피해를 줍니다.' },
  { id:'camp',  name:'병영',     icon:'⛺', cost:{ wood:25, stone:15 },
    desc:'병사 고용 한도 +1. 반복 노동을 병사에게 위임하세요.' },
  { id:'forge', name:'대장간',   icon:'🔨', cost:{ wood:30, stone:25 }, once:true,
    desc:'제작소가 열립니다. 돌 곡괭이·무기 강화 제작.' }
];

export const TRAP_DPS = 42;
export const TRAP_DPS_STEEL = 1.7;      // 강철 가시를 만들면 곱해지는 값
export const TRAP_DUR_STEEL = 1.6;
export const TRAP_SLOW = 0.45;          // 함정 위 이동 속도 배율
export const TRAP_WEAR = 7;             // 초당 내구도 감소
export const WALL_DMG_MUL = 1.6;        // 몬스터가 목책을 때릴 때의 피해 배율

/* ---------- 제작 ---------- */
/* ---------- 장비 제작 ----------
   need: 먼저 만들어야 하는 것. 순서가 있어야 "목표가 생기는" 느낌이 납니다. */
export const CRAFTS = [
  { id:'pickaxe', name:'돌 곡괭이', icon:'⛏️', cost:{ wood:10, stone:15 }, group:'도구',
    desc:'철광을 캘 수 있게 됩니다. 이게 없으면 지도 중앙의 철광은 그냥 돌덩이입니다.',
    effect:'철 채굴 개방' },
  { id:'ironpick', name:'철 곡괭이', icon:'⚒️', cost:{ iron:5, wood:10 }, group:'도구', need:'pickaxe',
    desc:'모든 자원을 훨씬 빨리 캡니다.',
    effect:'채집 속도 +60%' },
  { id:'huntknife', name:'사냥용 칼', icon:'🔪', cost:{ iron:3, wood:5 }, group:'도구',
    desc:'몬스터에게서 가죽을 두 배로 얻습니다.',
    effect:'가죽 획득 2배' },
  { id:'torch', name:'횃불', icon:'🔥', cost:{ wood:3, herb:2 }, group:'도구',
    desc:'밤에 보이는 범위가 넓어집니다.',
    effect:'야간 시야 +60%' },

  { id:'weapon',  name:'무기 강화', icon:'⚔️', cost:{ iron:5 }, max:6, group:'전투',
    desc:'공격력이 오릅니다. 여섯 번까지 강화할 수 있고, 단계가 오를수록 철이 더 듭니다.',
    effect:'공격력 +25% (누적, 최대 +150%)' },
  { id:'leather', name:'가죽 갑옷', icon:'🦺', cost:{ hide:8, wood:5 }, group:'전투',
    desc:'최대 체력이 늘어납니다.',
    effect:'최대 체력 +40' },
  { id:'ironmail', name:'철 갑옷', icon:'🛡️', cost:{ iron:10, hide:5 }, group:'전투', need:'leather',
    desc:'받는 피해가 줄어듭니다.',
    effect:'받는 피해 -20%' },
  /* ── 3막 장비 ──
     후반 웨이브를 넘으려면 후반에도 성장할 거리가 있어야 합니다.
     자동 시뮬레이션으로 재보니, 이 셋이 없으면 잘 준비해도 88일에서 막혔습니다. */
  { id:'steelspike', name:'강철 가시', icon:'🗡️', cost:{ iron:20, stone:30 }, group:'3막 장비', need:'ironmail',
    desc:'모든 가시함정의 피해와 내구도가 크게 오릅니다. 이미 깔아둔 함정에도 적용됩니다.',
    effect:'함정 피해 +70% · 내구도 +60%' },
  { id:'towerup', name:'망루 강화', icon:'🏹', cost:{ iron:25, wood:40 }, group:'3막 장비', need:'steelspike',
    desc:'철옹성 망루의 공격력이 두 배가 되고 더 빨리 쏩니다. 성 3단계가 필요합니다.',
    effect:'망루 피해 2배 · 발사 속도 +40%' },
  { id:'banner', name:'군기(軍旗)', icon:'🚩', cost:{ hide:20, iron:15 }, group:'3막 장비', need:'towerup',
    desc:'병사와 용병의 공격력과 체력이 함께 오릅니다. 머릿수가 힘이 되는 시점입니다.',
    effect:'병사·용병 공격 +50% · 체력 +40%' },

  { id:'potion', name:'치유약', icon:'🧪', cost:{ herb:5 }, group:'소모품', stack:true,
    desc:'즉시 체력을 회복합니다. 여러 개 만들어 둘 수 있습니다. (H 키)',
    effect:'체력 50 회복' }
];
export const POTION_HEAL = 50;

/* ---------- 성(거점) 업그레이드 ---------- */
export const BASE_LEVELS = [
  { lv:1, name:'토성',   maxHp:1300, cost:null,
    desc:'흙과 돌로 쌓은 기본 거점입니다.' },
  { lv:2, name:'석성',   maxHp:1900, cost:{ stone:60, wood:40 },
    desc:'성벽이 높아지고 체력이 크게 늘어납니다.' },
  { lv:3, name:'철옹성', maxHp:3200, cost:{ stone:120, iron:30 },
    desc:'망루에서 다가오는 적을 자동으로 공격합니다. 3막을 버티려면 반드시 필요합니다.' }
];
export const BASE_TOWER_DMG = 14;       // 3단계 망루의 자동 공격
export const BASE_TOWER_CD = 1.4;
export const TOWER_UP_DMG = 2.0;        // 망루 강화
export const TOWER_UP_CD = 0.6;
export const BANNER_ATK = 1.5;          // 군기 — 병사·용병 공격
export const BANNER_HP = 1.4;
export const BASE_TOWER_RANGE = 8 * 28;

/* ---------- 자원 ----------
   채집형 4종 + 전리품 1종. "무엇을 캐야 하는가"가 분명해야 재미가 생깁니다. */
export const RESOURCES = {
  wood:  { name:'목재', icon:'🪵', color:'#a9773f',
           from:'들판의 나무 옆에 서 있으면 자동으로 모입니다',
           use:'모든 건설의 기본. 목책·병영·대장간' },
  stone: { name:'석재', icon:'🪨', color:'#9e9c95',
           from:'들판의 바위에서 캡니다',
           use:'가시함정·대장간·성 업그레이드' },
  iron:  { name:'철', icon:'⛓️', color:'#c98a4b',
           from:'지도 한가운데 철광에서. 돌 곡괭이가 있어야 캘 수 있습니다',
           use:'무기 강화·철 갑옷·성 3단계' },
  herb:  { name:'약초', icon:'🌿', color:'#6fbf7a',
           from:'들판 곳곳에 자랍니다. 도구 없이 캘 수 있습니다',
           use:'치유약·횃불' },
  hide:  { name:'가죽', icon:'🟤', color:'#8a5a3b',
           from:'몬스터를 처치하면 나옵니다. 사냥용 칼이 있으면 두 배',
           use:'가죽 갑옷·철 갑옷' }
};
export const NODE_MAX = { wood:26, stone:22, iron:16, herb:10 };
export const GATHER_RATE = { wood:4, stone:3, iron:2, herb:5 };   // 장수 채집 속도(초당)
export const SOLDIER_GATHER_RATE = 2.2;
export const NODE_REGROW_SEC = 24;
export const HIDE_PER_KILL = 1;         // 몬스터 처치 시 가죽

/* ---------- 뽑기 · 재화 ----------
   ※ 프로토타입입니다. 실제 결제는 일어나지 않고, 보석은 버튼으로 모의 지급됩니다.
   ※ 한국에서 확률형 아이템은 확률 전체 공개가 법적 의무입니다(게임산업법 제33조).
     그래서 확률표를 상점 화면에 항상 띄우고, 이 배열이 그 표의 원본입니다. */
export const GACHA_COST_SHARD = 10;     // 옥새 조각 1회
export const GACHA_COST_GEM = 30;       // 보석 1회
export const GACHA_COST_GEM10 = 270;    // 보석 10연차 (1회분 할인)
export const GACHA_PITY = 90;           // 천장 — 이 횟수까지 전설 이상이 없으면 확정
export const GACHA_PITY_HARD = 180;     // 신화 확정
export const GEM_PACKS = [
  { id:'p1', gem:60,   price:'₩1,200',  bonus:0,   tag:'' },
  { id:'p2', gem:330,  price:'₩6,500',  bonus:30,  tag:'보너스 +10%' },
  { id:'p3', gem:1200, price:'₩22,000', bonus:200, tag:'인기' },
  { id:'p4', gem:3000, price:'₩49,000', bonus:700, tag:'최대 혜택' }
];
export const GEM_FREE_DAILY = 30;       // 하루 한 번 무료 보석

/* ---------- 보상 ---------- */
export const WAVE_SHARD = [15, 25, 40, 50, 60, 80, 95, 115, 150];
export const OBJECTIVE_SHARD = 3;
export const WIN_SHARD = 30, LOSE_SHARD = 10;

/* ---------- 성능 예산 (검수 기준) ----------
   ※ 처음 잡은 120은 그림자를 켜기 전의 숫자였습니다.
     그림자는 물체를 한 번 더 그리므로 draw call 이 대략 두 배가 됩니다.
     실제로 재보고 두 경로를 따로 적습니다.

   최악 장면 = 33일 밤 + 몬스터 21 + 목책 25 + 함정 10 + 나무 120 + 시설 + 미니맵 */
export const BUDGET = {
  // 저사양·모바일 (그림자·후처리 자동 OFF) — 측정값 105
  lowSpec:  { drawCalls: 120, triangles: 60000 },
  // 일반 PC (그림자·빛번짐 ON) — 측정값 201
  highSpec: { drawCalls: 260, triangles: 120000 },
  minFps: 30
};
