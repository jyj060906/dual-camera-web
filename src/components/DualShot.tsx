"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Slot = "big" | "small";

const SLOT_LABEL: Record<Slot, string> = { big: "큰 사진", small: "작은 사진" };

// 띠지는 디자인이 미정이라 제외했다.
type Frame = "rounded" | "square" | "circle" | "heart" | "star" | "polaroid";

const FRAMES: { id: Frame; label: string; aspect: number }[] = [
  { id: "rounded", label: "기본", aspect: 3 / 4 },
  { id: "square", label: "네모", aspect: 1 },
  { id: "circle", label: "동그라미", aspect: 1 },
  { id: "heart", label: "하트", aspect: 1 },
  { id: "star", label: "별", aspect: 1 },
  { id: "polaroid", label: "폴라로이드", aspect: 4 / 5 },
];

const STAR_CLIP =
  "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";

type Adjust = { brightness: number; contrast: number; saturate: number };
const NO_ADJUST: Adjust = { brightness: 100, contrast: 100, saturate: 100 };

// 필터를 늘리려면 이 목록에 한 줄만 추가하면 된다. effect는 CSS filter 값이다.
const FILTERS = [
  { id: "none", label: "원본", effect: "" },
  { id: "bw", label: "흑백", effect: "grayscale(1)" },
  { id: "warm", label: "따뜻한", effect: "sepia(0.35) saturate(1.2)" },
  { id: "cool", label: "차가운", effect: "sepia(0.25) hue-rotate(170deg) saturate(1.1)" },
  { id: "vintage", label: "빈티지", effect: "sepia(0.5) contrast(0.9) brightness(1.05)" },
  { id: "yellow", label: "노랑", effect: "sepia(0.8) saturate(2.5) hue-rotate(15deg) brightness(1.05)" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

const filterOf = (a: Adjust, f: FilterId) =>
  `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%) ${
    FILTERS.find((x) => x.id === f)!.effect
  }`;

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

export default function DualShot() {
  const [photos, setPhotos] = useState<Record<Slot, string | null>>({
    big: null,
    small: null,
  });
  const [slot, setSlot] = useState<Slot>("big");
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<Frame>("rounded");
  const [adjust, setAdjust] = useState<Record<Slot, Adjust>>({
    big: NO_ADJUST,
    small: NO_ADJUST,
  });
  const [filters, setFilters] = useState<Record<Slot, FilterId>>({
    big: "none",
    small: "none",
  });
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
    const other: Slot = slot === "big" ? "small" : "big";
    if (!photos[other]) setSlot(other);
  }

  function retake(s: Slot) {
    setPhotos((p) => ({ ...p, [s]: null }));
    setAdjust((a) => ({ ...a, [s]: NO_ADJUST }));
    setFilters((f) => ({ ...f, [s]: "none" }));
    setSlot(s);
  }

  function swap() {
    setPhotos((p) => ({ big: p.small, small: p.big }));
    setAdjust((a) => ({ big: a.small, small: a.big }));
    setFilters((f) => ({ big: f.small, small: f.big }));
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
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
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
          <div
            ref={stageRef}
            className="relative aspect-[3/4] touch-none overflow-hidden rounded-2xl bg-zinc-200"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos.big!}
              alt="큰 사진"
              className="h-full w-full object-cover"
              style={{ filter: filterOf(adjust.big, filters.big) }}
            />
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photos.small!}
                  alt="작은 사진"
                  draggable={false}
                  className="h-full w-full object-cover"
                  style={{ filter: filterOf(adjust.small, filters.small) }}
                />
              </div>
            </div>
          </div>

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
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilters((p) => ({ ...p, [editSlot]: f.id }))}
                  className={`rounded-full border px-3 py-1 ${
                    filters[editSlot] === f.id
                      ? "border-pink-500 bg-pink-50 text-pink-600"
                      : ""
                  }`}
                >
                  {f.label}
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
              }}
              className="self-end text-zinc-500 underline"
            >
              초기화
            </button>
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
    </section>
  );
}
