"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuth, type Profile } from "@/lib/auth";
import { errorCode, errorMessage } from "@/lib/errors";
import { USERNAME_HINT, USERNAME_RE, getSupabase } from "@/lib/supabase";
import Avatar from "./Avatar";

const NICKNAME_MAX = 30;
const BIO_MAX = 200;
const AVATAR_SIZE = 512;

// 올린 사진을 가운데 기준 정사각형으로 잘라 512px JPEG로 줄인다(저장 용량·개인정보 노출을 줄이려는 목적).
async function toAvatarBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_SIZE;
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("사진을 줄이지 못했어요."))), "image/jpeg", 0.9),
  );
}

function Form({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { refreshProfile, signOut } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState(profile.nickname);
  const [bio, setBio] = useState(profile.bio);
  const [isPrivate, setIsPrivate] = useState(profile.is_private);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const needsUsername = !profile.username;

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMessage({ ok: false, text: "사진 파일만 올릴 수 있어요." });
    if (preview) URL.revokeObjectURL(preview);
    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
    setMessage(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (needsUsername && !USERNAME_RE.test(username)) {
      return setMessage({ ok: false, text: `아이디는 ${USERNAME_HINT}여야 해요.` });
    }
    setBusy(true);
    try {
      const sb = getSupabase();
      const update: Record<string, unknown> = {
        nickname: nickname.trim(),
        bio: bio.trim(),
        is_private: isPrivate,
      };
      if (needsUsername) update.username = username;

      let uploadedPath: string | null = null;
      if (avatarFile) {
        const blob = await toAvatarBlob(avatarFile);
        uploadedPath = `${profile.id}/${Date.now()}.jpg`;
        const { error: upError } = await sb.storage
          .from("avatars")
          .upload(uploadedPath, blob, { contentType: "image/jpeg" });
        if (upError) throw upError;
        update.avatar_url = sb.storage.from("avatars").getPublicUrl(uploadedPath).data.publicUrl;
      }

      const { error } = await sb.from("profiles").update(update).eq("id", profile.id);
      if (error) {
        if (uploadedPath) await sb.storage.from("avatars").remove([uploadedPath]);
        if (error.code === "23505") return setMessage({ ok: false, text: "이미 사용 중인 아이디예요." });
        if (error.code === "23514") return setMessage({ ok: false, text: "입력한 내용이 규칙에 맞지 않아요. 글자 수와 아이디 형식을 확인해 주세요." });
        throw error;
      }

      // 예전 프로필 사진 파일은 지운다(실패해도 저장은 끝난 상태라 무시한다).
      const oldPath = profile.avatar_url?.split("/avatars/")[1];
      if (uploadedPath && oldPath && oldPath.startsWith(`${profile.id}/`)) {
        await sb.storage.from("avatars").remove([oldPath]).catch(() => undefined);
      }

      setAvatarFile(null);
      await refreshProfile();
      setMessage({ ok: true, text: "저장됐어요." });
    } catch (err) {
      // 사진 올리기에서 막힌 경우(용량·형식 등)도 이유가 보이게 한다.
      setMessage({ ok: false, text: errorCode(err) === "413" ? "사진 용량이 너무 커요." : errorMessage(err, "저장하지 못했어요.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 text-sm">
      {needsUsername && (
        <p className="rounded-xl bg-pink-50 p-3 text-pink-700">
          아이디를 만들어 주세요. 친구가 이 아이디로 나를 찾고, 한 번 정하면 바꿀 수 없어요.
        </p>
      )}

      <div className="flex items-center gap-4">
        <Avatar
          person={{ nickname, username: profile.username, avatar_url: preview ?? profile.avatar_url }}
          size={72}
        />
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-full border px-3 py-1"
          >
            사진 바꾸기
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} className="hidden" />
        </div>
      </div>

      <label className="flex flex-col gap-1">
        아이디
        {needsUsername ? (
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            placeholder={USERNAME_HINT}
            className="rounded-lg border px-3 py-2"
          />
        ) : (
          <input value={`@${profile.username}`} readOnly className="rounded-lg border bg-zinc-50 px-3 py-2 text-zinc-500" />
        )}
      </label>

      <label className="flex flex-col gap-1">
        닉네임
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={NICKNAME_MAX}
          className="rounded-lg border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        소개글 <span className="text-xs text-zinc-400">{bio.length}/{BIO_MAX}</span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={BIO_MAX}
          rows={3}
          className="resize-none rounded-lg border px-3 py-2"
        />
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
          className="mt-1"
        />
        <span>
          비공개 계정
          <span className="block text-xs text-zinc-500">
            켜면 다른 사람이 나를 팔로우할 때 내 승인이 필요해요.
          </span>
        </span>
      </label>

      {message && (
        <p role="status" className={message.ok ? "text-green-600" : "text-red-500"}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-pink-500 py-3 font-medium text-white disabled:opacity-50"
      >
        {busy ? "저장하는 중..." : "저장"}
      </button>

      <div className="flex items-center justify-between border-t pt-4">
        {profile.username ? (
          <Link href={`/u/${profile.username}`} className="text-pink-600 underline">
            내 프로필 보기
          </Link>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.push("/");
          }}
          className="text-zinc-500 underline"
        >
          로그아웃
        </button>
      </div>
    </form>
  );
}

export default function ProfileEditor() {
  const { profile } = useAuth();
  // 프로필이 바뀌면 입력칸을 새로 채우도록 key를 건다.
  return profile ? <Form key={profile.id} profile={profile} /> : null;
}
