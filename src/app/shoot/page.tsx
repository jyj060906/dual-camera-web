import DualShot from "@/components/DualShot";
import HomeGate from "@/components/HomeGate";

export const metadata = { title: "촬영 · 듀얼 카메라" };

export default function ShootPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <HomeGate>
        <DualShot />
      </HomeGate>
    </main>
  );
}
