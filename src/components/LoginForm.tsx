"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import {
  PASSWORD_MIN,
  USERNAME_HINT,
  USERNAME_RE,
  getSupabase,
  idToEmail,
} from "@/lib/supabase";
import { SetupNotice } from "./RequireLogin";

type Mode = "login" | "signup";

export default function LoginForm() {
  const router = useRouter();
  const { configured, status } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 이미 로그인된 상태로 들어오면 바로 사진 화면으로 보낸다.
  useEffect(() => {
    if (status === "in") router.replace("/");
  }, [status, router]);

  if (!configured) return <SetupNotice />;
  if (status === "in") {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p>이미 로그인되어 있어요.</p>
        <Link href="/" className="rounded-full bg-pink-500 py-2 text-center font-medium text-white">
          사진 만들러 가기
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!USERNAME_RE.test(username)) return setError(`아이디는 ${USERNAME_HINT}여야 해요.`);
    if (password.length < PASSWORD_MIN) return setError(`비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.`);
    if (mode === "signup" && password !== confirm) return setError("비밀번호가 서로 달라요.");

    setBusy(true);
    try {
      const sb = getSupabase();
      if (mode === "signup") {
        // 이미 있는 아이디로는 가입할 수 없다
        const { data: free, error: rpcError } = await sb.rpc("username_available", { name: username });
        if (rpcError) throw rpcError;
        if (!free) return setError("이미 사용 중인 아이디예요.");

        const { data, error: signUpError } = await sb.auth.signUp({
          email: idToEmail(username),
          password,
        });
        if (signUpError) {
          if (/already|registered/i.test(signUpError.message)) return setError("이미 사용 중인 아이디예요.");
          throw signUpError;
        }
        if (!data.session) {
          return setError(
            "가입은 됐지만 바로 로그인되지 않았어요. Supabase 설정에서 'Confirm email'을 꺼야 해요(supabase/README.md 참고).",
          );
        }
      } else {
        const { error: signInError } = await sb.auth.signInWithPassword({
          email: idToEmail(username),
          password,
        });
        if (signInError) {
          return setError("아이디 또는 비밀번호가 맞지 않아요.");
        }
      }
      router.push("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "kakao") {
    setError(null);
    const { error: oauthError } = await getSupabase().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) setError(oauthError.message);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 text-sm dark:bg-zinc-800">
        {(["login", "signup"] as Mode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`rounded-lg py-2 ${
              mode === m ? "bg-white font-medium text-pink-600 shadow-sm dark:bg-zinc-700" : "text-zinc-500"
            }`}
          >
            {m === "login" ? "로그인" : "가입하기"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1">
          아이디
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            placeholder={USERNAME_HINT}
            className="rounded-lg border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={`${PASSWORD_MIN}자 이상`}
            className="rounded-lg border px-3 py-2"
          />
        </label>
        {mode === "signup" && (
          <label className="flex flex-col gap-1">
            비밀번호 확인
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="rounded-lg border px-3 py-2"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-pink-500 py-3 font-medium text-white disabled:opacity-50"
        >
          {busy ? "잠시만요..." : mode === "login" ? "로그인" : "가입하기"}
        </button>
        {mode === "signup" && (
          <p className="text-xs text-zinc-500">
            메일 주소 없이 아이디와 비밀번호로만 가입해서, 비밀번호를 잊으면 찾을 수 없어요.
          </p>
        )}
      </form>

      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        또는
        <span className="h-px flex-1 bg-zinc-200" />
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <button onClick={() => oauth("google")} className="rounded-full border py-3">
          Google로 계속하기
        </button>
        <button
          onClick={() => oauth("kakao")}
          className="rounded-full bg-[#FEE500] py-3 font-medium text-black"
        >
          카카오로 계속하기
        </button>
        <p className="text-xs text-zinc-500">
          구글·카카오로 들어오면 아이디/비밀번호 계정과는 별개의 계정이에요.
        </p>
      </div>
    </div>
  );
}
