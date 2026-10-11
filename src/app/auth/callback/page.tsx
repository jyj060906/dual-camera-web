import PageShell from "@/components/PageShell";
import AuthCallback from "@/components/AuthCallback";

export default function CallbackPage() {
  return (
    <PageShell title="로그인 중">
      <AuthCallback />
    </PageShell>
  );
}
