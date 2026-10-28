// 겹치기 외 구성(그리드/번호/큰 글씨/©)의 배치. 화면 미리보기(CompositionBoard)와
// 저장 이미지(exportImage)가 같은 값을 쓰도록 한 곳에서 계산한다. 단위는 1080×1440 기준 px.
import type { Composition, Slot } from "./editor";

export const BOARD_W = 1080;
export const BOARD_H = 1440;

export type BoardBox = { x: number; y: number; w: number; h: number };

export type BoardText = {
  text: string;
  box: BoardBox;
  size: number; // 글자 크기 px
  weight: number;
  align: "left" | "right";
  lineHeight: number; // 글자 크기의 배수
  lines: number; // 최대 줄 수. 1이면 넘칠 때 …로 줄인다.
};

export type BoardLayout = {
  photos: Record<Slot, BoardBox>;
  texts: BoardText[];
};

const Q = BOARD_W / 100; // 1cqw
const PAD = 5 * Q;
const ROW_GAP = 2.5 * Q;
const PHOTO_GAP = 0.8 * Q;

function side(area: BoardBox, gap: number): Record<Slot, BoardBox> {
  const w = (area.w - gap) / 2;
  return {
    big: { x: area.x, y: area.y, w, h: area.h },
    small: { x: area.x + w + gap, y: area.y, w, h: area.h },
  };
}

export function boardLayout(
  c: Exclude<Composition, "overlay">,
  caption: string,
  year = new Date().getFullYear(),
): BoardLayout {
  const W = BOARD_W;
  const H = BOARD_H;
  const innerW = W - 2 * PAD;
  const text = (
    t: string,
    box: BoardBox,
    size: number,
    o: Partial<BoardText> = {},
  ): BoardText => ({ text: t, box, size, weight: 400, align: "left", lineHeight: 1.2, lines: 1, ...o });

  if (c === "grid") {
    const size = 4 * Q;
    const capH = size * 1.2;
    const area = { x: PAD, y: PAD, w: innerW, h: H - 2 * PAD - capH - ROW_GAP };
    return {
      photos: side(area, PHOTO_GAP),
      texts: [text(caption, { x: PAD, y: H - PAD - capH, w: innerW, h: capH }, size)],
    };
  }

  if (c === "num") {
    const size = 3.4 * Q;
    const lineH = size * 1.2;
    const colGap = 3 * Q;
    const top = PAD + lineH + 1.2 * Q;
    const area = { x: PAD, y: top, w: innerW, h: H - PAD - lineH - ROW_GAP - top };
    const photos = side(area, colGap);
    return {
      photos,
      texts: [
        text("(1)", { x: photos.big.x, y: PAD, w: photos.big.w, h: lineH }, size),
        text("(2)", { x: photos.small.x, y: PAD, w: photos.small.w, h: lineH }, size),
        text(caption ? `*${caption}` : "", { x: PAD, y: H - PAD - lineH, w: innerW, h: lineH }, size, {
          align: "right",
        }),
      ],
    };
  }

  if (c === "type") {
    const size = 13 * Q;
    const lh = 0.92;
    const capH = caption ? 2 * size * lh : 0;
    const top = PAD + capH + (caption ? ROW_GAP : 0);
    const area = { x: PAD, y: top, w: innerW, h: H - PAD - top };
    return {
      photos: side(area, PHOTO_GAP),
      texts: [
        text(caption, { x: PAD, y: PAD, w: innerW, h: capH }, size, { weight: 500, lineHeight: lh, lines: 2 }),
      ],
    };
  }

  // stamp: ©
  const bigSize = 9 * Q;
  const capSize = 3.4 * Q;
  const rowY = H - PAD - bigSize;
  const area = { x: PAD, y: PAD, w: innerW, h: rowY - ROW_GAP - PAD };
  return {
    photos: side(area, PHOTO_GAP),
    texts: [
      text(`© ${year}`, { x: PAD, y: rowY, w: innerW / 2, h: bigSize }, bigSize, { weight: 500, lineHeight: 1 }),
      text(
        caption,
        { x: W / 2, y: rowY + bigSize - capSize * 1.2, w: innerW / 2, h: capSize * 1.2 },
        capSize,
        { align: "right" },
      ),
    ],
  };
}
