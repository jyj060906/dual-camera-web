// 필름 입자·비네팅 같은 질감 효과. 늘리려면 TEXTURES에 항목을 추가하고
// TextureLayers에 해당 레이어를 그리면 된다.
export const TEXTURES = [
  { id: "grain", label: "그레인" },
  { id: "vignette", label: "비네팅" },
  { id: "haze", label: "뿌연 번짐" },
] as const;

export type TextureId = (typeof TEXTURES)[number]["id"];

const GRAIN_SVG = encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>" +
    "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>" +
    "<feColorMatrix type='saturate' values='0'/></filter>" +
    "<rect width='100%' height='100%' filter='url(#n)'/></svg>",
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
      {active.includes("vignette") && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      )}
    </>
  );
}
