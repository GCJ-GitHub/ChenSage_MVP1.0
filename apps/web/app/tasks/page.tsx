"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import StatusBadge from "@/components/common/StatusBadge";
import { useThemeConfig } from "@/lib/theme";

const TYPE_LABELS: Record<string, string> = {
  interview: "简历面试", content: "内容创作", research: "信息搜集",
  arxiv_daily: "arXiv 日报", generic: "通用任务", stock_research: "股票研究",
};

interface TaskItem {
  id: string; type: string; title: string; status: string;
  model_name: string | null; elapsed_ms: number | null; updated_at: string;
}

export default function TasksPage() {
  const t = useThemeConfig();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [filter, setFilter] = useState({ type: "", status: "", keyword: "" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("page_size", "20");
    if (filter.type) p.set("type", filter.type);
    if (filter.status) p.set("status", filter.status);
    if (filter.keyword) p.set("keyword", filter.keyword);
    api.get<{ data: { items: TaskItem[]; total: number; has_next: boolean } }>(`/tasks?${p}`)
      .then((r) => {
        setTasks(r.data.items);
        setTotal(r.data.total);
        setHasNext(r.data.has_next);
      })
      .catch(console.error);
  }, [filter, page]);

  const updateFilter = (patch: Partial<typeof filter>) => {
    setPage(1);
    setFilter((prev) => ({ ...prev, ...patch }));
  };

  const selClass = `rounded px-3 py-1.5 text-sm ${t.inputBg} ${t.inputBorder} ${t.inputText}`;

  return (
    <div className="max-w-5xl">
      <h1 className={`text-xl font-semibold mb-6 ${t.text}`}>历史任务</h1>

      <div className="flex gap-3 mb-4">
        <select className={selClass} value={filter.type} onChange={(e) => updateFilter({ type: e.target.value })}>
          <option value="">全部类型</option>
          <option value="interview">简历面试</option>
          <option value="content">内容创作</option>
          <option value="research">信息搜集</option>
          <option value="arxiv_daily">arXiv 日报</option>
          <option value="generic">通用</option>
        </select>
        <select className={selClass} value={filter.status} onChange={(e) => updateFilter({ status: e.target.value })}>
          <option value="">全部状态</option>
          <option value="succeeded">已完成</option>
          <option value="failed">已失败</option>
          <option value="running">执行中</option>
          <option value="draft">草稿</option>
        </select>
        <input className={`${selClass} flex-1`} placeholder="搜索关键词..." value={filter.keyword} onChange={(e) => updateFilter({ keyword: e.target.value })} />
      </div>

      {tasks.length === 0 ? (
        <p className={`text-sm py-8 text-center ${t.textMuted}`}>暂无任务</p>
      ) : (
        <div className={`border rounded-lg overflow-hidden ${t.border}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${t.tableHeader} ${t.border}`}>
                <th className={`text-left px-3 py-2.5 text-xs font-medium ${t.textMuted}`}>任务</th>
                <th className={`text-left px-3 py-2.5 text-xs font-medium ${t.textMuted}`}>类型</th>
                <th className={`text-left px-3 py-2.5 text-xs font-medium ${t.textMuted}`}>状态</th>
                <th className={`text-left px-3 py-2.5 text-xs font-medium ${t.textMuted}`}>模型</th>
                <th className={`text-right px-3 py-2.5 text-xs font-medium ${t.textMuted}`}>耗时</th>
                <th className={`text-right px-3 py-2.5 text-xs font-medium ${t.textMuted}`}>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className={`border-b transition-colors ${t.border} ${t.tableRowHover}`}>
                  <td className="px-3 py-2.5">
                    <a href={`/tasks/${task.id}`} className={`text-sm ${t.text} hover:underline`}>{task.title}</a>
                  </td>
                  <td className={`px-3 py-2.5 text-xs ${t.textMuted}`}>{TYPE_LABELS[task.type] || task.type}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={task.status} /></td>
                  <td className={`px-3 py-2.5 text-xs max-w-24 truncate ${t.textMuted}`}>{task.model_name || "—"}</td>
                  <td className={`px-3 py-2.5 text-xs text-right ${t.textMuted}`}>{task.elapsed_ms != null ? `${(task.elapsed_ms / 1000).toFixed(1)}s` : "—"}</td>
                  <td className={`px-3 py-2.5 text-xs text-right whitespace-nowrap ${t.textMuted}`}>
                    {(() => { try { return new Date(task.updated_at).toLocaleString("zh-CN", { month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit" }); } catch { return task.updated_at; } })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 20 && (
        <div className={`mt-4 flex items-center justify-between text-sm ${t.textMuted}`}>
          <span>共 {total} 个任务，第 {page} 页</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className={`px-3 py-1.5 rounded border disabled:opacity-40 ${t.inputBg} ${t.inputBorder} ${t.text}`}
            >
              上一页
            </button>
            <button
              disabled={!hasNext}
              onClick={() => setPage((current) => current + 1)}
              className={`px-3 py-1.5 rounded border disabled:opacity-40 ${t.inputBg} ${t.inputBorder} ${t.text}`}
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
