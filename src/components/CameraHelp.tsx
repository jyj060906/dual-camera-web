"use client";

import { useState } from "react";
import type { CameraProblem } from "@/lib/camera";

// 카메라를 쓸 수 없을 때의 안내. 인앱 브라우저 안내, 권한 허용 방법, 오류 원인(name·message)을 보여 준다.
export default function CameraHelp({
  inApp,
  problem,
  onRetry,
}: {
  inApp: boolean;
  problem: CameraProblem | null;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("이 주소를 복사해서 Safari나 Chrome에 붙여 넣으세요.", window.location.href);
    }
  }

  if (!inApp && !problem) return null;
  return (
    <div className="flex flex-col gap-3 border border-black p-3 text-sm" role="alert">
      {inApp && (
        <div className="flex flex-col gap-2">
          <p className="font-medium">Safari나 Chrome에서 열어주세요</p>
          <p style={{ color: "#555555" }}>
            카카오톡·인스타그램 같은 앱 안의 브라우저에서는 카메라가 켜지지 않을 수 있어요. 링크를 복사해서 Safari(아이폰) 또는 Chrome(안드로이드)에 붙여 넣어 주세요.
          </p>
          <button onClick={() => void copyLink()} className="h-11 bg-black px-4 text-white">
            {copied ? "링크를 복사했어요" : "링크 복사"}
          </button>
        </div>
      )}

      {problem?.denied && (
        <div className="flex flex-col gap-2">
          <p className="font-medium">카메라 권한이 필요해요</p>
          <ul className="list-disc pl-5" style={{ color: "#555555" }}>
            <li>아이폰 Safari: 주소창 왼쪽 <b>aA</b> → 웹사이트 설정 → 카메라 → 허용</li>
            <li>안드로이드 Chrome: 주소창 왼쪽 자물쇠(설정) 아이콘 → 권한 → 카메라 → 허용</li>
            <li>허용한 뒤 아래 &lsquo;다시 시도&rsquo;를 누르거나 페이지를 새로고침해 주세요.</li>
          </ul>
        </div>
      )}

      {problem && !problem.denied && <p className="font-medium">카메라를 시작하지 못했어요</p>}
      {problem && (
        <>
          <p className="break-words text-xs" style={{ color: "#555555" }}>
            오류: {problem.name}
            {problem.message ? ` — ${problem.message}` : ""}
          </p>
          <button onClick={onRetry} className="h-11 border border-black px-4">
            다시 시도
          </button>
        </>
      )}
    </div>
  );
}
