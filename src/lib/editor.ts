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

export const fontCss = (id: FontId) =>
  `var(${FONTS.find((f) => f.id === id)!.cssVar}), sans-serif`;
