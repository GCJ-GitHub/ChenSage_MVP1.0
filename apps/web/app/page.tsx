"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import { useThemeConfig } from "@/lib/theme";

const TYPE_LABELS: Record<string, string> = {
  interview: "简历面试", content: "内容创作", research: "信息搜集",
  arxiv_daily: "arXiv 日报", generic: "通用任务", stock_research: "股票研究",
};

const quickTasks = [
  { href: "/content", label: "内容创作", icon: "⊗", desc: "论文·小说·公众号·8种文体" },
  { href: "/interview", label: "简历面试", icon: "⊡", desc: "分析简历、模拟面试、复盘报告" },
  { href: "/research", label: "信息搜集", icon: "⊕", desc: "网页抓取、摘要、汇总报告" },
  { href: "/arxiv", label: "arXiv 日报", icon: "⊘", desc: "方向配置、每日论文简报" },
];

interface TaskItem {
  id: string; title: string; type: string; status: string;
  model_name: string | null; elapsed_ms: number | null; updated_at: string;
}

interface DashboardStats {
  task_count: number;
  running_count: number;
  succeeded_count: number;
  failed_count: number;
}

export default function DashboardPage() {
  const t = useThemeConfig();
  const [recentTasks, setRecentTasks] = useState<TaskItem[]>([]);
  const [stats, setStats] = useState({ task_count: 0, running_count: 0, succeeded_count: 0, failed_count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: { recent_tasks: TaskItem[]; stats: DashboardStats } }>("/dashboard/summary")
      .then((r) => { setStats(r.data.stats); setRecentTasks(r.data.recent_tasks); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }); }
    catch { return iso; }
  };
  const truncateId = (id: string) => id.slice(0, 8) + "...";

  return (
    <div className="max-w-5xl">
      <h1 className={`text-xl font-semibold mb-6 ${t.text}`}>工作台</h1>

      <section className="mb-8">
        <h2 className={`text-sm font-medium mb-3 ${t.textMuted}`}>快捷任务</h2>
        <div className="grid grid-cols-2 gap-3">
          {quickTasks.map((q) => (
            <Link key={q.href} href={q.href}
              className={`block p-4 border rounded-lg transition-all ${t.border} ${t.card} ${t.cardHover}`}>
              <span className="text-xl mr-2">{q.icon}</span>
              <span className={`font-medium ${t.text}`}>{q.label}</span>
              <p className={`text-xs mt-1 ${t.textMuted}`}>{q.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className={`text-sm font-medium ${t.textMuted}`}>最近任务</h2>
          <div className={`flex gap-3 text-xs ${t.textMuted}`}>
            <span>共 {stats.task_count} 个</span>
            <span className="text-emerald-500">已完成 {stats.succeeded_count}</span>
            <span className="text-sky-500">执行中 {stats.running_count}</span>
            <span className="text-red-500">失败 {stats.failed_count}</span>
          </div>
        </div>
        {loading ? <p className="text-sm py-8 text-center text-zinc-400">加载中...</p> :
         recentTasks.length === 0 ? <EmptyState title="还没有任务" description="点击上方快捷任务开始" action={{ label: "开始创作", href: "/content" }} /> : (
          <div className={`border rounded-lg overflow-hidden ${t.border}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${t.tableHeader} ${t.border}`}>
                  <th className={`text-left px-3 py-2.5 text-xs font-medium ${t.textMuted} w-16`}>ID</th>
                  <th className={`text-left px-3 py-2.5 text-xs font-medium ${t.textMuted}`}>任务</th>
                  <th className={`text-left px-3 py-2.5 text-xs font-medium ${t.textMuted}`}>类型</th>
                  <th className={`text-left px-3 py-2.5 text-xs font-medium ${t.textMuted}`}>状态</th>
                  <th className={`text-left px-3 py-2.5 text-xs font-medium ${t.textMuted}`}>模型</th>
                  <th className={`text-right px-3 py-2.5 text-xs font-medium ${t.textMuted}`}>耗时</th>
                  <th className={`text-right px-3 py-2.5 text-xs font-medium ${t.textMuted}`}>更新时间</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map((task) => (
                  <tr key={task.id} className={`border-b transition-colors ${t.border} ${t.tableRowHover}`}>
                    <td className={`px-3 py-2.5 text-xs font-mono ${t.textMuted}`}>{truncateId(task.id)}</td>
                    <td className="px-3 py-2.5"><Link href={`/tasks/${task.id}`} className={`truncate block max-w-44 text-sm ${t.text}`}>{task.title}</Link></td>
                    <td className={`px-3 py-2.5 text-xs ${t.textMuted}`}>{TYPE_LABELS[task.type] || task.type}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={task.status} /></td>
                    <td className={`px-3 py-2.5 text-xs max-w-24 truncate ${t.textMuted}`}>{task.model_name || "—"}</td>
                    <td className={`px-3 py-2.5 text-xs text-right ${t.textMuted}`}>{task.elapsed_ms != null ? `${(task.elapsed_ms / 1000).toFixed(1)}s` : "—"}</td>
                    <td className={`px-3 py-2.5 text-xs text-right whitespace-nowrap ${t.textMuted}`}>{formatTime(task.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
