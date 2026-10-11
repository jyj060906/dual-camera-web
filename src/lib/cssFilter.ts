// 일부 브라우저(iOS Safari 등)는 canvas의 ctx.filter를 지원하지 않는다.
// 이 파일은 우리가 쓰는 CSS filter 함수를 픽셀에 직접 적용하는 대체 구현이다.
// blur는 대체 구현에서 지원하지 않고 건너뛴다.

let supported: boolean | null = null;

export function canvasFilterSupported(): boolean {
  if (supported !== null) return supported;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d");
  if (!ctx || typeof ctx.filter !== "string") return (supported = false);
  ctx.filter = "grayscale(1)";
  ctx.fillStyle = "rgb(255,0,0)";
  ctx.fillRect(0, 0, 1, 1);
  const [r, g] = ctx.getImageData(0, 0, 1, 1).data;
  return (supported = r === g); // 필터가 적용되면 빨강이 회색이 된다.
}

type Matrix = number[]; // 3x3(행 우선)


// Filter Effects 명세의 색상 행렬.
function saturateM(s: number): Matrix {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
}

function grayscaleM(a: number): Matrix {
  const k = 1 - Math.min(1, Math.max(0, a));
  return [
    0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k,
    0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k,
    0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k,
  ];
}

function sepiaM(a: number): Matrix {
  const k = 1 - Math.min(1, Math.max(0, a));
  return [
    0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k,
    0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k,
    0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k,
  ];
}

function hueM(deg: number): Matrix {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

type Step =
  | { kind: "matrix"; m: Matrix }
  | { kind: "brightness"; v: number }
  | { kind: "contrast"; v: number };

function parse(filter: string): Step[] {
  const steps: Step[] = [];
  const re = /([a-z-]+)\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filter))) {
    const name = m[1];
    const raw = m[2].trim();
    const num = parseFloat(raw);
    if (Number.isNaN(num)) continue;
    const amount = raw.endsWith("%") ? num / 100 : num;
    if (name === "brightness") steps.push({ kind: "brightness", v: amount });
    else if (name === "contrast") steps.push({ kind: "contrast", v: amount });
    else if (name === "saturate") steps.push({ kind: "matrix", m: saturateM(amount) });
    else if (name === "grayscale") steps.push({ kind: "matrix", m: grayscaleM(amount) });
    else if (name === "sepia") steps.push({ kind: "matrix", m: sepiaM(amount) });
    else if (name === "hue-rotate") steps.push({ kind: "matrix", m: hueM(num) });
  }
  return steps;
}

export function applyFilterToImageData(img: ImageData, filter: string) {
  const steps = parse(filter);
  if (steps.length === 0) return;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    for (const st of steps) {
      if (st.kind === "brightness") {
        r *= st.v; g *= st.v; b *= st.v;
      } else if (st.kind === "contrast") {
        const off = 127.5 * (1 - st.v);
        r = r * st.v + off; g = g * st.v + off; b = b * st.v + off;
      } else {
        const m = st.m;
        const nr = m[0] * r + m[1] * g + m[2] * b;
        const ng = m[3] * r + m[4] * g + m[5] * b;
        const nb = m[6] * r + m[7] * g + m[8] * b;
        r = nr; g = ng; b = nb;
      }
      // 각 단계 사이에서 0~255로 자른다(CSS filter도 단계마다 자른다).
      r = r < 0 ? 0 : r > 255 ? 255 : r;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      b = b < 0 ? 0 : b > 255 ? 255 : b;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
}

