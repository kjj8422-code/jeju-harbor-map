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
export const DAY_SEC = 7;               // 하루 길이(초)
export const TOTAL_DAYS = 33;           // 1막 = 1~33일
export const WARN_SEC = 5;              // 웨이브 예고 시간

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
  sword:   { range:1.0,  dmg:1.15, cd:1.0,  name:'검' },
  bow:     { range:2.4,  dmg:0.85, cd:1.05, name:'활' },
  halberd: { range:1.55, dmg:1.0,  cd:1.12, name:'방천화극' }
};
export const HERO_SPD = 152;
export const HERO_HP = 100;
export const HERO_REGEN = 6;            // 초당 회복(주변에 적이 없을 때)
export const RESPAWN_BASE = 8;          // 부활 시간(초) — 일차가 지날수록 증가
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

/* ---------- 타일 점유 상태 ---------- */
export const OCC_EMPTY = 0, OCC_NODE = 1, OCC_BASE = 2;
export const OCC_WALL = 3, OCC_TRAP = 4, OCC_STRUCT = 5;

/* ---------- 장수 3종 (명성 시스템) ---------- */
export const GENERALS = [
  { id:'yohwa', name:'요화', grade:'일반', color:'#9aa7b0', accent:'#c9d3da',
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
  { id:'taesaja', name:'태사자', grade:'희귀', color:'#5B8FC7', accent:'#8fb8e0',
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
  { id:'yeopo', name:'여포', grade:'전설', color:'#E08B3C', accent:'#f0b878',
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
    ] }
];

/* ---------- 웨이브 (1막 3회) ---------- */
export const WAVES = [
  { day:11, name:'황건적의 습격', note:'튜토리얼 웨이브 · 소수 약체',
    count:10, hp:34, spd:70, dmg:6, sides:1,
    advice:'성벽이 없어도 막을 수 있는 웨이브입니다. 다음 22일은 다릅니다 — 지금 목책을 세우세요.' },
  { day:22, name:'산적 무리', note:'다수 약체 · 성벽의 필요성을 배우는 구간',
    count:18, hp:46, spd:78, dmg:8, sides:2,
    advice:'함정 처치 비율이 30% 아래라면 배치가 잘못된 겁니다. 목책으로 길을 좁히고 그 길목에 함정을 까세요.' },
  { day:33, name:'산적 두목', note:'1막 보스 · 함정의 가치를 배우는 구간',
    count:20, hp:56, spd:85, dmg:10, sides:2,
    boss:{ hp:600, dmg:22, spd:55 },
    advice:'보스는 체력이 높습니다. 함정 위를 오래 걷게 만드는 쪽이 정면으로 때리는 쪽보다 효율이 큽니다.' }
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
export const TRAP_SLOW = 0.45;          // 함정 위 이동 속도 배율
export const TRAP_WEAR = 7;             // 초당 내구도 감소
export const WALL_DMG_MUL = 1.6;        // 몬스터가 목책을 때릴 때의 피해 배율

/* ---------- 제작 ---------- */
export const CRAFTS = [
  { id:'pickaxe', name:'돌 곡괭이', icon:'⛏️', cost:{ wood:10, stone:15 },
    desc:'철광을 캘 수 있게 됩니다. 이게 없으면 지도 중앙의 철광은 그냥 돌덩이입니다.' },
  { id:'weapon',  name:'무기 강화', icon:'⚔️', cost:{ iron:5 }, max:3,
    desc:'공격력 +25%. 최대 3회까지 강화할 수 있습니다.' }
];

/* ---------- 자원 ---------- */
export const NODE_MAX = { wood:26, stone:22, iron:16 };
export const GATHER_RATE = { wood:4, stone:3, iron:2 };   // 장수 채집 속도(초당)
export const SOLDIER_GATHER_RATE = 2.2;
export const NODE_REGROW_SEC = 24;

/* ---------- 보상 ---------- */
export const WAVE_SHARD = [15, 25, 40];
export const OBJECTIVE_SHARD = 3;
export const WIN_SHARD = 30, LOSE_SHARD = 10;

/* ---------- 성능 예산 (검수 기준) ---------- */
export const BUDGET = { drawCalls: 120, triangles: 150000, minFps: 30 };
