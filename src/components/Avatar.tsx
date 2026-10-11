type Person = { nickname: string; username: string | null; avatar_url: string | null };

export const displayName = (p: Pick<Person, "nickname" | "username">) =>
  p.nickname || p.username || "이름 없음";

// 프로필 사진. 없으면 이름의 첫 글자를 보여 준다.
export default function Avatar({ person, size = 40 }: { person: Person; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (person.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.avatar_url}
        alt=""
        style={style}
        className="shrink-0 rounded-full bg-zinc-200 object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-pink-100 font-medium text-pink-600"
    >
      {displayName(person).slice(0, 1).toUpperCase()}
    </span>
  );
}
