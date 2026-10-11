import AccountBar from "@/components/AccountBar";
import DualShot from "@/components/DualShot";
import HomeGate from "@/components/HomeGate";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">듀얼 카메라</h1>
        <AccountBar />
      </header>
      <HomeGate>
        <DualShot />
      </HomeGate>
    </main>
  );
}
