import PageShell from "@/components/PageShell";
import ProfileEditor from "@/components/ProfileEditor";
import RequireLogin from "@/components/RequireLogin";

export const metadata = { title: "내 프로필 · 듀얼 카메라" };

export default function ProfilePage() {
  return (
    <PageShell title="내 프로필">
      <RequireLogin>
        <ProfileEditor />
      </RequireLogin>
    </PageShell>
  );
}
