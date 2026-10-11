// 화면의 미리보기(CSS)와 같은 결과를 canvas로 다시 그려 이미지 파일로 만든다.
import { canvasFilterSupported, applyFilterToImageData } from "./cssFilter";
import {
  FONT_FALLBACK_VAR,
  FONTS,
  FRAMES,
  TAPE_ALPHA,
  filterOf,
  hexToRgba,
  type Tape,
  type Adjust,
  type FilterId,
  type Frame,
  type Slot,
  type TextItem,
} from "./editor";
import type { TextureId } from "@/components/textures";

export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1440;

export type ExportInput = {
  photos: Record<Slot, string>;
  adjust: Record<Slot, Adjust>;
  filters: Record<Slot, FilterId>;
  textures: Record<Slot, TextureId[]>;
  frame: Frame;
  tape: Tape;
  smallSize: number; // 큰 사진 너비 대비 %
  smallPos: { x: number; y: number }; // %
  texts: TextItem[];
  stageWidthPx: number; // 화면에 보이는 사진 틀 너비(px). px 단위 값을 비율로 옮기는 데 쓴다.
};

type Box = { x: number; y: number; w: number; h: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("사진을 불러오지 못했습니다."));
    img.src = src;
  });
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// object-fit: cover와 같은 방식으로 사진을 상자에 채워 그린다.
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: Box,
  filter: string,
  k: number,
) {
  const scale = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const sw = box.w / scale;
  const sh = box.h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  const scaledFilter = filter.replace(
    /blur\(([\d.]+)px\)/g,
    (_, n: string) => `blur(${parseFloat(n) * k}px)`,
  );

  if (canvasFilterSupported()) {
    ctx.save();
    ctx.filter = scaledFilter;
    ctx.drawImage(img, sx, sy, sw, sh, box.x, box.y, box.w, box.h);
    ctx.restore();
    return;
  }

  const w = Math.max(1, Math.round(box.w));
  const h = Math.max(1, Math.round(box.h));
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const data = tctx.getImageData(0, 0, w, h);
  applyFilterToImageData(data, scaledFilter);
  tctx.putImageData(data, 0, 0);
  ctx.drawImage(tmp, box.x, box.y, box.w, box.h);
}

// 질감은 textures.tsx의 TextureLayers와 같은 순서·세기로 그린다.
function drawTextures(
  ctx: CanvasRenderingContext2D,
  active: TextureId[],
  box: Box,
  k: number,
) {
  const { x, y, w, h } = box;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  if (active.includes("grain")) {
    const size = Math.max(2, Math.round(200 * k));
    const noise = document.createElement("canvas");
    noise.width = noise.height = size;
    const nctx = noise.getContext("2d")!;
    const img = nctx.createImageData(size, size);
    const r = rng(11);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (r() - 0.5) * 200;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 160;
    }
    nctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = ctx.createPattern(noise, "repeat")!;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  if (active.includes("haze")) {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(x, y, w, h);
  }

  if (active.includes("dust")) {
    // 미리보기(SVG 노이즈)처럼 작은 하얀 점이 촘촘하게 흩어진 모양.
    const r = rng(7);
    const area = (w * h) / (EXPORT_WIDTH * EXPORT_HEIGHT);
    ctx.fillStyle = "white";
    for (let i = 0, n = Math.round(450 * area); i < n; i++) {
      ctx.globalAlpha = 0.35 + r() * 0.5;
      ctx.beginPath();
      ctx.arc(x + r() * w, y + r() * h, (0.25 + r() * 0.7) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (active.includes("lowres")) {
    const tile = Math.max(2, Math.round(3 * k));
    const dots = document.createElement("canvas");
    dots.width = dots.height = tile;
    const dctx = dots.getContext("2d")!;
    dctx.fillStyle = "rgba(0,0,0,0.28)";
    dctx.beginPath();
    dctx.arc(tile / 2, tile / 2, Math.max(0.8, k), 0, Math.PI * 2);
    dctx.fill();
    ctx.fillStyle = ctx.createPattern(dots, "repeat")!;
    ctx.fillRect(x, y, w, h);
  }

  if (active.includes("vignette")) {
    const rx = (w / 2) * Math.SQRT2;
    const ry = (h / 2) * Math.SQRT2;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  if (active.includes("whiteborder")) {
    const t = w * 0.04;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.rect(x + t, y + t, w - 2 * t, h - 2 * t);
    ctx.fill("evenodd");
  }

  ctx.restore();
}

// 작은 사진 프레임 모양의 경로를 만든다(화면의 shapeStyle과 같은 모양).
function traceShape(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  box: Box,
  k: number,
  inset: number,
) {
  const x = box.x + inset;
  const y = box.y + inset;
  const w = box.w - 2 * inset;
  const h = box.h - 2 * inset;
  ctx.beginPath();
  switch (frame) {
    case "rounded":
      ctx.roundRect(x, y, w, h, Math.max(0, 12 * k - inset));
      break;
    case "circle":
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "heart": {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(w, h);
      ctx.moveTo(0.5, 1);
      ctx.bezierCurveTo(0.1, 0.68, 0, 0.45, 0, 0.3);
      ctx.bezierCurveTo(0, 0.13, 0.12, 0, 0.27, 0);
      ctx.bezierCurveTo(0.37, 0, 0.46, 0.06, 0.5, 0.15);
      ctx.bezierCurveTo(0.54, 0.06, 0.63, 0, 0.73, 0);
      ctx.bezierCurveTo(0.88, 0, 1, 0.13, 1, 0.3);
      ctx.bezierCurveTo(1, 0.45, 0.9, 0.68, 0.5, 1);
      ctx.closePath();
      ctx.restore();
      break;
    }
    case "star": {
      const pts = [
        [50, 0], [61, 35], [98, 35], [68, 57], [79, 91],
        [50, 70], [21, 91], [32, 57], [2, 35], [39, 35],
      ];
      pts.forEach(([px, py], i) => {
        const X = x + (px / 100) * w;
        const Y = y + (py / 100) * h;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      ctx.closePath();
      break;
    }
    default: // square, polaroid
      ctx.rect(x, y, w, h);
  }
}

// 프레임 안쪽에 사진이 들어가는 영역.
function innerBox(frame: Frame, box: Box, k: number): Box {
  if (frame === "rounded" || frame === "square" || frame === "circle") {
    const b = 2 * k;
    return { x: box.x + b, y: box.y + b, w: box.w - 2 * b, h: box.h - 2 * b };
  }
  if (frame === "polaroid") {
    const pad = 0.06 * box.w;
    return {
      x: box.x + pad,
      y: box.y + pad,
      w: box.w - 2 * pad,
      h: box.h - pad - 0.22 * box.w,
    };
  }
  return box;
}

function fontFamily(item: TextItem): string {
  const cssVar = FONTS.find((f) => f.id === item.font)!.cssVar;
  const style = getComputedStyle(document.documentElement);
  const families = [cssVar, FONT_FALLBACK_VAR]
    .map((name) => style.getPropertyValue(name).trim())
    .filter(Boolean);
  return [...families, "sans-serif"].join(", ");
}

export async function renderDualShot(input: ExportInput): Promise<HTMLCanvasElement> {
  const W = EXPORT_WIDTH;
  const H = EXPORT_HEIGHT;
  const k = W / input.stageWidthPx;

  const [bigImg, smallImg] = await Promise.all([
    loadImage(input.photos.big),
    loadImage(input.photos.small),
  ]);

  // 글꼴이 준비된 뒤에 그려야 선택한 글꼴로 저장된다.
  await Promise.all(
    input.texts.map((t) =>
      document.fonts
        .load(`${t.weight} ${(t.size / 100) * W}px ${fontFamily(t)}`, t.text)
        .catch(() => undefined),
    ),
  );

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // 큰 사진
  const full: Box = { x: 0, y: 0, w: W, h: H };
  drawPhoto(ctx, bigImg, full, filterOf(input.adjust.big, input.filters.big), k);
  drawTextures(ctx, input.textures.big, full, k);

  // 작은 사진
  const aspect = FRAMES.find((f) => f.id === input.frame)!.aspect;
  const bw = (input.smallSize / 100) * W;
  const box: Box = {
    x: (input.smallPos.x / 100) * W,
    y: (input.smallPos.y / 100) * H,
    w: bw,
    h: bw / aspect,
  };

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 8 * k;
  ctx.shadowOffsetY = 4 * k;
  ctx.fillStyle = "white";
  traceShape(ctx, input.frame, box, k, 0);
  ctx.fill();
  ctx.restore();

  const inner = innerBox(input.frame, box, k);
  ctx.save();
  if (input.frame === "polaroid") {
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
  } else {
    const inset = input.frame === "heart" || input.frame === "star" ? 0 : 2 * k;
    traceShape(ctx, input.frame, box, k, inset);
  }
  ctx.clip();
  drawPhoto(ctx, smallImg, inner, filterOf(input.adjust.small, input.filters.small), k);
  drawTextures(ctx, input.textures.small, inner, k);
  ctx.restore();

  // 띠지: 작은 사진 위쪽 가장자리의 가운데에 걸친다.
  if (input.tape.on) {
    const tw = (input.tape.length / 100) * box.w;
    const th = (input.tape.thickness / 100) * W;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.15)";
    ctx.shadowBlur = 8 * k;
    ctx.shadowOffsetY = 4 * k;
    ctx.fillStyle = hexToRgba(input.tape.color, TAPE_ALPHA);
    ctx.fillRect(box.x + box.w / 2 - tw / 2, box.y - th / 2, tw, th);
    ctx.restore();
  }

  // 텍스트
  for (const t of input.texts) {
    const px = (t.size / 100) * W;
    ctx.save();
    ctx.font = `${t.weight} ${px}px ${fontFamily(t)}`;
    ctx.fillStyle = t.color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    if (t.shadowAlpha > 0) {
      ctx.shadowColor = hexToRgba(t.shadowColor, t.shadowAlpha / 100);
      ctx.shadowBlur = t.shadowBlur * k;
      ctx.shadowOffsetY = t.shadowOffset * k;
    }
    ctx.translate((t.x / 100) * W, (t.y / 100) * H);
    ctx.scale(t.scaleX / 100, t.scaleY / 100);
    // 줄 높이는 화면과 같은 1.25배. 각 줄은 줄 높이의 가운데에 맞춘다.
    t.text.split("\n").forEach((line, i) => {
      ctx.fillText(line, 0, px * 0.625 + i * px * 1.25);
    });
    ctx.restore();
  }

  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/jpeg" | "image/png",
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("이미지를 만들지 못했습니다."))),
      type,
      0.92,
    ),
  );
}

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function timestampName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `dual-camera-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
