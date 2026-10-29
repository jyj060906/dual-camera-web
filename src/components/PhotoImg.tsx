import { xformCss } from "@/lib/editor";
import type { Xform } from "@/lib/editor";

// 원본 사진을 "틀을 덮는 크기"(object-fit: cover와 같은 크기)로 틀 가운데에 놓고, 그 위에 이동·배율을 얹는다.
// 틀(부모)은 overflow: hidden + container-type: size여야 한다. 원본의 비율이 틀과 다르면 사진이 틀보다 커서
// 틀 밖으로 잘린 부분이 생기고, 이동하면 그 부분이 틀 안으로 들어온다. 저장 이미지(exportImage)와 같은 규칙이다.
//   cover 너비 = max(틀 너비, 틀 높이 × 비율), cover 높이 = max(틀 높이, 틀 너비 ÷ 비율)
//   이동 x·y는 틀 너비·높이 대비 %라서 cqw·cqh(틀 크기의 1%)로 쓴다.
export default function PhotoImg({
  src,
  alt,
  ratio,
  xform,
  filter,
  opacity,
}: {
  src: string;
  alt: string;
  ratio: number; // 원본의 가로/세로
  xform: Xform;
  filter?: string;
  opacity?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      draggable={false}
      style={
        {
          "--ar": ratio,
          position: "absolute",
          left: "50%",
          top: "50%",
          width: "max(100cqw, calc(100cqh * var(--ar)))",
          height: "max(100cqh, calc(100cqw / var(--ar)))",
          maxWidth: "none",
          transform: `translate(-50%, -50%) ${xformCss(xform, true)}`,
          filter,
          opacity,
        } as React.CSSProperties
      }
    />
  );
}
