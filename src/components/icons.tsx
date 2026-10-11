// 탭에 쓰는 단순한 선 아이콘. 색은 글자색(currentColor)을 따른다.
type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

// 큰 사진 위에 작은 사진이 올라간 모양
export const LayoutIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <rect x="11" y="11" width="7" height="7" rx="1.5" />
  </Svg>
);

// 슬라이더 세 줄
export const AdjustIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 6h5M15 6h5M4 12h1.5M10.5 12H20M4 18h9.5M18.5 18H20" />
    <circle cx="12" cy="6" r="2.5" />
    <circle cx="8" cy="12" r="2.5" />
    <circle cx="16" cy="18" r="2.5" />
  </Svg>
);

// 글자 T
export const TextIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M5 7V5h14v2M12 5v14M9 19h6" />
  </Svg>
);

// 내려받기
export const SaveIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" />
  </Svg>
);

// 친구(사람 둘)
export const UsersIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M17.5 14.2c2.2.2 3.6 1.8 4 4.3" />
  </Svg>
);
