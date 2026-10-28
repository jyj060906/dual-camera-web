export type Slot = "big" | "small";

// 띠지는 디자인이 미정이라 제외했다.
export type Frame = "rounded" | "square" | "circle" | "heart" | "star" | "polaroid";

export const FRAMES: { id: Frame; label: string; aspect: number }[] = [
  { id: "rounded", label: "기본", aspect: 3 / 4 },
  { id: "square", label: "네모", aspect: 1 },
  { id: "circle", label: "동그라미", aspect: 1 },
  { id: "heart", label: "하트", aspect: 1 },
  { id: "star", label: "별", aspect: 1 },
  { id: "polaroid", label: "폴라로이드", aspect: 4 / 5 },
];

// 이미지 전체의 구성. "overlay"는 큰 사진 위에 작은 사진을 얹는 기존 방식이고,
// 나머지는 feed-app 시안의 프레임으로 두 사진을 빈칸 없이 모두 배치한다.
// (작은 사진 모양인 Frame과는 별개다.) 배치는 composition.ts에서 계산해 미리보기와 저장 이미지가 함께 쓴다.
export type Composition = "overlay" | "grid" | "num" | "type" | "stamp";

export const COMPOSITIONS: { id: Composition; label: string }[] = [
  { id: "overlay", label: "겹치기" },
  { id: "grid", label: "그리드" },
  { id: "num", label: "번호" },
  { id: "type", label: "큰 글씨" },
  { id: "stamp", label: "©" },
];

// 텍스트 스탬프: 누르면 텍스트로 추가된다.
export const STAMPS: { id: string; label: string; text: () => string }[] = [
  { id: "copyright", label: "© 2026", text: () => `© ${new Date().getFullYear()}` },
  { id: "number", label: "(01)", text: () => "(01)" },
  { id: "frontback", label: "front / back", text: () => "front / back" },
  { id: "star", label: "★", text: () => "★" },
  {
    id: "date",
    label: "날짜",
    text: () => {
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
    },
  },
];

export const STAR_CLIP =
  "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";

export type TextItem = {
  id: number;
  text: string;
  x: number; // 사진 틀 너비 대비 %
  y: number; // 사진 틀 높이 대비 %
  size: number; // 사진 틀 너비 대비 %
  color: string;
  weight: number; // 글자 두께 100~900
  scaleX: number; // 가로 폭 %
  scaleY: number; // 세로 길이 %
  font: FontId;
  shadowColor: string;
  shadowAlpha: number; // 그림자 진하기 0~100 (0이면 그림자 없음)
  shadowBlur: number; // 그림자 흐림 px
  shadowOffset: number; // 그림자 아래쪽 거리 px
};

export function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const textShadowCss = (t: TextItem) =>
  t.shadowAlpha > 0
    ? `0 ${t.shadowOffset}px ${t.shadowBlur}px ${hexToRgba(t.shadowColor, t.shadowAlpha / 100)}`
    : "none";

// 띠지(흰 테두리): 작은 사진 가장자리를 둘러싸는 띠. 모든 프레임에서 켜고 끌 수 있다.
export type Border = {
  on: boolean;
  thickness: number; // 사진 틀 너비 대비 %
  color: string;
};

export const DEFAULT_BORDER: Border = { on: false, thickness: 3, color: "#ffffff" };

// 사진 한 장의 변형. 사진 틀(큰 사진은 화면 전체, 작은 사진은 프레임 안) 안에서 사진 자체를 움직인다.
// x·y: 틀 너비·높이 대비 이동 %, sx·sy: 가로·세로 배율(1 = 틀에 꽉 채움). 작은 사진은 가로·세로가 따로 바뀌지만, 큰 사진은 항상 sx = sy(비율 유지)다.
export type Xform = { x: number; y: number; sx: number; sy: number };
export const NO_XFORM: Xform = { x: 0, y: 0, sx: 1, sy: 1 };
export const XFORM_SCALE_MIN = 0.2;
export const XFORM_SCALE_MAX = 6;
// inFrame이 true이면 이동을 틀 크기 기준(cqw·cqh)으로 쓴다(PhotoImg). 아니면 요소 자신의 크기 기준(%)이다.
export const xformCss = (t: Xform, inFrame = false) =>
  inFrame
    ? `translate(${t.x}cqw, ${t.y}cqh) scale(${t.sx}, ${t.sy})`
    : `translate(${t.x}%, ${t.y}%) scale(${t.sx}, ${t.sy})`;
export const isNoXform = (t: Xform) => t.x === 0 && t.y === 0 && t.sx === 1 && t.sy === 1;

export type Adjust = { brightness: number; contrast: number; saturate: number };
export const NO_ADJUST: Adjust = { brightness: 100, contrast: 100, saturate: 100 };

// 필터를 늘리려면 이 목록에 한 줄만 추가하면 된다. effect는 CSS filter 값이다.
export const FILTERS = [
  { id: "none", label: "원본", effect: "" },
  { id: "bw", label: "흑백", effect: "grayscale(1)" },
  { id: "warm", label: "따뜻한", effect: "sepia(0.35) saturate(1.2)" },
  { id: "cool", label: "차가운", effect: "sepia(0.25) hue-rotate(170deg) saturate(1.1)" },
  { id: "vintage", label: "빈티지", effect: "sepia(0.5) contrast(0.9) brightness(1.05)" },
  { id: "yellow", label: "노랑", effect: "sepia(0.4) hue-rotate(12deg) saturate(1.1) contrast(0.88) brightness(1.08)" },
  { id: "digicam", label: "디카", effect: "brightness(1.15) contrast(1.12) saturate(0.85) hue-rotate(-6deg)" },
  { id: "film", label: "필름", effect: "sepia(0.3) hue-rotate(-10deg) saturate(0.8) contrast(0.85) brightness(1.05)" },
  { id: "glow", label: "글로우", effect: "sepia(0.35) saturate(1.1) contrast(0.9) brightness(1.12) blur(0.5px)" },
  { id: "creampink", label: "크림핑크", effect: "sepia(0.2) hue-rotate(-5deg) saturate(1.1) contrast(0.92) brightness(1.1)" },
  { id: "flash", label: "플래시", effect: "contrast(1.35) brightness(1.2) saturate(0.7)" },
  { id: "warmred", label: "웜레드", effect: "sepia(0.35) hue-rotate(-12deg) saturate(1.3) contrast(1.1) brightness(0.98)" },
] as const;

export type FilterId = (typeof FILTERS)[number]["id"];

export const filterOf = (a: Adjust, f: FilterId) =>
  `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%) ${
    FILTERS.find((x) => x.id === f)!.effect
  }`;


// 글꼴을 늘리려면 layout.tsx에 폰트를 불러오고 이 목록에 한 줄을 추가한다.
export const FONTS = [
  { id: "default", label: "기본", cssVar: "--font-geist-sans" },
  { id: "notosans", label: "고딕", cssVar: "--font-noto-sans-kr" },
  { id: "notoserif", label: "명조", cssVar: "--font-noto-serif-kr" },
  { id: "blackhan", label: "블랙한산스", cssVar: "--font-black-han-sans" },
  { id: "anton", label: "Anton", cssVar: "--font-anton" },
  { id: "bebas", label: "Bebas", cssVar: "--font-bebas-neue" },
  { id: "playfair", label: "Playfair", cssVar: "--font-playfair" },
] as const;

export type FontId = (typeof FONTS)[number]["id"];

// 영문 전용 글꼴로 한글을 쓰면 글자가 깨지지 않도록 한글 고딕을 대체 글꼴로 이어 붙인다.
const FALLBACK_VAR = "--font-noto-sans-kr";

export const fontCss = (id: FontId) =>
  `var(${FONTS.find((f) => f.id === id)!.cssVar}), var(${FALLBACK_VAR}), sans-serif`;

export const FONT_FALLBACK_VAR = FALLBACK_VAR;
