// Supabase 설정 점검: node scripts/check-supabase.mjs
// .env.local의 주소·anon 키로 접속해서 가입 설정, 구글, 스키마 적용 여부를 확인한다.
// 키는 화면에 출력하지 않는다(결과만 공유해도 안전하다).
import fs from "fs";

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
  );
}

const env = { ...readEnv(".env"), ...readEnv(".env.local"), ...process.env };
const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const ok = (m) => console.log(`✅ ${m}`);
const bad = (m, hint) => console.log(`❌ ${m}${hint ? `\n   → ${hint}` : ""}`);
let problems = 0;
const check = (cond, good, notGood, hint) => (cond ? ok(good) : (problems++, bad(notGood, hint)));

if (!url || !key || url.includes("your-project-ref") || key.includes("your-anon")) {
  bad(".env.local에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY가 없어요", ".env.example을 .env.local로 복사해 값을 채워 주세요.");
  process.exit(1);
}
check(/^https?:\/\//.test(url), "주소 형식이 올바르다", "주소는 https://...supabase.co 형태여야 해요");
const keyLooksOk = key.split(".").length === 3 || key.startsWith("sb_publishable_");
check(keyLooksOk, "anon(공개) 키 형식이 올바르다", "anon public 키가 아닌 것 같아요");
try {
  const role = key.split(".").length === 3 ? JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role : "anon";
  check(role !== "service_role", "공개용(anon) 키를 쓰고 있다", "service_role 키가 들어 있어요! 즉시 빼고 키를 재발급하세요", "service_role은 브라우저에 노출되면 안 됩니다.");
} catch {
  /* 새 형식의 키는 해석하지 않는다 */
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };
const get = async (path, init) => {
  try {
    const r = await fetch(`${url}${path}`, { headers, ...init });
    return { status: r.status, body: await r.text() };
  } catch (e) {
    return { status: 0, body: String(e.cause?.code ?? e.message) };
  }
};

const settings = await get("/auth/v1/settings");
if (settings.status !== 200) {
  bad(`Supabase에 연결하지 못했어요 (상태 ${settings.status || settings.body})`, "주소와 키가 맞는지, 프로젝트가 일시중지되지 않았는지 확인하세요.");
  process.exit(1);
}
ok("Supabase에 연결됨");
const s = JSON.parse(settings.body);

check(s.mailer_autoconfirm === true, "Confirm email이 꺼져 있다(가입 직후 로그인 가능)", "Confirm email이 켜져 있어요", "Authentication → Providers → Email에서 'Confirm email'을 끄세요. 안 끄면 아이디 가입 후 로그인되지 않습니다.");
check(s.disable_signup !== true, "새 가입이 허용돼 있다", "새 가입이 막혀 있어요", "Authentication → Providers → Email에서 'Enable email signups'를 켜세요.");
check(s.external?.email !== false, "Email 로그인 방식이 켜져 있다", "Email 로그인이 꺼져 있어요", "아이디/비밀번호 로그인은 Email 방식을 씁니다. Providers → Email을 켜세요.");
const pw = s.password_min_length;
if (typeof pw === "number") check(pw >= 8, `비밀번호 최소 길이 ${pw}자`, `비밀번호 최소 길이가 ${pw}자예요`, "앱은 8자 이상을 요구합니다. 설정에서 8 이상으로 올리면 일관돼요.");

check(s.external?.google === true, "구글 로그인이 켜져 있다", "구글 로그인이 꺼져 있어요", "Authentication → Providers → Google을 켜고 클라이언트 ID/Secret을 넣으세요.");

// schema.sql을 실행했는지
const rpc = await get("/rest/v1/rpc/username_available", {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "zz_check_probe" }),
});
check(rpc.status === 200, "schema.sql이 적용돼 있다(아이디 확인 함수 동작)", `schema.sql이 적용되지 않았어요 (상태 ${rpc.status})`, "SQL Editor에서 supabase/schema.sql 전체를 실행하세요.");
const prof = await get("/rest/v1/profiles?select=id&limit=1");
check(prof.status === 200, "profiles 테이블이 있다", `profiles 테이블을 찾지 못했어요 (상태 ${prof.status})`, "schema.sql을 실행하세요.");
if (prof.status === 200) check(prof.body.trim() === "[]", "로그인 전에는 프로필이 보이지 않는다(규칙 정상)", "로그인 전인데 프로필이 보여요!", "RLS가 꺼져 있을 수 있어요. schema.sql을 다시 실행하세요.");

console.log("\n(확인할 수 없는 항목) Redirect URL: Authentication → URL Configuration에 http://localhost:3000/auth/callback 이 있어야 해요.");
console.log(problems === 0 ? "\n🎉 점검 통과!" : `\n문제 ${problems}개를 고친 뒤 다시 실행해 주세요.`);
process.exit(problems === 0 ? 0 : 1);
