import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Writer - 创作你的杰作",
  description: "现代作家的智能小说创作平台。",
};

function getLocale(): string {
  return process.env.APP_LOCALE || 'zh-CN';
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = getLocale();
  
  return (
    <html lang={locale}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
