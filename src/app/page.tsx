import FriendFeed from "@/components/FriendFeed";
import HomeGate from "@/components/HomeGate";

export const metadata = { title: "홈 · 듀얼 카메라" };

export default function Home() {
  return (
    <HomeGate>
      <FriendFeed />
    </HomeGate>
  );
}
