import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import AppShell from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "晨枢 AI - ChenSage_MVP1.0",
  description: "个人 AI 任务中枢 MVP 版本",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body className="antialiased h-screen flex flex-col bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100" suppressHydrationWarning>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
