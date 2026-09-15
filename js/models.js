/* ==================================================================
   3D 모델 불러오기
   ------------------------------------------------------------------
   ★ 이 파일의 목적: "도형으로 만든 것"을 "진짜 3D 모델"로 갈아끼우는 통로.

   쓰는 법 (코드 수정 0줄):
     1) models/ 폴더에 .glb 파일을 넣습니다
     2) models/manifest.json 에 한 줄 추가합니다
     3) 새로고침하면 그 자리에 모델이 들어갑니다
   파일이 없으면 지금처럼 도형으로 그립니다. 그래서 언제 넣어도 됩니다.
   ================================================================== */

import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/addons/GLTFLoader.js';

/** 갈아끼울 수 있는 자리들. manifest.json 의 열쇠말이 이것과 같아야 합니다. */
export const SLOTS = [
  'tree', 'rock', 'iron',           // 자연물 (여러 개가 한 번에 그려집니다)
  'base', 'wall', 'trap', 'camp', 'forge',
  'hero_sword', 'hero_bow', 'hero_halberd',
  'soldier', 'monster', 'boss'
];

const loaded = new Map();      // slot -> { scene, geo, mat }
let ready = false;

/** 모델의 크기를 원하는 높이에 맞춥니다 — 받아온 모델마다 크기가 제각각이라 필수입니다 */
function fitToHeight(object3d, targetHeight) {
  const box = new THREE.Box3().setFromObject(object3d);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0.0001 && targetHeight > 0) {
    const k = targetHeight / size.y;
    object3d.scale.multiplyScalar(k);
  }
  // 발이 바닥(y=0)에 오도록 내립니다
  const box2 = new THREE.Box3().setFromObject(object3d);
  object3d.position.y -= box2.min.y;
  return object3d;
}

/** InstancedMesh 에 쓰려면 지오메트리 하나가 필요합니다 — 모델의 첫 메시를 꺼냅니다 */
function firstMesh(scene) {
  let found = null;
  scene.traverse(o => { if (!found && o.isMesh) found = o; });
  return found;
}

export async function load(basePath = 'models/') {
  if (ready) return loaded;
  ready = true;

  let manifest = {};
  try {
    const res = await fetch(basePath + 'manifest.json', { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch (e) {
    // 파일이 없어도 정상입니다. 도형으로 그립니다.
    return loaded;
  }

  const entries = Object.entries(manifest).filter(([slot]) => SLOTS.includes(slot));
  if (!entries.length) return loaded;

  const loader = new GLTFLoader();
  await Promise.all(entries.map(([slot, info]) => new Promise(resolve => {
    const file = typeof info === 'string' ? info : info.file;
    const height = (typeof info === 'object' && info.height) || 0;
    if (!file) return resolve();

    loader.load(basePath + file,
      gltf => {
        const scene = gltf.scene;
        scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        if (height) fitToHeight(scene, height);
        const m = firstMesh(scene);
        loaded.set(slot, {
          scene,
          geo: m ? m.geometry : null,
          mat: m ? m.material : null,
          animations: gltf.animations || []
        });
        console.info(`[models] ${slot} ← ${file}`);
        resolve();
      },
      undefined,
      () => { console.warn(`[models] ${file} 을(를) 불러오지 못했습니다 — 도형으로 대신 그립니다`); resolve(); }
    );
  })));

  return loaded;
}

export const has = slot => loaded.has(slot);
export const get = slot => loaded.get(slot) || null;
/** 장면에 놓을 복제본 — 같은 모델을 여러 개 놓을 때 반드시 복제해야 합니다 */
export const clone = slot => {
  const e = loaded.get(slot);
  return e ? e.scene.clone(true) : null;
};
