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
export const HERO_SPD = 152;
export const HERO_HP = 100;
export const HERO_REGEN = 6;            // 초당 회복(주변에 적이 없을 때)
export const RESPAWN_BASE = 8;          // 부활 시간(초) — 일차가 지날수록 증가
export const GATHER_RANGE = 34;

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
    tag:'대기만성형',
    desc:'초반이 가장 고된 대신 시작 자원이 가장 많고, 22일차 이후 공격력이 30% 오릅니다.',
    skill:'대기만성 — 22일차부터 공격력 +30%' },
  { id:'taesaja', name:'태사자', grade:'희귀', color:'#5B8FC7', accent:'#8fb8e0',
    combat:1.10, startRes:1.15, waveMul:0.95, lateGrow:0.20,
    tag:'균형형',
    desc:'모든 수치가 무난합니다. 처음 잡아보기에 가장 편한 장수.',
    skill:'강궁 — 공격 사거리 +30%' },
  { id:'yeopo', name:'여포', grade:'전설', color:'#E08B3C', accent:'#f0b878',
    combat:1.40, startRes:0.85, waveMul:1.15, lateGrow:0.00,
    tag:'초반 압도형',
    desc:'초반 전투력이 압도적입니다. 대신 시작 자원이 적고 몬스터가 15% 더 강하게 몰려옵니다.',
    skill:'무쌍 — 공격 속도 +25%' }
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
