// 필름 입자·비네팅 같은 질감 효과. 늘리려면 TEXTURES에 항목을 추가하고
// TextureLayers에 해당 레이어를 그리면 된다.
export const TEXTURES = [
  { id: "grain", label: "그레인" },
  { id: "vignette", label: "비네팅" },
  { id: "haze", label: "뿌연 번짐" },
  { id: "dust", label: "먼지" },
  { id: "lowres", label: "저화질" },
  { id: "whiteborder", label: "흰 테두리" },
] as const;

export type TextureId = (typeof TEXTURES)[number]["id"];

const GRAIN_SVG = encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>" +
    "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>" +
    "<feColorMatrix type='saturate' values='0'/></filter>" +
    "<rect width='100%' height='100%' filter='url(#n)'/></svg>",
);

// 노이즈 중 값이 큰 곳만 남겨 드문드문한 하얀 먼지 자국을 만든다.
const DUST_SVG = encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='360' height='360'>" +
    "<filter id='d'><feTurbulence type='fractalNoise' baseFrequency='0.55' numOctaves='1' seed='7'/>" +
    "<feColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 14 0 0 0 -10'/></filter>" +
    "<rect width='100%' height='100%' filter='url(#d)'/></svg>",
);

export function TextureLayers({ active }: { active: TextureId[] }) {
  return (
    <>
      {active.includes("grain") && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,${GRAIN_SVG}")`,
            opacity: 0.45,
            mixBlendMode: "overlay",
          }}
        />
      )}
      {active.includes("haze") && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "rgba(255,255,255,0.16)",
            backdropFilter: "blur(1.5px)",
          }}
        />
      )}
      {active.includes("dust") && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,${DUST_SVG}")`,
            opacity: 0.8,
          }}
        />
      )}
      {active.includes("lowres") && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(0,0,0,0.28) 1px, transparent 1.3px)",
            backgroundSize: "3px 3px",
            backdropFilter: "blur(0.8px) contrast(1.1)",
          }}
        />
      )}
      {active.includes("vignette") && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      )}
    {active.includes("whiteborder") && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            padding: "4%",
            background: "white",
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
          }}
        />
      )}
    </>
  );
}
