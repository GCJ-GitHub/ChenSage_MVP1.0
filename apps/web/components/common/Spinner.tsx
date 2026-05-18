"use client";

import { useThemeConfig } from "@/lib/theme";

export default function Spinner({ text = "处理中..." }: { text?: string }) {
  const t = useThemeConfig();

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-gray-200 dark:border-zinc-700 opacity-25" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-sky-500 animate-spin" />
      </div>
      <p className={`text-sm ${t.textMuted} animate-pulse`}>{text}</p>
    </div>
  );
}
