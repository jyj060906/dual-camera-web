"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Slot = "big" | "small";

const SLOT_LABEL: Record<Slot, string> = { big: "큰 사진", small: "작은 사진" };

export default function DualShot() {
  const [photos, setPhotos] = useState<Record<Slot, string | null>>({
    big: null,
    small: null,
  });
  const [slot, setSlot] = useState<Slot>("big");
  const [error, setError] = useState<string | null>(null);
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
    setSlot(s);
  }

  function swap() {
    setPhotos((p) => ({ big: p.small, small: p.big }));
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
      // 큰 사진 틀과 작은 사진 모두 3:4라서 높이 비율도 너비 비율과 같다.
      const maxX = 100 - smallSize;
      const maxY = 100 - smallSize;
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
            />
            <div
              onPointerDown={startDrag}
              className="absolute aspect-[3/4] cursor-grab overflow-hidden rounded-xl border-2 border-white shadow-lg"
              style={{
                width: `${smallSize}%`,
                left: `${smallPos.x}%`,
                top: `${smallPos.y}%`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photos.small!}
                alt="작은 사진"
                draggable={false}
                className="h-full w-full object-cover"
              />
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
