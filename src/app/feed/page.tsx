import { redirect } from "next/navigation";

// 예전 주소. 내 게시물 모아보기는 '나' 탭(/me)으로 옮겼다.
export default function FeedPage() {
  redirect("/me");
}
