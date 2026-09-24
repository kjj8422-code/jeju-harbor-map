/* ==================================================================
   소리 — WebAudio 로 직접 만들어 씁니다 (음원 파일 없음)
   ------------------------------------------------------------------
   왜 파일을 안 쓰나:
     이 프로젝트는 빌드도 없고 외부 CDN도 막혀 있습니다. mp3 를 넣으면
     저장소가 무거워지고 라이선스도 따로 챙겨야 합니다.
     그래서 브라우저가 소리를 "그 자리에서 합성" 하게 만들었습니다.
     용량 0바이트, 저작권 문제 0건, 로딩 0초입니다.

   타격음을 만드는 법(게임 사운드의 기본):
     한 번의 타격은 세 겹입니다.
       ① 툭 — 아주 짧은 잡음(noise). "닿았다"는 느낌.
       ② 둥 — 낮은 사인파. "무게".
       ③ 쨍 — 높은 금속음. 치명타일 때만 얹습니다.
     이 셋의 길이와 세기를 무기마다 다르게 주면 무기가 달라 보입니다.
   ================================================================== */

let AC = null, master = null, sfxG = null, musicG = null, noiseBuf = null;
let voices = 0;
const lastAt = new Map();               // 같은 소리가 겹쳐 터지는 것을 막습니다

export const state = { sfx: true, music: true, ready: false, phase: 'day' };

/* ---------------- 준비 ---------------- */
export function ensure() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return AC; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return null; }

  master = AC.createGain(); master.gain.value = 0.9; master.connect(AC.destination);
  sfxG = AC.createGain();   sfxG.gain.value = 0.85;  sfxG.connect(master);
  musicG = AC.createGain(); musicG.gain.value = 0.0; musicG.connect(master);

  // 잡음 버퍼 — 타격음의 "툭" 을 담당합니다
  const len = Math.floor(AC.sampleRate * 0.6);
  noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  state.ready = true;
  return AC;
}

export function setSfx(on) { state.sfx = on; if (sfxG) sfxG.gain.value = on ? 0.85 : 0; }
export function setMusic(on) {
  state.music = on;
  if (!AC) return;
  rampMusic(on ? musicTargetGain() : 0, 0.5);
  if (on && !musicTimer) startMusic();
  if (!on) stopMusic();
}

/* ---------------- 소리 만들기 도구 ---------------- */
function env(node, t0, peak, attack, decay) {
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  node.connect(g);
  return g;
}

function noise(t0, dur, peak, filter, freq, q) {
  const src = AC.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  let out = src;
  if (filter) {
    const f = AC.createBiquadFilter();
    f.type = filter; f.frequency.value = freq; f.Q.value = q || 1;
    src.connect(f); out = f;
  }
  const g = env(out, t0, peak, 0.002, dur);
  g.connect(sfxG);
  src.start(t0); src.stop(t0 + dur + 0.05);
  return src;
}

function tone(t0, f0, f1, dur, peak, type) {
  const o = AC.createOscillator();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, t0);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  const g = env(o, t0, peak, 0.004, dur);
  g.connect(sfxG);
  o.start(t0); o.stop(t0 + dur + 0.05);
  return o;
}

/* ---------------- 효과음 목록 ---------------- */
/* 각 항목은 "어떤 겹을 어떻게 쌓을지" 를 적은 요리법입니다. */
const RECIPE = {
  /* ── 타격 ── */
  hitSword:  t => { noise(t, 0.075, 0.55, 'bandpass', 1900, 1.4); tone(t, 150, 70, 0.10, 0.34); },
  hitHalberd:t => { noise(t, 0.11,  0.55, 'bandpass', 1150, 1.1); tone(t, 108, 46, 0.17, 0.44);
                    tone(t + 0.02, 320, 180, 0.09, 0.14, 'triangle'); },
  hitBow:    t => { noise(t, 0.045, 0.40, 'highpass', 2600, 0.8); tone(t, 640, 300, 0.06, 0.16, 'triangle'); },
  hitCrit:   t => { noise(t, 0.10, 0.62, 'bandpass', 2400, 1.6); tone(t, 180, 60, 0.20, 0.42);
                    tone(t + 0.012, 1560, 1180, 0.26, 0.15, 'square');
                    tone(t + 0.012, 2330, 1760, 0.22, 0.09, 'square'); },
  hitTrap:   t => { noise(t, 0.07, 0.30, 'bandpass', 3100, 2.2); tone(t, 260, 120, 0.07, 0.12, 'sawtooth'); },
  hitWall:   t => { noise(t, 0.06, 0.34, 'bandpass', 700, 1.0); tone(t, 190, 120, 0.11, 0.26, 'triangle'); },
  heroHit:   t => { noise(t, 0.13, 0.50, 'lowpass', 900, 0.9); tone(t, 132, 58, 0.24, 0.42, 'square'); },
  block:     t => { noise(t, 0.05, 0.30, 'bandpass', 4200, 3.0); tone(t, 900, 700, 0.07, 0.12, 'square'); },

  /* ── 휘두름 ── */
  swing:     t => { noise(t, 0.10, 0.17, 'bandpass', 900, 0.7); },
  swingBig:  t => { noise(t, 0.17, 0.24, 'bandpass', 620, 0.6); },
  shoot:     t => { noise(t, 0.05, 0.22, 'highpass', 3000, 0.9); tone(t, 880, 420, 0.05, 0.10, 'triangle'); },

  /* ── 죽음 ── */
  die:       t => { noise(t, 0.16, 0.34, 'lowpass', 1400, 0.8); tone(t, 220, 70, 0.20, 0.22, 'sawtooth'); },
  bossDie:   t => { noise(t, 0.6, 0.55, 'lowpass', 900, 0.8); tone(t, 150, 40, 0.9, 0.42, 'sawtooth');
                    tone(t + 0.05, 420, 90, 0.7, 0.2, 'triangle'); },
  wallBreak: t => { noise(t, 0.28, 0.42, 'bandpass', 520, 0.8); tone(t, 150, 60, 0.3, 0.3, 'triangle'); },

  /* ── 조작 ── */
  dodge:     t => { noise(t, 0.16, 0.24, 'bandpass', 1500, 0.6); tone(t, 520, 900, 0.12, 0.10, 'sine'); },
  skill:     t => { tone(t, 420, 980, 0.22, 0.26, 'triangle'); noise(t, 0.16, 0.30, 'bandpass', 1700, 1.0); },
  /* 궁극기 — 낮게 깔리는 울림 + 위로 솟는 음. 평타·스킬과 확실히 구별돼야 합니다. */
  ult:       t => { tone(t, 90, 44, 1.0, 0.5, 'sawtooth');
                    tone(t + 0.04, 300, 1400, 0.5, 0.3, 'triangle');
                    tone(t + 0.04, 450, 2100, 0.45, 0.16, 'square');
                    noise(t, 0.5, 0.45, 'bandpass', 900, 0.7);
                    noise(t + 0.18, 0.35, 0.3, 'highpass', 2200, 0.9); },
  build:     t => { tone(t, 320, 440, 0.09, 0.22, 'triangle'); noise(t, 0.05, 0.16, 'bandpass', 800, 1.0); },
  deny:      t => { tone(t, 220, 150, 0.16, 0.24, 'square'); },
  hire:      t => { tone(t, 520, 660, 0.10, 0.22, 'triangle'); tone(t + 0.09, 660, 790, 0.12, 0.18, 'triangle'); },
  craft:     t => { tone(t, 600, 760, 0.09, 0.20, 'triangle'); tone(t + 0.08, 900, 1100, 0.12, 0.14, 'triangle'); },
  coin:      t => { tone(t, 1180, 1560, 0.09, 0.18, 'square'); tone(t + 0.07, 1560, 1980, 0.14, 0.12, 'square'); },
  potion:    t => { tone(t, 700, 1300, 0.28, 0.2, 'sine'); },
  objective: t => { tone(t, 760, 1010, 0.10, 0.2, 'triangle'); tone(t + 0.1, 1010, 1270, 0.16, 0.15, 'triangle'); },
  /* 성 업그레이드 — 돌을 쌓아 올리는 묵직한 소리. 정적 점검에서 "없는 소리" 로 잡혔습니다. */
  upgrade:   t => { noise(t, 0.3, 0.4, 'lowpass', 700, 0.8); tone(t, 140, 220, 0.4, 0.34, 'triangle');
                    tone(t + 0.18, 330, 440, 0.35, 0.22, 'triangle');
                    tone(t + 0.36, 440, 660, 0.4, 0.18, 'triangle'); },

  /* ── 상황 ── */
  windup:    t => { tone(t, 190, 260, 0.14, 0.11, 'sine'); },
  warn:      t => { tone(t, 180, 150, 0.7, 0.3, 'sawtooth'); tone(t + 0.35, 150, 120, 0.7, 0.24, 'sawtooth'); },
  nightStart:t => { tone(t, 120, 70, 1.1, 0.38, 'sawtooth'); noise(t, 0.8, 0.26, 'lowpass', 500, 0.7); },
  heroDown:  t => { tone(t, 170, 55, 0.7, 0.4, 'sawtooth'); noise(t, 0.4, 0.3, 'lowpass', 700, 0.8); },
  respawn:   t => { tone(t, 330, 660, 0.3, 0.26, 'triangle'); tone(t + 0.14, 660, 990, 0.35, 0.18, 'triangle'); },
  lastStand: t => { tone(t, 220, 175, 0.9, 0.36, 'sawtooth'); tone(t + 0.05, 330, 262, 0.9, 0.22, 'sawtooth'); },
  report:    t => { tone(t, 700, 880, 0.14, 0.22, 'triangle'); },
  win:       t => { [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.13, f, f, 0.4, 0.24, 'triangle')); },
  lose:      t => { [392, 330, 262, 196].forEach((f, i) => tone(t + i * 0.17, f, f, 0.5, 0.26, 'sawtooth')); },

  /* ── 짐승·역병의 울음 (팀장님 요청: 늑대·좀비·호랑이 소리) ─────────
     진짜 동물 소리를 흉내 내는 요령:
       늑대 — 길게 끄는 **순음**이 위로 올라갔다 천천히 내려옵니다 (하울링).
              두 음을 살짝 어긋나게 겹치면 "여럿이 운다" 로 들립니다.
       좀비 — **낮은 톱니파**를 느리게 떨게 하고, 숨소리로 잡음을 깝니다.
       호랑이 — 아주 낮은 주파수 + 강한 잡음. 포효는 "음"이 아니라 "덩어리" 입니다. */
  howl:      t => {                              // 늑대 하울링
    tone(t,        420, 640, 0.55, 0.12, 'sine');
    tone(t + 0.35, 640, 330, 0.85, 0.11, 'sine');
    tone(t + 0.08, 428, 650, 0.55, 0.06, 'sine');   // 살짝 어긋난 두 번째 마리
    tone(t + 0.43, 650, 335, 0.85, 0.05, 'sine');
    noise(t, 0.9, 0.035, 'bandpass', 700, 2.2);
  },
  groan:     t => {                              // 좀비 신음
    tone(t,        96,  78, 0.75, 0.16, 'sawtooth');
    tone(t + 0.1, 148, 104, 0.6,  0.07, 'square');  // 목 긁는 소리
    noise(t + 0.05, 0.5, 0.07, 'lowpass', 520, 0.8);
    noise(t + 0.45, 0.35, 0.05, 'highpass', 2600, 0.6);   // 마른 숨
  },
  roar:      t => {                              // 호랑이 포효
    tone(t,        62,  44, 0.85, 0.34, 'sawtooth');
    tone(t + 0.04, 92,  58, 0.7,  0.18, 'square');
    noise(t,        0.75, 0.30, 'lowpass',  900, 1.1);
    noise(t + 0.02, 0.55, 0.16, 'bandpass', 320, 2.6);
  },

  /* ── 대란이 다가올 때의 으스스한 기척 ──
     멀리서 들리는 북소리와 바람. 소리가 먼저 오고 적이 나중에 옵니다. */
  drums:     t => {
    for (let i = 0; i < 4; i++) {
      tone(t + i * 0.42, 74, 52, 0.26, 0.20 + i * 0.03, 'sine');
      noise(t + i * 0.42, 0.12, 0.10, 'lowpass', 300, 0.7);
    }
  },
  dread:     t => {                              // 낮게 깔리는 불길한 기척
    tone(t, 58, 52, 2.4, 0.13, 'sawtooth');
    tone(t + 0.2, 87, 79, 2.0, 0.07, 'sine');
    noise(t, 2.6, 0.05, 'lowpass', 400, 0.6);
  },
  surge:     t => {                              // 「적 본대 진격!」 — 징 + 함성
    tone(t, 300, 180, 1.2, 0.30, 'square');
    tone(t, 452, 262, 1.1, 0.16, 'triangle');
    noise(t, 1.3, 0.26, 'bandpass', 1100, 0.5);   // 함성
    noise(t + 0.05, 0.9, 0.18, 'lowpass', 260, 0.8);
    for (let i = 0; i < 3; i++) tone(t + i * 0.16, 70, 48, 0.24, 0.24, 'sine');
  }
};

/* 같은 소리가 너무 촘촘히 겹치면 귀가 아픕니다. 최소 간격과 동시 발음 수를 제한합니다. */
const MIN_GAP = { hitSword: 0.035, hitHalberd: 0.04, hitBow: 0.03, hitTrap: 0.09,
                  hitWall: 0.07, windup: 0.08, swing: 0.05, die: 0.04, shoot: 0.04 };

export function play(name, delay = 0) {
  if (!state.sfx) return;
  const ac = ensure();
  if (!ac || !RECIPE[name]) return;
  const now = ac.currentTime;
  const gap = MIN_GAP[name];
  if (gap) {
    const prev = lastAt.get(name) || 0;
    if (now - prev < gap) return;
    lastAt.set(name, now);
  }
  if (voices > 18) return;
  voices++;
  setTimeout(() => { voices--; }, 350);
  try { RECIPE[name](now + delay); } catch (e) { /* 소리는 실패해도 게임에 영향 없음 */ }
}

/* ==================================================================
   배경음악 — 5음계(펜타토닉) 위에서 절차적으로 연주합니다
   ------------------------------------------------------------------
   5음계는 아무 음이나 겹쳐도 불협이 잘 안 나는 음계라,
   "무작위로 골라도 듣기 좋은" 음악을 만들 때 가장 안전합니다.
   국악의 평조와도 음 구성이 겹쳐서 삼국지 분위기에 잘 맞습니다.
   ================================================================== */
const PENTA = [0, 2, 4, 7, 9];          // 도 레 미 솔 라
const hz = semi => 55 * Math.pow(2, semi / 12);
let musicTimer = null, nextNote = 0, step = 0, drone = null, droneG = null;

const musicTargetGain = () => (state.phase === 'night' ? 0.30 : 0.22);

function rampMusic(v, sec) {
  if (!musicG || !AC) return;
  musicG.gain.cancelScheduledValues(AC.currentTime);
  musicG.gain.setValueAtTime(musicG.gain.value, AC.currentTime);
  musicG.gain.linearRampToValueAtTime(v, AC.currentTime + sec);
}

function pluck(t, semi, dur, peak, type) {
  const o = AC.createOscillator();
  o.type = type || 'triangle';
  o.frequency.value = hz(semi);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const f = AC.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 2600;
  o.connect(f); f.connect(g); g.connect(musicG);
  o.start(t); o.stop(t + dur + 0.05);
}

function drum(t, low) {
  const o = AC.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(low ? 108 : 168, t);
  o.frequency.exponentialRampToValueAtTime(low ? 44 : 70, t + 0.20);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(low ? 0.5 : 0.3, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  o.connect(g); g.connect(musicG);
  o.start(t); o.stop(t + 0.3);

  const src = AC.createBufferSource();
  src.buffer = noiseBuf;
  const nf = AC.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1100;
  const ng = AC.createGain();
  ng.gain.setValueAtTime(low ? 0.20 : 0.12, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  src.connect(nf); nf.connect(ng); ng.connect(musicG);
  src.start(t); src.stop(t + 0.12);
}

function ensureDrone() {
  if (drone) return;
  drone = AC.createOscillator();
  drone.type = 'sawtooth';
  drone.frequency.value = hz(24);       // 낮은 도
  droneG = AC.createGain(); droneG.gain.value = 0.05;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 340;
  drone.connect(f); f.connect(droneG); droneG.connect(musicG);
  drone.start();
}

function schedule() {
  if (!AC || !state.music) return;
  const night = state.phase === 'night' || state.phase === 'warn';
  const beat = night ? 60 / 112 : 60 / 74;
  const ahead = AC.currentTime + 0.5;

  while (nextNote < ahead) {
    const t = Math.max(nextNote, AC.currentTime + 0.02);
    const bar = step % 8;

    if (night) {
      // 밤 — 북과 짧은 오스티나토. 긴장감은 규칙적인 저음에서 나옵니다.
      if (bar % 2 === 0) drum(t, bar % 4 === 0);
      const low = [36, 36, 39, 36, 41, 36, 39, 43][bar];
      pluck(t, low, 0.5, 0.16, 'sawtooth');
      if (bar === 3 || bar === 7) pluck(t + beat * 0.5, 48 + PENTA[(step / 2 | 0) % 5], 0.35, 0.12, 'square');
    } else {
      // 낮 — 느린 5음계 아르페지오. 배경에 깔리되 방해하지 않게.
      const oct = bar < 4 ? 48 : 55;
      const n = oct + PENTA[(step * 3) % 5];
      pluck(t, n, 1.3, 0.13);
      if (bar === 0) pluck(t, 36, 2.4, 0.10, 'sine');
      if (bar === 4) pluck(t + beat * 0.5, n + 12, 1.0, 0.07);
    }
    nextNote = t + beat;
    step++;
  }
}

export function startMusic() {
  if (!state.music) return;
  const ac = ensure();
  if (!ac || musicTimer) return;
  ensureDrone();
  nextNote = ac.currentTime + 0.1;
  musicTimer = setInterval(schedule, 120);
  rampMusic(musicTargetGain(), 1.6);
}

export function stopMusic() {
  rampMusic(0, 0.6);
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}

/** 낮 ↔ 밤이 바뀌면 곡이 바뀝니다. 같은 음계를 써서 이어 들립니다. */
export function setPhase(phase) {
  if (phase === state.phase) return;
  state.phase = phase;
  if (droneG) droneG.gain.value = (phase === 'night' || phase === 'warn') ? 0.09 : 0.05;
  if (state.music && musicTimer) rampMusic(musicTargetGain(), 1.2);
}
