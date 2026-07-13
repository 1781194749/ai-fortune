import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "玄机 AI - 看得见推演过程的 AI 命理顾问",
  description:
    "玄机 AI 融合塔罗、八字五行、八卦问事、手相解读和深度报告，提供可追问、可沉淀的 AI 命理体验。",
  applicationName: "玄机 AI",
  keywords: [
    "玄机 AI",
    "Xuanji AI",
    "AI 算命",
    "塔罗占卜",
    "八字五行",
    "手相解读",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full font-sans antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
