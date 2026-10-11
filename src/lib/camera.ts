// 전면 카메라를 가능한 한 넓은 화각으로 맞춘다. 브라우저가 허용하는 방법만 쓴다.
//  1) 줌 값을 1보다 작게 내릴 수 있으면 가장 넓게 내린다(일부 안드로이드 크롬).
//  2) 이름에 wide/광각/ultra가 들어간 전면 렌즈가 따로 보이면 그 렌즈로 바꾼다.
// 둘 다 안 되면 그대로 두고 false를 돌려준다. 화각은 소프트웨어로 넓힐 수 없다.
type ZoomCaps = MediaTrackCapabilities & { zoom?: { min: number; max: number } };

const WIDE_RE = /wide|광각|ultra/i;
const BACK_RE = /back|rear|후면|environment/i;

export async function widenFront(stream: MediaStream): Promise<{ stream: MediaStream; wide: boolean }> {
  const track = stream.getVideoTracks()[0];
  if (!track) return { stream, wide: false };

  try {
    const zoom = (track.getCapabilities?.() as ZoomCaps | undefined)?.zoom;
    if (zoom && zoom.min < 1) {
      await track.applyConstraints({ advanced: [{ zoom: zoom.min } as MediaTrackConstraintSet] });
      return { stream, wide: true };
    }
  } catch {
    // 줌을 못 바꾸면 다음 방법으로 넘어간다.
  }

  try {
    const current = track.getSettings().deviceId;
    // 장치 이름(label)은 카메라 권한을 받은 뒤에야 보인다.
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "videoinput" && WIDE_RE.test(d.label) && !BACK_RE.test(d.label),
    );
    if (devices.some((d) => d.deviceId === current)) return { stream, wide: true };
    const lens = devices[0];
    if (lens) {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: lens.deviceId } },
        audio: false,
      });
      stream.getTracks().forEach((t) => t.stop());
      return { stream: next, wide: true };
    }
  } catch {
    // 못 바꾸면 처음 스트림을 그대로 쓴다.
  }
  return { stream, wide: false };
}
