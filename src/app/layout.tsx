import type { Metadata } from "next"
import { Cinzel, Geist_Mono, Noto_Sans_KR } from "next/font/google"
import "./globals.css"

const display = Cinzel({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
})

const sans = Noto_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
})

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "OLYMPUS VAULT",
  description: "게임 계정을 하나의 공용 Vault에서 함께 관리합니다.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${display.variable} ${sans.variable} ${mono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  )
}
