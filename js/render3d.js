/* ==================================================================
   3D 화면
   ------------------------------------------------------------------
   게임 규칙(sim.js)은 전혀 건드리지 않습니다. 상태를 읽어서 그리기만 합니다.
   좌표 환산: 게임의 (x, y) → 3D의 (x*SCALE, 높이, y*SCALE)
   ================================================================== */

import * as THREE from '../vendor/three.module.min.js';
import { EffectComposer } from '../vendor/addons/EffectComposer.js';
import { RenderPass } from '../vendor/addons/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/OutputPass.js';
import * as BufferGeometryUtils from '../vendor/addons/BufferGeometryUtils.js';
import * as C from './config.js';
import * as Sim from './sim.js';
import * as Tex from './textures.js';
import * as Models from './models.js';

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
  composer: null, bloom: null, sky: null, grass: null,
  shake: { t: 0, power: 0 },
  path: { inst: null, gates: null, dirty: true, sig: '', dirs: [], points: [] },
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
  const groundRepeat = Math.round((C.WORLD_W * S3) / 7);

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
  // 철광의 광맥 — 어두운 바위에 박힌 주황빛 결정. 이게 있어야 그냥 돌과 구분됩니다.
  MAT.ironVein = new THREE.MeshStandardMaterial({ color: 0xC98A4B, roughness: 0.35, metalness: 0.6,
                                                  emissive: 0x5a3312, emissiveIntensity: 0.55 });
  MAT.herbLeaf = new THREE.MeshStandardMaterial({ color: 0x6FBF7A, roughness: 0.85 });
  MAT.herbFlower = new THREE.MeshStandardMaterial({ color: 0xE8E3A0, roughness: 0.7,
                                                    emissive: 0x3a3a10, emissiveIntensity: 0.4 });
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
  if (window.__forceHQ) R.quality.lowSpec = false;   // 검수용 — 실제 GPU 환경을 흉내냅니다
  const mobile = window.innerWidth < 820 || /Mobi|Android/i.test(navigator.userAgent);
  R.quality.shadows = (!R.quality.lowSpec && !mobile) || !!window.__forceHQ;

  R.renderer = new THREE.WebGLRenderer({ antialias: !R.quality.lowSpec && !mobile, powerPreference: 'high-performance' });
  R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  R.renderer.shadowMap.enabled = R.quality.shadows;
  R.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  R.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // 후처리는 내부적으로 여러 번 그리므로 자동 초기화를 끄고 프레임 단위로 직접 셉니다
  R.renderer.info.autoReset = false;
  R.renderer.toneMappingExposure = 1.05;
  container.appendChild(R.renderer.domElement);

  buildMaterials();

  // 조명 — 태양 1개 + 하늘빛. 밤에는 이 둘을 낮추고 횃불을 켭니다.
  R.hemi = new THREE.HemisphereLight(0xcfe4f7, 0x6a7258, 1.05);
  R.scene.add(R.hemi);

  R.sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
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

  // 후처리 — 빛이 번지면 밤의 횃불과 대장간 화로가 살아납니다.
  // 저사양·모바일에서는 비용이 크므로 끕니다.
  if ((!R.quality.lowSpec && !mobile) || window.__forceHQ) {
    R.composer = new EffectComposer(R.renderer);
    R.composer.addPass(new RenderPass(R.scene, R.camera));
    R.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.75, 0.82);
    R.composer.addPass(R.bloom);
    R.composer.addPass(new OutputPass());
  }

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
  if (R.composer) R.composer.setSize(w, h);
  if (R.minimap) { R.minimap.width = R.minimap.clientWidth; R.minimap.height = R.minimap.clientHeight; }
}

/* ---------------- 하늘 ----------------
   단색 배경은 값싸 보입니다. 위아래 색이 다른 돔 하나만 씌워도
   "하늘 아래 있다"는 느낌이 생깁니다. 낮과 밤에 색이 바뀝니다. */
const SKY_VERT = `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const SKY_FRAG = `
  uniform vec3 top;
  uniform vec3 bottom;
  uniform float horizon;
  varying vec3 vWorld;
  void main() {
    float h = normalize(vWorld - cameraPosition).y;
    float t = smoothstep(-0.12, horizon, h);
    gl_FragColor = vec4(mix(bottom, top, t), 1.0);
  }`;

function buildSky() {
  if (R.sky) return;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top:     { value: new THREE.Color(0x4e7fb5) },
      bottom:  { value: new THREE.Color(0xc9d8e4) },
      horizon: { value: 0.45 }
    },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    side: THREE.BackSide, depthWrite: false, fog: false
  });
  R.sky = new THREE.Mesh(new THREE.SphereGeometry(320, 24, 16), mat);
  R.sky.frustumCulled = false;
  R.scene.add(R.sky);
}

/* ---------------- 잔디 ----------------
   땅이 밋밋해 보이는 가장 큰 이유는 "아무것도 안 자라서"입니다.
   풀잎 수천 개도 InstancedMesh 하나면 draw call 1번입니다. */
function buildGrass(S) {
  if (R.grass) { R.scene.remove(R.grass); R.grass = null; }
  const count = R.quality.lowSpec ? 900 : 4200;
  const blade = new THREE.ConeGeometry(0.1, 0.62, 3);
  blade.translate(0, 0.31, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x4d7f45, roughness: 1 });
  const im = new THREE.InstancedMesh(blade, mat, count);
  im.castShadow = false;                 // 풀 그림자는 눈에 안 띄는데 비용만 큽니다
  im.receiveShadow = R.quality.shadows;
  im.frustumCulled = false;

  const W = C.WORLD_W * S3, H = C.WORLD_H * S3;
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = Math.random() * W, z = Math.random() * H;
    const sc = 0.65 + Math.random() * 0.9;
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
    _sc.set(sc, sc * (0.7 + Math.random() * 0.8), sc);
    _v.set(x, 0, z);
    im.setMatrixAt(i, _m4.compose(_v, _q, _sc));
    // 풀색도 조금씩 다르게 — 전부 같은 초록이면 인공적으로 보입니다
    col.setHSL(0.25 + Math.random() * 0.06, 0.34 + Math.random() * 0.2, 0.30 + Math.random() * 0.18);
    im.setColorAt(i, col);
  }
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  R.grass = im;
  R.scene.add(im);
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
  R.path.dirty = true; R.path.sig = '';
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

  buildSky();
  buildGrass(S);
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
  /* ★ 예전 코드는 herb 를 세지 않고 iron 인스턴스에 같이 그려 넣었습니다.
     철광 용량(14)보다 많은 40개를 쓰는 바람에 약초 26포기가 화면에서 통째로 사라졌고,
     그려진 것들도 철광과 똑같은 회색 돌로 보였습니다.
     ("나무랑 돌밖에 안 보인다" 의 원인이 이것입니다) */
  const counts = { wood: 0, stone: 0, iron: 0, herb: 0 };
  for (const n of S.nodes) counts[n.type] = (counts[n.type] || 0) + 1;

  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.14, 0.9, 6);
  const leafGeo = new THREE.ConeGeometry(0.62, 1.35, 7);
  const leaf2Geo = new THREE.ConeGeometry(0.44, 1.0, 7);     // 위쪽 작은 잎 — 실루엣이 살아납니다
  const rockGeo = new THREE.IcosahedronGeometry(0.42, 0);
  const ironGeo = new THREE.DodecahedronGeometry(0.46, 0);
  const veinGeo = new THREE.OctahedronGeometry(0.2, 0);      // 철광에 박힌 결정
  const herbGeo = new THREE.SphereGeometry(0.3, 7, 5);       // 약초 덤불
  const budGeo  = new THREE.SphereGeometry(0.1, 6, 4);       // 그 위의 꽃

  /* models/ 에 모델이 등록돼 있으면 그 지오메트리를 씁니다.
     없으면 지금처럼 도형으로 그립니다 — 그래서 언제 넣어도 됩니다. */
  const pick = (slot, geo, mat) => {
    const m = Models.get(slot);
    return (m && m.geo) ? [m.geo, m.mat || mat] : [geo, mat];
  };

  const mk = (geo, mat, count) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    im.castShadow = R.quality.shadows;
    im.receiveShadow = R.quality.shadows;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    R.scene.add(im);
    return im;
  };

  // 나무 모델이 등록돼 있으면 줄기·잎을 나누지 않고 모델 하나로 대체합니다
  R.usingTreeModel = Models.has('tree');
  if (R.usingTreeModel) {
    const t = Models.get('tree');
    R.nodeInst.trunk = mk(t.geo, t.mat || MAT.trunk, counts.wood);
    R.nodeInst.leaf  = mk(leafGeo, MAT.foliage, 1);
    R.nodeInst.leaf2 = mk(leaf2Geo, MAT.foliage, 1);
  } else {
    R.nodeInst.trunk = mk(trunkGeo, MAT.trunk, counts.wood);
    R.nodeInst.leaf  = mk(leafGeo, MAT.foliage, counts.wood);
    R.nodeInst.leaf2 = mk(leaf2Geo, MAT.foliage, counts.wood);
  }
  const [rg, rm] = pick('rock', rockGeo, MAT.rock);
  const [ig, im2] = pick('iron', ironGeo, MAT.ironRock);
  R.nodeInst.rock  = mk(rg, rm, counts.stone);
  R.nodeInst.iron  = mk(ig, im2, counts.iron);
  R.nodeInst.vein  = mk(veinGeo, MAT.ironVein, counts.iron);
  R.nodeInst.herb  = mk(herbGeo, MAT.herbLeaf, counts.herb);
  R.nodeInst.bud   = mk(budGeo, MAT.herbFlower, counts.herb);

  refreshNodes(S);
}

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _sc = new THREE.Vector3();

/** 자원지가 고갈되거나 되살아나면 다시 배치합니다 */
const _col = new THREE.Color();
/** 같은 값에서 늘 같은 결과가 나오는 작은 난수 — 나무마다 개성을 주되 매 프레임 흔들리지 않게 */
function hash01(a, b) {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

export function refreshNodes(S) {
  let wi = 0, ri = 0, ii = 0, hi = 0;
  for (const n of S.nodes) {
    const x = gx(n.x), z = gz(n.y);
    const alive = n.amt > 0;
    const r1 = hash01(n.tx, n.ty), r2 = hash01(n.ty, n.tx * 3);
    if (n.type === 'wood') {
      // 나무마다 키·굵기·기울기·색을 다르게 — 똑같은 나무 120그루는 바로 티가 납니다
      const big = 0.78 + r1 * 0.65;
      const h = alive ? big : 0.3;
      const tilt = (r2 - 0.5) * 0.14;
      _q.setFromEuler(new THREE.Euler(tilt, (r1 * 6.28), tilt * 0.6));
      _sc.set(0.85 + r2 * 0.4, h, 0.85 + r2 * 0.4);
      _v.set(x, 0.45 * h, z);
      R.nodeInst.trunk.setMatrixAt(wi, _m4.compose(_v, _q, _sc));

      const ls = alive ? big : 0.001;
      _sc.set(ls, ls, ls);
      _v.set(x, 1.28 * big, z);
      R.nodeInst.leaf.setMatrixAt(wi, _m4.compose(_v, _q, _sc));
      _v.set(x, 2.05 * big, z);
      R.nodeInst.leaf2.setMatrixAt(wi, _m4.compose(_v, _q, _sc));

      // 잎 색도 개체마다 — 노란 기 도는 것부터 짙은 것까지
      _col.setHSL(0.24 + r1 * 0.06, 0.34 + r2 * 0.2, 0.20 + r1 * 0.14);
      R.nodeInst.leaf.setColorAt(wi, _col);
      _col.offsetHSL(0, 0, 0.05);
      R.nodeInst.leaf2.setColorAt(wi, _col);
      _col.setHSL(0.08, 0.3, 0.16 + r2 * 0.08);
      R.nodeInst.trunk.setColorAt(wi, _col);
      wi++;
    } else if (n.type === 'stone') {
      _q.setFromEuler(new THREE.Euler(r1 * 1.2, r2 * 6.28, r1 * 0.8));
      const rs = (alive ? 0.75 + r1 * 0.7 : 0.4);
      _sc.set(rs, rs * (0.7 + r2 * 0.5), rs);
      _v.set(x, 0.26 * rs, z);
      _col.setHSL(0.09, 0.05 + r1 * 0.05, 0.36 + r2 * 0.2);
      R.nodeInst.rock.setColorAt(ri, _col);
      R.nodeInst.rock.setMatrixAt(ri++, _m4.compose(_v, _q, _sc));
    } else if (n.type === 'iron') {
      _q.setFromAxisAngle(new THREE.Vector3(0.2, 1, 0.4).normalize(), (n.tx * 7 + n.ty * 23) % 6.28);
      _sc.setScalar(alive ? 1 : 0.4);
      _v.set(x, alive ? 0.34 : 0.15, z);
      R.nodeInst.iron.setMatrixAt(ii, _m4.compose(_v, _q, _sc));
      // 바위 위로 삐져나온 주황 결정 — 멀리서도 "저건 철광이다" 가 보입니다
      _q.setFromEuler(new THREE.Euler(r1 * 2, r2 * 6.28, r1 * 1.5));
      _sc.setScalar(alive ? 0.9 + r2 * 0.5 : 0.001);
      _v.set(x + (r1 - 0.5) * 0.3, alive ? 0.62 : 0, z + (r2 - 0.5) * 0.3);
      R.nodeInst.vein.setMatrixAt(ii++, _m4.compose(_v, _q, _sc));
    } else {
      // 약초 — 낮고 둥근 초록 덤불에 옅은 꽃. 나무·바위와 실루엣이 확실히 다릅니다.
      _q.setFromEuler(new THREE.Euler(0, r1 * 6.28, 0));
      const hs = alive ? 0.85 + r1 * 0.45 : 0.3;
      _sc.set(hs * 1.15, hs * 0.75, hs * 1.15);
      _v.set(x, 0.2 * hs, z);
      _col.setHSL(0.29 + r2 * 0.05, 0.35 + r1 * 0.20, 0.32 + r2 * 0.12);
      R.nodeInst.herb.setColorAt(hi, _col);
      R.nodeInst.herb.setMatrixAt(hi, _m4.compose(_v, _q, _sc));
      _sc.setScalar(alive ? 0.9 + r1 * 0.5 : 0.001);
      _v.set(x + (r1 - 0.5) * 0.25, alive ? 0.42 * hs + 0.12 : 0, z + (r2 - 0.5) * 0.25);
      R.nodeInst.bud.setMatrixAt(hi++, _m4.compose(_v, _q, _sc));
    }
  }
  R.nodeInst.trunk.count = wi;
  R.nodeInst.leaf.count = R.usingTreeModel ? 0 : wi;
  R.nodeInst.leaf2.count = R.usingTreeModel ? 0 : wi;
  R.nodeInst.rock.count = ri;
  R.nodeInst.iron.count = ii;  R.nodeInst.vein.count = ii;
  R.nodeInst.herb.count = hi;  R.nodeInst.bud.count  = hi;
  for (const k in R.nodeInst) {
    R.nodeInst[k].instanceMatrix.needsUpdate = true;
    if (R.nodeInst[k].instanceColor) R.nodeInst[k].instanceColor.needsUpdate = true;
  }
}

/* ---------------- 거점 ---------------- */
/** 같은 재질의 조각들을 하나로 합쳐 draw call 을 줄입니다.
    거점처럼 움직이지 않는 구조물에 특히 효과가 큽니다(성가퀴 32개 → 1개). */
function mergeParts(parts, material, cast, receive) {
  const geos = parts.map(p => {
    const g = p.geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(
      p.pos, p.quat || new THREE.Quaternion(), p.scale || new THREE.Vector3(1, 1, 1)));
    return g;
  });
  const merged = BufferGeometryUtils.mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  const m = new THREE.Mesh(merged, material);
  m.castShadow = !!cast; m.receiveShadow = !!receive;
  return m;
}

/** 모델을 게임이 기대하는 형태(userData.body/head 를 가진 그룹)로 감쌉니다 */
function wrapModel(slot) {
  const g = new THREE.Group();
  const model = Models.clone(slot);
  g.add(model);
  // 애니메이션·색 변화 코드가 찾는 자리를 만들어 둡니다
  let firstMesh = null;
  model.traverse(o => { if (!firstMesh && o.isMesh) firstMesh = o; });
  g.userData.body = firstMesh || model;
  g.userData.head = firstMesh || model;
  g.userData.isModel = true;
  return g;
}

/** 성을 다시 짓습니다 (업그레이드 시 호출) */
export function rebuildBase(S) {
  if (R.baseGroup) { R.scene.remove(R.baseGroup); R.baseGroup = null; }
  buildBase(S);
}

function buildBase(S) {
  if (Models.has('base')) {
    const g = wrapModel('base');
    g.position.set(gx(S.base.x), 0, gz(S.base.y));
    R.baseGroup = g;
    R.scene.add(g);
    return;
  }
  const g = new THREE.Group();
  const lv = S.baseLv || 1;
  // 단계가 오르면 눈에 보이게 커집니다 — 자원을 쓴 보람이 있어야 합니다
  const r = C.TILE * 1.5 * S3 * (1 + (lv - 1) * 0.12);
  const WALL_H = 3.0 + (lv - 1) * 1.1, WALL_T = 0.8 + (lv - 1) * 0.15;

  // 돌로 된 부분을 전부 모아 한 번에 그립니다.
  // 성가퀴만 32개라 따로 그리면 거점 하나에 draw call 40번(그림자까지 80번)이 듭니다.
  const stoneParts = [];
  const keepTop = 4.4 + (lv - 1) * 1.2;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const sides = [
    [0, -r, r * 2, WALL_T], [0, r, r * 2, WALL_T],
    [-r, 0, WALL_T, r * 2], [r, 0, WALL_T, r * 2]
  ];
  for (const [ox, oz, sx, sz] of sides) {
    stoneParts.push({ geo: new THREE.BoxGeometry(sx, WALL_H, sz), pos: V(ox, WALL_H / 2, oz) });
  }
  stoneParts.push({ geo: new THREE.BoxGeometry(r * 2, 0.25, r * 2), pos: V(0, 0.12, 0) });   // 안마당
  stoneParts.push({ geo: new THREE.BoxGeometry(r * 0.9, keepTop, r * 0.9), pos: V(0, keepTop / 2, 0) }); // 망루

  const step = r * 2 / 7;
  const qRot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  for (let i = 0; i <= 7; i++) {
    for (const [ox, oz] of [[0, -r], [0, r], [-r, 0], [r, 0]]) {
      const geo = new THREE.BoxGeometry(step * 0.55, 0.5, WALL_T);
      if (ox === 0) stoneParts.push({ geo, pos: V(-r + i * step, WALL_H + 0.25, oz) });
      else stoneParts.push({ geo, pos: V(ox, WALL_H + 0.25, -r + i * step), quat: qRot });
    }
  }
  g.add(mergeParts(stoneParts, MAT.stone, R.quality.shadows, R.quality.shadows));

  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 0.78, 1.5 + (lv - 1) * 0.4, 4),
                              lv >= 3 ? MAT.ironRock : MAT.wood);
  roof.position.y = keepTop + 0.9;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = R.quality.shadows;
  g.add(roof);

  // 3단계 — 망루에 화살대를 세워 "자동으로 쏜다"를 보여줍니다
  if (lv >= 3) {
    for (const [ox, oz] of [[-r*0.8, -r*0.8], [r*0.8, -r*0.8], [-r*0.8, r*0.8], [r*0.8, r*0.8]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, WALL_H + 1.4, 6), MAT.stone);
      t.position.set(ox, (WALL_H + 1.4) / 2, oz);
      t.castShadow = R.quality.shadows;
      g.add(t);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 6), MAT.ironRock);
      cap.position.set(ox, WALL_H + 1.75, oz);
      g.add(cap);
    }
  }
  // 깃대
  const flagY = keepTop + 2.9;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), MAT.trunk);
  pole.position.set(0, flagY, 0);
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.72), MAT.flag);
  flag.position.set(0.62, flagY + 0.8, 0);
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
  const modelSlot = 'hero_' + d.weapon;
  const g = Models.has(modelSlot) ? wrapModel(modelSlot) : makeHumanoid(d.color, d.accent, 1);

  // 망토
  const cape = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 1.05),
    new THREE.MeshStandardMaterial({ color: d.accent, roughness: 0.8, side: THREE.DoubleSide }));
  cape.position.set(0, 0.87, -0.32);
  g.add(cape);
  g.userData.cape = cape;

  // 무기 — 장수마다 다릅니다
  const wgrp = makeWeapon(d.weapon);
  // 무기를 크게 — 작으면 뭘 들었는지 안 보입니다
  const wscale = (C.WEAPON[d.weapon] || C.WEAPON.sword).scale || 1.4;
  wgrp.scale.setScalar(wscale);
  wgrp.position.set(d.weapon === 'bow' ? 0.42 : 0.5, 0.72, d.weapon === 'bow' ? 0.22 : 0.05);
  wgrp.rotation.z = d.weapon === 'bow' ? 0 : -0.2;
  g.add(wgrp);
  g.userData.weapon = wgrp;
  g.userData.weaponType = d.weapon;

  // 발밑 표식 — 저폴리 화면에서 내 캐릭터를 놓치지 않게 (ARPG 관례)
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.56, 24),
    new THREE.MeshBasicMaterial({ color: d.accent, transparent: true, opacity: 0.85,
                                  side: THREE.DoubleSide, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.05;
  marker.renderOrder = 3;
  g.add(marker);
  g.userData.marker = marker;

  g.position.set(gx(S.hero.x), 0, gz(S.hero.y));
  R.hero = g;
  R.scene.add(g);
}

/* ---------------- 시설 ---------------- */
function buildStructs(S) {
  for (const st of S.structs) addStruct(st);
}
export function addStruct(st) {
  if (Models.has(st.type)) {
    const g = wrapModel(st.type);
    g.position.set(gx(st.x), 0, gz(st.y));
    R.scene.add(g);
    return g;
  }
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

/* ★ 목책이 늘 같은 방향으로만 서 있으면 어색합니다.
   이웃한 목책을 보고 결을 맞춥니다:
     좌우로 이어지면  가로로 늘어서고
     위아래로 이어지면 세로로 늘어서고
     모서리·외톨이는   네 귀퉁이에 박습니다 */
function wallLayout(tx, ty, tileSet) {
  const E = tileSet.has(ty * C.MAPW + (tx + 1)) || tileSet.has(ty * C.MAPW + (tx - 1));
  const N = tileSet.has((ty + 1) * C.MAPW + tx) || tileSet.has((ty - 1) * C.MAPW + tx);
  if (E && N) return 'corner';
  if (N) return 'vertical';
  if (E) return 'horizontal';
  return 'post';
}

function rebuildWalls() {
  ensureWallInstances();
  let i = 0;
  const half = C.TILE * S3 * 0.5;
  const tileSet = new Set(wallTiles);

  for (const k of wallTiles) {
    const tx = k % C.MAPW, ty = (k / C.MAPW) | 0;
    const cx = gx(tx * C.TILE + C.TILE / 2), cz = gz(ty * C.TILE + C.TILE / 2);
    const layout = wallLayout(tx, ty, tileSet);

    for (let j = 0; j < LOGS_PER_WALL; j++) {
      if (i >= MAX_WALLS * LOGS_PER_WALL) break;
      const t = (j + 0.5) / LOGS_PER_WALL;
      // 손으로 세운 느낌 — 높이와 기울기를 조금씩 다르게
      const h = 0.92 + ((tx * 7 + ty * 13 + j * 5) % 5) * 0.06;
      const lean = (((tx + ty + j) % 3) - 1) * 0.05;

      let ox = 0, oz = 0;
      if (layout === 'horizontal')      { ox = -half + t * half * 2; oz = 0; }
      else if (layout === 'vertical')   { ox = 0; oz = -half + t * half * 2; }
      else if (layout === 'corner')     {          // 모서리 — ㄱ 자로 꺾어 세웁니다
        ox = (j < 2 ? -half + (j + 0.5) * half : 0);
        oz = (j < 2 ? 0 : -half + (j - 1.5) * half);
      } else {                                      // 외톨이 — 네 귀퉁이에 박은 말뚝
        ox = (j % 2 ? 1 : -1) * half * 0.45;
        oz = (j < 2 ? -1 : 1) * half * 0.45;
      }

      _sc.set(1, h, 1);
      _q.setFromEuler(new THREE.Euler(layout === 'vertical' ? lean : 0, 0,
                                      layout === 'vertical' ? 0 : lean));
      _v.set(cx + ox, 0.575 * h, cz + oz);
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
const ROLE_COLOR = { wood: 0x5FAE72, stone: 0x9E9384, herb: 0x6FBF7A, iron: 0xC98A4B, def: 0xC6412F };

/** 종류별 색 — 방패병은 잿빛, 기병은 주황, 정예는 보라. 한눈에 구분돼야 대응이 갈립니다. */
function kindColor(m) {
  if (m.boss) return BOSS_COLOR;
  const K = C.MONSTER_KINDS[m.kind];
  return K ? K.color : MONSTER_COLOR;
}
const monScale = m => (m.boss ? 1.7 : 0.95 * (m.scale || 1));

function makeMonsterMesh(m) {
  const scale = monScale(m);
  const slot = m.boss ? 'boss' : 'monster';
  if (Models.has(slot)) return wrapModel(slot);
  const g = makeHumanoid(kindColor(m), 0xD9B84A, scale, false);
  // 황건 — 노란 두건
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.2 * scale, 0.05 * scale, 6, 12),
    new THREE.MeshStandardMaterial({ color: 0xD9B84A, roughness: 0.8 }));
  band.rotation.x = Math.PI / 2;
  band.position.y = 1.2 * scale;
  g.add(band);
  if (m.kind === 'tank') {
    const shield = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34 * scale, 0.34 * scale, 0.07 * scale, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.7, metalness: 0.3 }));
    shield.rotation.set(Math.PI / 2, 0, 0);
    shield.position.set(-0.32 * scale, 0.9 * scale, 0.18 * scale);
    g.add(shield);
  }
  if (m.kind === 'elite') {
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.09 * scale, 0.4 * scale, 6),
      new THREE.MeshStandardMaterial({ color: 0xE0B44A, roughness: 0.6 }));
    plume.position.y = 1.45 * scale;
    g.add(plume);
  }
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
   예상 침공로 — 이 게임에서 가장 중요한 안내 장치
   ------------------------------------------------------------------
   "적이 어디로 오는지" 를 모르면 목책과 함정을 어디에 놓을지 판단할 수 없습니다.
   그래서 다음 웨이브의 진입 지점과, 거기서 거점까지 실제로 걸어올 길을
   낮에도 바닥에 그려줍니다. 목책을 하나 놓으면 이 길이 즉시 휘어집니다.
   → 플레이어가 "내 목책이 적의 길을 바꿨다" 를 눈으로 보게 됩니다.
   ================================================================== */
const PATH_MAX = 520;                   // 화살표 인스턴스 최대 개수

export function markPathDirty() { R.path.dirty = true; }

function ensurePathInst() {
  if (R.path.inst) return;
  // 납작한 삼각형(쐐기) 하나를 거점 쪽으로 눕혀 씁니다 — 전부 합쳐 draw call 1
  const g = new THREE.ConeGeometry(0.23, 0.52, 3);
  g.rotateX(Math.PI / 2);               // 바닥에 눕힙니다
  const mat = new THREE.MeshBasicMaterial({
    color: 0xE0554A, transparent: true, opacity: 0.62,
    depthWrite: false, toneMapped: false
  });
  const inst = new THREE.InstancedMesh(g, mat, PATH_MAX);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.frustumCulled = false;
  inst.count = 0;
  inst.renderOrder = 2;
  R.path.inst = inst;
  R.scene.add(inst);

  // 진입 지점 표시 — 붉은 기둥 + 고리
  const gates = new THREE.Group();
  R.path.gates = gates;
  R.scene.add(gates);
}

function makeGate() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xE0554A, transparent: true,
                                            opacity: 0.5, depthWrite: false, toneMapped: false });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 2.6, 6), mat);
  pillar.position.y = 1.3;
  g.add(pillar);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.92, 28), mat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  g.add(ring);
  g.userData.mat = mat;
  return g;
}

const _pm = new THREE.Matrix4(), _pq = new THREE.Quaternion(),
      _pv = new THREE.Vector3(), _ps = new THREE.Vector3(1, 1, 1),
      _pe = new THREE.Euler();

function rebuildPath(S) {
  ensurePathInst();
  const dirs = Sim.upcomingDirs(S);
  R.path.dirs = dirs;
  const pts = [];
  for (const d of dirs) {
    const tiles = Sim.invasionPath(S, d);
    for (let i = 0; i < tiles.length - 1; i++) {
      const a = tiles[i], b = tiles[i + 1];
      const ax = a.tx * C.TILE + C.TILE / 2, ay = a.ty * C.TILE + C.TILE / 2;
      const bx = b.tx * C.TILE + C.TILE / 2, by = b.ty * C.TILE + C.TILE / 2;
      pts.push({ x: ax, y: ay, a: Math.atan2(bx - ax, by - ay), i: pts.length });
    }
  }
  R.path.points = pts;

  // 진입 지점 기둥
  const gates = R.path.gates;
  while (gates.children.length < dirs.length) gates.add(makeGate());
  gates.children.forEach((g, i) => {
    g.visible = i < dirs.length;
    if (i >= dirs.length) return;
    const e = Sim.entryPoint(dirs[i]);
    g.position.set(gx(e.tx * C.TILE + C.TILE / 2), 0, gz(e.ty * C.TILE + C.TILE / 2));
  });
}

function updatePath(S, dt) {
  const sig = `${S.wallList.length}|${S.waveIdx}|${S.baseLv}`;
  if (R.path.dirty || sig !== R.path.sig) { R.path.sig = sig; R.path.dirty = false; rebuildPath(S); }
  const inst = R.path.inst;
  if (!inst) return;

  const pts = R.path.points;
  const n = Math.min(pts.length, PATH_MAX);
  inst.count = n;
  if (!n) return;

  // 낮에는 또렷하게, 밤에는 실제 적이 보이므로 흐리게
  const night = S.phase === 'night';
  inst.material.opacity = night ? 0.18 : 0.6;
  for (const g of R.path.gates.children)
    if (g.visible) g.userData.mat.opacity = night ? 0.15 : 0.45 + Math.sin(S.t * 3) * 0.12;

  // 거점 쪽으로 흐르는 느낌 — 세 칸에 하나씩만 밝게 커집니다
  const flow = (S.t * 6) % 3;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const pulse = 1 + 0.45 * Math.max(0, 1 - Math.abs(((i % 3) - flow + 3) % 3));
    _pe.set(0, p.a, 0);
    _pq.setFromEuler(_pe);
    _pv.set(gx(p.x), 0.06, gz(p.y));
    _ps.set(pulse, pulse, pulse);
    _pm.compose(_pv, _pq, _ps);
    inst.setMatrixAt(i, _pm);
  }
  inst.instanceMatrix.needsUpdate = true;
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
    // 무적(부활 직후·궁극기)일 때는 살짝 떠오르며 빛납니다
    R.hero.rotation.x = 0;
    R.hero.position.y = S.hero.invuln > 0 ? Math.sin(S.t * 14) * 0.05 + 0.06 : 0;
    // 표식은 몸이 구르거나 돌아도 늘 땅에 붙어 있어야 합니다
    const mk = R.hero.userData.marker;
    if (mk) {
      mk.rotation.set(-Math.PI / 2 - R.hero.rotation.x, 0, -R.hero.rotation.y);
      mk.position.y = 0.05 - R.hero.position.y;
      mk.material.opacity = S.hero.invuln > 0 ? 1 : 0.7;
      mk.material.color.setHex(S.hero.invuln > 0 ? 0x9fd8ff : 0xffffff);
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
    const scale = monScale(m);
    if (!mesh.userData.isModel)
      mesh.userData.body.position.y = (0.82 + Math.sin(S.t * 10 + m.x) * 0.05) * scale;
    // 체력이 닳을수록 어두워지고, 맞는 순간 하얗게 번쩍입니다
    if (!mesh.userData.isModel) {
      const ratio = Math.max(0, m.hp / m.maxHp);
      const base = new THREE.Color(kindColor(m));
      base.multiplyScalar(0.45 + ratio * 0.55);
      if (m.hitFlash > 0) base.lerp(new THREE.Color(0xffffff), 0.75);
      mesh.userData.body.material.color.copy(base);
    }

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
      mesh = makeHumanoid(ROLE_COLOR[s.role] || 0x5FAE72, 0xcfd6da, 0.82);
      R.scene.add(mesh); R.soldierMeshes.set(s, mesh);
    }
    sseen.add(s);
    mesh.visible = !s.down;
    mesh.position.set(gx(s.x), 0, gz(s.y));
    mesh.rotation.y = s.facing || 0;
    mesh.userData.body.material.color.set(ROLE_COLOR[s.role] || 0x5FAE72);
    mesh.userData.body.position.y = 0.67 + Math.sin(S.t * 11 + s.x) * 0.04;
  }
  for (const [s, mesh] of R.soldierMeshes) {
    if (!sseen.has(s)) { R.scene.remove(mesh); R.soldierMeshes.delete(s); }
  }

  updatePath(S, dt);
  updateRings(S);
  updateArrows(dt);
  updateVfx(S, dt);

  // --- 낮과 밤 ---
  updateDayNight(S, dt);

  // --- 깃발 흔들림 ---
  if (R.baseFlag) R.baseFlag.rotation.y = Math.sin(S.t * 2) * 0.25;

  updateCamera(S, dt);
  drawMinimap(S);

  R.renderer.info.reset();

  if (R.composer) R.composer.render();
  else R.renderer.render(R.scene, R.camera);

  // 성능 집계 (후처리의 전체화면 패스는 빼고 장면 자체만 셉니다)
  R.stats.calls = Math.max(0, R.renderer.info.render.calls - (R.composer ? 3 : 0));
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
      const ease = 1 - Math.pow(1 - p, 2);      // 처음에 빠르게 퍼지고 끝에서 잦아듭니다
      v.mesh.scale.setScalar(0.3 + ease * v.radius);
      v.mesh.material.opacity = 0.75 * (1 - p) * (1 - p);
    } else if (v.kind === 'beam') {
      v.mesh.material.opacity = 0.6 * (1 - p);
    } else if (v.kind === 'spark') {
      const g = 7.5;
      for (let j = 0; j < v.n; j++) {
        const q = v.parts[j];
        q.vy -= g * dt;
        q.px += q.vx * dt; q.py += q.vy * dt; q.pz += q.vz * dt;
        _sc.setScalar(q.s * (1 - p));
        _v.set(q.px, q.py, q.pz);
        v.mesh.setMatrixAt(j, _m4.compose(_v, _q.identity(), _sc));
      }
      v.mesh.instanceMatrix.needsUpdate = true;
      v.mesh.material.opacity = 1 - p * p;
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

  if (R.sky) {
    const u = R.sky.material.uniforms;
    u.top.value.setHex(0x4e7fb5).lerp(new THREE.Color(0x070c1a), nightMix);
    u.bottom.value.setHex(0xd8c9a8).lerp(new THREE.Color(0x16203a), nightMix);
  }
  if (R.bloom) R.bloom.strength = 0.32 + nightMix * 0.6;   // 밤에 불빛이 더 번집니다
  R.scene.fog.near = 22 - nightMix * 14;
  R.scene.fog.far = 68 - nightMix * 32;

  R.sun.intensity = 2.6 * (1 - nightMix) + 0.06;
  R.sun.color.setHex(nightMix > 0.5 ? 0x9fb6e0 : 0xfff2d8);
  R.hemi.intensity = 1.05 * (1 - nightMix) + 0.14;

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
      g.userData.logs = g.userData.logs || [];
      g.userData.logs.push(log);
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
    new THREE.RingGeometry(0.93, 1.0, 48),     // 얇은 테두리라야 적이 가려지지 않습니다
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7,
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

/* 타격 순간 튀는 파편 — 숫자만으로는 "맞았다"가 약합니다 */
const sparkGeo = new THREE.TetrahedronGeometry(0.075, 0);
export function spawnHitSpark(x, y, crit) {
  const n = crit ? 12 : 7;
  const color = crit ? 0xFFD98A : 0xFFF0C8;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  const im = new THREE.InstancedMesh(sparkGeo, mat, n);      // 파편 전부를 한 번에 그립니다
  im.frustumCulled = false;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, up = 0.6 + Math.random() * 2.2;
    parts.push({ px: 0, py: 0, pz: 0,
                 vx: Math.cos(a) * (1.2 + Math.random() * 2.4),
                 vy: up,
                 vz: Math.sin(a) * (1.2 + Math.random() * 2.4),
                 s: (crit ? 1.4 : 1) * (0.6 + Math.random() * 0.8) });
  }
  im.position.set(gx(x), 1.0, gz(y));
  R.scene.add(im);
  R.vfx.push({ mesh: im, t: 0, life: crit ? 0.5 : 0.35, kind: 'spark', parts, n });
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

  // 중앙 철광 지대
  const mid = Math.floor(C.MAPW / 2);
  ctx.fillStyle = 'rgba(201,138,75,0.13)';
  ctx.fillRect((mid - 4) * C.TILE * sx, 0, 8 * C.TILE * sx, h);

  /* 자원지 — 어디에 뭐가 있는지 미니맵만 봐도 알게 합니다.
     철광은 중앙에만, 약초는 들판 곳곳이라 이 점들이 길잡이가 됩니다. */
  const NODE_DOT = { wood: '#4e8f5e', stone: '#8d8a83', iron: '#C98A4B', herb: '#7fd98c' };
  for (const n of S.nodes) {
    if (n.amt <= 0) continue;
    ctx.fillStyle = NODE_DOT[n.type] || '#666';
    const r = n.type === 'iron' ? 3 : 2;
    ctx.fillRect(n.x * sx - r / 2, n.y * sy - r / 2, r, r);
  }

  // 목책
  ctx.fillStyle = '#96703f';
  for (const k of S.wallList) {
    if (S.occ[k] !== C.OCC_WALL) continue;
    ctx.fillRect((k % C.MAPW) * C.TILE * sx, ((k / C.MAPW) | 0) * C.TILE * sy,
                 Math.max(1.5, C.TILE * sx), Math.max(1.5, C.TILE * sy));
  }
  // 함정 — 침공로 위는 붉게, 벗어난 것은 회색. 한눈에 헛수고를 알아볼 수 있습니다.
  for (const t of S.traps) {
    if (t.dur <= 0) continue;
    ctx.fillStyle = t.onPath === false ? '#5c5850' : '#C6412F';
    ctx.fillRect(t.tx * C.TILE * sx, t.ty * C.TILE * sy, Math.max(1.5, C.TILE * sx), Math.max(1.5, C.TILE * sy));
  }
  // ★ 예상 침공로 — 3D 바닥에 그린 것과 같은 길을 미니맵에도 그립니다
  const night = S.phase === 'night';
  ctx.strokeStyle = night ? 'rgba(224,85,74,0.35)' : 'rgba(224,85,74,0.85)';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.lineDashOffset = -(S.t * 14) % 6;
  for (const d of R.path.dirs) {
    const tiles = Sim.invasionPath(S, d);
    if (tiles.length < 2) continue;
    ctx.beginPath();
    tiles.forEach((t, i) => {
      const px = (t.tx * C.TILE + C.TILE / 2) * sx, py = (t.ty * C.TILE + C.TILE / 2) * sy;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // 진입 지점
  for (const d of R.path.dirs) {
    const e = Sim.entryPoint(d);
    const px = (e.tx * C.TILE + C.TILE / 2) * sx, py = (e.ty * C.TILE + C.TILE / 2) * sy;
    ctx.fillStyle = '#E0554A';
    ctx.beginPath(); ctx.arc(px, py, 3.4, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(px, py, 5.5 + Math.sin(S.t * 3) * 1.4, 0, 6.283); ctx.stroke();
  }

  // 거점
  ctx.fillStyle = '#E0B44A';
  ctx.fillRect(S.base.x * sx - 4, S.base.y * sy - 4, 8, 8);
  // 병사 · 용병 (부상자는 회색으로 남겨둡니다 — 몇 명이 빠졌는지 보여야 합니다)
  for (const s of S.soldiers) {
    ctx.fillStyle = s.down ? '#5a5a52' : s.merc ? '#5B8FC7' : '#5FAE72';
    ctx.fillRect(s.x * sx - 1.5, s.y * sy - 1.5, 3, 3);
  }
  // 몬스터 — 종류별 색 그대로
  for (const m of S.monsters) {
    const r = m.boss ? 5 : 2.4;
    ctx.fillStyle = '#' + kindColor(m).toString(16).padStart(6, '0');
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
