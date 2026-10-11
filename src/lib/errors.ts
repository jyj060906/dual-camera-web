// supabase 오류는 Error가 아닌 일반 객체({ message, code })로 던져지는 경우가 많아서, 화면에 보일 문구를 꺼내는 도우미를 둔다.
export function errorMessage(err: unknown, fallback = "문제가 생겼어요. 잠시 뒤 다시 해 주세요."): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

export function errorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    const c = (err as { code: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}
