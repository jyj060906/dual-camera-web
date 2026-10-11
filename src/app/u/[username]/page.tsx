import { Suspense } from "react";
import PageShell from "@/components/PageShell";
import UserProfileView from "@/components/UserProfileView";

export const metadata = { title: "프로필 · 듀얼 카메라" };

// 아이디는 요청 때 알 수 있어서 Suspense로 감싸야 빌드가 된다(Cache Components).
export default function UserPage() {
  return (
    <PageShell title="프로필">
      <Suspense fallback={<p className="text-sm text-zinc-500">불러오는 중...</p>}>
        <UserProfileView />
      </Suspense>
    </PageShell>
  );
}
