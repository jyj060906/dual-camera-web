import FriendsView from "@/components/FriendsView";
import PageShell from "@/components/PageShell";

export const metadata = { title: "친구 · 듀얼 카메라" };

export default function FriendsPage() {
  return (
    <PageShell title="친구">
      <FriendsView />
    </PageShell>
  );
}
