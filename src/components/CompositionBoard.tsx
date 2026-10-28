import PhotoImg from "./PhotoImg";
import { TextureLayers, type TextureId } from "./textures";
import { BOARD_H, BOARD_W, boardLayout, type BoardBox } from "@/lib/composition";
import { filterOf, type Adjust, type Composition, type FilterId, type Slot, type Xform } from "@/lib/editor";

type Props = {
  composition: Exclude<Composition, "overlay">;
  photos: Record<Slot, string>;
  adjust: Record<Slot, Adjust>;
  filters: Record<Slot, FilterId>;
  textures: Record<Slot, TextureId[]>;
  xform: Record<Slot, Xform>;
  ratio: Record<Slot, number>; // 원본 사진의 가로/세로
  caption: string;
};

const place = (b: BoardBox): React.CSSProperties => ({
  position: "absolute",
  left: `${(b.x / BOARD_W) * 100}%`,
  top: `${(b.y / BOARD_H) * 100}%`,
  width: `${(b.w / BOARD_W) * 100}%`,
  height: `${(b.h / BOARD_H) * 100}%`,
});

// feed-app 시안의 프레임. 위치·크기는 저장 이미지와 같은 boardLayout 값을 쓴다.
// 사진 두 장(큰 사진 = 앞, 작은 사진 = 뒤)은 빈칸 없이 모두 들어간다.
export default function CompositionBoard({ composition, photos, adjust, filters, textures, xform, ratio, caption }: Props) {
  const layout = boardLayout(composition, caption);
  return (
    <div className="absolute inset-0 bg-white text-black">
      {(["big", "small"] as Slot[]).map((s) => (
        <div key={s} data-photo={s} data-photo-box={s} className="overflow-hidden bg-[#F2F2F2] [container-type:size]" style={place(layout.photos[s])}>
          <PhotoImg
            src={photos[s]}
            alt={s === "big" ? "큰 사진" : "작은 사진"}
            ratio={ratio[s]}
            xform={xform[s]}
            filter={filterOf(adjust[s], filters[s])}
          />
          <TextureLayers active={textures[s]} />
        </div>
      ))}
      {layout.texts.map((t, i) => (
        <div
          key={i}
          style={{
            ...place(t.box),
            fontSize: `${(t.size / BOARD_W) * 100}cqw`,
            fontWeight: t.weight,
            lineHeight: t.lineHeight,
            textAlign: t.align,
            overflow: "hidden",
            whiteSpace: t.lines === 1 ? "nowrap" : "normal",
            textOverflow: t.lines === 1 ? "ellipsis" : "clip",
            wordBreak: "keep-all",
            overflowWrap: "anywhere",
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
