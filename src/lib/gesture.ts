// 사진을 손가락으로 편집하는 계산. 화면(DualShot)과 시험이 같은 함수를 쓴다.
//
// 모델: 사진 틀(rect) 안에 원본 사진이 "틀을 덮는 크기"(cover)로 가운데에 놓이고, 거기에 배율(sx, sy)과 이동(x, y)이 더해진다.
//  · 원본의 가로세로 비율이 틀과 다르면 cover가 틀보다 한쪽으로 더 커서, 틀 밖으로 잘린 부분이 생긴다.
//  · 이동(x, y)은 틀 너비·높이 대비 %. 이동하면 잘린 부분이 틀 안으로 들어온다.
//  · 사진이 틀을 덮을 수 있는 범위(fitXform) 안에서만 움직인다: 필요 이상의 빈 곳이 생기지 않는다.
import { XFORM_SCALE_MAX, XFORM_SCALE_MIN, type Xform } from "./editor";

export type Pt = { x: number; y: number };
export type BoxRect = { left: number; top: number; width: number; height: number };
export type Cover = { width: number; height: number };

// 손가락 사이가 한 방향으로 이만큼(px)보다 좁으면 그 방향 배율은 바꾸지 않는다.
// (거의 한 줄로 놓인 손가락이 다른 방향을 부풀리지 않도록)
export const SPREAD_FLOOR = 40;

// 큰 사진(zoomOnly)은 처음 표시된 크기(배율 1)보다 작아지지 않는다. 확대한 뒤 줄여도 거기서 멈춘다.
export const ZOOM_ONLY_MIN = 1;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const clampScale = (v: number, min = XFORM_SCALE_MIN) => clamp(v, min, XFORM_SCALE_MAX);
const mid = (p: Pt[]): Pt => ({ x: p.reduce((a, q) => a + q.x, 0) / p.length, y: p.reduce((a, q) => a + q.y, 0) / p.length });
const center = (r: BoxRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// 원본(가로/세로 = ar)을 틀에 비율을 지키며 꽉 채우는 크기(object-fit: cover와 같다).
export const coverOf = (rect: { width: number; height: number }, ar: number): Cover => ({
  width: Math.max(rect.width, rect.height * ar),
  height: Math.max(rect.height, rect.width / ar),
});

// 큰 사진 자리로 넘어오는 변형을 확대·축소 전용으로 바꾼다: 가로·세로는 둘 중 큰 배율에 맞춰 비율을 같게 하고,
// 처음 크기(1)보다 작았다면 1로 맞춘다. 위치는 가운데로 되돌린다(틀이 달라 이전 위치가 맞지 않는다).
export const toZoomOnly = (xf: Xform): Xform => {
  const s = Math.max(xf.sx, xf.sy, ZOOM_ONLY_MIN);
  return { x: 0, y: 0, sx: s, sy: s };
};

// 사진이 틀을 덮을 수 있는 범위로 이동을 제한한다. 사진(cover × 배율)이 틀보다 크면 가장자리가 틀 밖에 머물도록,
// 작으면 틀 안에 머물도록 한다. zoomOnly이면 가로·세로 배율을 같게 맞춘다.
export function fitXform(xf: Xform, rect: { width: number; height: number }, cover: Cover = rect, zoomOnly = false): Xform {
  const sx = xf.sx;
  const sy = zoomOnly ? xf.sx : xf.sy;
  const maxX = (Math.abs(cover.width * sx - rect.width) / 2 / rect.width) * 100;
  const maxY = (Math.abs(cover.height * sy - rect.height) / 2 / rect.height) * 100;
  return { x: clamp(xf.x, -maxX, maxX), y: clamp(xf.y, -maxY, maxY), sx, sy };
}

// 사진을 (dx, dy)px만큼 민다(스크롤·휠·미는 동작). 틀은 그대로이고 사진이 틀 아래에서 움직인다.
export function panXform(xf: Xform, rect: { width: number; height: number }, cover: Cover, dx: number, dy: number, zoomOnly = false): Xform {
  return fitXform({ ...xf, x: xf.x + (dx / rect.width) * 100, y: xf.y + (dy / rect.height) * 100 }, rect, cover, zoomOnly);
}

// 두 손가락 조작. start: 손가락이 놓인 시점의 손가락 위치와 변형, now: 지금 손가락 위치.
//  · 작은 사진: 두 손가락 사이를 가로로 벌리면 가로만, 세로로 벌리면 세로만, 대각선이면 둘 다 바뀐다. 한 손가락은 이동.
//    손가락 사이 지점 아래의 사진 점이 제자리에 머문다.
//  · 큰 사진(zoomOnly): 손가락 사이 거리만큼 비율을 유지한 채 확대·축소만 된다(이동은 스크롤로 한다).
export function computeXform(
  start: { pts: Pt[]; xf: Xform; rect: BoxRect; cover?: Cover; zoomOnly?: boolean },
  now: Pt[],
): Xform {
  const { rect, xf } = start;
  const cover = start.cover ?? rect;
  const zoomOnly = Boolean(start.zoomOnly);
  const fit = (v: Xform) => fitXform(v, rect, cover, zoomOnly);
  const c = center(rect);
  const t0 = { x: (xf.x / 100) * rect.width, y: (xf.y / 100) * rect.height };
  const m0 = mid(start.pts);
  const m = mid(now);

  if (zoomOnly) {
    if (start.pts.length < 2 || now.length < 2) return fit(xf);
    const d0 = Math.hypot(start.pts[1].x - start.pts[0].x, start.pts[1].y - start.pts[0].y);
    const d = Math.hypot(now[1].x - now[0].x, now[1].y - now[0].y);
    const s = clampScale(xf.sx * (Math.max(d, SPREAD_FLOOR) / Math.max(d0, SPREAD_FLOOR)), ZOOM_ONLY_MIN);
    return fit({ x: xf.x, y: xf.y, sx: s, sy: s });
  }

  if (start.pts.length < 2 || now.length < 2) {
    return fit({ ...xf, x: ((t0.x + m.x - m0.x) / rect.width) * 100, y: ((t0.y + m.y - m0.y) / rect.height) * 100 });
  }

  const ratio = (a: number, b: number) => Math.max(Math.abs(a), SPREAD_FLOOR) / Math.max(Math.abs(b), SPREAD_FLOOR);
  const sx = clampScale(xf.sx * ratio(now[1].x - now[0].x, start.pts[1].x - start.pts[0].x));
  const sy = clampScale(xf.sy * ratio(now[1].y - now[0].y, start.pts[1].y - start.pts[0].y));

  // 처음 손가락 사이 지점 아래에 있던 사진 위의 점(p0)이 지금 손가락 사이 지점에 오도록 이동을 정한다.
  const p0 = { x: (m0.x - c.x - t0.x) / xf.sx, y: (m0.y - c.y - t0.y) / xf.sy };
  const t = { x: m.x - c.x - sx * p0.x, y: m.y - c.y - sy * p0.y };
  return fit({ x: (t.x / rect.width) * 100, y: (t.y / rect.height) * 100, sx, sy });
}

// ── 네 모서리 조절점 ──
// 1 = 오른쪽/아래, -1 = 왼쪽/위.
export type Corner = { cx: 1 | -1; cy: 1 | -1 };
export const CORNERS: Corner[] = [
  { cx: -1, cy: -1 },
  { cx: 1, cy: -1 },
  { cx: -1, cy: 1 },
  { cx: 1, cy: 1 },
];

// 사진(틀 안에서 변형된 모양)의 네 모서리 위치. rect는 틀의 화면 위치, cover는 배율 1일 때 사진의 크기다.
export function cornerPoint(rect: BoxRect, xf: Xform, corner: Corner, cover: Cover = rect): Pt {
  const c = center(rect);
  return {
    x: c.x + (xf.x / 100) * rect.width + (corner.cx * cover.width * xf.sx) / 2,
    y: c.y + (xf.y / 100) * rect.height + (corner.cy * cover.height * xf.sy) / 2,
  };
}

// 한 모서리를 from에서 to로 끌어 크기를 바꾼다.
//  · 작은 사진: 반대쪽 모서리를 고정한 채 가로·세로를 따로 바꾼다(비율 고정 없음).
//  · 큰 사진(zoomOnly): 사진 중심은 그대로 두고 비율을 유지한 채 확대·축소만 된다(처음 크기 아래로는 안 줄어든다).
// 어느 쪽이든 사진이 틀을 덮을 수 있는 범위(fitXform) 안에 머문다.
export function dragCorner(
  start: { xf: Xform; rect: BoxRect; cover?: Cover; corner: Corner; from: Pt; zoomOnly?: boolean },
  to: Pt,
): Xform {
  const { xf, rect, corner } = start;
  const cover = start.cover ?? rect;
  const dragged = cornerPoint(rect, xf, corner, cover);
  const nx = dragged.x + (to.x - start.from.x);
  const ny = dragged.y + (to.y - start.from.y);

  if (start.zoomOnly) {
    const cx = rect.left + rect.width / 2 + (xf.x / 100) * rect.width;
    const cy = rect.top + rect.height / 2 + (xf.y / 100) * rect.height;
    const dvx = (corner.cx * cover.width) / 2;
    const dvy = (corner.cy * cover.height) / 2;
    const su = clampScale(((nx - cx) * dvx + (ny - cy) * dvy) / (dvx * dvx + dvy * dvy), ZOOM_ONLY_MIN);
    return fitXform({ x: xf.x, y: xf.y, sx: su, sy: su }, rect, cover, true);
  }

  const fixed = cornerPoint(rect, xf, { cx: (-corner.cx) as 1 | -1, cy: (-corner.cy) as 1 | -1 }, cover);
  const sx = clampScale(((nx - fixed.x) * corner.cx) / cover.width);
  const sy = clampScale(((ny - fixed.y) * corner.cy) / cover.height);
  const dx = fixed.x + corner.cx * sx * cover.width;
  const dy = fixed.y + corner.cy * sy * cover.height;
  const c = center(rect);
  return fitXform(
    {
      x: (((fixed.x + dx) / 2 - c.x) / rect.width) * 100,
      y: (((fixed.y + dy) / 2 - c.y) / rect.height) * 100,
      sx,
      sy,
    },
    rect,
    cover,
  );
}

// ── 작은 사진 프레임 자체의 크기·모양 ──
// 모서리를 from에서 to로 끌면 반대쪽 모서리를 고정한 채 프레임의 가로·세로가 따로 바뀐다(비율 고정 없음).
// 프레임은 사진 틀(stage) 밖으로 나갈 수 없고, 한 변이 틀 너비의 8%보다 작아지지 않는다.
// 돌려주는 값은 화면 상태와 같은 단위다: size = 틀 너비 대비 프레임 너비 %, aspect = 너비/높이, x·y = 왼쪽·위 위치 %.
export const FRAME_MIN = 0.08;

export function dragFrameCorner(
  start: { stage: BoxRect; box: BoxRect; corner: Corner; from: Pt },
  to: Pt,
): { size: number; aspect: number; x: number; y: number } {
  const { stage, box, corner } = start;
  const fixed = {
    x: corner.cx > 0 ? box.left : box.left + box.width,
    y: corner.cy > 0 ? box.top : box.top + box.height,
  };
  const dragged = {
    x: (corner.cx > 0 ? box.left + box.width : box.left) + (to.x - start.from.x),
    y: (corner.cy > 0 ? box.top + box.height : box.top) + (to.y - start.from.y),
  };
  // 틀 안에서 반대쪽 모서리로부터 늘릴 수 있는 최대 길이
  const maxW = corner.cx > 0 ? stage.left + stage.width - fixed.x : fixed.x - stage.left;
  const maxH = corner.cy > 0 ? stage.top + stage.height - fixed.y : fixed.y - stage.top;
  const min = FRAME_MIN * stage.width;
  const w = Math.min(maxW, Math.max(Math.min(min, maxW), (dragged.x - fixed.x) * corner.cx));
  const h = Math.min(maxH, Math.max(Math.min(min, maxH), (dragged.y - fixed.y) * corner.cy));
  const left = corner.cx > 0 ? fixed.x : fixed.x - w;
  const top = corner.cy > 0 ? fixed.y : fixed.y - h;
  return {
    size: (w / stage.width) * 100,
    aspect: w / h,
    x: ((left - stage.left) / stage.width) * 100,
    y: ((top - stage.top) / stage.height) * 100,
  };
}
