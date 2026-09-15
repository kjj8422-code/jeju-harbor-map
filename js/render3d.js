/* ==================================================================
   3D 화면
   ------------------------------------------------------------------
   게임 규칙(sim.js)은 전혀 건드리지 않습니다. 상태를 읽어서 그리기만 합니다.
   좌표 환산: 게임의 (x, y) → 3D의 (x*SCALE, 높이, y*SCALE)
   ================================================================== */

import * as THREE from '../vendor/three.module.min.js';
import * as C from './config.js';
import * as Tex from './textures.js';

const S3 = C.RENDER_SCALE;              // 게임 단위 → 3D 단위
const gx = x => x * S3;                 // 가로
const gz = y => y * S3;                 // 세로(게임의 y가 3D의 z)

export const R = {
  scene: null, camera: null, renderer: null, container: null,
  sun: null, hemi: null, baseLight: null, heroLight: null,
  hero: null, ground: null, gravel: null,
  monsterMeshes: new Map(), soldierMeshes: new Map(),
  wallMeshes: new Map(), trapMeshes: new Map(),
  nodeInst: {}, nodeIndex: new Map(),
  cam: { yaw: 0.6, pitch: 0.72, dist: 14, target: new THREE.Vector3() },
  quality: { shadows: true, lowSpec: false },
  minimap: null, minimapCtx: null,
  rings: {}, ghostGroup: null, arrows: [], vfx: [],
  shake: { t: 0, power: 0 },
  stats: { calls: 0, tris: 0, fps: 0 },
  _fpsT: 0, _fpsN: 0, _minimapT: 0
};

/* ---------------- 재질 ---------------- */
const MAT = {};

function canvasTexture(cv, repeat, srgb = true) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildMaterials() {
  // 땅 텍스처 반복 밀도: 맵 가로(128.8유닛) ÷ 타일당 12유닛 ≈ 11
  const groundRepeat = Math.round((C.WORLD_W * S3) / 12);

  MAT.ground = new THREE.MeshStandardMaterial({
    map: canvasTexture(Tex.groundTexture(512), groundRepeat),
    roughness: 1, metalness: 0
  });
  MAT.gravel = new THREE.MeshStandardMaterial({
    map: canvasTexture(Tex.gravelTexture(512), Math.round(groundRepeat * 0.6)),
    roughness: 1, metalness: 0, transparent: true, opacity: 0.92
  });
  MAT.stone = new THREE.MeshStandardMaterial({
    map: canvasTexture(Tex.stoneTexture(512), 3), roughness: 0.9, metalness: 0.02
  });
  MAT.wood = new THREE.MeshStandardMaterial({
    map: canvasTexture(Tex.woodTexture(256), 1), roughness: 0.95, metalness: 0
  });

  MAT.trunk    = new THREE.MeshStandardMaterial({ color: 0x5c4128, roughness: 1 });
  MAT.foliage  = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 1 });
  MAT.rock     = new THREE.MeshStandardMaterial({ color: 0x7d7871, roughness: 0.85 });
  MAT.ironRock = new THREE.MeshStandardMaterial({ color: 0x4d4842, roughness: 0.7, metalness: 0.25 });
  MAT.trapMat  = new THREE.MeshStandardMaterial({ color: 0xC6412F, roughness: 0.6, metalness: 0.3 });
  MAT.flag     = new THREE.MeshStandardMaterial({ color: 0xE0B44A, roughness: 0.8, side: THREE.DoubleSide });
}

/* ---------------- 초기화 ---------------- */
export function initRenderer(container) {
  R.container = container;

  R.scene = new THREE.Scene();
  R.scene.background = new THREE.Color(0x8fa7bd);
  R.scene.fog = new THREE.Fog(0x8fa7bd, 22, 68);

  R.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 400);

  // 저사양 환경(GPU 없는 PC 등)에서는 그림자·안티앨리어싱을 끕니다
  const probe = document.createElement('canvas').getContext('webgl');
  const dbg = probe && probe.getExtension('WEBGL_debug_renderer_info');
  const gpuName = dbg ? String(probe.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  R.quality.lowSpec = /swiftshader|llvmpipe|software/i.test(gpuName);
  const mobile = window.innerWidth < 820 || /Mobi|Android/i.test(navigator.userAgent);
  R.quality.shadows = !R.quality.lowSpec && !mobile;

  R.renderer = new THREE.WebGLRenderer({ antialias: !R.quality.lowSpec && !mobile, powerPreference: 'high-performance' });
  R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  R.renderer.shadowMap.enabled = R.quality.shadows;
  R.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  R.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  R.renderer.toneMappingExposure = 1.05;
  container.appendChild(R.renderer.domElement);

  buildMaterials();

  // 조명 — 태양 1개 + 하늘빛. 밤에는 이 둘을 낮추고 횃불을 켭니다.
  R.hemi = new THREE.HemisphereLight(0xbdd7f0, 0x4a5240, 0.75);
  R.scene.add(R.hemi);

  R.sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
  R.sun.position.set(30, 45, 18);
  if (R.quality.shadows) {
    R.sun.castShadow = true;
    R.sun.shadow.mapSize.set(2048, 2048);
    const d = 26;
    R.sun.shadow.camera.left = -d; R.sun.shadow.camera.right = d;
    R.sun.shadow.camera.top = d;   R.sun.shadow.camera.bottom = -d;
    R.sun.shadow.camera.near = 1;  R.sun.shadow.camera.far = 140;
    R.sun.shadow.bias = -0.0008;
    R.sun.shadow.normalBias = 0.02;
  }
  R.scene.add(R.sun);
  R.scene.add(R.sun.target);

  // 밤 조명 — 거점 화톳불과 장수 횃불
  R.baseLight = new THREE.PointLight(0xffb163, 0, 26, 1.8);
  R.baseLight.position.set(gx(C.BASE_TX * C.TILE), 3.2, gz(C.BASE_TY * C.TILE));
  R.scene.add(R.baseLight);

  R.heroLight = new THREE.PointLight(0xffd0a0, 0, 22, 1.6);
  R.scene.add(R.heroLight);

  resize();
  window.addEventListener('resize', resize);
  return R;
}

export function resize() {
  if (!R.renderer) return;
  const w = R.container.clientWidth;
  const h = R.container.clientHeight;
  R.camera.aspect = w / h;
  R.camera.updateProjectionMatrix();
  R.renderer.setSize(w, h, false);
  if (R.minimap) { R.minimap.width = R.minimap.clientWidth; R.minimap.height = R.minimap.clientHeight; }
}

/* ---------------- 지면 표시 링 ----------------
   "여기까지 닿는다"를 눈으로 알려주는 장치들입니다. */
function makeRing(inner, outer, color, opacity) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
                                  side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  m.visible = false;
  return m;
}

function buildRings() {
  if (R.rings.attack) return;
  // 공격 사거리 — 평소엔 아주 흐리게, 적이 들어오면 하얗게 밝아집니다
  R.rings.attack = makeRing(0.96, 1.0, 0xffffff, 0.16);
  // 건설 가능 범위
  R.rings.build = makeRing(0.985, 1.0, 0xE0B44A, 0.4);
  // 채집 대상 표시
  R.rings.gather = makeRing(0.55, 0.72, 0xffffff, 0.85);
  // 지금 노리는 적 표시
  R.rings.target = makeRing(0.62, 0.78, 0xffffff, 0.9);
  for (const k in R.rings) R.scene.add(R.rings[k]);
}

/* ---------------- 세계 만들기 ---------------- */
export function buildWorld(S) {
  // 이전 판의 물체 정리
  for (const m of [...R.monsterMeshes.values(), ...R.soldierMeshes.values(),
                   ...R.wallMeshes.values(), ...R.trapMeshes.values()]) R.scene.remove(m);
  R.monsterMeshes.clear(); R.soldierMeshes.clear();
  R.wallMeshes.clear(); R.trapMeshes.clear();
  wallTiles.length = 0;
  if (R.wallInst) { R.wallInst.count = 0; R.wallInst.instanceMatrix.needsUpdate = true; }
  for (const k in R.nodeInst) { R.scene.remove(R.nodeInst[k]); }
  R.nodeInst = {}; R.nodeIndex.clear();
  if (R.ground) R.scene.remove(R.ground);
  if (R.gravel) R.scene.remove(R.gravel);
  if (R.hero) R.scene.remove(R.hero);
  if (R.baseGroup) R.scene.remove(R.baseGroup);

  const W = C.WORLD_W * S3, H = C.WORLD_H * S3;

  // 바깥 땅 — 지도 경계 너머가 허공으로 보이지 않게 넓게 깔아둡니다.
  // 안개가 먼저 덮으므로 실제로는 "끝없는 들판"처럼 보입니다.
  if (R.outer) R.scene.remove(R.outer);
  R.outer = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, H * 3), MAT.ground);
  R.outer.rotation.x = -Math.PI / 2;
  R.outer.position.set(W / 2, -0.02, H / 2);
  R.scene.add(R.outer);

  // 땅 (플레이 구역) — 레이캐스트로 건설 위치를 잡는 기준면입니다
  R.ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), MAT.ground);
  R.ground.rotation.x = -Math.PI / 2;
  R.ground.position.set(W / 2, 0, H / 2);
  R.ground.receiveShadow = R.quality.shadows;
  R.scene.add(R.ground);

  // 중앙 고급 자원 지대 — 바닥 색이 다릅니다
  const mid = Math.floor(C.MAPW / 2);
  R.gravel = new THREE.Mesh(new THREE.PlaneGeometry(8 * C.TILE * S3, H), MAT.gravel);
  R.gravel.rotation.x = -Math.PI / 2;
  R.gravel.position.set(gx((mid) * C.TILE), 0.012, H / 2);
  R.gravel.receiveShadow = R.quality.shadows;
  R.scene.add(R.gravel);

  buildRings();
  buildNodeInstances(S);
  buildBase(S);
  buildHero(S);
  buildStructs(S);
  for (const a of R.arrows) R.scene.remove(a.mesh);
  R.arrows.length = 0;
  for (const v of R.vfx) R.scene.remove(v.mesh);
  R.vfx.length = 0;
  for (const [, t] of R.telegraphs || []) R.scene.remove(t);
  R.telegraphs = new Map();

  R.cam.target.set(gx(S.hero.x), 1, gz(S.hero.y));
}

/* 나무·바위·철광은 InstancedMesh 로 묶습니다.
   131개를 따로 그리면 draw call 이 131번이지만, 묶으면 3번입니다. */
function buildNodeInstances(S) {
  const counts = { wood: 0, stone: 0, iron: 0 };
  for (const n of S.nodes) counts[n.type]++;

  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.13, 0.75, 6);
  const leafGeo = new THREE.ConeGeometry(0.52, 1.25, 7);
  const rockGeo = new THREE.IcosahedronGeometry(0.42, 0);
  const ironGeo = new THREE.DodecahedronGeometry(0.46, 0);

  const mk = (geo, mat, count) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    im.castShadow = R.quality.shadows;
    im.receiveShadow = R.quality.shadows;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    R.scene.add(im);
    return im;
  };

  R.nodeInst.trunk = mk(trunkGeo, MAT.trunk, counts.wood);
  R.nodeInst.leaf  = mk(leafGeo, MAT.foliage, counts.wood);
  R.nodeInst.rock  = mk(rockGeo, MAT.rock, counts.stone);
  R.nodeInst.iron  = mk(ironGeo, MAT.ironRock, counts.iron);

  refreshNodes(S);
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _sc = new THREE.Vector3();

/** 자원지가 고갈되거나 되살아나면 다시 배치합니다 */
export function refreshNodes(S) {
  let wi = 0, ri = 0, ii = 0;
  for (const n of S.nodes) {
    const x = gx(n.x), z = gz(n.y);
    const alive = n.amt > 0;
    if (n.type === 'wood') {
      // 고갈되면 그루터기만 남깁니다(잎을 숨김)
      const h = alive ? 1 : 0.35;
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (n.tx * 37 + n.ty * 11) % 6.28);
      _sc.set(1, h, 1);
      _v.set(x, 0.37 * h, z);
      R.nodeInst.trunk.setMatrixAt(wi, _m4.compose(_v, _q, _sc));
      _sc.set(alive ? 1 : 0.001, alive ? 1 : 0.001, alive ? 1 : 0.001);
      _v.set(x, 1.15, z);
      R.nodeInst.leaf.setMatrixAt(wi, _m4.compose(_v, _q, _sc));
      wi++;
    } else if (n.type === 'stone') {
      _q.setFromAxisAngle(new THREE.Vector3(0.3, 1, 0.2).normalize(), (n.tx * 13 + n.ty * 29) % 6.28);
      _sc.setScalar(alive ? 1 : 0.45);
      _v.set(x, alive ? 0.3 : 0.14, z);
      R.nodeInst.rock.setMatrixAt(ri++, _m4.compose(_v, _q, _sc));
    } else {
      _q.setFromAxisAngle(new THREE.Vector3(0.2, 1, 0.4).normalize(), (n.tx * 7 + n.ty * 23) % 6.28);
      _sc.setScalar(alive ? 1 : 0.4);
      _v.set(x, alive ? 0.34 : 0.15, z);
      R.nodeInst.iron.setMatrixAt(ii++, _m4.compose(_v, _q, _sc));
    }
  }
  R.nodeInst.trunk.count = wi; R.nodeInst.leaf.count = wi;
  R.nodeInst.rock.count = ri;  R.nodeInst.iron.count = ii;
  for (const k in R.nodeInst) R.nodeInst[k].instanceMatrix.needsUpdate = true;
}

/* ---------------- 거점 ---------------- */
function buildBase(S) {
  const g = new THREE.Group();
  const r = C.TILE * 1.5 * S3;
  const WALL_H = 3.0, WALL_T = 0.8;   // 사람(1.8)보다 확실히 높아야 성벽처럼 보입니다

  // 네 면의 성벽 — 통짜 상자가 아니라 벽 네 개라야 "요새"로 읽힙니다
  const sides = [
    [0, -r, r * 2, WALL_T], [0, r, r * 2, WALL_T],
    [-r, 0, WALL_T, r * 2], [r, 0, WALL_T, r * 2]
  ];
  for (const [ox, oz, sx, sz] of sides) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(sx, WALL_H, sz), MAT.stone);
    w.position.set(ox, WALL_H / 2, oz);
    w.castShadow = w.receiveShadow = R.quality.shadows;
    g.add(w);
  }

  // 안마당 바닥
  const yard = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 0.25, r * 2), MAT.stone);
  yard.position.y = 0.12;
  yard.receiveShadow = R.quality.shadows;
  g.add(yard);

  // 안쪽 망루
  const keep = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, 4.4, r * 0.9), MAT.stone);
  keep.position.y = 2.2;
  keep.castShadow = R.quality.shadows;
  g.add(keep);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 0.78, 1.5, 4), MAT.wood);
  roof.position.y = 5.1;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = R.quality.shadows;
  g.add(roof);

  // 성가퀴 — 성벽 위 톱니
  const step = r * 2 / 7;
  for (let i = 0; i <= 7; i++) {
    for (const [ox, oz] of [[0, -r], [0, r], [-r, 0], [r, 0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(step * 0.55, 0.5, WALL_T), MAT.stone);
      if (ox === 0) b.position.set(-r + i * step, WALL_H + 0.25, oz);
      else { b.position.set(ox, WALL_H + 0.25, -r + i * step); b.rotation.y = Math.PI / 2; }
      b.castShadow = R.quality.shadows;
      g.add(b);
    }
  }
  // 깃대
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), MAT.trunk);
  pole.position.set(0, 7.0, 0);
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.72), MAT.flag);
  flag.position.set(0.62, 7.8, 0);
  g.add(flag);
  R.baseFlag = flag;

  g.position.set(gx(S.base.x), 0, gz(S.base.y));
  R.baseGroup = g;
  R.scene.add(g);
}

/* ---------------- 장수 ---------------- */
function makeHumanoid(bodyColor, accentColor, scale0 = 1, withHelm = true) {
  const scale = scale0 * 1.32;   // 한 칸(2.8유닛) 대비 사람이 제대로 보이는 비율
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.26 * scale, 0.5 * scale, 4, 10),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.75 }));
  body.position.y = 0.62 * scale;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2 * scale, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xe8c9a0, roughness: 0.85 }));
  head.position.y = 1.12 * scale;
  head.castShadow = true;
  g.add(head);

  // 투구는 장수·병사만 씁니다. 몬스터는 두건으로 대신해 메시를 하나 아낍니다
  // (20마리가 동시에 나오면 그것만으로 draw call 20번 차이가 납니다).
  if (withHelm) {
    const helm = new THREE.Mesh(
      new THREE.ConeGeometry(0.23 * scale, 0.26 * scale, 8),
      new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5, metalness: 0.4 }));
    helm.position.y = 1.3 * scale;
    g.add(helm);
  }

  g.userData.body = body;
  g.userData.head = head;
  return g;
}

/* 장수마다 다른 무기를 쥐어줍니다 */
function makeWeapon(type) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.25, metalness: 0.85 });

  if (type === 'bow') {
    // 활 — 반원 몸체 + 시위
    const limb = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 14, Math.PI * 1.15), MAT.trunk);
    limb.rotation.set(0, Math.PI / 2, Math.PI / 2 + 0.3);
    limb.position.y = 0.1;
    g.add(limb);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.78, 3),
      new THREE.MeshStandardMaterial({ color: 0xe8e2d2 }));
    string.position.set(-0.13, 0.1, 0);
    g.add(string);
    g.userData.string = string;
  } else if (type === 'halberd') {
    // 방천화극 — 긴 자루 + 초승달 날
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.0, 6), MAT.trunk);
    shaft.position.y = 0.55;
    g.add(shaft);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 4), steel);
    blade.position.y = 1.75;
    g.add(blade);
    const moon = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 5, 10, Math.PI), steel);
    moon.position.set(0.17, 1.5, 0);
    moon.rotation.set(Math.PI / 2, 0, -0.4);
    g.add(moon);
  } else {
    // 검 — 자루 + 날 + 코등이
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.3, 6), MAT.trunk);
    grip.position.y = 0.15;
    g.add(grip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.08), steel);
    guard.position.y = 0.32;
    g.add(guard);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.0, 0.03), steel);
    blade.position.y = 0.85;
    g.add(blade);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), steel);
    tip.position.y = 1.42;
    g.add(tip);
  }
  return g;
}

function buildHero(S) {
  const d = S.heroDef;
  const g = makeHumanoid(d.color, d.accent, 1);

  // 망토
  const cape = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 1.05),
    new THREE.MeshStandardMaterial({ color: d.accent, roughness: 0.8, side: THREE.DoubleSide }));
  cape.position.set(0, 0.87, -0.32);
  g.add(cape);
  g.userData.cape = cape;

  // 무기 — 장수마다 다릅니다
  const wgrp = makeWeapon(d.weapon);
  wgrp.position.set(d.weapon === 'bow' ? 0.34 : 0.42, 0.72, d.weapon === 'bow' ? 0.18 : 0.05);
  wgrp.rotation.z = d.weapon === 'bow' ? 0 : -0.2;
  g.add(wgrp);
  g.userData.weapon = wgrp;
  g.userData.weaponType = d.weapon;

  g.position.set(gx(S.hero.x), 0, gz(S.hero.y));
  R.hero = g;
  R.scene.add(g);
}

/* ---------------- 시설 ---------------- */
function buildStructs(S) {
  for (const st of S.structs) addStruct(st);
}
export function addStruct(st) {
  const g = new THREE.Group();
  if (st.type === 'camp') {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.4, 7), MAT.wood);
    tent.position.y = 0.7;
    tent.castShadow = R.quality.shadows;
    g.add(tent);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), MAT.trunk);
    pole.position.y = 1.7;
    g.add(pole);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.3), MAT.flag);
    banner.position.set(0.24, 1.9, 0);
    g.add(banner);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.3), MAT.stone);
    body.position.y = 0.55;
    body.castShadow = R.quality.shadows;
    g.add(body);
    const forgeLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.4, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xE08B3C, emissive: 0xE08B3C, emissiveIntensity: 2.2 }));
    forgeLight.position.set(0, 0.5, 0.66);
    g.add(forgeLight);
    const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.28), MAT.ironRock);
    anvil.position.set(0.9, 0.15, 0);
    g.add(anvil);
  }
  g.position.set(gx(st.x), 0, gz(st.y));
  R.scene.add(g);
  return g;
}

/* ---------------- 목책 · 함정 ---------------- */
const spikeGeo = new THREE.ConeGeometry(0.13, 0.44, 5);

/* 목책 = 통나무 4개를 세운 울타리.
   통나무를 하나씩 Mesh 로 만들면 목책 200개 = 800 draw call 이 됩니다.
   전부 InstancedMesh 한 덩어리에 담아 1번에 그립니다. */
const LOGS_PER_WALL = 4;
const MAX_WALLS = 320;
const logGeo = new THREE.CylinderGeometry(0.17, 0.2, 1.15, 6);
const wallTiles = [];   // 세워진 순서대로 타일 키

function ensureWallInstances() {
  if (R.wallInst) return;
  R.wallInst = new THREE.InstancedMesh(logGeo, MAT.wood, MAX_WALLS * LOGS_PER_WALL);
  R.wallInst.castShadow = R.wallInst.receiveShadow = R.quality.shadows;
  R.wallInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  R.wallInst.count = 0;
  R.wallInst.frustumCulled = false;
  R.scene.add(R.wallInst);
}

function rebuildWalls() {
  ensureWallInstances();
  let i = 0;
  const half = C.TILE * S3 * 0.5;
  for (const k of wallTiles) {
    const tx = k % C.MAPW, ty = (k / C.MAPW) | 0;
    const cx = gx(tx * C.TILE + C.TILE / 2), cz = gz(ty * C.TILE + C.TILE / 2);
    for (let j = 0; j < LOGS_PER_WALL; j++) {
      if (i >= MAX_WALLS * LOGS_PER_WALL) break;
      // 통나무를 한 칸 폭에 나란히 세우고 조금씩 높이를 달리해 손으로 세운 느낌을 냅니다
      const t = (j + 0.5) / LOGS_PER_WALL;
      const h = 0.92 + ((tx * 7 + ty * 13 + j * 5) % 5) * 0.06;
      _sc.set(1, h, 1);
      _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (((tx + ty + j) % 3) - 1) * 0.05);
      _v.set(cx - half + t * half * 2, 0.575 * h, cz);
      R.wallInst.setMatrixAt(i++, _m4.compose(_v, _q, _sc));
    }
  }
  R.wallInst.count = i;
  R.wallInst.instanceMatrix.needsUpdate = true;
}

export function addWall(tx, ty) {
  const k = ty * C.MAPW + tx;
  if (wallTiles.includes(k)) return;
  wallTiles.push(k);
  rebuildWalls();
}
export function removeWall(tx, ty) {
  const k = ty * C.MAPW + tx;
  const i = wallTiles.indexOf(k);
  if (i >= 0) { wallTiles.splice(i, 1); rebuildWalls(); }
}
export function addTrap(tx, ty) {
  const k = ty * C.MAPW + tx;
  if (R.trapMeshes.has(k)) return;
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(spikeGeo, MAT.trapMat);
    s.position.set((i % 2 ? 0.5 : -0.5) * 0.55, 0.22, (i < 2 ? 0.5 : -0.5) * 0.55);
    s.castShadow = R.quality.shadows;
    g.add(s);
  }
  const pit = new THREE.Mesh(
    new THREE.BoxGeometry(C.TILE * S3 * 0.9, 0.06, C.TILE * S3 * 0.9),
    new THREE.MeshStandardMaterial({ color: 0x3a2420, roughness: 1 }));
  pit.position.y = 0.03;
  pit.receiveShadow = R.quality.shadows;
  g.add(pit);
  g.position.set(gx(tx * C.TILE + C.TILE / 2), 0, gz(ty * C.TILE + C.TILE / 2));
  R.scene.add(g);
  R.trapMeshes.set(k, g);
}
export function removeTrap(tx, ty) {
  const k = ty * C.MAPW + tx;
  const m = R.trapMeshes.get(k);
  if (m) { R.scene.remove(m); R.trapMeshes.delete(k); }
}

/* ---------------- 몬스터 · 병사 ---------------- */
const MONSTER_COLOR = 0xA8382A, BOSS_COLOR = 0x8C2B1F;
const ROLE_COLOR = { wood: 0x5FAE72, stone: 0x9E9384, def: 0xC6412F };

function makeMonsterMesh(m) {
  const scale = m.boss ? 1.7 : 0.95;
  const g = makeHumanoid(m.boss ? BOSS_COLOR : MONSTER_COLOR, 0xD9B84A, scale, false);
  // 황건 — 노란 두건
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.2 * scale, 0.05 * scale, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0xD9B84A, roughness: 0.8 }));
  band.rotation.x = Math.PI / 2;
  band.position.y = 1.2 * scale;
  g.add(band);
  if (m.boss) {
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.07 * scale, 0.35 * scale, 5),
        new THREE.MeshStandardMaterial({ color: 0x2a1a16, roughness: 0.6 }));
      horn.position.set(sx * 0.17 * scale, 1.42 * scale, 0);
      horn.rotation.z = sx * 0.4;
      g.add(horn);
    }
  }
  return g;
}

/* ==================================================================
   매 프레임 갱신
   ================================================================== */
export function sync(S, dt) {
  if (!R.renderer) return;

  // --- 장수 ---
  if (R.hero) {
    R.hero.visible = !S.hero.dead;
    R.hero.position.set(gx(S.hero.x), 0, gz(S.hero.y));
    R.hero.rotation.y = S.hero.facing;
    const bob = S.hero.moving ? Math.sin(S.t * 12) * 0.06 : 0;
    R.hero.userData.body.position.y = 0.82 + bob;
    R.hero.userData.head.position.y = 1.48 + bob;

    // ── 회피 구르기 — 앞으로 구르는 회전 ──
    if (S.hero.dodgeT > 0) {
      const p = 1 - S.hero.dodgeT / C.DODGE_TIME;
      R.hero.rotation.x = -p * Math.PI * 2;
      R.hero.position.y = Math.sin(p * Math.PI) * 0.25;
    } else {
      R.hero.rotation.x = 0;
      R.hero.position.y = 0;
    }

    // ── 무기별 공격 모션 ──
    const w = R.hero.userData.weapon;
    const wt = R.hero.userData.weaponType;
    if (w) {
      const sw = S.hero.swing;
      const kind = S.hero.swingKind;
      if (sw > 0) {
        const p = 1 - sw / (kind === 'attack' ? 0.24 : 0.32);   // 0→1 진행도
        if (kind === 'spin') {              // 회선 — 제자리 360도
          R.hero.rotation.y = S.hero.facing + p * Math.PI * 2;
          w.rotation.z = -1.4;
        } else if (kind === 'arc') {        // 참격 — 크게 베어내림
          w.rotation.x = -2.0 + p * 3.4;
          w.rotation.z = -0.9 + p * 1.4;
        } else if (wt === 'bow') {          // 활 — 당겼다 놓기
          const draw = p < 0.5 ? p * 2 : (1 - p) * 2;
          w.rotation.y = -0.5;
          if (w.userData.string) w.userData.string.position.x = -0.13 - draw * 0.22;
        } else if (wt === 'halberd') {      // 창 — 찌르기
          const thrust = Math.sin(p * Math.PI);
          w.rotation.x = -0.35 - thrust * 0.5;
          w.position.z = 0.05 + thrust * 0.55;
        } else {                            // 검 — 대각선 베기
          w.rotation.x = -1.5 + p * 2.6;
          w.rotation.z = -0.2 - Math.sin(p * Math.PI) * 1.1;
        }
      } else {
        w.rotation.set(0, wt === 'bow' ? -0.5 : 0, wt === 'bow' ? 0 : -0.2);
        w.position.z = wt === 'bow' ? 0.18 : 0.05;
        if (w.userData.string) w.userData.string.position.x = -0.13;
      }
    }

    // 무쌍난무·철벽 중에는 몸이 빛납니다
    const glow = S.hero.frenzy > 0 ? 0.5 : S.hero.guard > 0 ? 0.35 : 0;
    const bodyMat = R.hero.userData.body.material;
    bodyMat.emissive = bodyMat.emissive || new THREE.Color();
    bodyMat.emissive.setHex(S.hero.frenzy > 0 ? 0xE08B3C : 0x5B8FC7);
    bodyMat.emissiveIntensity = glow;
  }

  // --- 몬스터 ---
  const seen = new Set();
  for (const m of S.monsters) {
    let mesh = R.monsterMeshes.get(m);
    if (!mesh) { mesh = makeMonsterMesh(m); R.scene.add(mesh); R.monsterMeshes.set(m, mesh); }
    seen.add(m);
    mesh.position.set(gx(m.x), 0, gz(m.y));
    mesh.rotation.y = m.facing || 0;
    const scale = m.boss ? 1.7 : 0.95;
    mesh.userData.body.position.y = (0.82 + Math.sin(S.t * 10 + m.x) * 0.05) * scale;
    // 체력이 닳을수록 어두워지고, 맞는 순간 하얗게 번쩍입니다
    const ratio = Math.max(0, m.hp / m.maxHp);
    const base = new THREE.Color(m.boss ? BOSS_COLOR : MONSTER_COLOR);
    base.multiplyScalar(0.45 + ratio * 0.55);
    if (m.hitFlash > 0) base.lerp(new THREE.Color(0xffffff), 0.75);
    mesh.userData.body.material.color.copy(base);

    // ★ 공격 예고 — 바닥에 붉은 원이 차오릅니다. 다 차기 전에 구르면 피합니다.
    if (m.windup > 0) {
      let tg = R.telegraphs.get(m);
      if (!tg) {
        tg = new THREE.Mesh(
          new THREE.RingGeometry(0.1, 1.0, 28),
          new THREE.MeshBasicMaterial({ color: 0xC6412F, transparent: true, opacity: 0.75,
                                        side: THREE.DoubleSide, depthWrite: false }));
        tg.rotation.x = -Math.PI / 2;
        R.scene.add(tg);
        R.telegraphs.set(m, tg);
      }
      const full = m.boss ? C.MONSTER_WINDUP_BOSS : C.MONSTER_WINDUP;
      const p = 1 - m.windup / full;                 // 0 → 1 로 차오릅니다
      tg.visible = true;
      tg.position.set(gx(m.x), 0.05, gz(m.y));
      tg.scale.setScalar((m.boss ? 1.9 : 1.15) * (0.35 + p * 0.65));
      tg.material.opacity = 0.35 + p * 0.5;
      // 몸을 뒤로 젖혀 "때리려 한다"를 보여줍니다
      mesh.userData.body.rotation.x = -p * 0.5;
    } else {
      const tg = R.telegraphs.get(m);
      if (tg) tg.visible = false;
      mesh.userData.body.rotation.x = 0;
    }
  }
  for (const [m, mesh] of R.monsterMeshes) {
    if (!seen.has(m)) {
      R.scene.remove(mesh); R.monsterMeshes.delete(m);
      const tg = R.telegraphs.get(m);
      if (tg) { R.scene.remove(tg); R.telegraphs.delete(m); }
    }
  }

  // --- 병사 ---
  const sseen = new Set();
  for (const s of S.soldiers) {
    let mesh = R.soldierMeshes.get(s);
    if (!mesh) {
      mesh = makeHumanoid(ROLE_COLOR[s.role], 0xcfd6da, 0.82);
      R.scene.add(mesh); R.soldierMeshes.set(s, mesh);
    }
    sseen.add(s);
    mesh.visible = !s.down;
    mesh.position.set(gx(s.x), 0, gz(s.y));
    mesh.rotation.y = s.facing || 0;
    mesh.userData.body.material.color.set(ROLE_COLOR[s.role]);
    mesh.userData.body.position.y = 0.67 + Math.sin(S.t * 11 + s.x) * 0.04;
  }
  for (const [s, mesh] of R.soldierMeshes) {
    if (!sseen.has(s)) { R.scene.remove(mesh); R.soldierMeshes.delete(s); }
  }

  updateRings(S);
  updateArrows(dt);
  updateVfx(S, dt);

  // --- 낮과 밤 ---
  updateDayNight(S, dt);

  // --- 깃발 흔들림 ---
  if (R.baseFlag) R.baseFlag.rotation.y = Math.sin(S.t * 2) * 0.25;

  updateCamera(S, dt);
  drawMinimap(S);

  R.renderer.render(R.scene, R.camera);

  // 성능 집계
  R.stats.calls = R.renderer.info.render.calls;
  R.stats.tris = R.renderer.info.render.triangles;
  R._fpsN++; R._fpsT += dt;
  if (R._fpsT >= 0.5) { R.stats.fps = Math.round(R._fpsN / R._fpsT); R._fpsN = 0; R._fpsT = 0; }
}

/* 어디까지 닿는지, 무엇을 노리는지 바닥에 그려줍니다 */
function updateRings(S) {
  const r = R.rings;
  if (!r.attack) return;
  const h = S.hero;

  // 공격 사거리 — 적이 들어오면 하얗게 밝아집니다
  const range = (C.HERO_RANGE * (C.WEAPON[S.heroDef.weapon] || C.WEAPON.sword).range
                 * (S.heroDef.id === 'taesaja' ? 1.3 : 1)) * S3;
  let inRange = null, bd = Infinity;
  for (const m of S.monsters) {
    const d = Math.hypot(m.x - h.x, m.y - h.y);
    if (d < bd) { bd = d; if (d <= range / S3) inRange = m; }
  }
  r.attack.visible = !h.dead;
  r.attack.position.set(gx(h.x), 0.04, gz(h.y));
  r.attack.scale.setScalar(range);
  r.attack.material.opacity = inRange ? 0.55 : 0.14;
  r.attack.material.color.setHex(inRange ? 0xffffff : 0x9E9384);

  // 지금 노리는 적 — 흰 링
  r.target.visible = !!inRange;
  if (inRange) {
    r.target.position.set(gx(inRange.x), 0.06, gz(inRange.y));
    r.target.scale.setScalar(inRange.boss ? 1.9 : 1.1);
  }

  // 채집 대상 — 흰 링 (캐는 중이면 밝게 깜빡)
  const node = h.gatherTarget;
  r.gather.visible = !!node;
  if (node) {
    r.gather.position.set(gx(node.x), 0.06, gz(node.y));
    r.gather.scale.setScalar(1.05);
    r.gather.material.opacity = 0.55 + Math.sin(S.t * 9) * 0.3;
  }

  // 건설 가능 범위 — 건설 모드일 때만
  r.build.visible = R.buildMode;
  if (R.buildMode) {
    r.build.position.set(gx(h.x), 0.03, gz(h.y));
    r.build.scale.setScalar(C.BUILD_RANGE * S3);
  }
}
export function setBuildMode(on) { R.buildMode = on; }

function updateArrows(dt) {
  for (let i = R.arrows.length - 1; i >= 0; i--) {
    const a = R.arrows[i];
    a.t += dt;
    const p = a.t / a.dur;
    if (p >= 1) { R.scene.remove(a.mesh); R.arrows.splice(i, 1); continue; }
    a.mesh.position.lerpVectors(a.a, a.b, p);
    a.mesh.position.y += Math.sin(p * Math.PI) * 0.35;   // 살짝 포물선
  }
}

function updateVfx(S, dt) {
  for (let i = R.vfx.length - 1; i >= 0; i--) {
    const v = R.vfx[i];
    v.t += dt;
    const p = v.t / v.life;
    if (p >= 1) { R.scene.remove(v.mesh); R.vfx.splice(i, 1); continue; }
    if (v.kind === 'wave') {
      v.mesh.scale.setScalar(0.2 + p * v.radius);
      v.mesh.material.opacity = 0.85 * (1 - p);
    } else if (v.kind === 'beam') {
      v.mesh.material.opacity = 0.6 * (1 - p);
    } else if (v.kind === 'aura') {
      v.mesh.position.set(gx(S.hero.x), 0.07, gz(S.hero.y));
      v.mesh.scale.setScalar(1 + Math.sin(v.t * 8) * 0.08);
      v.mesh.material.opacity = 0.55 * (1 - p * 0.5);
    }
  }
}

let nightMix = 0;
function updateDayNight(S, dt) {
  const wantNight = (S.phase === 'night' || S.phase === 'warn') ? 1 : 0;
  nightMix += (wantNight - nightMix) * Math.min(1, dt * 1.6);

  const daySky = new THREE.Color(0x8fa7bd), nightSky = new THREE.Color(0x0d1526);
  const sky = daySky.clone().lerp(nightSky, nightMix);
  R.scene.background = sky;
  R.scene.fog.color = sky;
  R.scene.fog.near = 22 - nightMix * 14;
  R.scene.fog.far = 68 - nightMix * 32;

  R.sun.intensity = 2.1 * (1 - nightMix) + 0.06;
  R.sun.color.setHex(nightMix > 0.5 ? 0x9fb6e0 : 0xfff2d8);
  R.hemi.intensity = 0.75 * (1 - nightMix) + 0.12;

  R.baseLight.intensity = nightMix * 34;
  R.heroLight.intensity = nightMix * 22;
  if (!S.hero.dead) R.heroLight.position.set(gx(S.hero.x), 2.2, gz(S.hero.y));

  // 최후의 저항 — 거점 불빛이 붉게 타오릅니다
  if (S.lastStand) {
    R.baseLight.color.setHex(0xff5a3c);
    R.baseLight.intensity = (nightMix * 30 + 10) * (1 + Math.sin(S.t * 6) * 0.2);
  }

  // 그림자 카메라를 장수 주변으로 따라가게 해서 해상도를 아낍니다
  if (R.quality.shadows) {
    R.sun.target.position.set(gx(S.hero.x), 0, gz(S.hero.y));
    R.sun.position.set(gx(S.hero.x) + 24, 38, gz(S.hero.y) + 14);
    R.sun.target.updateMatrixWorld();
  }
}

/* ---------------- 카메라 (3인칭 추격) ---------------- */
function updateCamera(S, dt) {
  const tx = gx(S.hero.dead ? S.base.x : S.hero.x);
  const tz = gz(S.hero.dead ? S.base.y : S.hero.y);
  R.cam.target.lerp(new THREE.Vector3(tx, 1.1, tz), Math.min(1, dt * 7));

  const c = R.cam;
  const hDist = c.dist * Math.cos(c.pitch - Math.PI / 2 + 0.001);
  const px = c.target.x + Math.sin(c.yaw) * c.dist * Math.cos(c.pitch);
  const pz = c.target.z + Math.cos(c.yaw) * c.dist * Math.cos(c.pitch);
  const py = c.target.y + c.dist * Math.sin(c.pitch);

  // 타격·피격 시 화면이 짧게 흔들립니다
  let sx = 0, sy = 0;
  if (R.shake.t > 0) {
    R.shake.t -= dt;
    const k = Math.max(0, R.shake.t / 0.22) * R.shake.power;
    sx = (Math.random() - 0.5) * k;
    sy = (Math.random() - 0.5) * k;
    if (R.shake.t <= 0) R.shake.power = 0;
  }

  R.camera.position.set(px + sx, Math.max(1.5, py + sy), pz + sx);
  R.camera.lookAt(c.target);
}

export function orbitCamera(dx, dy) {
  R.cam.yaw -= dx * 0.006;
  R.cam.pitch = Math.max(0.25, Math.min(1.35, R.cam.pitch + dy * 0.004));
}
export function zoomCamera(delta) {
  R.cam.dist = Math.max(6, Math.min(34, R.cam.dist + delta));
}
export const getCameraYaw = () => R.cam.yaw;

/* ---------------- 지면 좌표 얻기 (건설용) ---------------- */
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
export function screenToTile(clientX, clientY) {
  const rect = R.renderer.domElement.getBoundingClientRect();
  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _ray.setFromCamera(_ndc, R.camera);
  const hit = _ray.intersectObject(R.ground, false);
  if (!hit.length) return null;
  const p = hit[0].point;
  return { tx: Math.floor(p.x / S3 / C.TILE), ty: Math.floor(p.z / S3 / C.TILE) };
}

/** 세계 좌표 → 화면 좌표 (떠오르는 글씨용) */
const _proj = new THREE.Vector3();
export function worldToScreen(x, y, height = 1.2) {
  _proj.set(gx(x), height, gz(y)).project(R.camera);
  const rect = R.renderer.domElement.getBoundingClientRect();
  return {
    x: (_proj.x * 0.5 + 0.5) * rect.width,
    y: (-_proj.y * 0.5 + 0.5) * rect.height,
    visible: _proj.z < 1
  };
}

/* ---------------- 설치 미리보기 ----------------
   바닥 색만 보여주지 않고 "실제로 뭐가 들어설지" 형태까지 보여줍니다.
   지어놓고 나서 "이게 아닌데" 하는 일을 줄이는 장치입니다. */
let ghost = null, ghostKind = null, ghostShape = null;

function ghostMaterial(color) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false });
}

function buildGhostShape(kind) {
  const g = new THREE.Group();
  const mat = ghostMaterial(0x5FAE72);
  if (kind === 'wall') {
    const half = C.TILE * S3 * 0.5;
    for (let j = 0; j < 4; j++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 1.05, 6), mat);
      log.position.set(-half + ((j + 0.5) / 4) * half * 2, 0.53, 0);
      g.add(log);
    }
  } else if (kind === 'trap') {
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.44, 5), mat);
      sp.position.set((i % 2 ? 0.5 : -0.5) * 0.55, 0.22, (i < 2 ? 0.5 : -0.5) * 0.55);
      g.add(sp);
    }
  } else if (kind === 'camp') {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.4, 7), mat);
    tent.position.y = 0.7;
    g.add(tent);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.3), mat);
    body.position.y = 0.55;
    g.add(body);
  }
  // 바닥 판 — 어느 칸에 들어가는지 명확히
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(C.TILE * S3 * 0.96, C.TILE * S3 * 0.96), ghostMaterial(0x5FAE72));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.03;
  g.add(pad);
  g.userData.parts = g.children;
  return g;
}

export function showGhost(tx, ty, okToBuild, kind, locked) {
  if (ghostKind !== kind) {
    if (ghost) R.scene.remove(ghost);
    ghost = buildGhostShape(kind);
    ghostKind = kind;
    R.scene.add(ghost);
  }
  ghost.visible = true;
  const color = okToBuild ? (locked ? 0xE0B44A : 0x5FAE72) : 0xC6412F;
  for (const part of ghost.children) part.material.color.setHex(color);
  // 확정 대기 중이면 살짝 위아래로 움직여 "확인을 기다린다"를 알립니다
  const bob = locked ? Math.sin(performance.now() * 0.006) * 0.06 : 0;
  ghost.position.set(gx(tx * C.TILE + C.TILE / 2), bob, gz(ty * C.TILE + C.TILE / 2));
}
export function hideGhost() { if (ghost) ghost.visible = false; }

/* ---------------- 화살 · 스킬 이펙트 ---------------- */
const arrowGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 4);
const arrowMat = new THREE.MeshStandardMaterial({ color: 0xd9c9a0, roughness: 0.6 });

export function spawnArrow(from, to) {
  const m = new THREE.Mesh(arrowGeo, arrowMat);
  const a = new THREE.Vector3(gx(from.x), 1.15, gz(from.y));
  const b = new THREE.Vector3(gx(to.x), 0.9, gz(to.y));
  m.position.copy(a);
  m.lookAt(b);
  m.rotateX(Math.PI / 2);
  R.scene.add(m);
  R.arrows.push({ mesh: m, a, b, t: 0, dur: Math.max(0.08, a.distanceTo(b) / 42) });
}

/** 바닥에서 퍼져나가는 원 — 광역 스킬의 범위를 눈으로 알려줍니다 */
export function spawnShockwave(x, y, radius, color, life = 0.45) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85,
                                  side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(gx(x), 0.08, gz(y));
  R.scene.add(m);
  R.vfx.push({ mesh: m, t: 0, life, kind: 'wave', radius: radius * S3 });
}

/** 직선 스킬(관통사)의 궤적 */
export function spawnBeam(x, y, facing, range, color) {
  const len = range * S3;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.45, len),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6,
                                  side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -facing;
  m.position.set(gx(x) + Math.sin(facing) * len / 2, 0.09, gz(y) + Math.cos(facing) * len / 2);
  R.scene.add(m);
  R.vfx.push({ mesh: m, t: 0, life: 0.3, kind: 'beam' });
}

/** 장수 주변 오라 (철벽 · 무쌍난무) */
export function spawnAura(color, dur) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 0.95, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7,
                                  side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  R.scene.add(m);
  R.vfx.push({ mesh: m, t: 0, life: dur, kind: 'aura' });
}

export function shakeCamera(power) {
  R.shake.power = Math.max(R.shake.power, power);
  R.shake.t = 0.22;
}

/* ---------------- 미니맵 ---------------- */
export function attachMinimap(canvas) {
  R.minimap = canvas;
  R.minimapCtx = canvas.getContext('2d');
  canvas.width = canvas.clientWidth || 150;
  canvas.height = canvas.clientHeight || 120;
}

function drawMinimap(S) {
  if (!R.minimapCtx) return;
  R._minimapT += 1;
  if (R._minimapT % 4 !== 0) return;      // 초당 15회만 그립니다

  const ctx = R.minimapCtx;
  const w = R.minimap.width, h = R.minimap.height;
  const sx = w / C.WORLD_W, sy = h / C.WORLD_H;

  ctx.fillStyle = '#1a2418';
  ctx.fillRect(0, 0, w, h);

  // 중앙 자원 지대
  const mid = Math.floor(C.MAPW / 2);
  ctx.fillStyle = 'rgba(224,180,74,0.14)';
  ctx.fillRect((mid - 4) * C.TILE * sx, 0, 8 * C.TILE * sx, h);

  // 목책
  ctx.fillStyle = '#96703f';
  for (const k of S.wallList) {
    if (S.occ[k] !== C.OCC_WALL) continue;
    ctx.fillRect((k % C.MAPW) * C.TILE * sx, ((k / C.MAPW) | 0) * C.TILE * sy,
                 Math.max(1.5, C.TILE * sx), Math.max(1.5, C.TILE * sy));
  }
  // 함정
  ctx.fillStyle = '#C6412F';
  for (const t of S.traps) {
    if (t.dur <= 0) continue;
    ctx.fillRect(t.tx * C.TILE * sx, t.ty * C.TILE * sy, Math.max(1.5, C.TILE * sx), Math.max(1.5, C.TILE * sy));
  }
  // 거점
  ctx.fillStyle = '#E0B44A';
  ctx.fillRect(S.base.x * sx - 4, S.base.y * sy - 4, 8, 8);
  // 병사
  ctx.fillStyle = '#5FAE72';
  for (const s of S.soldiers) { if (!s.down) ctx.fillRect(s.x * sx - 1.5, s.y * sy - 1.5, 3, 3); }
  // 몬스터
  ctx.fillStyle = '#E0554A';
  for (const m of S.monsters) {
    const r = m.boss ? 4 : 2.2;
    ctx.fillRect(m.x * sx - r / 2, m.y * sy - r / 2, r, r);
  }
  // 장수
  if (!S.hero.dead) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(S.hero.x * sx, S.hero.y * sy, 3.2, 0, 6.283);
    ctx.fill();
  }
}
