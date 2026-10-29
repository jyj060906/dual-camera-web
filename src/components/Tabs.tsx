"use client";

// 앱 전체에서 쓰는 탭 전환. 같은 너비로 나란히 놓고 전체를 검은 테두리로 감싼다.
// 선택된 탭은 검은 배경 + 흰 글씨 + 굵게, 선택 안 된 탭은 흰 배경 + 검은 글씨다.
export default function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="grid border border-black text-sm"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t, i) => {
        const on = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`h-11 px-1 ${i > 0 ? "border-l border-black" : ""} ${
              on ? "bg-black font-bold text-white" : "bg-white font-normal text-black"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
