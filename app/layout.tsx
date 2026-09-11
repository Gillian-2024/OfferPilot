import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OfferPilot 领航员",
  description: "应届生校招求职辅助 · JD拆解 / 简历拆解 / 面试复盘",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
