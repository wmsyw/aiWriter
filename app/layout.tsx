import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Writer - 创作你的杰作",
  description: "现代作家的智能小说创作平台。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="font-sans">{children}</body>
    </html>
  );
}
