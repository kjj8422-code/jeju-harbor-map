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

/* ---------- 적 공격 예비 동작 ----------
   몬스터가 곧바로 때리지 않고 0.45초 동안 팔을 치켜듭니다.
   ★ 구르기(회피)는 뺐습니다. 대신 그 사이에 **걸어서 사거리 밖으로 나가면** 빗나갑니다.
     붉은 원이 차오를 때 뒤로 물러서는 것이 이 게임의 기본 방어입니다.
     급하면 궁극기(Space)의 무적 순간으로 흘려도 됩니다. */
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
    /* 외형 — 3D 장수와 도감 초상이 같은 데이터를 읽습니다.
       삼국지 인물의 잘 알려진 특징을 한두 개씩만 잡았습니다. */
    look: { helm:'plain', armor:'scale', shield:true, beard:'short', cape:0.9,
            skin:'#e8c9a0', hair:'#2b2118', cloth:'#6c6a63',
            note:'수수한 찰갑과 큰 방패 — 버티는 장수' },
    skills:[
      { key:'Q', name:'참격', cd:6, desc:'전방을 크게 베어 여러 적을 한 번에 밀쳐냅니다',
        type:'arc', range:1.7, arc:2.1, dmg:2.2, knock:1.0 },
      { key:'E', name:'철벽', cd:16, desc:'4초간 받는 피해가 60% 줄고 주변 적을 끌어당깁니다',
        type:'guard', dur:4, reduce:0.6 },
      { key:'Space', name:'천지개벽', cd:30, ult:true,
        desc:'땅을 내리쳐 주변을 전부 쓸어버리고, 그동안 무적입니다',
        type:'spin', range:3.2, dmg:5.5, knock:2.0, invuln:1.3 }
    ] },
  { id:'taesaja', name:'태사자', grade:'희귀', free:true, color:'#5B8FC7', accent:'#8fb8e0',
    combat:1.10, startRes:1.15, waveMul:0.95, lateGrow:0.20,
    tag:'균형형 · 활',
    weapon:'bow',
    desc:'활을 쓰는 명궁. 멀리서 안전하게 싸울 수 있습니다. 처음 잡아보기에 가장 편한 장수.',
    skill:'강궁 — 공격 사거리 +30%',
    look: { helm:'cap', armor:'light', quiver:true, beard:'short', cape:0.85,
            skin:'#e8c9a0', hair:'#241d16', cloth:'#3f5f86',
            note:'가벼운 가죽 갑옷과 등에 멘 화살통 — 움직이는 궁수' },
    skills:[
      { key:'Q', name:'연사', cd:6, desc:'화살 3발을 빠르게 쏩니다',
        type:'multi', shots:3, dmg:0.9, interval:0.12 },
      { key:'E', name:'관통사', cd:16, desc:'직선상의 모든 적을 꿰뚫는 강력한 일격',
        type:'pierce', range:4.2, width:0.55, dmg:3.4 },
      { key:'Space', name:'만궁', cd:30, ult:true,
        desc:'하늘을 덮는 화살비. 쏘는 동안 무적입니다',
        type:'multi', shots:14, dmg:1.15, interval:0.06, invuln:1.3 }
    ] },
  { id:'yeopo', name:'여포', grade:'전설', free:true, color:'#E08B3C', accent:'#f0b878',
    combat:1.40, startRes:0.85, waveMul:1.15, lateGrow:0.00,
    tag:'초반 압도형 · 방천화극',
    weapon:'halberd',
    desc:'방천화극을 든 최강의 무장. 초반 전투력이 압도적이지만 시작 자원이 적고 몬스터가 15% 더 강하게 몰려옵니다.',
    skill:'무쌍 — 공격 속도 +25%',
    look: { helm:'horned', armor:'heavy', shoulder:true, beard:'short', cape:1.35,
            skin:'#e5c298', hair:'#1e1712', cloth:'#8a4c18',
            note:'꿩깃을 꽂은 뿔 투구와 긴 망토 — 삼국 제일의 무장' },
    skills:[
      { key:'Q', name:'회선', cd:6, desc:'제자리에서 360도 휘둘러 주변을 전부 쓸어버립니다',
        type:'spin', range:1.9, dmg:2.0, knock:1.2 },
      { key:'E', name:'무쌍난무', cd:16, desc:'4초간 공격 속도와 이동 속도가 크게 오릅니다',
        type:'frenzy', dur:4, atkSpd:0.45, moveSpd:1.35 },
      { key:'Space', name:'무신강림', cd:30, ult:true,
        desc:'방천화극을 크게 돌려 주변을 초토화합니다. 그동안 무적입니다',
        type:'spin', range:3.6, dmg:6.5, knock:2.4, invuln:1.4 }
    ] },

  /* ── 아래 셋은 가챠로 뽑아야 열립니다 (출전 후보 확장) ── */
  { id:'hahudon', name:'하후돈', grade:'영웅', color:'#9B6FC9', accent:'#c3a3e8',
    combat:1.18, startRes:1.05, waveMul:1.0, lateGrow:0.12,
    tag:'흡혈형 · 검', weapon:'sword',
    desc:'때릴 때마다 체력을 조금씩 되찾습니다. 오래 버티는 싸움에 강합니다.',
    skill:'발형 — 타격 시 피해의 12%를 회복',
    lifesteal: 0.12,
    look: { helm:'crest', armor:'heavy', eyepatch:true, shoulder:true, beard:'short', cape:1.0,
            skin:'#e2bf95', hair:'#1b1510', cloth:'#5a3f7a',
            note:'한쪽 눈을 잃고도 싸운 장수 — 검은 안대' },
    skills:[
      { key:'Q', name:'혈전', cd:6, desc:'전방을 베며 회복량이 크게 늘어납니다',
        type:'arc', range:1.6, arc:2.0, dmg:2.0, knock:0.8 },
      { key:'E', name:'불굴', cd:16, desc:'5초간 받는 피해가 절반이 되고 회복이 두 배',
        type:'guard', dur:5, reduce:0.5 },
      { key:'Space', name:'혈해', cd:30, ult:true,
        desc:'주변을 베어 넘기고 입힌 피해의 절반을 회복합니다. 그동안 무적입니다',
        type:'spin', range:3.0, dmg:5.0, knock:1.8, invuln:1.3, lifesteal:0.5 }
    ] },
  { id:'hwangchung', name:'황충', grade:'영웅', color:'#5FAE72', accent:'#9fdcae',
    combat:1.15, startRes:1.0, waveMul:1.0, lateGrow:0.18,
    tag:'명중형 · 활', weapon:'bow',
    desc:'노장의 활 솜씨. 치명타가 자주 터집니다.',
    skill:'백발백중 — 치명타 확률 +18%',
    critBonus: 0.18,
    look: { helm:'cap', armor:'scale', quiver:true, beard:'white', cape:0.9,
            skin:'#dfbc93', hair:'#d8d2c4', cloth:'#3f6b4c',
            note:'흰 수염의 노장 — 나이를 무색하게 하는 활 솜씨' },
    skills:[
      { key:'Q', name:'속사', cd:6, desc:'화살 4발을 연달아 쏩니다',
        type:'multi', shots:4, dmg:0.85, interval:0.1 },
      { key:'E', name:'천지사', cd:16, desc:'직선상의 모든 적을 꿰뚫는 강력한 일격',
        type:'pierce', range:4.6, width:0.6, dmg:3.8 },
      { key:'Space', name:'백보천양', cd:30, ult:true,
        desc:'화살 한 발로 직선상의 모든 것을 꿰뚫습니다. 쏘는 동안 무적입니다',
        type:'pierce', range:8.0, width:1.1, dmg:9.0, invuln:1.2 }
    ] },
  { id:'gwanwoo', name:'관우', grade:'전설', color:'#C6412F', accent:'#f09a86',
    combat:1.35, startRes:0.9, waveMul:1.1, lateGrow:0.05,
    tag:'광역형 · 청룡언월도', weapon:'halberd',
    desc:'청룡언월도를 든 무신. 한 번에 여러 적을 쓸어버립니다.',
    skill:'위압 — 주변 적의 이동 속도 20% 감소',
    slowAura: 0.2,
    look: { helm:'hood', armor:'scale', beard:'long', cape:1.25,
            skin:'#c98a6a', hair:'#17120e', cloth:'#2f6b4a',
            note:'붉은 얼굴과 다섯 자 수염, 녹색 전포 — 미염공(美髥公)' },
    skills:[
      { key:'Q', name:'월참', cd:6, desc:'반달 모양으로 크게 베어 넘깁니다',
        type:'arc', range:2.1, arc:2.6, dmg:2.4, knock:1.1 },
      { key:'E', name:'청룡강림', cd:16, desc:'제자리에서 두 바퀴 휘둘러 주변을 쓸어버립니다',
        type:'spin', range:2.3, dmg:2.6, knock:1.4 },
      { key:'Space', name:'청룡참', cd:30, ult:true,
        desc:'청룡언월도로 반원을 크게 가릅니다. 그동안 무적입니다',
        type:'arc', range:3.4, arc:3.2, dmg:6.5, knock:2.2, invuln:1.3 }
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
    advice:'아직은 장수 혼자서도 거의 다 잡힙니다 — 그래서 함정 처치 비율이 낮게 나오는 게 정상입니다.<br>'
         + '지금 함정을 까는 이유는 <b>나중을 위한 연습</b>입니다. 목책으로 길을 좁히고 그 길목에 함정을 깔아두면, '
         + '적이 많아지는 3막(77일~)부터 이 배치가 판을 갈라놓습니다.' },
  { day:33, act:1, name:'산적 두목', note:'1막 보스 · 함정의 가치를 배우는 구간',
    count:20, hp:56, spd:85, dmg:10, sides:2,
    mix:[['normal',0.8],['fast',0.2]],
    boss:{ hp:600, dmg:22, spd:55, name:'산적 두목' },
    advice:'보스는 체력이 높습니다. 함정 위를 오래 걷게 만드는 쪽이 정면으로 때리는 쪽보다 효율이 큽니다.<br>'
         + '함정은 <b>적의 최대 체력에 비례해서도</b> 피해를 줍니다 — 단단한 적일수록 함정이 더 잘 듣습니다.' },

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
    advice:'세 방향을 한 사람이 다 막을 수는 없습니다. 병사와 용병에게 길목 하나씩을 맡기세요.<br>'
         + '<b>다음 막부터는 사방에서 옵니다.</b> 지금부터 거점을 빙 둘러싸고 문을 몇 개만 내두세요.' },

  { day:77, act:3, name:'위군 선봉', note:'3막 시작 · 정예가 섞여 들어옵니다',
    count:30, hp:105, spd:88, dmg:17, sides:3,
    mix:[['normal',0.4],['fast',0.25],['tank',0.25],['elite',0.1]],
    advice:'정예 한 마리가 졸개 셋보다 아픕니다. 회피로 예비 동작을 흘리고 스킬로 끊으세요.' },
  { day:88, act:3, name:'조조의 정예', note:'사방에서 몰려옵니다',
    count:32, hp:120, spd:90, dmg:18, sides:4,
    mix:[['normal',0.4],['fast',0.25],['tank',0.2],['elite',0.15]],
    advice:'네 방향입니다. 철옹성의 망루가 없으면 손이 모자랍니다.<br>'
         + '<b>정석</b> — 거점에서 4~5칸 떨어진 곳을 목책으로 <b>빙 둘러싸고</b>, '
         + '네 방향에 문을 하나씩만 냅니다. 그 문 안쪽 두세 칸에 함정을 겹쳐 까세요. '
         + '적은 반드시 그 문으로만 들어옵니다.' },
  { day:99, act:3, name:'최후의 대란', note:'최종 보스 · 99일의 끝',
    count:36, hp:140, spd:90, dmg:20, sides:4,
    mix:[['normal',0.35],['fast',0.25],['tank',0.2],['elite',0.2]],
    boss:{ hp:2300, dmg:34, spd:58, name:'여포(적)' },
    advice:'마지막입니다. 치유약을 아끼지 말고, 보스는 함정 위로 끌어들이세요.<br>'
         + '문을 둘러싼 목책이 온전한지, 함정이 전부 <b>침공로 위</b>에 있는지 마지막으로 확인하세요.' }
];

/* ---------- 건설 ---------- */
export const BUILDS = [
  { id:'wall',  name:'목책',     icon:'🧱', cost:{ wood:8 }, hp:130,
    desc:'적의 길을 막아 돌아가게 만듭니다. 장수와 병사는 넘어다닙니다. 막는 게 아니라 길을 몰아가는 도구입니다.',
    effect:'침공로를 바꿉니다' },
  { id:'trap',  name:'가시함정', icon:'🔻', cost:{ wood:10, stone:7 }, dur:250,
    desc:'밟고 지나가는 적을 크게 늦추고 계속 피해를 줍니다. 바닥의 붉은 화살표 위에 깔아야 일을 합니다.',
    effect:'침공로 위에서만 효과' },
  { id:'camp',  name:'병영',     icon:'⛺', cost:{ wood:35, stone:10 },
    desc:'병사를 둘 자리가 1칸 늘어납니다. 병영만 지어서는 병사가 안 나오고, 아래 「＋ 병사 고용」을 눌러야 들어옵니다.',
    effect:'병사 정원 +1 (고용은 따로)' },
  { id:'forge', name:'대장간',   icon:'🔨', cost:{ wood:40, stone:18 }, once:true,
    desc:'🔨 제작·성 화면의 장비 제작이 열립니다. 곡괭이가 있어야 철을 캘 수 있으니 가장 먼저 지으세요. 한 채면 충분합니다.',
    effect:'장비 제작 개방 (1채면 충분)' }
];

/* ---------- 함정 ----------
   ★ 예전에는 피해가 초당 42 로 고정이었습니다. 그런데 적 체력은
     11일 34 → 99일 448(정예) 로 13배가 됩니다.
     자동 플레이로 재보니 99일 정예 한 마리를 함정만으로 잡으려면 17칸이 필요했고,
     그래서 후반 함정 처치 비율이 10% 안팎까지 떨어졌습니다.
     "함정의 가치를 배운다" 는 기획 의도가 후반에 무너진 것입니다.

   → 고정 피해에 **최대 체력 비례 피해**를 얹습니다.
     초반에는 거의 티가 안 나고(졸개 34 체력이면 초당 1.7), 후반 정예에게 크게 듣습니다.
     타워디펜스에서 흔히 쓰는 방식입니다. */
export const TRAP_DPS = 42;             // 초당 고정 피해
export const TRAP_PCT_DPS = 0.05;       // + 초당 최대 체력의 5%
export const TRAP_DPS_STEEL = 1.7;      // 강철 가시를 만들면 곱해지는 값
export const TRAP_DUR_STEEL = 1.6;
export const TRAP_SLOW = 0.38;          // 함정 위 이동 속도 배율 (낮을수록 오래 밟습니다)
export const TRAP_WEAR = 7;             // 초당 내구도 감소
export const WALL_DMG_MUL = 1.6;        // 몬스터가 목책을 때릴 때의 피해 배율

/* ---------- 철거 ----------
   목책을 옮기면 적의 길이 바뀌고, 그러면 예전에 깔아둔 함정이 길에서 벗어납니다.
   치울 방법이 없으면 그 자원이 영원히 묶입니다(자동 플레이에서 함정 15개 중 13개가
   쓸모없어진 채로 남았습니다). 그래서 되돌릴 수 있게 합니다.
   전부 돌려주면 무한히 다시 지을 수 있으니 절반만 돌려줍니다. */
export const REFUND_RATIO = 0.5;

/* ==================================================================
   제작 — 8종
   ------------------------------------------------------------------
   ★ 원래 11종에 **5단계 선행 사슬**이었습니다.
     군기 하나를 만들려면 가죽갑옷 → 철갑옷 → 강철가시 → 망루강화 를
     순서대로 다 만들어야 했고, 목록이 길어 무엇부터 할지 알 수 없었습니다.
     ("무기 업글 제작 너무 정신없다")

   정리한 원칙 셋:
     ① **효과가 없는 것은 없앤다** — 횃불은 코드에서 한 번도 쓰이지 않았습니다(삭제)
     ② **비슷한 것은 합친다** — 돌 곡괭이 + 철 곡괭이 → 곡괭이 하나
                              망루 강화 → 철옹성에 기본 포함
     ③ **사슬 대신 성 단계로 연다** — 길게 이어지는 선행 대신
        "석성이면 강철 가시, 철옹성이면 군기" 처럼 한눈에 보이는 조건으로
   ================================================================== */
export const CRAFTS = [
  /* ── 장비 — 대장간만 있으면 바로 ── */
  { id:'pickaxe', name:'곡괭이', icon:'⛏️', cost:{ wood:15, stone:20 }, group:'장비',
    desc:'철광을 캘 수 있게 되고, 모든 채집이 빨라집니다. 가장 먼저 만드세요.',
    effect:'철 채굴 개방 · 채집 속도 +40%' },
  { id:'huntknife', name:'사냥용 칼', icon:'🔪', cost:{ iron:3, wood:5 }, group:'장비',
    desc:'몬스터에게서 가죽을 두 배로 얻습니다. 갑옷과 군기가 가죽을 씁니다.',
    effect:'가죽 획득 2배' },
  { id:'weapon',  name:'무기 강화', icon:'⚔️', max:3, group:'장비',
    desc:'공격력이 오릅니다. 세 번까지 강화할 수 있고, 단계마다 철과 가죽이 더 듭니다.',
    effect:'단계마다 공격력 +50% (★3 = +150%)' },
  { id:'leather', name:'갑옷', icon:'🦺', cost:{ hide:8, wood:5 }, group:'장비',
    desc:'최대 체력이 늘어납니다. 가죽은 몬스터를 잡아야 나옵니다.',
    effect:'최대 체력 +40' },
  { id:'ironmail', name:'중갑', icon:'🛡️', cost:{ iron:10, hide:5 }, group:'장비', need:'leather',
    desc:'받는 피해가 줄어듭니다. 갑옷을 먼저 만들어야 합니다.',
    effect:'받는 피해 -20%' },

  /* ── 시설 강화 — 성 단계가 열어줍니다 ── */
  { id:'steelspike', name:'강철 가시', icon:'🗡️', cost:{ iron:20, stone:25 }, group:'시설 강화',
    baseLv:2,
    desc:'모든 가시함정이 강해집니다. 이미 깔아둔 함정에도 바로 적용됩니다.',
    effect:'함정 피해 +70% · 내구도 +60%' },
  { id:'banner', name:'군기(軍旗)', icon:'🚩', cost:{ hide:20, iron:15 }, group:'시설 강화',
    baseLv:3,
    desc:'병사와 용병이 함께 강해집니다. 이미 고용한 병력에게도 적용됩니다.',
    effect:'병사·용병 공격 +50% · 체력 +40%' },

  /* ── 소모품 ── */
  { id:'potion', name:'치유약', icon:'🧪', cost:{ herb:5 }, group:'소모품', stack:true,
    desc:'즉시 체력을 회복합니다. 여러 개 만들어 둘 수 있습니다. (H 키)',
    effect:'체력 50 회복' }
];

/** 무기 강화 단계별 비용 — 뒤로 갈수록 비쌉니다 */
export const WEAPON_COST = [
  { iron: 8 },
  { iron: 16, hide: 6 },
  { iron: 26, hide: 12 }
];
/** 무기 강화 한 단계가 올려주는 공격력 */
export const WEAPON_STEP = 0.5;

/** 곡괭이가 올려주는 채집 속도 */
export const PICK_GATHER = 1.4;

export const POTION_HEAL = 50;

/* ---------- 성(거점) 업그레이드 ---------- */
export const BASE_LEVELS = [
  { lv:1, name:'토성',   maxHp:1300, cost:null,
    desc:'흙과 돌로 쌓은 기본 거점입니다.' },
  { lv:2, name:'석성',   maxHp:1900, cost:{ stone:45, wood:70 },
    desc:'성벽이 높아지고 체력이 크게 늘어납니다.' },
  { lv:3, name:'철옹성', maxHp:3200, cost:{ stone:85, wood:90, iron:25 },
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
           from:'지도 한가운데 철광에서. 곡괭이가 있어야 캘 수 있습니다',
           use:'무기 강화·철 갑옷·성 3단계' },
  herb:  { name:'약초', icon:'🌿', color:'#6fbf7a',
           from:'들판 곳곳에 자랍니다. 도구 없이 캘 수 있습니다',
           use:'치유약' },
  hide:  { name:'가죽', icon:'🟤', color:'#8a5a3b',
           from:'몬스터를 처치하면 나옵니다. 사냥용 칼이 있으면 두 배',
           use:'갑옷·중갑' },
  /* ★ 정수 — 무엇을 캐든 낮은 확률로 함께 나옵니다.
     쓸 곳: **모자란 자원을 대신합니다.** 철이 없어도 정수로 무기를 강화할 수 있고,
     석재가 모자라도 정수로 성을 올릴 수 있습니다.
     "돌만 계속 캐야 해서 답답하다" 는 문제를 재료 하나로 풀어줍니다. */
  essence:{ name:'정수', icon:'⭐', color:'#E0B44A',
           from:'무엇을 캐든 낮은 확률로 함께 나옵니다 (철광에서 제일 잘 나옵니다)',
           use:'모자란 자원을 대신합니다 — 제작·건설·성 업그레이드 어디에나' }
};

/* 자원지별 정수가 나올 확률 (한 번 캘 때마다) */
export const ESSENCE_CHANCE = { wood: 0.012, stone: 0.02, iron: 0.05, herb: 0.02 };
/** 정수 1개가 대신할 수 있는 일반 자원의 양 */
export const ESSENCE_WORTH = 6;
export const NODE_MAX = { wood:22, stone:30, iron:18, herb:10 };
/* ★ 지도에 나무가 돌보다 3배 많은데 캐는 속도까지 더 빨랐습니다.
   실제로 해보면 "나무는 넘치는데 돌이 없어서 아무것도 못 짓는" 상태가 됩니다.
   속도를 뒤집어 균형을 맞춥니다 — 돌은 귀한 대신 빨리 캐집니다. */
export const GATHER_RATE = { wood:3.4, stone:4.2, iron:2.4, herb:5 };   // 장수 채집 속도(초당)
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

/* ---------- 중복 카드 · 각성 ----------
   뽑기에서 이미 가진 장수가 또 나오면 허탈합니다.
   중복은 '혼백(魂)'으로 바뀌고, 혼백을 모아 장수를 각성시킵니다.
   등급이 높을수록 더 많이 주고, 각성 한 단계마다 전투력이 오릅니다. */
export const SOUL_BY_GRADE = { 일반: 2, 희귀: 5, 영웅: 15, 전설: 40, 신화: 100 };
export const AWAKEN_MAX = 5;            // ★5 까지
export const AWAKEN_COST = [20, 45, 90, 170, 300];   // 1→2, 2→3 …
export const AWAKEN_BONUS = 0.06;       // 한 단계마다 전투력 +6% (★5 = +30%)

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
