"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useThemeConfig } from "@/lib/theme";

const navItems = [
  { href: "/", label: "工作台", icon: "▦" },
  { href: "/content", label: "内容创作", icon: "⊗" },
  { href: "/interview", label: "简历面试", icon: "⊡" },
  { href: "/research", label: "信息搜集", icon: "⊕" },
  { href: "/arxiv", label: "arXiv 日报", icon: "⊘" },
  { href: "/files", label: "文件管理", icon: "⊟" },
  { href: "/tasks", label: "历史任务", icon: "⊞" },
  { href: "/settings/models", label: "模型设置", icon: "⚙" },
  { href: "/settings/prompts", label: "提示词模板", icon: "⊞" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const t = useThemeConfig();

  return (
    <aside className={`w-56 border-r shrink-0 flex flex-col ${t.sidebarBg} ${t.border}`}>
      <div className={`px-5 h-12 border-b flex items-center gap-2 shrink-0 ${t.headerBorder}`}>
        <span className={`text-base font-semibold ${t.text}`}>晨枢 AI</span>
        <span className={`text-xs ${t.textMuted}`}>ChenSage_MVP1.0</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm rounded-sm mx-2 my-0.5 transition-colors ${
                active ? `${t.sidebarActive} ${t.sidebarActiveText} font-medium` : `${t.sidebarText} ${t.sidebarHover}`
              }`}>
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className={`px-5 py-2 text-xs border-t ${t.textMuted} ${t.headerBorder}`}>v0.1.0 MVP</div>
    </aside>
  );
}
