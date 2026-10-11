"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TEXTURES, TextureLayers, type TextureId } from "./textures";
import RetouchView from "./RetouchView";
import { AdjustIcon, FaceIcon, LayoutIcon, SaveIcon, TextIcon } from "./icons";
import { MAX_UNDO, createWork, getCtx, previewResize, type Tool, type Work } from "@/lib/retouch";
import {
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  canvasToBlob,
  downloadUrl,
  renderDualShot,
  timestampName,
} from "@/lib/exportImage";
import {
  FILTERS,
  FONTS,
  DEFAULT_TAPE,
  FRAMES,
  NO_ADJUST,
  TAPE_ALPHA,
  hexToRgba,
  STAR_CLIP,
  filterOf,
  fontCss,
  textShadowCss,
  type Adjust,
  type FilterId,
  type Frame,
  type Slot,
  type Tape,
  type TextItem,
} from "@/lib/editor";

const SLOT_LABEL: Record<Slot, string> = { big: "큰 사진", small: "작은 사진" };

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

function shapeStyle(frame: Frame): React.CSSProperties {
  switch (frame) {
    case "rounded":
      return { borderRadius: "0.75rem", border: "2px solid white" };
    case "square":
      return { border: "2px solid white" };
    case "circle":
      return { borderRadius: "50%", border: "2px solid white" };
    case "heart":
      return { clipPath: "url(#dual-heart)" };
    case "star":
      return { clipPath: STAR_CLIP };
    case "polaroid":
      return { background: "white", padding: "6% 6% 22%" };
  }
}

const MAX_TEXT_LENGTH = 120;

// 탭은 아이콘으로 보여 주고, 이름은 aria-label과 길게 눌렀을 때의 툴팁으로 남긴다.
const TABS = [
  { id: "layout", label: "배치", Icon: LayoutIcon },
  { id: "adjust", label: "보정", Icon: AdjustIcon },
  { id: "retouch", label: "얼굴", Icon: FaceIcon },
  { id: "text", label: "텍스트", Icon: TextIcon },
  { id: "save", label: "저장", Icon: SaveIcon },
] as const;

type TabId = (typeof TABS)[number]["id"];

const RETOUCH_TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "smooth", label: "피부 보정", hint: "매끈하게 하고 싶은 곳을 문질러 주세요. 눈·입술 같은 윤곽은 선명하게 남아요." },
  { id: "heal", label: "잡티 지우기", hint: "지우고 싶은 점이나 여드름을 콕 눌러 주세요. 브러시를 점보다 조금 크게 맞추면 깔끔해요." },
  { id: "brighten", label: "화사하게", hint: "밝게 하고 싶은 곳을 문질러 주세요. 누르고 있으면 점점 밝아져요." },
  { id: "color", label: "볼터치·립 색", hint: "볼이나 입술을 문질러 색을 입혀요. 색은 아래에서 고르세요." },
  { id: "resize", label: "크기 조절", hint: "눈·코·턱 등을 한 번 눌러 위치를 정한 뒤, 아래 슬라이더로 키우거나 줄이세요. 위치는 끌어서 옮길 수 있어요." },
];

const EXPORT_SIZE_LABEL = `${EXPORT_WIDTH}×${EXPORT_HEIGHT}`;

export default function DualShot() {
  const [photos, setPhotos] = useState<Record<Slot, string | null>>({
    big: null,
    small: null,
  });
  const [slot, setSlot] = useState<Slot>("big");
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<Frame>("rounded");
  const [tape, setTape] = useState<Tape>(DEFAULT_TAPE);
  // 얼굴 터치 보정: originals는 보정 전 사진, works는 보정 중인 복사본(canvas).
  const [originals, setOriginals] = useState<Record<Slot, string | null>>({
    big: null,
    small: null,
  });
  const [works, setWorks] = useState<Record<Slot, Work | null>>({ big: null, small: null });
  const [retouchSlot, setRetouchSlot] = useState<Slot>("big");
  const [tool, setTool] = useState<Tool>("smooth");
  const [brushSize, setBrushSize] = useState(6); // 사진 너비 대비 %
  const [retouchStrength, setRetouchStrength] = useState(50);
  const [retouchColor, setRetouchColor] = useState("#f472b6");
  const [, setRetouchTick] = useState(0);
  // 크기 조절: 찍어 둔 위치와 그 시점의 사진(base). 슬라이더로 양을 정하고 "적용"을 누르면 확정된다.
  const [resizeSession, setResizeSession] = useState<{ x: number; y: number; base: ImageData } | null>(null);
  const [resizeAmount, setResizeAmount] = useState(0); // -100(줄이기) ~ 100(키우기)
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
  const [smallPos, setSmallPos] = useState({ x: 6, y: 6 }); // 왼쪽·위 기준 %

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // 모바일(터치 기기)은 큰 사진=후면, 작은 사진=전면. PC는 둘 다 전면.
  const isMobile = useSyncExternalStore(
    () => () => {},
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );

  const facingFor = (s: Slot): "user" | "environment" =>
    isMobile && s === "big" ? "environment" : "user";

  const bothTaken = photos.big && photos.small;
  const aspect = FRAMES.find((f) => f.id === frame)!.aspect;

  useEffect(() => {
    if (bothTaken) return;
    let cancelled = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());

    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: { ideal: facingFor(slot) } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setError(null);
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() =>
        setError(
          "카메라를 사용할 수 없습니다. 권한을 허용했는지, https 또는 localhost 주소인지 확인해 주세요.",
        ),
      );

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, isMobile, bothTaken]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const url = canvas.toDataURL("image/jpeg", 0.92);
    setPhotos((p) => ({ ...p, [slot]: url }));
    setOriginals((o) => ({ ...o, [slot]: url }));
    setWorks((w) => ({ ...w, [slot]: null }));
    const other: Slot = slot === "big" ? "small" : "big";
    if (!photos[other]) setSlot(other);
  }

  function retake(s: Slot) {
    setPhotos((p) => ({ ...p, [s]: null }));
    setOriginals((o) => ({ ...o, [s]: null }));
    setWorks((w) => ({ ...w, [s]: null }));
    setAdjust((a) => ({ ...a, [s]: NO_ADJUST }));
    setFilters((f) => ({ ...f, [s]: "none" }));
    setTextures((t) => ({ ...t, [s]: [] }));
    setSlot(s);
  }

  function swap() {
    setPhotos((p) => ({ big: p.small, small: p.big }));
    setOriginals((o) => ({ big: o.small, small: o.big }));
    setWorks((w) => ({ big: w.small, small: w.big }));
    setAdjust((a) => ({ big: a.small, small: a.big }));
    setFilters((f) => ({ big: f.small, small: f.big }));
    setTextures((t) => ({ big: t.small, small: t.big }));
  }

  function addText() {
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
      },
    ]);
    setSelectedText(id);
  }

  function updateText(id: number, patch: Partial<TextItem>) {
    setTexts((t) => t.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function saveEdited() {
    const stage = stageRef.current;
    if (!stage || !photos.big || !photos.small) return;
    setSaving(true);
    setSaveError(null);
    try {
      const canvas = await renderDualShot({
        photos: { big: photos.big, small: photos.small },
        adjust,
        filters,
        textures,
        frame,
        tape,
        smallSize,
        smallPos,
        texts,
        stageWidthPx: stage.getBoundingClientRect().width,
      });
      const blob = await canvasToBlob(
        canvas,
        format === "png" ? "image/png" : "image/jpeg",
      );
      const url = URL.createObjectURL(blob);
      downloadUrl(url, `${timestampName()}.${format}`);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  // 얼굴 탭을 열면 보정할 사진의 복사본(canvas)을 만든다.
  useEffect(() => {
    const src = photos[retouchSlot];
    if (tab !== "retouch" || !src || works[retouchSlot]) return;
    let cancelled = false;
    createWork(src).then((w) => {
      if (!cancelled) setWorks((ws) => (ws[retouchSlot] ? ws : { ...ws, [retouchSlot]: w }));
    });
    return () => {
      cancelled = true;
    };
  }, [tab, retouchSlot, photos, works]);

  // 진행 중인 크기 조절을 확정(apply)하거나 취소한다.
  function finishResize(apply: boolean) {
    const work = works[retouchSlot];
    if (resizeSession && work) {
      if (apply && resizeAmount !== 0) {
        work.undo.push(resizeSession.base);
        if (work.undo.length > MAX_UNDO) work.undo.shift();
        commitRetouch(retouchSlot, work);
      } else {
        getCtx(work.canvas).putImageData(resizeSession.base, 0, 0);
      }
    }
    setResizeSession(null);
    setResizeAmount(0);
  }

  // 칠하기 시작 직전의 사진을 되돌리기용으로 남긴다.
  function startRetouchStroke() {
    const work = works[retouchSlot];
    if (!work) return;
    work.undo.push(getCtx(work.canvas).getImageData(0, 0, work.canvas.width, work.canvas.height));
    if (work.undo.length > MAX_UNDO) work.undo.shift();
  }

  function placeResize(x: number, y: number) {
    const work = works[retouchSlot];
    if (!work) return;
    finishResize(true); // 이전 위치의 조절은 그대로 확정하고 새 위치로 넘어간다
    const base = getCtx(work.canvas).getImageData(0, 0, work.canvas.width, work.canvas.height);
    setResizeSession({ x, y, base });
    setResizeAmount(0);
  }

  function goTab(next: TabId) {
    finishResize(true);
    setTab(next);
  }

  function chooseTool(next: Tool) {
    finishResize(true);
    setTool(next);
  }

  function chooseRetouchSlot(next: Slot) {
    finishResize(true);
    setRetouchSlot(next);
  }

  // 슬라이더·범위 크기가 바뀔 때마다 보정 전 사진에서 다시 그려 미리 보여 준다.
  useEffect(() => {
    const work = works[retouchSlot];
    if (!resizeSession || !work) return;
    getCtx(work.canvas).putImageData(resizeSession.base, 0, 0);
    previewResize(
      work.canvas,
      resizeSession.base,
      resizeSession.x,
      resizeSession.y,
      (brushSize / 100) * work.canvas.width,
      resizeAmount / 100,
    );
  }, [resizeSession, resizeAmount, brushSize, works, retouchSlot]);

  function commitRetouch(slot: Slot, work: Work) {
    const url = work.canvas.toDataURL("image/jpeg", 0.92);
    setPhotos((p) => ({ ...p, [slot]: url }));
    setRetouchTick((t) => t + 1);
  }

  function retouchUndo() {
    if (resizeSession) {
      finishResize(false); // 진행 중인 크기 조절이 있으면 그것부터 취소한다
      return;
    }
    const work = works[retouchSlot];
    const snapshot = work?.undo.pop();
    if (!work || !snapshot) return;
    getCtx(work.canvas).putImageData(snapshot, 0, 0);
    commitRetouch(retouchSlot, work);
  }

  async function retouchReset() {
    const src = originals[retouchSlot];
    if (!src) return;
    setResizeSession(null);
    setResizeAmount(0);
    const work = await createWork(src);
    setWorks((ws) => ({ ...ws, [retouchSlot]: work }));
    setPhotos((p) => ({ ...p, [retouchSlot]: src }));
  }

  function saveOriginals() {
    // 원본은 얼굴 보정 전의 사진이다.
    if (!originals.big || !originals.small) return;
    const name = timestampName();
    downloadUrl(originals.big, `${name}-original-big.jpg`);
    // 브라우저가 한꺼번에 여러 파일을 내려받는 것을 막지 않도록 간격을 둔다.
    setTimeout(() => downloadUrl(originals.small!, `${name}-original-small.jpg`), 400);
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
  }

  function startTextDrag(e: React.PointerEvent<HTMLDivElement>, id: number) {
    const stage = stageRef.current;
    const item = texts.find((x) => x.id === id);
    if (!stage || !item) return;
    setSelectedText(id);
    goTab("text");
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

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current;
    if (!stage) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = stage.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = smallPos;
    const target = e.currentTarget;

    const move = (ev: PointerEvent) => {
      const smallHeightPct = (smallSize * (rect.width / rect.height)) / aspect;
      const maxX = 100 - smallSize;
      const maxY = Math.max(0, 100 - smallHeightPct);
      const x = origin.x + ((ev.clientX - startX) / rect.width) * 100;
      const y = origin.y + ((ev.clientY - startY) / rect.height) * 100;
      setSmallPos({
        x: Math.min(Math.max(0, x), maxX),
        y: Math.min(Math.max(0, y), maxY),
      });
    };
    const up = (ev: PointerEvent) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      // 거의 움직이지 않았으면 끌기가 아니라 탭으로 보고 큰/작은 사진을 바꾼다.
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) swap();
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
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
          <div className="flex gap-2">
            {(["big", "small"] as Slot[]).map((s) => (
              <button
                key={s}
                onClick={() => setSlot(s)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  slot === s ? "border-pink-500 bg-pink-50 text-pink-600" : ""
                }`}
              >
                {SLOT_LABEL[s]} ·{" "}
                {facingFor(s) === "environment" ? "후면" : "전면"}
                {photos[s] ? " ✓" : ""}
              </button>
            ))}
          </div>
          <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${
                facingFor(slot) === "user" ? "-scale-x-100" : ""
              }`}
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            onClick={capture}
            className="rounded-full bg-pink-500 py-3 font-medium text-white"
          >
            {SLOT_LABEL[slot]} 촬영
          </button>
          {(photos.big || photos.small) && (
            <p className="text-sm text-zinc-500">
              이미 찍은 사진은 다시 찍으려면 해당 버튼을 눌러 촬영하세요.
            </p>
          )}
        </div>
      )}

      {bothTaken && (
        <div className="flex flex-col gap-3">
          {/* 사진을 위에 고정해 두고, 아이콘 탭은 사진 위에 얹어 사진이 작아지지 않게 한다. */}
          <div className="sticky top-0 z-20 -mx-4 bg-background px-4 pb-2 pt-2 shadow-sm">
            <div className="relative mx-auto w-[min(100%,calc(46dvh*0.75))]">
              {tab === "retouch" ? (
                <RetouchView
                  work={works[retouchSlot]}
                  tool={tool}
                  sizePct={brushSize}
                  strength={retouchStrength / 100}
                  color={retouchColor}
                  marker={resizeSession ? { x: resizeSession.x, y: resizeSession.y } : null}
                  onPlace={placeResize}
                  onStrokeStart={startRetouchStroke}
                  onStrokeEnd={(w) => commitRetouch(retouchSlot, w)}
                />
              ) : (
                <div
                  ref={stageRef}
                  className="relative aspect-[3/4] w-full touch-none overflow-hidden rounded-2xl bg-zinc-200 [container-type:inline-size]"
                >
                  <div className="absolute inset-0 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photos.big!}
                      alt="큰 사진"
                      className="h-full w-full object-cover"
                      style={{ filter: filterOf(adjust.big, filters.big) }}
                    />
                    <TextureLayers active={textures.big} />
                  </div>
                  <div
                    onPointerDown={startDrag}
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
                      style={shapeStyle(frame)}
                    >
                      <div className="relative h-full w-full overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photos.small!}
                          alt="작은 사진"
                          draggable={false}
                          className="h-full w-full object-cover"
                          style={{ filter: filterOf(adjust.small, filters.small) }}
                        />
                        <TextureLayers active={textures.small} />
                      </div>
                    </div>
                    {tape.on && (
                      <div
                        aria-hidden
                        className="absolute left-1/2 top-0"
                        style={{
                          width: `${(smallSize * tape.length) / 100}cqw`,
                          height: `${tape.thickness}cqw`,
                          transform: "translate(-50%, -50%)",
                          background: hexToRgba(tape.color, TAPE_ALPHA),
                        }}
                      />
                    )}
                  </div>
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
              )}

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
                    onClick={() => goTab(t.id)}
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
            <label className="flex items-center gap-3 text-sm">
              작은 사진 크기
              <input
                type="range"
                min={15}
                max={60}
                value={smallSize}
                onChange={(e) => setSmallSize(Number(e.target.value))}
                className="flex-1"
              />
            </label>
            <div className="flex flex-wrap gap-2 text-sm">
              {FRAMES.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFrame(f.id)}
                  className={`rounded-full border px-3 py-1 ${
                    frame === f.id ? "border-pink-500 bg-pink-50 text-pink-600" : ""
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
              <button
                onClick={() => setTape((t) => ({ ...t, on: !t.on }))}
                aria-pressed={tape.on}
                className={`rounded-lg border py-1 ${
                  tape.on ? "border-pink-500 bg-pink-50 text-pink-600" : ""
                }`}
              >
                띠지 {tape.on ? "빼기" : "붙이기"}
              </button>
              {tape.on && (
                <>
                  {(
                    [
                      ["length", "길이", 20, 200],
                      ["thickness", "두께", 2, 20],
                    ] as [keyof Tape, string, number, number][]
                  ).map(([key, label, min, max]) => (
                    <label key={key} className="flex items-center gap-3">
                      <span className="w-10">{label}</span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        value={tape[key] as number}
                        onChange={(e) =>
                          setTape((t) => ({ ...t, [key]: Number(e.target.value) }))
                        }
                        className="flex-1"
                      />
                    </label>
                  ))}
                  <label className="flex items-center gap-3">
                    <span className="w-10">색</span>
                    <input
                      type="color"
                      value={tape.color}
                      onChange={(e) =>
                        setTape((t) => ({ ...t, color: e.target.value }))
                      }
                      className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                    />
                  </label>
                </>
              )}
            </div>

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
                    className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 ${
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
                    className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 ${
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

          {tab === "retouch" && (
            <div className="flex flex-col gap-3 rounded-xl border p-3 text-sm">
              <div className="flex gap-2">
                {(["big", "small"] as Slot[]).map((sl) => (
                  <button
                    key={sl}
                    onClick={() => chooseRetouchSlot(sl)}
                    className={`flex-1 rounded-lg border py-1 ${
                      retouchSlot === sl ? "border-pink-500 bg-pink-50 text-pink-600" : ""
                    }`}
                  >
                    {SLOT_LABEL[sl]}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {RETOUCH_TOOLS.map((t) => (
                  <button
                    key={t.id}
                    aria-pressed={tool === t.id}
                    onClick={() => chooseTool(t.id)}
                    className={`rounded-full border px-3 py-1 ${
                      tool === t.id ? "border-pink-500 bg-pink-50 text-pink-600" : ""
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-zinc-500">
                {RETOUCH_TOOLS.find((t) => t.id === tool)!.hint}
              </p>
              <label className="flex items-center gap-3">
                <span className="w-16">{tool === "resize" ? "범위 크기" : "브러시 크기"}</span>
                <input
                  type="range"
                  min={2}
                  max={20}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="flex-1"
                />
              </label>
              {tool === "resize" && (
                <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                  <label className="flex items-center gap-3">
                    <span className="w-16">크기</span>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={resizeAmount}
                      disabled={!resizeSession}
                      onChange={(e) => setResizeAmount(Number(e.target.value))}
                      className="flex-1"
                    />
                  </label>
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>줄이기</span>
                    <span>{resizeSession ? `${resizeAmount > 0 ? "+" : ""}${resizeAmount}` : "위치를 먼저 눌러 주세요"}</span>
                    <span>키우기</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => finishResize(true)}
                      disabled={!resizeSession}
                      className="flex-1 rounded-lg border border-pink-500 py-1 text-pink-600 disabled:opacity-40"
                    >
                      적용
                    </button>
                    <button
                      onClick={() => finishResize(false)}
                      disabled={!resizeSession}
                      className="flex-1 rounded-lg border py-1 disabled:opacity-40"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
              {tool !== "heal" && tool !== "resize" && (
                <label className="flex items-center gap-3">
                  <span className="w-16">강도</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={retouchStrength}
                    onChange={(e) => setRetouchStrength(Number(e.target.value))}
                    className="flex-1"
                  />
                </label>
              )}
              {tool === "color" && (
                <label className="flex items-center gap-3">
                  <span className="w-16">색</span>
                  <input
                    type="color"
                    value={retouchColor}
                    onChange={(e) => setRetouchColor(e.target.value)}
                    className="h-6 w-10 cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>
              )}
              <div className="flex gap-2">
                <button
                  onClick={retouchUndo}
                  disabled={!works[retouchSlot]?.undo.length}
                  className="flex-1 rounded-lg border py-2 disabled:opacity-40"
                >
                  되돌리기 ({works[retouchSlot]?.undo.length ?? 0})
                </button>
                <button onClick={retouchReset} className="flex-1 rounded-lg border py-2">
                  처음으로
                </button>
              </div>
            </div>
          )}

          {tab === "text" && (
            <div className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
              <button
                onClick={addText}
                className="rounded-lg border border-pink-500 py-1 text-pink-600"
              >
                + 텍스트 추가
              </button>
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
                      onClick={() => setSelectedText(t.id)}
                      className={`max-w-28 shrink-0 truncate rounded-full border px-3 py-1 ${
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
                        className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 ${
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
                      className="relative flex h-7 cursor-pointer items-center gap-1 rounded-full border px-2 text-xs"
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
                      className="h-7 rounded-full border border-pink-500 px-2 text-xs text-pink-600"
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
                    className={`rounded-full border px-3 py-1 uppercase ${
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
                className="rounded-full bg-pink-500 py-3 font-medium text-white disabled:opacity-50"
              >
                {saving ? "저장하는 중..." : "편집본 저장"}
              </button>
              <button onClick={saveOriginals} className="rounded-full border py-2">
                원본 사진 2장 저장
              </button>
              {saveError && <p className="text-red-500">{saveError}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
