import LoginForm from "@/components/LoginForm";
import PageShell from "@/components/PageShell";

export const metadata = { title: "로그인 · 듀얼 카메라" };

export default function LoginPage() {
  return (
    <PageShell title="로그인">
      <LoginForm />
    </PageShell>
  );
}
