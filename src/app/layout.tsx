import type { Metadata } from "next";
import {
  Anton,
  Bebas_Neue,
  Black_Han_Sans,
  Geist,
  Geist_Mono,
  Noto_Sans_KR,
  Noto_Serif_KR,
  Playfair_Display,
} from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansKr.variable} ${notoSerifKr.variable} ${blackHanSans.variable} ${anton.variable} ${bebasNeue.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
