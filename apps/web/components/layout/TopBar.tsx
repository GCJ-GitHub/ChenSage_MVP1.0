"use client";

import { useEffect, useState } from "react";
import { useThemeConfig, useTheme } from "@/lib/theme";

export default function TopBar() {
  const [now, setNow] = useState<Date | null>(null);
  const t = useThemeConfig();
  const { dark, toggle } = useTheme();

  useEffect(() => {
    const tick = () => setNow(new Date());
    queueMicrotask(tick);
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className={`h-12 border-b flex items-center justify-end px-5 shrink-0 gap-4 ${t.headerBg} ${t.headerBorder}`}>
      <button onClick={toggle}
        className={`px-3 py-1 text-xs rounded border transition-colors ${t.inputBg} ${t.inputBorder} ${t.text}`}>
        {dark ? "☀ 亮色" : "☾ 暗色"}
      </button>
      <span className={`text-xs ${t.textMuted}`}>
        {now ? (
          <>
            {now.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
            {" "}
            {now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
          </>
        ) : "时间同步中"}
      </span>
    </header>
  );
}
