// 광각 전환. 브라우저가 허용하는 방법만 쓴다(화각은 소프트웨어로 넓힐 수 없다).
//  - "zoom": 카메라 트랙이 1보다 작은 줌 값을 받는 기기(일부 안드로이드 크롬). 0.5배~2배를 연속으로 조절한다.
//  - "lens": 별도 초광각 렌즈가 카메라 목록에 따로 보이는 기기(예: 아이폰의 "Back Ultra Wide Camera").
//            0.5배는 그 렌즈로 바꾸고, 1배 이상은 기본 렌즈에서 화면을 확대(디지털 줌)해서 쓴다.
// 둘 다 없으면 null이고, 화면은 광각 옵션을 숨긴다.
export type Facing = "user" | "environment";

export type WideSupport =
  | { kind: "zoom"; min: number; max: number } // max는 ZOOM_MAX 이하
  | { kind: "lens"; wideDeviceId: string };

export const ZOOM_MAX = 2;
export const LENS_WIDE_ZOOM = 0.5; // "lens" 방식에서 초광각 렌즈의 배율 표시

const WIDE_RE = /wide|광각|ultra/i;
const BACK_RE = /back|rear|후면|environment/i;

type ZoomCaps = MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number } };

export async function detectWide(stream: MediaStream, facing: Facing): Promise<WideSupport | null> {
  const track = stream.getVideoTracks()[0];
  if (!track) return null;

  try {
    const zoom = (track.getCapabilities?.() as ZoomCaps | undefined)?.zoom;
    // 1보다 작은 값을 받으면 광각이 있다. (웹캠의 줌은 100~500 같은 다른 단위라서 여기에 걸리지 않는다.)
    if (zoom && zoom.min < 1 && zoom.max >= 1) {
      return { kind: "zoom", min: Math.max(zoom.min, 0.1), max: Math.min(zoom.max, ZOOM_MAX) };
    }
  } catch {
    // 줌 정보를 못 읽으면 다음 방법으로 넘어간다.
  }

  try {
    // 장치 이름(label)은 카메라 권한을 받은 뒤에야 보인다.
    const lens = (await navigator.mediaDevices.enumerateDevices()).find(
      (d) =>
        d.kind === "videoinput" &&
        WIDE_RE.test(d.label) &&
        (facing === "environment" ? BACK_RE.test(d.label) : !BACK_RE.test(d.label)),
    );
    if (lens) return { kind: "lens", wideDeviceId: lens.deviceId };
  } catch {
    // 목록을 못 읽으면 지원하지 않는 것으로 본다.
  }
  return null;
}

// 카카오톡·인스타그램 같은 앱 안의 브라우저(인앱 브라우저)와 안드로이드 웹뷰. 카메라나 로그인이 막히는 경우가 많다.
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|NAVER\(inapp|DaumApps|Line\/|Snapchat|; wv\)|everytimeApp|Whale\/.*Mobile.*inapp/i.test(navigator.userAgent);
}

export type CameraProblem = { name: string; message: string; denied: boolean };

// getUserMedia가 던진 오류를 화면에 보일 모양으로 바꾼다. 원인 파악을 위해 name과 message를 그대로 둔다.
export function cameraProblem(e: unknown): CameraProblem {
  const name = typeof e === "object" && e && "name" in e ? String((e as { name: unknown }).name) : "Error";
  const message = typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return { name, message, denied: name === "NotAllowedError" || name === "SecurityError" };
}

// 카메라를 연다. wideLensId가 있으면 그 초광각 렌즈를, 없으면 방향(facing)에 맞는 기본 렌즈를 연다.
// 그 방향의 카메라가 없거나 조건이 맞지 않으면 아무 카메라나 열어 본다(권한 거부는 다시 시도하지 않는다).
export async function openCamera(facing: Facing, wideLensId?: string): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    const err = new Error("이 브라우저는 카메라를 지원하지 않거나, https 주소가 아니에요.");
    err.name = "NotSupportedError";
    throw err;
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: wideLensId ? { deviceId: { exact: wideLensId } } : { facingMode: { ideal: facing } },
      audio: false,
    });
  } catch (e) {
    if (cameraProblem(e).denied) throw e;
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

// "zoom" 방식의 배율을 카메라에 적용한다.
export async function applyZoom(stream: MediaStream, zoom: number): Promise<void> {
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] }).catch(() => undefined);
}

// 화면에서 보이는 배율(0.5~2). "lens" 방식에서 1 이상은 디지털 줌이다.
export const digitalZoomOf = (support: WideSupport | null, zoom: number) =>
  support?.kind === "lens" && zoom >= 1 ? Math.min(zoom, ZOOM_MAX) : 1;

export const usesWideLens = (support: WideSupport | null, zoom: number) =>
  support?.kind === "lens" && zoom < 1;

export const zoomChoices = (support: WideSupport): number[] =>
  support.kind === "zoom"
    ? [support.min < 1 ? Math.ceil(support.min * 10) / 10 : 1, 1, support.max >= 2 ? 2 : support.max]
    : [LENS_WIDE_ZOOM, 1, ZOOM_MAX];
