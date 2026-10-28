"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { TEXTURES, TextureLayers, type TextureId } from "./textures";
import { AdjustIcon, LayoutIcon, SaveIcon, TextIcon } from "./icons";
import CompositionBoard from "./CompositionBoard";
import PublishPanel from "./PublishPanel";
import {
  applyZoom,
  detectWide,
  digitalZoomOf,
  openCamera,
  usesWideLens,
  zoomChoices,
  type Facing,
  type WideSupport,
} from "@/lib/camera";
import {
  CORNERS,
  computeXform,
  coverOf,
  cornerPoint,
  dragCorner,
  dragFrameCorner,
  panXform,
  toZoomOnly,
  type Corner,
  type Cover,
  type Pt,
} from "@/lib/gesture";
import PhotoImg from "./PhotoImg";
import {
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  canvasToBlob,
  downloadUrl,
  renderDualShot,
  timestampName,
} from "@/lib/exportImage";
import {
  COMPOSITIONS,
  FILTERS,
  FONTS,
  STAMPS,
  DEFAULT_BORDER,
  FRAMES,
  NO_ADJUST,
  NO_XFORM,
  STAR_CLIP,
  filterOf,
  fontCss,
  textShadowCss,
  type Adjust,
  type Border,
  type Composition,
  type FilterId,
  type Frame,
  type Slot,
  type TextItem,
  type Xform,
} from "@/lib/editor";

const SLOT_LABEL: Record<Slot, string> = { big: "큰 사진", small: "작은 사진" };
// 촬영 순서대로 배치한다: 첫 번째로 찍은 사진은 큰 사진, 두 번째로 찍은 사진은 작은 사진.
const SHOT_LABEL: Record<Slot, string> = { big: "첫 번째", small: "두 번째" };

const FAVORITES_KEY = "dual-camera.favoriteColors";
const MAX_FAVORITES = 20;

// 즐겨찾기 색상은 이 브라우저에만 저장한다(로그인 전이라 서버에 두지 않는다).
function loadFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((c): c is string => typeof c === "string").slice(0, MAX_FAVORITES)
      : [];
  } catch {
    return [];
  }
}

function saveFavorites(list: string[]) {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
  } catch {
    // 저장이 막힌 환경에서는 이번 접속 동안만 유지된다.
  }
}

const TEXT_COLORS = ["#ffffff", "#000000", "#ec4899", "#facc15", "#38bdf8"];

// 작은 사진 프레임의 바깥 모양. border가 켜져 있으면 테두리 색 바탕에 두께만큼 안쪽으로 들어간다.
function shapeStyle(frame: Frame, border: Border): React.CSSProperties {
  if (border.on) {
    const t = border.thickness;
    const base = { background: border.color, padding: `${t}cqw` };
    switch (frame) {
      case "rounded":
        return { ...base, borderRadius: "0.75rem" };
      case "circle":
        return { ...base, borderRadius: "50%" };
      case "heart":
        return { ...base, clipPath: "url(#dual-heart)" };
      case "star":
        return { ...base, clipPath: STAR_CLIP };
      case "polaroid":
        return { background: border.color, padding: `${t}cqw ${t}cqw ${(t * 22) / 6}cqw` };
      default:
        return base;
    }
  }
  // 띠지가 꺼져 있으면 테두리가 없다(폴라로이드는 흰 띠가 프레임 모양 자체다).
  switch (frame) {
    case "rounded":
      return { borderRadius: "0.75rem" };
    case "square":
      return {};
    case "circle":
      return { borderRadius: "50%" };
    case "heart":
      return { clipPath: "url(#dual-heart)" };
    case "star":
      return { clipPath: STAR_CLIP };
    case "polaroid":
      return { background: "white", padding: "6% 6% 22%" };
  }
}

// 테두리 안쪽(사진이 들어가는 칸)의 모양. 바깥과 같은 모양으로 잘라야 테두리가 둘러싼 것처럼 보인다.
function innerShapeStyle(frame: Frame, border: Border): React.CSSProperties {
  if (!border.on) return {};
  switch (frame) {
    case "rounded":
      return { borderRadius: `max(0px, calc(0.75rem - ${border.thickness}cqw))` };
    case "circle":
      return { borderRadius: "50%" };
    case "heart":
      return { clipPath: "url(#dual-heart)" };
    case "star":
      return { clipPath: STAR_CLIP };
    default:
      return {};
  }
}

const MAX_TEXT_LENGTH = 120;

// 편집 영역: 사진 틀(잘라내기 영역)은 화면 가운데에 고정되어 있고 둘레에 RING만큼의 빈 테두리가 보인다.
// 스크롤(밀기·휠)하면 틀은 그대로이고 사진이 틀 아래에서 움직인다. 틀 밖으로 잘린 부분은 테두리 쪽에 흐리게 보인다.
const RING = 0.07;
const STAGE_PCT = 100 / (1 + 2 * RING); // 보이는 편집 영역 대비 사진 틀의 크기(%)
const STAGE_OFFSET_PCT = (RING / (1 + 2 * RING)) * 100; // 사진 틀의 왼쪽·위 위치(%)

// 탭은 아이콘으로 보여 주고, 이름은 aria-label과 길게 눌렀을 때의 툴팁으로 남긴다.
const TABS = [
  { id: "layout", label: "배치", Icon: LayoutIcon },
  { id: "adjust", label: "보정", Icon: AdjustIcon },
  { id: "text", label: "텍스트", Icon: TextIcon },
  { id: "save", label: "저장", Icon: SaveIcon },
] as const;

type TabId = (typeof TABS)[number]["id"];

const EXPORT_SIZE_LABEL = `${EXPORT_WIDTH}×${EXPORT_HEIGHT}`;

export default function DualShot() {
  const [photos, setPhotos] = useState<Record<Slot, string | null>>({
    big: null,
    small: null,
  });
  // 지금 찍을 차례: 큰 사진이 비어 있으면 큰 사진, 아니면 작은 사진이다(다시 찍을 때도 같다).
  const slot: Slot = photos.big ? "small" : "big";
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<Frame>("rounded");
  const [composition, setComposition] = useState<Composition>("overlay");
  const [caption, setCaption] = useState("");
  const [border, setBorder] = useState<Border>(DEFAULT_BORDER);
  const [adjust, setAdjust] = useState<Record<Slot, Adjust>>({
    big: NO_ADJUST,
    small: NO_ADJUST,
  });
  const [filters, setFilters] = useState<Record<Slot, FilterId>>({
    big: "none",
    small: "none",
  });
  const [textures, setTextures] = useState<Record<Slot, TextureId[]>>({
    big: [],
    small: [],
  });
  const [xform, setXform] = useState<Record<Slot, Xform>>({ big: NO_XFORM, small: NO_XFORM });
  // 찍은 원본 사진의 가로/세로(틀 밖으로 잘린 부분이 얼마나 되는지 정한다).
  const [ratio, setRatio] = useState<Record<Slot, number>>({ big: 3 / 4, small: 3 / 4 });
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [selectedText, setSelectedText] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<number | null>(null);
  const [tab, setTab] = useState<TabId>("layout");
  const lastTap = useRef<{ id: number; time: number } | null>(null);
  const nextTextId = useRef(1);
  const [favorites, setFavorites] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : loadFavorites(),
  );
  const [format, setFormat] = useState<"jpg" | "png">("jpg");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editSlot, setEditSlot] = useState<Slot>("big");
  const [smallSize, setSmallSize] = useState(32); // 큰 사진 너비 대비 %
  const [smallAspect, setSmallAspect] = useState(3 / 4); // 작은 사진 프레임의 너비/높이(모서리를 끌어 자유롭게 바뀐다)
  const [smallPos, setSmallPos] = useState({ x: 6, y: 6 }); // 왼쪽·위 기준 %

  // 광각 지원 여부: 카메라 방향별로 처음 켤 때 한 번 알아낸다(undefined = 아직 모름, null = 지원 안 함).
  const [wideMap, setWideMap] = useState<Partial<Record<Facing, WideSupport | null>>>({});
  // 방향별 배율(0.5~2). 기본은 1배.
  const [zoomMap, setZoomMap] = useState<Partial<Record<Facing, number>>>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // 지금 미리보기에 붙어 있는 카메라가 어느 사진용인지. 카메라를 바꾸는 중에는 null이다.
  const liveSlotRef = useRef<Slot | null>(null);
  // 전면 사진을 찍으면 3초 뒤 후면 사진이 자동으로 찍힌다. left는 남은 초(0이면 촬영 중).
  const [auto, setAuto] = useState<{ slot: Slot; left: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // 모바일(터치 기기)은 찍을 때마다 전면·후면을 바꿀 수 있다. PC는 전면 카메라만 쓴다(기획서 4장).
  const isMobile = useSyncExternalStore(
    () => () => {},
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );

  // 다음에 찍을 카메라. 고르기 전에는 첫 사진 후면, 두 번째 사진 전면이다.
  const [facingPick, setFacingPick] = useState<"user" | "environment" | null>(null);
  const facing: "user" | "environment" = isMobile
    ? (facingPick ?? (slot === "big" ? "environment" : "user"))
    : "user";

  function toggleFacing() {
    setAuto(null);
    setFacingPick(facing === "user" ? "environment" : "user");
  }

  const bothTaken = photos.big && photos.small;
  const aspect = smallAspect;

  const wide = wideMap[facing] ?? null;
  const zoom = zoomMap[facing] ?? 1;
  const wideLens = usesWideLens(wide, zoom);
  const digital = digitalZoomOf(wide, zoom);
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  });

  useEffect(() => {
    if (bothTaken) return;
    let cancelled = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());

    (async () => {
      const known = wideMap[facing];
      const stream = await openCamera(facing, wideLens && known?.kind === "lens" ? known.wideDeviceId : undefined);
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      // 처음 켠 방향이면 광각을 지원하는지 알아낸다(권한을 받은 뒤라야 렌즈 이름이 보인다).
      let support = known;
      if (support === undefined) {
        support = await detectWide(stream, facing);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setWideMap((m) => ({ ...m, [facing]: support }));
      }
      if (support?.kind === "zoom") await applyZoom(stream, Math.min(Math.max(zoomRef.current, support.min), support.max));
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setError(null);
      if (videoRef.current) videoRef.current.srcObject = stream;
      liveSlotRef.current = slot;
    })().catch(() =>
      setError(
        "카메라를 사용할 수 없습니다. 권한을 허용했는지, https 또는 localhost 주소인지 확인해 주세요.",
      ),
    );

    return () => {
      cancelled = true;
      liveSlotRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // wideMap은 처음 한 번 읽는 값이라 의존성에 넣지 않는다(넣으면 감지 직후 카메라가 다시 켜진다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, isMobile, bothTaken, facing, wideLens]);

  // 연속 줌 방식은 카메라를 다시 켜지 않고 배율만 바꾼다.
  useEffect(() => {
    if (wide?.kind === "zoom" && streamRef.current) void applyZoom(streamRef.current, zoom);
  }, [wide, zoom]);

  function setZoom(v: number) {
    setZoomMap((m) => ({ ...m, [facing]: v }));
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    // 디지털 줌(렌즈 방식의 1배 이상)은 미리보기와 똑같이 가운데를 확대한 부분만 찍는다.
    const sw = video.videoWidth / digital;
    const sh = video.videoHeight / digital;
    canvas.width = sw;
    canvas.height = sh;
    canvas
      .getContext("2d")
      ?.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, sw, sh);
    const url = canvas.toDataURL("image/jpeg", 0.92);
    setPhotos((p) => ({ ...p, [slot]: url }));
    setRatio((r) => ({ ...r, [slot]: sw / sh }));
    const other: Slot = slot === "big" ? "small" : "big";
    // 다음 사진은 반대쪽 카메라가 기본이다(바꾸려면 전환 버튼).
    setFacingPick(facing === "user" ? "environment" : "user");
    // 직접 누른 촬영이면 진행 중이던 자동 촬영은 취소한다. 모바일에서 전면 사진을 먼저 찍었다면
    // 다음 사진(후면)은 3초 뒤 자동으로 찍힌다.
    setAuto(isMobile && facing === "user" && !photos[other] ? { slot: other, left: 3 } : null);
  }

  // 자동 촬영은 항상 최신 capture를 불러야 해서 ref에 담아 둔다.
  const captureRef = useRef(capture);
  useEffect(() => {
    captureRef.current = capture;
  });

  useEffect(() => {
    if (!auto) return;
    if (auto.left > 0) {
      const t = setTimeout(() => setAuto({ slot: auto.slot, left: auto.left - 1 }), 1000);
      return () => clearTimeout(t);
    }
    // 시간이 되었다. 후면 카메라가 아직 준비 중이면 잠깐(최대 5초) 기다린다.
    // 이전 카메라의 멈춘 화면을 찍지 않도록 새 카메라가 붙었을 때만 찍는다.
    let tries = 0;
    const t = setInterval(() => {
      const v = videoRef.current;
      if (v && liveSlotRef.current === auto.slot && v.readyState >= 2 && v.videoWidth) {
        clearInterval(t);
        captureRef.current();
      } else if (++tries > 25) {
        clearInterval(t);
        setAuto(null);
        setError("후면 카메라가 준비되지 않아 자동으로 찍지 못했어요. 직접 촬영해 주세요.");
      }
    }, 200);
    return () => clearInterval(t);
  }, [auto]);

  function retake(s: Slot) {
    setPhotos((p) => ({ ...p, [s]: null }));
    setAdjust((a) => ({ ...a, [s]: NO_ADJUST }));
    setFilters((f) => ({ ...f, [s]: "none" }));
    setTextures((t) => ({ ...t, [s]: [] }));
    setXform((x) => ({ ...x, [s]: NO_XFORM }));
    setRatio((r) => ({ ...r, [s]: 3 / 4 }));
    setFacingPick(null);
    setAuto(null);
  }

  function swap() {
    setPhotos((p) => ({ big: p.small, small: p.big }));
    setAdjust((a) => ({ big: a.small, small: a.big }));
    setFilters((f) => ({ big: f.small, small: f.big }));
    setTextures((t) => ({ big: t.small, small: t.big }));
    // 큰 사진은 움직이거나 모양을 바꿀 수 없으므로, 작은 사진에서 넘어온 사진은 가운데에 두고 비율을 같게 정리한다.
    setXform((x) => ({ big: toZoomOnly(x.small), small: x.big }));
    setRatio((r) => ({ big: r.small, small: r.big }));
  }

  function addText(init: Partial<TextItem> = {}) {
    const id = nextTextId.current++;
    setTexts((t) => [
      ...t,
      {
        id,
        text: "텍스트",
        x: 30,
        y: 40,
        size: 9,
        color: "#ffffff",
        weight: 700,
        scaleX: 100,
        scaleY: 100,
        font: "default",
        shadowColor: "#000000",
        shadowAlpha: 45,
        shadowBlur: 4,
        shadowOffset: 1,
        ...init,
      },
    ]);
    setSelectedText(id);
  }

  // 스탬프는 겹치기에서는 사진 위에 얹히는 흰 글씨, 다른 구성에서는 흰 바탕 위의 검정 글씨로 넣는다.
  function addStamp(text: string) {
    addText(
      composition === "overlay"
        ? { text }
        : { text, color: "#000000", weight: 500, size: 6, shadowAlpha: 0 },
    );
  }

  function updateText(id: number, patch: Partial<TextItem>) {
    setTexts((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  // 지금 화면의 편집 결과를 이미지 파일(Blob)로 만든다.
  async function renderBlob(type: "image/jpeg" | "image/png"): Promise<Blob> {
    const stage = stageRef.current;
    if (!stage || !photos.big || !photos.small) throw new Error("사진 두 장이 필요해요.");
    const canvas = await renderDualShot({
      photos: { big: photos.big, small: photos.small },
      adjust,
      filters,
      textures,
      xform,
      composition,
      caption,
      frame,
      border,
      smallSize,
      smallAspect,
      smallPos,
      texts,
      stageWidthPx: stage.getBoundingClientRect().width,
    });
    return canvasToBlob(canvas, type);
  }

  async function saveEdited() {
    if (!photos.big || !photos.small) return;
    setSaving(true);
    setSaveError(null);
    try {
      const blob = await renderBlob(format === "png" ? "image/png" : "image/jpeg");
      const url = URL.createObjectURL(blob);
      downloadUrl(url, `${timestampName()}.${format}`);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function saveOriginals() {
    if (!photos.big || !photos.small) return;
    const name = timestampName();
    downloadUrl(photos.big, `${name}-original-big.jpg`);
    // 브라우저가 한꺼번에 여러 파일을 내려받는 것을 막지 않도록 간격을 둔다.
    setTimeout(() => downloadUrl(photos.small!, `${name}-original-small.jpg`), 400);
  }

  function addFavorite(color: string) {
    setFavorites((f) => {
      const next = [color, ...f.filter((c) => c !== color)].slice(0, MAX_FAVORITES);
      saveFavorites(next);
      return next;
    });
  }

  function removeFavorite(color: string) {
    setFavorites((f) => {
      const next = f.filter((c) => c !== color);
      saveFavorites(next);
      return next;
    });
  }

  function removeText(id: number) {
    setTexts((t) => t.filter((x) => x.id !== id));
    setSelectedText(null);
    setEditingText((cur) => (cur === id ? null : cur));
  }

  function startTextDrag(e: React.PointerEvent<HTMLDivElement>, id: number) {
    const stage = stageRef.current;
    const item = texts.find((x) => x.id === id);
    if (!stage || !item) return;
    setSelectedText(id);
    setTab("text");
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = stage.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const target = e.currentTarget;

    const move = (ev: PointerEvent) => {
      const x = item.x + ((ev.clientX - startX) / rect.width) * 100;
      const y = item.y + ((ev.clientY - startY) / rect.height) * 100;
      updateText(id, {
        x: Math.min(Math.max(0, x), 95),
        y: Math.min(Math.max(0, y), 95),
      });
    };
    const up = (ev: PointerEvent) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      // 제자리에서 두 번 연속 누르면 그 자리에서 글자를 고친다.
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) >= 6) return;
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && prev.id === id && now - prev.time < 350) {
        lastTap.current = null;
        setEditingText(id);
      } else {
        lastTap.current = { id, time: now };
      }
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  function toggleTexture(id: TextureId) {
    setTextures((t) => ({
      ...t,
      [editSlot]: t[editSlot].includes(id)
        ? t[editSlot].filter((x) => x !== id)
        : [...t[editSlot], id],
    }));
  }

  // ── 사진을 손가락으로 직접 편집 ──
  // 선택 후 편집: 선택되지 않은 사진을 처음 만지면 선택만 되고, 이미 선택된 사진(조절점이 붙어 있는 사진)에서만 아래 조작이 된다.
  // 한 손가락: 사진을 끌어 옮긴다(겹치기의 작은 사진은 프레임 자체를 옮긴다). 같은 사진을 빠르게 두 번 탭하면 큰/작은 사진의 위치와 크기가 서로 바뀐다.
  // 두 손가락: 벌리고 오므리면 확대·축소. 작은 사진은 손가락 사이를 가로로 벌리면 가로 길이만, 세로로 벌리면 세로 길이만 바뀌고,
  //            큰 사진은 가운데에 고정되어 움직이지 않고, 어느 쪽으로 벌려도 가로·세로 비율을 유지한 채 확대·축소만 된다.
  //            손가락 사이 지점이 제자리에 머물도록 이동도 함께 계산한다.
  type Gesture = {
    target: Slot;
    mode: "frame" | "content" | "select"; // select: 선택만 하는 터치(편집하지 않는다)
    moved: boolean;
    start: Pt;
    origin: { x: number; y: number }; // 시작할 때 작은 사진 프레임 위치
    base: { pts: Pt[]; xf: Xform; rect: DOMRect; cover: Cover; zoomOnly: boolean } | null;
  };
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<Gesture | null>(null);
  const photoTap = useRef<{ time: number; x: number; y: number; target: Slot } | null>(null);
  function captureBase(g: Gesture) {
    const el = stageRef.current?.querySelector<HTMLElement>(`[data-photo-box="${g.target}"]`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      pts: [...pointers.current.values()].slice(0, 2),
      xf: xform[g.target],
      rect,
      cover: coverOf(rect, ratio[g.target]),
      zoomOnly: g.target === "big", // 큰 사진은 손가락으로는 비율을 유지한 확대·축소만 된다(이동은 스크롤로 한다)
    };
  }

  function onStageDown(e: React.PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    const el = e.target as HTMLElement;
    // 글자가 아닌 곳을 누르면 글자 선택이 풀린다(삭제 X 버튼도 함께 사라진다).
    if (!el.closest("[data-text]")) setSelectedText(null);
    // 이동 모드에서는 스크롤만, 글자는 자기 방식으로 끌린다. 텍스트 탭에서는 글자를 다루다 사진이 딸려 움직이지 않게 사진 조작을 끈다.
    if (!stage || panMode || tab === "text" || el.closest("[data-text]")) return;
    stage.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const g = gesture.current;
    if (!g) {
      const target = el.closest<HTMLElement>("[data-photo]")?.dataset.photo as Slot | undefined;
      if (!target) {
        pointers.current.delete(e.pointerId);
        return;
      }
      // 선택 후 편집: 선택되지 않은 사진을 처음 만지면 선택만 하고, 그 터치로는 사진을 움직이지 않는다.
      const selectOnly = target !== editSlot;
      const next: Gesture = {
        target,
        mode: selectOnly ? "select" : composition === "overlay" && target === "small" ? "frame" : "content",
        moved: false,
        start: { x: e.clientX, y: e.clientY },
        origin: smallPos,
        base: null,
      };
      if (!selectOnly) next.base = captureBase(next);
      gesture.current = next;
      if (selectOnly) setEditSlot(target);
    } else if (g.mode === "select") {
      g.moved = true; // 선택만 하는 터치는 손가락이 늘어도 계속 편집하지 않는다
    } else {
      // 두 번째 손가락이 닿으면 확대 모드로 바꾼다. 프레임을 끌다 온 경우 위치를 되돌린다.
      if (g.mode === "frame") setSmallPos(g.origin);
      g.mode = "content";
      g.moved = true;
      g.base = captureBase(g);
    }
  }

  function onStageMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const stage = stageRef.current;
    if (!g || !stage) return;

    if (g.mode === "select") {
      if (Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) >= 6) g.moved = true;
      return;
    }

    if (g.mode === "frame") {
      const rect = stage.getBoundingClientRect();
      if (Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) >= 6) g.moved = true;
      const smallHeightPct = (smallSize * (rect.width / rect.height)) / aspect;
      const x = g.origin.x + ((e.clientX - g.start.x) / rect.width) * 100;
      const y = g.origin.y + ((e.clientY - g.start.y) / rect.height) * 100;
      setSmallPos({
        x: Math.min(Math.max(0, x), 100 - smallSize),
        y: Math.min(Math.max(0, y), Math.max(0, 100 - smallHeightPct)),
      });
      return;
    }

    const base = g.base;
    if (!base) return;
    const now = [...pointers.current.values()].slice(0, 2);
    const m0x = base.pts.reduce((a, q) => a + q.x, 0) / base.pts.length;
    const m0y = base.pts.reduce((a, q) => a + q.y, 0) / base.pts.length;
    const mx = now.reduce((a, q) => a + q.x, 0) / now.length;
    const my = now.reduce((a, q) => a + q.y, 0) / now.length;
    if (Math.hypot(mx - m0x, my - m0y) >= 6) g.moved = true;
    if (base.zoomOnly && now.length < 2) return; // 큰 사진은 한 손가락으로 움직이지 않는다
    const next = computeXform(base, now);
    setXform((all) => ({ ...all, [g.target]: next }));
  }

  function onStageUp(e: React.PointerEvent<HTMLDivElement>, cancelled = false) {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (!g) return;
    if (pointers.current.size > 0) {
      // 손가락 하나를 떼도 남은 손가락으로 이어서 편집한다(사진이 튀지 않게 기준을 다시 잡는다).
      if (g.mode !== "select") g.base = captureBase(g);
      return;
    }
    gesture.current = null;
    // 거의 움직이지 않은 한 손가락 탭이다. 같은 사진을 빠르게(0.35초 안, 30px 이내) 두 번 탭하면 위치와 크기를 서로 바꾼다.
    // 한 번만 탭한 것은 아무 일도 하지 않는다(실수로 바뀌지 않도록).
    if (cancelled || g.moved) return;
    const now = Date.now();
    const prev = photoTap.current;
    if (prev && prev.target === g.target && now - prev.time < 350 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
      photoTap.current = null;
      swap();
    } else {
      photoTap.current = { time: now, x: e.clientX, y: e.clientY, target: g.target };
    }
  }

  // ── 편집 영역: 틀은 고정, 스크롤하면 사진이 움직인다 ──
  // 선택한 사진(editSlot)을 밀면(터치로 빈 테두리 밀기, 이동 모드에서 밀기, 마우스 휠·트랙패드) 틀은 그대로이고
  // 사진이 틀 아래에서 움직인다. 틀 밖으로 잘린 부분이 틀 안으로 들어온다. 사진은 틀을 덮을 수 있는 범위 안에서만 움직인다.
  const viewportRef = useRef<HTMLDivElement>(null);
  // 이동 모드: 켜면 사진 어디를 밀어도 편집이 아니라 사진 이동(스크롤)이 된다.
  const [panMode, setPanMode] = useState(false);
  const panDrag = useRef<{ id: number; x: number; y: number } | null>(null);
  const panByRef = useRef<(dx: number, dy: number) => void>(() => undefined);

  function panBy(dx: number, dy: number) {
    const el = stageRef.current?.querySelector<HTMLElement>(`[data-photo-box="${editSlot}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const target = editSlot;
    setXform((all) => ({ ...all, [target]: panXform(all[target], rect, coverOf(rect, ratio[target]), dx, dy, target === "big") }));
  }
  useEffect(() => {
    panByRef.current = panBy;
  });

  // 마우스 휠·트랙패드 스크롤. 스크롤한 방향으로 화면이 따라가는 것처럼 사진이 반대로 움직인다.
  useEffect(() => {
    const v = viewportRef.current;
    if (!v) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // 트랙패드 확대 제스처는 건드리지 않는다
      e.preventDefault(); // 페이지가 같이 스크롤되지 않게 한다
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? v.clientHeight : 1;
      panByRef.current(-e.deltaX * unit, -e.deltaY * unit);
    };
    v.addEventListener("wheel", onWheel, { passive: false });
    return () => v.removeEventListener("wheel", onWheel);
  }, [bothTaken]);

  // 터치·마우스로 밀기: 사진 틀 바깥의 빈 테두리(또는 이동 모드에서는 어디든)를 끌면 사진이 손가락을 따라 움직인다.
  function onViewportDown(e: React.PointerEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    const onStage = Boolean(stageRef.current?.contains(t));
    if (t.closest("[data-text]") || !(t === e.currentTarget || (panMode && onStage))) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function onViewportMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = panDrag.current;
    if (!p || p.id !== e.pointerId) return;
    panBy(e.clientX - p.x, e.clientY - p.y);
    p.x = e.clientX;
    p.y = e.clientY;
  }
  function onViewportUp(e: React.PointerEvent<HTMLDivElement>) {
    if (panDrag.current?.id === e.pointerId) panDrag.current = null;
  }

  // 선택한 사진의 이동을 가운데로 되돌린다(배율은 그대로).
  function recenter() {
    setXform((all) => ({ ...all, [editSlot]: { ...all[editSlot], x: 0, y: 0 } }));
  }

  // ── 네 모서리 조절점 ──
  // 선택한 사진(editSlot)의 변형된 모양 네 모서리에 동그라미를 얹는다. 작은 사진은 반대쪽 모서리를 고정한 채 가로·세로를 따로,
  // 큰 사진은 가운데를 기준으로 비율을 유지하며 확대·축소만 된다. 사진 틀의 화면 위치는 DOM에서 직접 재서 쓴다(프레임·구성마다 달라서).
  const showHandles = Boolean(bothTaken) && tab !== "text";
  // 겹치기 구성의 작은 사진은 프레임 자체의 크기·모양을, 그 밖에는 프레임 안의 사진을 바꾼다.
  const frameHandles = composition === "overlay" && editSlot === "small";
  type HandleBox = { left: number; top: number; width: number; height: number; vw: number; vh: number };
  const [handleBox, setHandleBox] = useState<HandleBox | null>(null);
  const [, bumpLayout] = useState(0);

  // 사진 틀 위치는 렌더마다 달라질 수 있어 매번 재고, 값이 같으면 상태를 바꾸지 않는다(무한 갱신 없음).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const view = viewportRef.current;
    const el = showHandles
      ? stage?.querySelector<HTMLElement>(frameHandles ? '[data-photo="small"]' : `[data-photo-box="${editSlot}"]`)
      : null;
    if (!stage || !view || !el) {
      setHandleBox((prev) => (prev ? null : prev));
      return;
    }
    // 편집 영역 기준 위치
    const vr = view.getBoundingClientRect();
    const br = el.getBoundingClientRect();
    const next = { left: br.left - vr.left, top: br.top - vr.top, width: br.width, height: br.height, vw: vr.width, vh: vr.height };
    setHandleBox((prev) =>
      prev && (Object.keys(next) as (keyof HandleBox)[]).every((k) => Math.abs(prev[k] - next[k]) < 0.5) ? prev : next,
    );
  });

  // 화면 크기가 바뀌면 조절점 위치를 다시 잰다.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => bumpLayout((n) => n + 1));
    ro.observe(stage);
    return () => ro.disconnect();
  }, [bothTaken]);

  // 선택한 글자의 오른쪽 위 모서리 위치(편집 영역 기준). 선택이 풀리거나 글자를 직접 고치는 중에는 없다.
  const [deleteBtn, setDeleteBtn] = useState<{ x: number; y: number } | null>(null);
  // 글자는 끌려 움직이므로 렌더마다 재고, 값이 같으면 상태를 바꾸지 않는다(무한 갱신 없음).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const view = viewportRef.current;
    const el =
      view && bothTaken && selectedText !== null && editingText !== selectedText
        ? stageRef.current?.querySelector<HTMLElement>(`[data-text-id="${selectedText}"]`)
        : null;
    if (!view || !el) {
      setDeleteBtn((prev) => (prev ? null : prev));
      return;
    }
    const vr = view.getBoundingClientRect();
    const tr = el.getBoundingClientRect();
    const next = { x: tr.right - vr.left, y: tr.top - vr.top };
    setDeleteBtn((prev) => (prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 ? prev : next));
  });

  function onCornerDown(e: React.PointerEvent<HTMLDivElement>, corner: Corner) {
    e.stopPropagation(); // 사진 이동·확대 제스처로 넘어가지 않게 한다
    const stage = stageRef.current;
    const el = stage?.querySelector<HTMLElement>(frameHandles ? '[data-photo="small"]' : `[data-photo-box="${editSlot}"]`);
    if (!stage || !el || panMode) return;
    const node = e.currentTarget;
    node.setPointerCapture(e.pointerId);
    const target = editSlot;
    const from = { x: e.clientX, y: e.clientY };
    const box = el.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const toRect = (r: DOMRect) => ({ left: r.left, top: r.top, width: r.width, height: r.height });
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const to = { x: ev.clientX, y: ev.clientY };
      if (frameHandles) {
        const f = dragFrameCorner({ stage: toRect(stageRect), box: toRect(box), corner, from }, to);
        setSmallSize(f.size);
        setSmallAspect(f.aspect);
        setSmallPos({ x: f.x, y: f.y });
      } else {
        const rect = toRect(box);
        const start = { xf: xform[target], rect, cover: coverOf(rect, ratio[target]), corner, from, zoomOnly: target === "big" };
        setXform((all) => ({ ...all, [target]: dragCorner(start, to) }));
      }
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
  }

  return (
    <section className="flex flex-col gap-4">
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <clipPath id="dual-heart" clipPathUnits="objectBoundingBox">
            <path d="M0.5,1 C0.1,0.68 0,0.45 0,0.3 C0,0.13 0.12,0 0.27,0 C0.37,0 0.46,0.06 0.5,0.15 C0.54,0.06 0.63,0 0.73,0 C0.88,0 1,0.13 1,0.3 C1,0.45 0.9,0.68 0.5,1Z" />
          </clipPath>
        </defs>
      </svg>
      {!bothTaken && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>
              {SHOT_LABEL[slot]} 사진 · {facing === "environment" ? "후면" : "전면"}
            </span>
            {isMobile && (
              <button
                onClick={toggleFacing}
                aria-label={`카메라를 ${facing === "user" ? "후면" : "전면"}으로 바꾸기`}
                className="h-11 border px-3 text-sm"
              >
                ⟲ {facing === "user" ? "후면으로" : "전면으로"}
              </button>
            )}
          </div>
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
            {auto && auto.slot === slot && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/25 text-white">
                <span className="text-8xl font-medium leading-none" aria-live="assertive">
                  {auto.left > 0 ? auto.left : "…"}
                </span>
                <span className="text-sm">
                  {auto.left > 0 ? `${SHOT_LABEL[auto.slot]} 사진(후면)이 ${auto.left}초 뒤 자동으로 찍혀요` : "찍는 중"}
                </span>
                <button onClick={() => setAuto(null)} className="h-11 border border-white px-4 text-sm">
                  자동 촬영 취소
                </button>
              </div>
            )}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{ transform: `${facing === "user" ? "scaleX(-1) " : ""}scale(${digital})` }}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {/* 광각을 지원하는 카메라에서만 보인다. 지원하지 않으면 통째로 숨긴다. */}
          {wide && (
            <div className="flex flex-col gap-2 text-sm" role="group" aria-label="광각·배율">
              <div className="flex items-center gap-2">
                {zoomChoices(wide).map((z) => (
                  <button
                    key={z}
                    onClick={() => setZoom(z)}
                    aria-pressed={Math.abs(zoom - z) < 0.05}
                    className={`h-11 min-w-14 flex-1 border px-3 ${
                      Math.abs(zoom - z) < 0.05 ? "border-pink-500 bg-pink-50 text-pink-600" : ""
                    }`}
                  >
                    {z < 1 ? `${z}× 광각` : `${z}×`}
                  </button>
                ))}
              </div>
              {wide.kind === "zoom" && (
                <label className="flex items-center gap-3">
                  <input
                    type="range"
                    min={Math.min(wide.min, 1)}
                    max={wide.max}
                    step={0.05}
                    value={zoom}
                    aria-label="배율"
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-12 text-right tabular-nums">{zoom.toFixed(1)}×</span>
                </label>
              )}
            </div>
          )}
          <button
            onClick={capture}
            className="rounded-none bg-pink-500 py-3 font-medium text-white"
          >
            {SHOT_LABEL[slot]} 사진 촬영
          </button>
        </div>
      )}

      {bothTaken && (
        <div className="flex flex-col gap-3">
          {/* 사진을 위에 고정해 두고, 아이콘 탭은 사진 위에 얹어 사진이 작아지지 않게 한다. */}
          <div className="sticky top-0 z-20 -mx-4 bg-background px-4 pb-2 pt-2 shadow-sm">
            <div className="relative mx-auto w-[min(100%,calc(46dvh*0.75))]">
              {/* 편집 영역. 사진 틀(잘라내기 영역)은 고정이고, 틀 바깥의 빈 테두리를 밀거나(또는 이동 모드에서 어디든 밀거나)
                  휠로 스크롤하면 사진이 틀 아래에서 움직인다. 사진·조절점·글자를 만지면 편집이다. */}
              <div
                ref={viewportRef}
                onPointerDown={onViewportDown}
                onPointerMove={onViewportMove}
                onPointerUp={onViewportUp}
                onPointerCancel={onViewportUp}
                className="relative aspect-[3/4] w-full overflow-hidden overscroll-contain bg-[#F2F2F2]"
                style={{ touchAction: "none" }}
              >
              {composition === "overlay" && (
                // 틀 밖으로 잘린 큰 사진 부분을 흐리게 보여 준다(저장되는 이미지는 틀 안쪽뿐이다).
                <div
                  aria-hidden
                  className="pointer-events-none absolute [container-type:size]"
                  style={{ left: `${STAGE_OFFSET_PCT}%`, top: `${STAGE_OFFSET_PCT}%`, width: `${STAGE_PCT}%`, aspectRatio: "3 / 4" }}
                >
                  <PhotoImg
                    src={photos.big!}
                    alt=""
                    ratio={ratio.big}
                    xform={xform.big}
                    filter={filterOf(adjust.big, filters.big)}
                    opacity={0.35}
                  />
                </div>
              )}
              <div
                ref={stageRef}
                onPointerDown={onStageDown}
                onPointerMove={onStageMove}
                onPointerUp={onStageUp}
                onPointerCancel={(e) => onStageUp(e, true)}
                className="absolute overflow-hidden rounded-2xl bg-zinc-200 [container-type:inline-size]"
                style={{
                  left: `${STAGE_OFFSET_PCT}%`,
                  top: `${STAGE_OFFSET_PCT}%`,
                  width: `${STAGE_PCT}%`,
                  aspectRatio: "3 / 4",
                  touchAction: "none",
                }}
              >
                {composition !== "overlay" ? (
                  <CompositionBoard
                    composition={composition}
                    photos={{ big: photos.big!, small: photos.small! }}
                    adjust={adjust}
                    filters={filters}
                    textures={textures}
                    xform={xform}
                    ratio={ratio}
                    caption={caption}
                  />
                ) : (
                  <>
                <div data-photo="big" data-photo-box="big" className="absolute inset-0 overflow-hidden bg-white [container-type:size]">
                  <PhotoImg
                    src={photos.big!}
                    alt="큰 사진"
                    ratio={ratio.big}
                    xform={xform.big}
                    filter={filterOf(adjust.big, filters.big)}
                  />
                  <TextureLayers active={textures.big} />
                </div>
                <div
                  data-photo="small"
                  className="absolute cursor-grab drop-shadow-lg"
                  style={{
                    width: `${smallSize}%`,
                    aspectRatio: aspect,
                    left: `${smallPos.x}%`,
                    top: `${smallPos.y}%`,
                  }}
                >
                  <div
                    className="h-full w-full overflow-hidden"
                    style={shapeStyle(frame, border)}
                  >
                    <div
                      data-photo-box="small"
                      className="relative h-full w-full overflow-hidden [container-type:size]"
                      style={{ background: border.on ? border.color : "white", ...innerShapeStyle(frame, border) }}
                    >
                      <PhotoImg
                        src={photos.small!}
                        alt="작은 사진"
                        ratio={ratio.small}
                        xform={xform.small}
                        filter={filterOf(adjust.small, filters.small)}
                      />
                      <TextureLayers active={textures.small} />
                    </div>
                  </div>
                </div>
                  </>
                )}
                {texts.map((t) => {
                  const style: React.CSSProperties = {
                    left: `${t.x}%`,
                    top: `${t.y}%`,
                    fontSize: `${t.size}cqw`,
                    fontFamily: fontCss(t.font),
                    fontWeight: t.weight,
                    transform: `scale(${t.scaleX / 100}, ${t.scaleY / 100})`,
                    transformOrigin: "0 0",
                    color: t.color,
                    textShadow: textShadowCss(t),
                  };
                  if (editingText === t.id) {
                    // 사진 위에서 바로 고치는 중. Enter는 줄바꿈이고, Esc나 바깥을 누르면 끝난다.
                    // 숨은 span이 글자 크기만큼 칸을 늘려 textarea가 내용에 맞게 커진다.
                    return (
                      <div
                        key={t.id}
                        data-text
                        data-text-id={t.id}
                        className="absolute grid outline-2 outline-pink-500"
                        style={style}
                      >
                        <span
                          aria-hidden
                          className="invisible col-start-1 row-start-1 whitespace-pre leading-tight"
                        >
                          {t.text + "\n "}
                        </span>
                        <textarea
                          autoFocus
                          wrap="off"
                          rows={1}
                          aria-label="텍스트 직접 수정"
                          value={t.text}
                          maxLength={MAX_TEXT_LENGTH}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => updateText(t.id, { text: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") e.currentTarget.blur();
                          }}
                          onBlur={() => setEditingText(null)}
                          className="col-start-1 row-start-1 m-0 resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 leading-tight outline-none"
                          style={{
                            font: "inherit",
                            color: "inherit",
                            textShadow: "inherit",
                            width: 0, // 기본 너비가 상자를 넓히지 않도록 하고,
                            minWidth: "100%", // 숨은 span이 정한 칸에 맞춘다.
                          }}
                        />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={t.id}
                      data-text
                      data-text-id={t.id}
                      onPointerDown={(e) => startTextDrag(e, t.id)}
                      className={`absolute cursor-grab touch-none whitespace-pre leading-tight ${
                        selectedText === t.id
                          ? "outline-2 outline-dashed outline-pink-400"
                          : ""
                      }`}
                      style={style}
                    >
                      {t.text || " "}
                    </div>
                  );
                })}
              </div>

              {handleBox && (
                <>
                  {/* 사진의 현재 모양(틀 밖까지)을 점선으로 보여 준다. */}
                  {!frameHandles && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute border border-dashed border-black"
                      style={(() => {
                        const box = { left: handleBox.left, top: handleBox.top, width: handleBox.width, height: handleBox.height };
                        const cover = coverOf(box, ratio[editSlot]);
                        const tl = cornerPoint(box, xform[editSlot], CORNERS[0], cover);
                        const br = cornerPoint(box, xform[editSlot], CORNERS[3], cover);
                        return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y };
                      })()}
                    />
                  )}
                  {CORNERS.map((c) => {
                    const box = { left: handleBox.left, top: handleBox.top, width: handleBox.width, height: handleBox.height };
                    const p0 = cornerPoint(box, frameHandles ? NO_XFORM : xform[editSlot], c, frameHandles ? box : coverOf(box, ratio[editSlot]));
                    // 모서리가 편집 영역 밖으로 나가도 조절점은 안쪽 가장자리에 남겨서 잡을 수 있게 한다(사진을 밀면 실제 위치로 온다).
                    const p = { x: Math.min(Math.max(p0.x, 14), handleBox.vw - 14), y: Math.min(Math.max(p0.y, 14), handleBox.vh - 14) };
                    return (
                      <div
                        key={`${c.cx},${c.cy}`}
                        onPointerDown={(e) => onCornerDown(e, c)}
                        role="button"
                        aria-label={`${SLOT_LABEL[editSlot]} ${frameHandles ? "프레임" : ""} ${c.cy < 0 ? "위" : "아래"} ${c.cx < 0 ? "왼쪽" : "오른쪽"} 모서리 조절`}
                        className="absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center"
                        style={{ left: p.x, top: p.y, touchAction: "none", pointerEvents: panMode ? "none" : "auto" }}
                      >
                        <span className="block h-[18px] w-[18px] rounded-full border-2 border-black bg-white shadow" />
                      </div>
                    );
                  })}
                </>
              )}
              {deleteBtn && selectedText !== null && (
                <button
                  onClick={() => removeText(selectedText)}
                  aria-label="선택한 텍스트 삭제"
                  className="absolute z-20 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                  style={{ left: deleteBtn.x, top: deleteBtn.y, touchAction: "manipulation" }}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-black text-[11px] leading-none text-white shadow">
                    ✕
                  </span>
                </button>
              )}
              </div>

              <div className="absolute left-2 top-2 z-10 flex flex-col gap-1 rounded-xl bg-black/35 p-1 backdrop-blur-sm">
                <button
                  onClick={() => setPanMode((v) => !v)}
                  aria-pressed={panMode}
                  title="사진 이동: 켜면 사진 어디를 밀어도 편집 대신 틀 아래에서 사진이 움직여요(틀은 고정)"
                  className={`h-9 min-w-9 rounded-lg px-1 text-[11px] ${panMode ? "bg-white text-pink-600 shadow-sm" : "text-white/90"}`}
                >
                  이동
                </button>
                <button
                  onClick={recenter}
                  title="선택한 사진의 위치를 가운데로"
                  className="h-9 min-w-9 rounded-lg px-1 text-[11px] text-white/90"
                >
                  중앙
                </button>
              </div>

              <div
                role="tablist"
                aria-orientation="vertical"
                className="absolute right-2 top-2 z-10 flex flex-col gap-1 rounded-xl bg-black/35 p-1 backdrop-blur-sm"
              >
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={tab === t.id}
                    aria-label={t.label}
                    title={t.label}
                    onClick={() => setTab(t.id)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      tab === t.id
                        ? "bg-white text-pink-600 shadow-sm"
                        : "text-white/85"
                    }`}
                  >
                    <t.Icon className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {tab === "layout" && (
            <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 text-sm">
              <span className="text-xs text-zinc-500">구성</span>
              <div className="flex flex-wrap gap-2">
                {COMPOSITIONS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setComposition(c.id)}
                    aria-pressed={composition === c.id}
                    className={`border px-3 py-1 ${
                      composition === c.id ? "border-pink-500 bg-pink-50 text-pink-600" : ""
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {composition !== "overlay" && (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500">캡션</span>
                    <input
                      value={caption}
                      maxLength={80}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="한마디 쓰기"
                      className="h-11 border-0 border-b bg-transparent px-0 outline-none focus:border-b-2"
                    />
                  </label>
                </>
              )}
            </div>
            {composition === "overlay" && (
            <>
            <div className="flex flex-wrap gap-2 text-sm">
              {FRAMES.map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setFrame(f.id);
                    setSmallAspect(f.aspect); // 모양을 고르면 그 모양의 기본 비율로 돌아간다
                  }}
                  className={`rounded-none border px-3 py-1 ${
                    frame === f.id ? "border-pink-500 bg-pink-50 text-pink-600" : ""
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
              <button
                onClick={() => setBorder((b) => ({ ...b, on: !b.on }))}
                aria-pressed={border.on}
                className={`rounded-lg border py-1 ${
                  border.on ? "border-pink-500 bg-pink-50 text-pink-600" : ""
                }`}
              >
                띠지(흰 테두리) {border.on ? "끄기" : "켜기"}
              </button>
              {border.on && (
                <>
                  <label className="flex items-center gap-3">
                    <span className="w-10">두께</span>
                    <input
                      type="range"
                      min={0.5}
                      max={10}
                      step={0.5}
                      value={border.thickness}
                      onChange={(e) =>
                        setBorder((b) => ({ ...b, thickness: Number(e.target.value) }))
                      }
                      className="flex-1"
                    />
                  </label>
                  <label className="flex items-center gap-3">
                    <span className="w-10">색</span>
                    <input
                      type="color"
                      value={border.color}
                      onChange={(e) =>
                        setBorder((b) => ({ ...b, color: e.target.value }))
                      }
                      className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>
                </>
              )}
            </div>

            </>
            )}

            <div className="flex gap-2 text-sm">
              <button onClick={swap} className="flex-1 rounded-lg border py-2">
                큰/작은 사진 바꾸기
              </button>
              <button
                onClick={() => retake("big")}
                className="flex-1 rounded-lg border py-2"
              >
                큰 사진 다시 찍기
              </button>
              <button
                onClick={() => retake("small")}
                className="flex-1 rounded-lg border py-2"
              >
                작은 사진 다시 찍기
              </button>
            </div>

            </div>
          )}

          {tab === "adjust" && (
            <div className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
              <div className="flex gap-2">
                {(["big", "small"] as Slot[]).map((sl) => (
                  <button
                    key={sl}
                    onClick={() => setEditSlot(sl)}
                    className={`flex-1 rounded-lg border py-1 ${
                      editSlot === sl ? "border-pink-500 bg-pink-50 text-pink-600" : ""
                    }`}
                  >
                    {SLOT_LABEL[sl]} 보정
                  </button>
                ))}
              </div>
              <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilters((p) => ({ ...p, [editSlot]: f.id }))}
                    className={`shrink-0 whitespace-nowrap rounded-none border px-3 py-1 ${
                      filters[editSlot] === f.id
                        ? "border-pink-500 bg-pink-50 text-pink-600"
                        : ""
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
                {TEXTURES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleTexture(t.id)}
                    className={`shrink-0 whitespace-nowrap rounded-none border px-3 py-1 ${
                      textures[editSlot].includes(t.id)
                        ? "border-pink-500 bg-pink-50 text-pink-600"
                        : ""
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {(
                [
                  ["brightness", "밝기"],
                  ["contrast", "대비"],
                  ["saturate", "채도"],
                ] as [keyof Adjust, string][]
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3">
                  <span className="w-10">{label}</span>
                  <input
                    type="range"
                    min={50}
                    max={150}
                    value={adjust[editSlot][key]}
                    onChange={(e) =>
                      setAdjust((a) => ({
                        ...a,
                        [editSlot]: { ...a[editSlot], [key]: Number(e.target.value) },
                      }))
                    }
                    className="flex-1"
                  />
                </label>
              ))}
              <button
                onClick={() => {
                  setAdjust((a) => ({ ...a, [editSlot]: NO_ADJUST }));
                  setFilters((f) => ({ ...f, [editSlot]: "none" }));
                  setTextures((t) => ({ ...t, [editSlot]: [] }));
                }}
                className="self-end text-zinc-500 underline"
              >
                초기화
              </button>
            </div>
          )}

          {tab === "text" && (
            <div className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
              <button
                onClick={() => addText()}
                className="rounded-lg border border-pink-500 py-1 text-pink-600"
              >
                + 텍스트 추가
              </button>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500">텍스트 스탬프</span>
                <div className="flex flex-wrap gap-1.5">
                  {STAMPS.map((st) => (
                    <button
                      key={st.id}
                      onClick={() => addStamp(st.text())}
                      className="h-10 border px-3"
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
              {texts.length > 0 && (
                <p className="text-xs text-zinc-500">
                  사진 위의 글자를 두 번 누르면 그 자리에서 고칠 수 있어요. Enter는 줄바꿈이고, 끝내려면 바깥을 누르세요.
                </p>
              )}
              {texts.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {texts.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedText((cur) => (cur === t.id ? null : t.id))}
                      className={`max-w-28 shrink-0 truncate rounded-none border px-3 py-1 ${
                        selectedText === t.id
                          ? "border-pink-500 bg-pink-50 text-pink-600"
                          : ""
                      }`}
                    >
                      {t.text.replace(/\n/g, " ") || "(빈 텍스트)"}
                    </button>
                  ))}
                </div>
              )}
              {texts.find((t) => t.id === selectedText) && (
                <>
                  <textarea
                    value={texts.find((t) => t.id === selectedText)!.text}
                    onChange={(e) =>
                      updateText(selectedText!, { text: e.target.value })
                    }
                    maxLength={MAX_TEXT_LENGTH}
                    rows={2}
                    placeholder="내용을 입력하세요 (Enter로 줄바꿈)"
                    className="resize-none rounded-lg border px-3 py-2"
                  />
                  <label className="flex items-center gap-3">
                    <span className="w-10">크기</span>
                    <input
                      type="range"
                      min={4}
                      max={20}
                      value={texts.find((t) => t.id === selectedText)!.size}
                      onChange={(e) =>
                        updateText(selectedText!, { size: Number(e.target.value) })
                      }
                      className="flex-1"
                    />
                  </label>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {FONTS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => updateText(selectedText!, { font: f.id })}
                        className={`shrink-0 whitespace-nowrap rounded-none border px-3 py-1 ${
                          texts.find((t) => t.id === selectedText)!.font === f.id
                            ? "border-pink-500 bg-pink-50 text-pink-600"
                            : ""
                        }`}
                        style={{ fontFamily: fontCss(f.id) }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  {(
                    [
                      ["weight", "두께", 100, 900, 100],
                      ["scaleY", "세로 길이", 50, 400, 10],
                      ["scaleX", "가로 폭", 50, 200, 10],
                    ] as [keyof TextItem, string, number, number, number][]
                  ).map(([key, label, min, max, step]) => (
                    <label key={key} className="flex items-center gap-3">
                      <span className="w-16">{label}</span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={
                          texts.find((t) => t.id === selectedText)![key] as number
                        }
                        onChange={(e) =>
                          updateText(selectedText!, {
                            [key]: Number(e.target.value),
                          })
                        }
                        className="flex-1"
                      />
                    </label>
                  ))}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-10">색</span>
                    {TEXT_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => updateText(selectedText!, { color: c })}
                        aria-label={`색상 ${c}`}
                        className={`h-7 w-7 rounded-full border ${
                          texts.find((t) => t.id === selectedText)!.color === c
                            ? "ring-2 ring-pink-500 ring-offset-1"
                            : ""
                        }`}
                        style={{ background: c }}
                      />
                    ))}
                    <label
                      className="relative flex h-7 cursor-pointer items-center gap-1 rounded-none border px-2 text-xs"
                      title="색상 직접 고르기"
                    >
                      <input
                        type="color"
                        value={texts.find((t) => t.id === selectedText)!.color}
                        onChange={(e) =>
                          updateText(selectedText!, { color: e.target.value })
                        }
                        className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                      />
                      직접 선택
                    </label>
                    <button
                      onClick={() =>
                        addFavorite(texts.find((t) => t.id === selectedText)!.color)
                      }
                      className="h-7 rounded-none border border-pink-500 px-2 text-xs text-pink-600"
                    >
                      ★ 보관함에 추가
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500">
                      색상 보관함 {favorites.length > 0 ? "(누르면 적용)" : ""}
                    </span>
                    {favorites.length === 0 ? (
                      <p className="text-xs text-zinc-400">
                        자주 쓰는 색을 ★로 추가해 두세요.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {favorites.map((c) => (
                          <span key={c} className="relative">
                            <button
                              onClick={() => updateText(selectedText!, { color: c })}
                              aria-label={`보관함 색상 ${c}`}
                              className="h-7 w-7 rounded-full border"
                              style={{ background: c }}
                            />
                            <button
                              onClick={() => removeFavorite(c)}
                              aria-label={`보관함에서 ${c} 삭제`}
                              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-700 text-[10px] leading-none text-white"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {(
                    [
                      ["shadowAlpha", "그림자", 0, 100, 5],
                      ["shadowBlur", "흐림", 0, 20, 1],
                      ["shadowOffset", "거리", 0, 20, 1],
                    ] as [keyof TextItem, string, number, number, number][]
                  ).map(([key, label, min, max, step]) => (
                    <label key={key} className="flex items-center gap-3">
                      <span className="w-16">{label}</span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={
                          texts.find((t) => t.id === selectedText)![key] as number
                        }
                        onChange={(e) =>
                          updateText(selectedText!, {
                            [key]: Number(e.target.value),
                          })
                        }
                        className="flex-1"
                      />
                    </label>
                  ))}
                  <label className="flex items-center gap-3">
                    <span className="w-16">그림자 색</span>
                    <input
                      type="color"
                      value={texts.find((t) => t.id === selectedText)!.shadowColor}
                      onChange={(e) =>
                        updateText(selectedText!, { shadowColor: e.target.value })
                      }
                      className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>
                  <button
                    onClick={() => removeText(selectedText!)}
                    className="self-end text-zinc-500 underline"
                  >
                    이 텍스트 삭제
                  </button>
                </>
              )}
            </div>
          )}

          {tab === "save" && (
            <div className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-16">저장 형식</span>
                {(["jpg", "png"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`rounded-none border px-3 py-1 uppercase ${
                      format === f ? "border-pink-500 bg-pink-50 text-pink-600" : ""
                    }`}
                  >
                    {f}
                  </button>
                ))}
                <span className="text-xs text-zinc-500">
                  {EXPORT_SIZE_LABEL}
                </span>
              </div>
              <button
                onClick={saveEdited}
                disabled={saving}
                className="rounded-none bg-pink-500 py-3 font-medium text-white disabled:opacity-50"
              >
                {saving ? "저장하는 중..." : "편집본 저장"}
              </button>
              <button onClick={saveOriginals} className="rounded-none border py-2">
                원본 사진 2장 저장
              </button>
              {saveError && <p className="text-red-500">{saveError}</p>}
              <PublishPanel makeImage={() => renderBlob("image/jpeg")} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
