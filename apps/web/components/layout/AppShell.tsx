"use client";

import { useThemeConfig } from "@/lib/theme";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const t = useThemeConfig();

  return (
    <div className={`flex flex-1 overflow-hidden ${t.bg} ${t.text}`}>
      <Sidebar />
      <div className={`flex-1 flex flex-col min-w-0 ${t.bg}`}>
        <TopBar />
        <main className={`flex-1 overflow-y-auto p-6 ${t.bg}`}>{children}</main>
      </div>
    </div>
  );
}
