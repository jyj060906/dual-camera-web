// 화면의 미리보기(CSS)와 같은 결과를 canvas로 다시 그려 이미지 파일로 만든다.
import { canvasFilterSupported, applyFilterToImageData } from "./cssFilter";
import { BOARD_H, BOARD_W, boardLayout, type BoardText } from "./composition";
import {
  FONT_FALLBACK_VAR,
  FONTS,
  filterOf,
  hexToRgba,
  type Border,
  type Adjust,
  type Composition,
  type FilterId,
  type Frame,
  type Slot,
  type TextItem,
  type Xform,
} from "./editor";
import type { TextureId } from "@/components/textures";

export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1440;

export type ExportInput = {
  photos: Record<Slot, string>;
  adjust: Record<Slot, Adjust>;
  filters: Record<Slot, FilterId>;
  textures: Record<Slot, TextureId[]>;
  xform: Record<Slot, Xform>;
  composition: Composition;
  caption: string;
  frame: Frame;
  border: Border;
  smallSize: number; // 큰 사진 너비 대비 %
  smallAspect: number; // 작은 사진 프레임의 너비/높이
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

// 사진을 틀 안에서 이동·가로세로 배율을 적용해 그린다. 화면(PhotoImg)과 같은 규칙이다:
// 원본을 틀을 덮는 크기(cover)로 틀 가운데에 놓고, 이동 → 배율 순서로 적용한다. 틀 밖으로 나간 부분은 잘린다.
function drawPhotoX(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: Box,
  xf: Xform,
  filter: string,
  k: number,
) {
  const ar = img.naturalWidth / img.naturalHeight;
  const cw = Math.max(box.w, box.h * ar);
  const ch = Math.max(box.h, box.w / ar);
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.translate(box.x + box.w / 2 + (xf.x / 100) * box.w, box.y + box.h / 2 + (xf.y / 100) * box.h);
  ctx.scale(xf.sx, xf.sy);
  // cover 상자는 원본과 비율이 같아서 원본 전체가 그려진다(drawPhoto의 cover 잘라내기가 일어나지 않는다).
  drawPhoto(ctx, img, { x: -cw / 2, y: -ch / 2, w: cw, h: ch }, filter, k);
  ctx.restore();
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
// 띠지(border)가 켜져 있으면 그 두께(px)만큼 안쪽으로 들어가고, 꺼져 있으면 테두리가 없다.
function frameInset(borderPx: number | null): number {
  return borderPx ?? 0;
}

function innerBox(frame: Frame, box: Box, k: number, borderPx: number | null): Box {
  if (frame === "polaroid") {
    // 폴라로이드는 아래쪽 띠가 위·옆의 22/6배
    const pad = borderPx ?? 0.06 * box.w;
    const bottom = borderPx !== null ? borderPx * (22 / 6) : 0.22 * box.w;
    return { x: box.x + pad, y: box.y + pad, w: box.w - 2 * pad, h: box.h - pad - bottom };
  }
  const b = frameInset(borderPx);
  return { x: box.x + b, y: box.y + b, w: box.w - 2 * b, h: box.h - 2 * b };
}

function fontFamily(item: TextItem): string {
  const cssVar = FONTS.find((f) => f.id === item.font)!.cssVar;
  const style = getComputedStyle(document.documentElement);
  const families = [cssVar, FONT_FALLBACK_VAR]
    .map((name) => style.getPropertyValue(name).trim())
    .filter(Boolean);
  return [...families, "sans-serif"].join(", ");
}

// 구성 안의 글자 한 개를 그린다. 줄바꿈 규칙은 화면(CompositionBoard)과 같다:
// 공백에서만 줄을 바꾸고, 한 낱말이 칸보다 길면 글자 단위로 자른다.
function boardLines(ctx: CanvasRenderingContext2D, t: BoardText): string[] {
  const width = t.box.w;
  if (t.lines === 1) {
    let line = t.text.replace(/\n/g, " ");
    if (ctx.measureText(line).width <= width) return [line];
    while (line.length > 0 && ctx.measureText(line + "…").width > width) line = line.slice(0, -1);
    return [line + "…"];
  }
  const out: string[] = [];
  for (const para of t.text.split("\n")) {
    let cur = "";
    for (const word of para.split(/(?<= )/)) {
      if (ctx.measureText((cur + word).trimEnd()).width <= width) {
        cur += word;
        continue;
      }
      if (cur) out.push(cur.trimEnd());
      cur = "";
      for (const ch of word) {
        if (cur && ctx.measureText(cur + ch).width > width) {
          out.push(cur);
          cur = "";
        }
        cur += ch;
      }
    }
    out.push(cur.trimEnd());
  }
  return out.slice(0, t.lines);
}

function drawBoardText(ctx: CanvasRenderingContext2D, t: BoardText, family: string) {
  if (!t.text) return;
  ctx.save();
  ctx.font = `${t.weight} ${t.size}px ${family}`;
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "middle";
  ctx.textAlign = t.align;
  const x = t.align === "right" ? t.box.x + t.box.w : t.box.x;
  boardLines(ctx, t).forEach((line, i) => {
    ctx.fillText(line, x, t.box.y + (i + 0.5) * t.size * t.lineHeight);
  });
  ctx.restore();
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

  if (input.composition !== "overlay") {
    // 그리드·번호·큰 글씨·©: 흰 바탕에 두 사진을 빈칸 없이 놓는다.
    const layout = boardLayout(input.composition, input.caption);
    const family = getComputedStyle(document.body).fontFamily;
    await Promise.all(
      layout.texts
        .filter((t) => t.text)
        .map((t) => document.fonts.load(`${t.weight} ${t.size}px ${family}`, t.text).catch(() => undefined)),
    );
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, W, H);
    // 보드는 BOARD_W×BOARD_H 기준이므로 저장 크기가 다르면 비율만큼 키운다.
    ctx.save();
    ctx.scale(W / BOARD_W, H / BOARD_H);
    (["big", "small"] as Slot[]).forEach((s) => {
      const box = layout.photos[s];
      ctx.fillStyle = "#F2F2F2";
      ctx.fillRect(box.x, box.y, box.w, box.h);
      drawPhotoX(ctx, s === "big" ? bigImg : smallImg, box, input.xform[s], filterOf(input.adjust[s], input.filters[s]), k);
      drawTextures(ctx, input.textures[s], box, k);
    });
    layout.texts.forEach((t) => drawBoardText(ctx, t, family));
    ctx.restore();
  } else {
    // 큰 사진
    const full: Box = { x: 0, y: 0, w: W, h: H };
    ctx.fillStyle = "white"; // 사진을 줄이거나 돌려서 비는 곳
    ctx.fillRect(0, 0, W, H);
    drawPhotoX(ctx, bigImg, full, input.xform.big, filterOf(input.adjust.big, input.filters.big), k);
    drawTextures(ctx, input.textures.big, full, k);

    // 작은 사진
    const aspect = input.smallAspect;
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
    // 바깥 모양을 테두리 색(기본은 흰색)으로 채우고, 그 안쪽에 사진을 넣는다.
    const borderPx = input.border.on ? (input.border.thickness / 100) * W : null;
    ctx.fillStyle = input.border.on ? input.border.color : "white";
    traceShape(ctx, input.frame, box, k, 0);
    ctx.fill();
    ctx.restore();

    const inner = innerBox(input.frame, box, k, borderPx);
    ctx.save();
    if (input.frame === "polaroid") {
      ctx.beginPath();
      ctx.rect(inner.x, inner.y, inner.w, inner.h);
    } else {
      traceShape(ctx, input.frame, box, k, frameInset(borderPx));
    }
    ctx.clip();
    drawPhotoX(ctx, smallImg, inner, input.xform.small, filterOf(input.adjust.small, input.filters.small), k);
    drawTextures(ctx, input.textures.small, inner, k);
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
