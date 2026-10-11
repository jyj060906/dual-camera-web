// 터치 보정 엔진. 사진 픽셀을 canvas 위에서 직접 고친다(얼굴 인식 없이 브러시로 칠하는 방식).

// resize(크기 조절)는 브러시로 칠하지 않고, 위치를 찍은 뒤 슬라이더로 양을 정한다.
export type Tool = "smooth" | "heal" | "brighten" | "color" | "resize";

// 보정 중인 사진 한 장. canvas가 곧 화면에 보이는 사진이다.
export type Work = { canvas: HTMLCanvasElement; undo: ImageData[] };

export const MAX_UNDO = 8;
// 보정용 복사본의 긴 변 최대치. 카메라 사진은 보통 이보다 작다.
const MAX_SIDE = 1920;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("사진을 불러오지 못했습니다."));
    img.src = src;
  });
}

export async function createWork(src: string): Promise<Work> {
  const img = await loadImage(src);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  getCtx(canvas).drawImage(img, 0, 0, canvas.width, canvas.height);
  // 화면 틀 안에 사진 전체가 보이도록 맞춘다.
  canvas.style.cssText = "width:100%;height:100%;object-fit:contain;display:block;";
  return { canvas, undo: [] };
}

export function getCtx(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext("2d", { willReadFrequently: true })!;
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

type Region = { x0: number; y0: number; w: number; h: number };

function regionOf(canvas: HTMLCanvasElement, cx: number, cy: number, reach: number): Region | null {
  const x0 = Math.max(0, Math.floor(cx - reach));
  const y0 = Math.max(0, Math.floor(cy - reach));
  const x1 = Math.min(canvas.width, Math.ceil(cx + reach));
  const y1 = Math.min(canvas.height, Math.ceil(cy + reach));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

function blurAxis(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  ch: number,
  r: number,
  horizontal: boolean,
) {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const stride = horizontal ? ch : w * ch;
  const lineStride = horizontal ? w * ch : ch;
  const inv = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    for (let c = 0; c < ch; c++) {
      const base = l * lineStride + c;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[base + Math.min(len - 1, Math.max(0, k)) * stride];
      for (let i = 0; i < len; i++) {
        dst[base + i * stride] = sum * inv;
        sum +=
          src[base + Math.min(len - 1, i + r + 1) * stride] -
          src[base + Math.max(0, i - r) * stride];
      }
    }
  }
}

// 상자 흐림을 가로·세로로 여러 번 반복해 가우시안에 가깝게 만든다.
function boxBlur(src: Float32Array, w: number, h: number, ch: number, r: number, passes: number) {
  const a = src.slice();
  const b = new Float32Array(src.length);
  for (let p = 0; p < passes; p++) {
    blurAxis(a, b, w, h, ch, r, true);
    blurAxis(b, a, w, h, ch, r, false);
  }
  return a;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 한 번 찍는 보정. (cx, cy)는 사진 픽셀 좌표, rad는 브러시 반지름(px), strength는 0~1.
 * amount는 한 번에 적용하는 양의 배수다(콕 눌렀을 때는 드래그 한 번보다 조금 더 세게 준다).
 */
export function stamp(
  canvas: HTMLCanvasElement,
  tool: Tool,
  cx: number,
  cy: number,
  rad: number,
  strength: number,
  color: string,
  amount: number,
) {
  switch (tool) {
    case "smooth":
      return smoothStamp(canvas, cx, cy, rad, strength, amount);
    case "heal":
      return healStamp(canvas, cx, cy, rad);
    case "brighten":
    case "color":
      return tintStamp(canvas, tool, cx, cy, rad, strength, color, amount);
    case "resize":
      return; // 크기 조절은 previewResize로 따로 처리한다.
  }
}

// 피부 보정: 흐린 사진과 섞되, 윤곽(눈·입술 등)처럼 차이가 큰 곳은 덜 섞어서 선명하게 남긴다.
function smoothStamp(
  canvas: HTMLCanvasElement,
  cx: number,
  cy: number,
  rad: number,
  strength: number,
  amount: number,
) {
  const reg = regionOf(canvas, cx, cy, rad);
  if (!reg) return;
  const ctx = getCtx(canvas);
  const img = ctx.getImageData(reg.x0, reg.y0, reg.w, reg.h);
  const d = img.data;
  const f = new Float32Array(reg.w * reg.h * 3);
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    f[j] = d[i];
    f[j + 1] = d[i + 1];
    f[j + 2] = d[i + 2];
  }
  const blurred = boxBlur(f, reg.w, reg.h, 3, Math.max(2, Math.round(rad * 0.12)), 2);

  for (let y = 0; y < reg.h; y++) {
    for (let x = 0; x < reg.w; x++) {
      const dist = Math.hypot(reg.x0 + x + 0.5 - cx, reg.y0 + y + 0.5 - cy);
      const m = smooth01(1 - dist / rad);
      if (m <= 0) continue;
      const i = (y * reg.w + x) * 4;
      const j = (y * reg.w + x) * 3;
      const diff = Math.abs(lum(d[i], d[i + 1], d[i + 2]) - lum(blurred[j], blurred[j + 1], blurred[j + 2]));
      const edge = 1 / (1 + (diff / 10) ** 2);
      const a = Math.min(1, m * strength * 0.3 * amount * edge);
      d[i] += (blurred[j] - d[i]) * a;
      d[i + 1] += (blurred[j + 1] - d[i + 1]) * a;
      d[i + 2] += (blurred[j + 2] - d[i + 2]) * a;
    }
  }
  ctx.putImageData(img, reg.x0, reg.y0);
}

// 잡티 지우기: 브러시 둘레의 피부색만으로 안쪽을 부드럽게 메워 넣는다.
function healStamp(canvas: HTMLCanvasElement, cx: number, cy: number, rad: number) {
  const reg = regionOf(canvas, cx, cy, rad * 1.9);
  if (!reg) return;
  const ctx = getCtx(canvas);
  const img = ctx.getImageData(reg.x0, reg.y0, reg.w, reg.h);
  const d = img.data;
  // 안쪽(브러시 원)은 비우고 바깥만 색×가중치로 모은다.
  const buf = new Float32Array(reg.w * reg.h * 4);
  for (let y = 0; y < reg.h; y++) {
    for (let x = 0; x < reg.w; x++) {
      const dist = Math.hypot(reg.x0 + x + 0.5 - cx, reg.y0 + y + 0.5 - cy);
      if (dist < rad * 1.05) continue;
      const i = (y * reg.w + x) * 4;
      buf[i] = d[i];
      buf[i + 1] = d[i + 1];
      buf[i + 2] = d[i + 2];
      buf[i + 3] = 1;
    }
  }
  const bl = boxBlur(buf, reg.w, reg.h, 4, Math.max(3, Math.round(rad * 0.6)), 3);

  for (let y = 0; y < reg.h; y++) {
    for (let x = 0; x < reg.w; x++) {
      const dist = Math.hypot(reg.x0 + x + 0.5 - cx, reg.y0 + y + 0.5 - cy);
      const alpha = 1 - smooth01((dist - rad * 0.85) / (rad * 0.3));
      if (alpha <= 0) continue;
      const i = (y * reg.w + x) * 4;
      const wgt = bl[i + 3];
      if (wgt < 0.02) continue;
      const grain = (Math.random() - 0.5) * 3; // 너무 매끈해 보이지 않게 아주 작은 알갱이
      for (let c = 0; c < 3; c++) {
        d[i + c] += (bl[i + c] / wgt + grain - d[i + c]) * alpha;
      }
    }
  }
  ctx.putImageData(img, reg.x0, reg.y0);
}

// 화사하게(밝게)와 볼터치·립 색.
function tintStamp(
  canvas: HTMLCanvasElement,
  tool: "brighten" | "color",
  cx: number,
  cy: number,
  rad: number,
  strength: number,
  color: string,
  amount: number,
) {
  const reg = regionOf(canvas, cx, cy, rad);
  if (!reg) return;
  const ctx = getCtx(canvas);
  const img = ctx.getImageData(reg.x0, reg.y0, reg.w, reg.h);
  const d = img.data;
  const [cr, cg, cb] = hexToRgb(color);
  const colorLum = Math.max(1, lum(cr, cg, cb));

  for (let y = 0; y < reg.h; y++) {
    for (let x = 0; x < reg.w; x++) {
      const dist = Math.hypot(reg.x0 + x + 0.5 - cx, reg.y0 + y + 0.5 - cy);
      const m = smooth01(1 - dist / rad);
      if (m <= 0) continue;
      const i = (y * reg.w + x) * 4;
      if (tool === "brighten") {
        const a = Math.min(1, m * strength * 0.06 * amount);
        for (let c = 0; c < 3; c++) d[i + c] += (255 - d[i + c]) * a;
      } else {
        // 원래 밝기(음영)는 그대로 두고 색만 입혀서 피부 질감이 남게 한다.
        const k = lum(d[i], d[i + 1], d[i + 2]) / colorLum;
        const a = Math.min(0.7, m * strength * 0.1 * amount);
        d[i] += (Math.min(255, cr * k) - d[i]) * a;
        d[i + 1] += (Math.min(255, cg * k) - d[i + 1]) * a;
        d[i + 2] += (Math.min(255, cb * k) - d[i + 2]) * a;
      }
    }
  }
  ctx.putImageData(img, reg.x0, reg.y0);
}

// 크기 조절 미리보기. 찍은 위치(cx, cy) 둘레를 base(보정 전 사진)에서 다시 그린 뒤 amount(-1~1)만큼 밀거나 당긴다.
// amount가 양수면 커지고(키우기), 음수면 작아진다(줄이기). 0이면 base 그대로다.
export function previewResize(
  canvas: HTMLCanvasElement,
  base: ImageData,
  cx: number,
  cy: number,
  rad: number,
  amount: number,
) {
  const reg = regionOf(canvas, cx, cy, rad);
  if (!reg) return;
  const ctx = getCtx(canvas);
  ctx.putImageData(base, 0, 0, reg.x0, reg.y0, reg.w, reg.h);
  if (amount !== 0) warpStamp(canvas, amount * 0.5, cx, cy, rad);
}

// 브러시 안쪽을 중심에서 밀어내거나(k>0, 확대) 끌어당긴다(k<0, 축소). 가장자리는 원래대로 이어진다.
function warpStamp(canvas: HTMLCanvasElement, k: number, cx: number, cy: number, rad: number) {
  const reg = regionOf(canvas, cx, cy, rad);
  if (!reg) return;
  const ctx = getCtx(canvas);
  const src = ctx.getImageData(reg.x0, reg.y0, reg.w, reg.h);
  const out = ctx.createImageData(reg.w, reg.h);
  out.data.set(src.data);
  const s = src.data;
  const o = out.data;

  for (let y = 0; y < reg.h; y++) {
    for (let x = 0; x < reg.w; x++) {
      const dx = reg.x0 + x + 0.5 - cx;
      const dy = reg.y0 + y + 0.5 - cy;
      const d2 = (dx * dx + dy * dy) / (rad * rad);
      if (d2 >= 1) continue;
      const scale = 1 - k * (1 - d2) ** 2;
      // 원본에서 읽어 올 위치(영역 안쪽 좌표). 확대는 중심 쪽에서, 축소는 바깥쪽에서 읽는다.
      const sx = Math.min(reg.w - 1, Math.max(0, cx + dx * scale - reg.x0 - 0.5));
      const sy = Math.min(reg.h - 1, Math.max(0, cy + dy * scale - reg.y0 - 0.5));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(reg.w - 1, x0 + 1);
      const y1 = Math.min(reg.h - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i = (y * reg.w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = s[(y0 * reg.w + x0) * 4 + c] * (1 - fx) + s[(y0 * reg.w + x1) * 4 + c] * fx;
        const bot = s[(y1 * reg.w + x0) * 4 + c] * (1 - fx) + s[(y1 * reg.w + x1) * 4 + c] * fx;
        o[i + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  ctx.putImageData(out, reg.x0, reg.y0);
}
