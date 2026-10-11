import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 환경 변수가 없으면 로그인 기능만 꺼지고, 카메라·꾸미기는 그대로 쓸 수 있다.
export const SUPABASE_CONFIGURED = Boolean(URL && ANON_KEY);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!URL || !ANON_KEY) {
    throw new Error("Supabase 설정이 없습니다. .env.local에 주소와 키를 넣어 주세요.");
  }
  client ??= createBrowserClient(URL, ANON_KEY);
  return client;
}

// 로그인은 아이디+비밀번호만 쓴다. Supabase Auth가 이메일 형식을 요구해서
// 아이디를 가짜 이메일로 바꿔 넣는다(메일은 보내지 않는다). supabase/schema.sql의 도메인과 같아야 한다.
export const ID_EMAIL_DOMAIN = "id.dual-camera.example";
export const idToEmail = (id: string) => `${id}@${ID_EMAIL_DOMAIN}`;

export const USERNAME_RE = /^[a-z0-9_]{4,20}$/;
export const USERNAME_HINT = "영문 소문자, 숫자, _ 로 4~20자";
export const PASSWORD_MIN = 8;
