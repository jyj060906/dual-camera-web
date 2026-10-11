import Link from "next/link";

// 로그인·프로필·친구 화면의 공통 틀: 뒤로가기와 제목
export default function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="사진 만들기로 돌아가기" className="rounded-full p-1 text-zinc-500">
          ←
        </Link>
        <h1 className="text-xl font-semibold">{title}</h1>
      </header>
      {children}
    </main>
  );
}
