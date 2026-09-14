/* ==================================================================
   절차적 텍스처 생성
   ------------------------------------------------------------------
   외부 이미지 파일을 전혀 쓰지 않습니다. 코드로 직접 그립니다.
   장점: 다운로드 0바이트, 오프라인 동작, 404 에러 없음.

   타일 텍스처의 3대 조건을 구조적으로 만족합니다:
     ① seamless  — 경계를 넘어가는 무늬는 반대편에도 똑같이 그립니다
     ② top-down  — 위에서 수직으로 본 평면만 그립니다(원근 없음)
     ③ 그림자 없음 — 명암을 굽지 않습니다. 조명은 엔진이 실시간으로 합니다

   ★ 나중에 고품질 텍스처(힉스필드 등)로 바꾸려면:
     config 의 TEXTURE_SET 를 바꾸고 loadImageTexture 경로만 연결하면 됩니다.
     이 파일의 함수 이름과 반환 규격은 그대로 두세요.
   ================================================================== */

/** 경계가 이어지도록 점을 찍습니다 — 가장자리를 넘으면 반대편에도 같이 찍습니다 */
function wrapDot(ctx, size, x, y, r, color) {
  ctx.fillStyle = color;
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      const px = x + ox, py = y + oy;
      if (px < -r || px > size + r || py < -r || py > size + r) continue;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function makeCanvas(size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  return cv;
}

/** 흙·풀 지면 — 유닛 색(파랑·주황·적색)과 대비되도록 어두운 한랭 녹회색 */
export function groundTexture(size = 512) {
  const cv = makeCanvas(size), ctx = cv.getContext('2d');
  ctx.fillStyle = '#2c3a29';
  ctx.fillRect(0, 0, size, size);

  // 흙 얼룩
  for (let i = 0; i < 900; i++) {
    const shade = 34 + Math.random() * 26;
    wrapDot(ctx, size, Math.random() * size, Math.random() * size,
            2 + Math.random() * 9, `rgba(${shade + 10},${shade + 18},${shade},0.5)`);
  }
  // 풀 포기
  for (let i = 0; i < 2200; i++) {
    const g = 60 + Math.random() * 50;
    wrapDot(ctx, size, Math.random() * size, Math.random() * size,
            0.7 + Math.random() * 1.6, `rgba(${g * 0.55},${g},${g * 0.42},0.55)`);
  }
  // 잔돌
  for (let i = 0; i < 120; i++) {
    const s = 90 + Math.random() * 40;
    wrapDot(ctx, size, Math.random() * size, Math.random() * size,
            1 + Math.random() * 2.2, `rgba(${s},${s * 0.97},${s * 0.9},0.4)`);
  }
  return cv;
}

/** 중앙 고급 자원 지대의 자갈 바닥 — 여기가 격전지라는 걸 바닥으로 알립니다 */
export function gravelTexture(size = 512) {
  const cv = makeCanvas(size), ctx = cv.getContext('2d');
  ctx.fillStyle = '#3a3630';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const s = 70 + Math.random() * 60;
    wrapDot(ctx, size, Math.random() * size, Math.random() * size,
            1.5 + Math.random() * 5, `rgba(${s},${s * 0.94},${s * 0.84},0.6)`);
  }
  // 철광맥이 비치는 주황 알갱이
  for (let i = 0; i < 90; i++) {
    wrapDot(ctx, size, Math.random() * size, Math.random() * size,
            1 + Math.random() * 2, 'rgba(200,120,50,0.45)');
  }
  return cv;
}

/** 성벽 석재 — 거점용 */
export function stoneTexture(size = 512) {
  const cv = makeCanvas(size), ctx = cv.getContext('2d');
  ctx.fillStyle = '#6b6359';
  ctx.fillRect(0, 0, size, size);

  const rows = 8, h = size / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * h * 0.5;
    for (let c = 0; c < rows; c++) {
      const x = (c * h + offset) % size, y = r * h;
      const v = 92 + Math.random() * 34;
      ctx.fillStyle = `rgb(${v},${v * 0.94},${v * 0.86})`;
      ctx.fillRect(x + 1.5, y + 1.5, h - 3, h - 3);
      if (x + h - 1.5 > size) ctx.fillRect(x - size + 1.5, y + 1.5, h - 3, h - 3);
    }
  }
  for (let i = 0; i < 500; i++) {
    wrapDot(ctx, size, Math.random() * size, Math.random() * size,
            0.8 + Math.random() * 2, 'rgba(60,56,50,0.3)');
  }
  return cv;
}

/** 목재 — 목책·병영용. 작은 물체라 무늬를 성기게(저주파) 넣습니다 */
export function woodTexture(size = 256) {
  const cv = makeCanvas(size), ctx = cv.getContext('2d');
  ctx.fillStyle = '#6d4f30';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const y = (i / 26) * size;
    const v = 88 + Math.random() * 40;
    ctx.fillStyle = `rgba(${v},${v * 0.72},${v * 0.45},0.55)`;
    ctx.fillRect(0, y, size, size / 26 * (0.4 + Math.random() * 0.5));
  }
  for (let i = 0; i < 60; i++) {
    wrapDot(ctx, size, Math.random() * size, Math.random() * size,
            1 + Math.random() * 2.5, 'rgba(50,34,20,0.35)');
  }
  return cv;
}

/** 이어붙임 품질 확인 — 좌우/상하 경계 픽셀의 차이를 재서 0에 가까울수록 좋습니다 */
export function seamScore(canvas) {
  const size = canvas.width;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, size, size).data;
  const px = (x, y) => { const i = (y * size + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  let seam = 0, inner = 0;
  for (let i = 0; i < size; i++) {
    const a = px(0, i), b = px(size - 1, i);
    const c = px(i, 0), e = px(i, size - 1);
    seam += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    seam += Math.abs(c[0] - e[0]) + Math.abs(c[1] - e[1]) + Math.abs(c[2] - e[2]);
    const f = px(10, i), g = px(11, i);
    inner += Math.abs(f[0] - g[0]) + Math.abs(f[1] - g[1]) + Math.abs(f[2] - g[2]);
  }
  // 경계 차이 ÷ 내부 차이. 1에 가까우면 경계가 내부와 구분되지 않는다는 뜻입니다.
  return inner > 0 ? seam / (inner * 2) : 0;
}
