import type { Metadata } from "next";
import {
  Anton,
  Archivo_Narrow,
  Bebas_Neue,
  Black_Han_Sans,
  Geist,
  Geist_Mono,
  IBM_Plex_Sans_KR,
  Noto_Sans_KR,
  Noto_Serif_KR,
  Playfair_Display,
} from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { AuthProvider } from "@/lib/auth";
import BottomNav from "@/components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 화면 기본 글꼴(시안과 같은 조합). 영문·숫자는 Archivo Narrow, 한글은 IBM Plex Sans KR.
const archivoNarrow = Archivo_Narrow({
  variable: "--font-archivo-narrow",
  subsets: ["latin"],
});
const plexKr = IBM_Plex_Sans_KR({
  variable: "--font-plex-kr",
  weight: ["400", "500", "700"],
  preload: false,
});

// 텍스트 글꼴 선택용. 쓰지 않으면 내려받지 않도록 preload는 끈다.
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  preload: false,
});
const notoSerifKr = Noto_Serif_KR({
  variable: "--font-noto-serif-kr",
  subsets: ["latin"],
  preload: false,
});
const blackHanSans = Black_Han_Sans({
  variable: "--font-black-han-sans",
  weight: "400",
  subsets: ["latin"],
  preload: false,
});
const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
  preload: false,
});
const bebasNeue = Bebas_Neue({
  variable: "--font-bebas-neue",
  weight: "400",
  subsets: ["latin"],
  preload: false,
});
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "듀얼 카메라",
  description: "전·후면 사진을 각각 찍어 합치는 듀얼샷",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${archivoNarrow.variable} ${plexKr.variable} ${geistSans.variable} ${geistMono.variable} ${notoSansKr.variable} ${notoSerifKr.variable} ${blackHanSans.variable} ${anton.variable} ${bebasNeue.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          {children}
          {/* 현재 주소(usePathname)는 요청 때 정해지는 값이라 Suspense로 감싼다 */}
          <Suspense fallback={null}>
            <BottomNav />
          </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
