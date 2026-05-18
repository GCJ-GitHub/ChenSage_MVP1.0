"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import { useThemeConfig } from "@/lib/theme";

interface PromptTpl {
  id: string;
  task_type: string;
  sub_type: string;
  name: string;
  system_prompt: string | null;
  user_prompt_template: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  version?: number;
  created_at: string;
  updated_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  generic: "通用任务", content: "内容创作", interview: "简历面试",
  research: "信息搜集", arxiv_daily: "arXiv日报",
};

const SUB_OPTIONS: Record<string, string[]> = {
  generic: ["通用"],
  content: ["论文草稿", "专利草稿", "小说", "剧本", "歌词", "小红书", "知乎", "公众号"],
  interview: ["简历分析", "面试出题", "回答评价", "复盘报告"],
  research: ["信息汇总"],
  arxiv_daily: ["论文日报"],
};

export default function PromptsPage() {
  const t = useThemeConfig();
  const [templates, setTemplates] = useState<PromptTpl[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    task_type: "generic", sub_type: "", name: "", system_prompt: "",
    user_prompt_template: "", description: "", is_default: false,
  });

  const load = () => {
    api.get<{ data: { items: PromptTpl[] } }>("/prompts")
      .then((r) => setTemplates(r.data.items))
      .catch(console.error);
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ task_type: "generic", sub_type: "", name: "", system_prompt: "", user_prompt_template: "", description: "", is_default: false });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.user_prompt_template.trim()) return;
    if (editingId) {
      await api.patch(`/prompts/${editingId}`, form);
    } else {
      await api.post("/prompts", form);
    }
    resetForm();
    load();
  };

  const handleEdit = (t: PromptTpl) => {
    setForm({
      task_type: t.task_type, sub_type: t.sub_type, name: t.name, system_prompt: t.system_prompt || "",
      user_prompt_template: t.user_prompt_template, description: t.description || "",
      is_default: t.is_default,
    });
    setEditingId(t.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除此模板？")) return;
    await api.delete(`/prompts/${id}`);
    load();
  };

  const grouped = templates.reduce<Record<string, PromptTpl[]>>((acc, t) => {
    (acc[t.task_type] ||= []).push(t);
    return acc;
  }, {});

  const formatDt = (iso: string) => {
    try { return new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  };
  const inputClass = `w-full border rounded px-3 py-2 text-sm ${t.inputBg} ${t.inputBorder} ${t.inputText}`;
  const textareaClass = `${inputClass} resize-none font-mono`;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className={`text-xl font-semibold ${t.text}`}>提示词模板</h1>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }}
          className={`px-4 py-2 text-white text-sm rounded transition-colors ${t.accent} ${t.accentHover}`}>
          {showForm ? "取消" : "新建模板"}
        </button>
      </div>

      {showForm && (
        <div className={`border rounded-lg p-5 mb-6 space-y-4 ${t.border} ${t.card}`}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-xs mb-1 ${t.textMuted}`}>适用任务类型</label>
              <select className={inputClass}
                value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
            <div>
              <label className={`block text-xs mb-1 ${t.textMuted}`}>细分类型</label>
              <select className={inputClass}
                value={form.sub_type} onChange={(e) => setForm({ ...form, sub_type: e.target.value })}>
                <option value="">-- 全部 --</option>
                {(SUB_OPTIONS[form.task_type] || []).map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            <div>
              <label className={`block text-xs mb-1 ${t.textMuted}`}>模板名称</label>
              <input className={inputClass}
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：专业分析模板" />
            </div>
            <div className="col-span-2">
              <label className={`block text-xs mb-1 ${t.textMuted}`}>描述</label>
              <input className={inputClass}
                value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="模板用途说明..." />
            </div>
            <div className="col-span-2">
              <label className={`block text-xs mb-1 ${t.textMuted}`}>System Prompt</label>
              <textarea className={`${textareaClass} h-20`}
                value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder="你是一个专业的写作助手..." />
            </div>
            <div className="col-span-2">
              <label className={`block text-xs mb-1 ${t.textMuted}`}>
                User Prompt 模板（使用 `{"{变量名}"}` 作为占位符）
              </label>
              <textarea className={`${textareaClass} h-32`}
                value={form.user_prompt_template} onChange={(e) => setForm({ ...form, user_prompt_template: e.target.value })}
                placeholder="## 主题&#10;{topic}&#10;&#10;## 风格&#10;{style}&#10;&#10;## 补充信息&#10;{context}" />
            </div>
          </div>
          <label className={`flex items-center gap-2 text-sm ${t.textMuted}`}>
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              className="accent-sky-500" />
            设为该类型的默认模板
          </label>
          <button onClick={handleSave}
            className={`px-4 py-2 text-white text-sm rounded transition-colors ${t.accent} ${t.accentHover}`}>
            {editingId ? "更新模板" : "创建模板"}
          </button>
        </div>
      )}

      {templates.length === 0 ? (
        <p className={`text-sm py-8 text-center ${t.textMuted}`}>暂无提示词模板，点击「新建模板」创建</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([taskType, items]) => (
            <div key={taskType}>
              <h3 className={`text-sm font-medium mb-2 ${t.textMuted}`}>
                {TYPE_LABELS[taskType] || taskType}
                <span className={`ml-2 ${t.textMuted}`}>({items.length} 个)</span>
              </h3>
              <div className={`border rounded-lg overflow-hidden ${t.border}`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b ${t.tableHeader} ${t.border}`}>
                      <th className={`text-left px-3 py-2 text-xs font-medium ${t.textMuted} w-12`}>#</th>
                      <th className={`text-left px-3 py-2 text-xs font-medium ${t.textMuted}`}>名称</th>
                      <th className={`text-left px-3 py-2 text-xs font-medium ${t.textMuted}`}>细分</th>
                      <th className={`text-left px-3 py-2 text-xs font-medium ${t.textMuted}`}>描述</th>
                      <th className={`text-left px-3 py-2 text-xs font-medium ${t.textMuted}`}>默认</th>
                      <th className={`text-left px-3 py-2 text-xs font-medium ${t.textMuted}`}>时间</th>
                      <th className={`text-right px-3 py-2 text-xs font-medium ${t.textMuted}`}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((tpl, i) => (
                      <tr key={tpl.id} className={`border-b transition-colors ${t.border} ${t.tableRowHover}`}>
                        <td className={`px-3 py-2 text-xs font-mono ${t.textMuted}`}>{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className={`font-medium ${t.text}`}>{tpl.name}</span>
                          <span className={`text-xs ml-2 ${t.textMuted}`}>v{tpl.version ?? 1}</span>
                        </td>
                        <td className={`px-3 py-2 text-xs ${t.textMuted}`}>{tpl.sub_type || "—"}</td>
                        <td className={`px-3 py-2 text-xs max-w-48 truncate ${t.textMuted}`}>{tpl.description || "—"}</td>
                        <td className="px-3 py-2">
                          {tpl.is_default ? <span className={`text-xs px-1.5 py-0.5 rounded ${t.statusRunning}`}>默认</span> : <span className={`text-xs ${t.textMuted}`}>—</span>}
                        </td>
                        <td className={`px-3 py-2 text-xs whitespace-nowrap ${t.textMuted}`}>{formatDt(tpl.created_at)}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => handleEdit(tpl)} className={`text-xs mr-2 ${t.accentText}`}>编辑</button>
                          <button onClick={() => handleDelete(tpl.id)} className="text-xs text-rose-500 hover:text-rose-400">删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
