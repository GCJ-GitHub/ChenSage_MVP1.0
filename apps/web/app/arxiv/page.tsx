"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/common/EmptyState";
import ModelSelector from "@/components/common/ModelSelector";
import Spinner from "@/components/common/Spinner";
import { api } from "@/lib/api-client";
import { useThemeConfig } from "@/lib/theme";
import { downloadMarkdown, exportTaskMarkdown } from "@/lib/task-export";

interface Direction {
  id: string;
  name: string;
  keywords: string[];
  exclude_keywords: string[];
  categories: string[];
  is_enabled: boolean;
  last_run_at: string | null;
}

interface Paper {
  id: string;
  arxiv_id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  abs_url: string | null;
  pdf_url: string | null;
  published_at: string | null;
  categories: string[] | null;
  is_starred: boolean;
}

interface Report {
  id: string;
  report_date: string;
  title: string;
  content: string;
  paper_count: number;
  recommended_count: number;
  status: string;
  created_at: string;
}

interface PromptItem {
  id: string;
  name: string;
  sub_type: string;
  is_default: boolean;
}

const CATEGORIES = [
  "cs.AI", "cs.CL", "cs.CV", "cs.LG", "cs.NE", "cs.SE", "cs.CR",
  "stat.ML", "math.OC", "q-bio.NC", "q-fin.ST", "eess.IV", "eess.AS",
];

const today = () => new Date().toISOString().slice(0, 10);

export default function ArxivPage() {
  const t = useThemeConfig();
  const [directions, setDirections] = useState<Direction[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptItem[]>([]);
  const [selectedDir, setSelectedDir] = useState("");
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", keywords: "", exclude_keywords: "", categories: "cs.AI" });
  const [starFilter, setStarFilter] = useState(false);
  const [modelConfigId, setModelConfigId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [maxPapers, setMaxPapers] = useState(20);
  const [reportDate, setReportDate] = useState(today());
  const [reportPreview, setReportPreview] = useState("");
  const [reportTaskId, setReportTaskId] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [loading, setLoading] = useState<"directions" | "papers" | "fetch" | "report" | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

  const inp = `w-full border rounded px-3 py-2 text-sm ${t.inputBg} ${t.inputBorder} ${t.inputText}`;
  const btn = `px-4 py-2 text-sm rounded transition-colors disabled:opacity-50 text-white ${t.accent} ${t.accentHover}`;
  const secBtn = `px-3 py-2 text-sm rounded border transition-colors ${t.inputBg} ${t.inputBorder} ${t.textMuted} hover:bg-gray-100 dark:hover:bg-zinc-800`;

  const selectedDirection = directions.find((item) => item.id === selectedDir);
  const starredCount = papers.filter((paper) => paper.is_starred).length;
  const latestDate = papers[0]?.published_at ? new Date(papers[0].published_at).toLocaleDateString("zh-CN") : "暂无";
  const selectedReport = reports.find((report) => report.id === selectedReportId);
  const visibleReport = reportPreview || selectedReport?.content || "";

  const loadDirections = useCallback(async () => {
    setLoading("directions");
    try {
      const res = await api.get<{ data: { directions: Direction[] } }>("/arxiv/directions");
      setDirections(res.data.directions);
      setSelectedDir((current) => current || res.data.directions[0]?.id || "");
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "加载研究方向失败");
    } finally {
      setLoading(null);
    }
  }, []);

  const loadReports = useCallback(async (directionId = "") => {
    try {
      const query = directionId ? `?direction_id=${directionId}` : "";
      const res = await api.get<{ data: { reports: Report[] } }>(`/arxiv/reports${query}`);
      setReports(res.data.reports);
    } catch {}
  }, []);

  const loadPromptTemplates = useCallback(async () => {
    try {
      const res = await api.get<{ data: { items: PromptItem[] } }>("/prompts?task_type=arxiv_daily&is_active=true");
      const items = [...res.data.items].sort((a, b) => {
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
        return a.name.localeCompare(b.name, "zh-CN");
      });
      setPromptTemplates(items);
      const defaultTemplate = items.find((tpl) => tpl.is_default);
      if (defaultTemplate) setTemplateId(defaultTemplate.id);
    } catch {}
  }, []);

  const loadPapers = useCallback(async () => {
    if (!selectedDir) return;
    setLoading("papers");
    try {
      const params = new URLSearchParams({ direction_id: selectedDir, page_size: "50" });
      if (starFilter) params.set("starred", "true");
      const res = await api.get<{ data: { items: Paper[] } }>(`/arxiv/papers?${params}`);
      setPapers(res.data.items);
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "加载论文失败");
    } finally {
      setLoading(null);
    }
  }, [selectedDir, starFilter]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadDirections();
      void loadReports();
      void loadPromptTemplates();
    });
  }, [loadDirections, loadPromptTemplates, loadReports]);

  useEffect(() => {
    if (!selectedDir) return;
    void Promise.resolve().then(() => {
      void loadPapers();
      void loadReports(selectedDir);
    });
  }, [loadPapers, loadReports, selectedDir]);

  const resetForm = () => {
    setEditingId("");
    setShowForm(false);
    setForm({ name: "", keywords: "", exclude_keywords: "", categories: "cs.AI" });
  };

  const editDirection = (direction: Direction) => {
    setEditingId(direction.id);
    setShowForm(true);
    setForm({
      name: direction.name,
      keywords: (direction.keywords || []).join(", "),
      exclude_keywords: (direction.exclude_keywords || []).join(", "),
      categories: direction.categories?.[0] || "cs.AI",
    });
  };

  const saveDirection = async () => {
    if (!form.name.trim()) return setStatusMsg("请填写研究方向名称");
    const body = {
      name: form.name.trim(),
      keywords: form.keywords.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean),
      exclude_keywords: form.exclude_keywords.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean),
      categories: [form.categories],
    };
    try {
      if (editingId) {
        await api.patch(`/arxiv/directions/${editingId}`, body);
      } else {
        await api.post("/arxiv/directions", body);
      }
      resetForm();
      await loadDirections();
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "保存研究方向失败");
    }
  };

  const deleteDirection = async (directionId: string) => {
    try {
      await api.delete(`/arxiv/directions/${directionId}`);
      if (selectedDir === directionId) setSelectedDir("");
      await loadDirections();
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "删除研究方向失败");
    }
  };

  const fetchLatest = async () => {
    if (!selectedDir) return;
    setStatusMsg("");
    setLoading("fetch");
    try {
      const res = await api.post<{ data: { fetched_count: number; new_count: number }; message: string }>(`/arxiv/directions/${selectedDir}/fetch`);
      setStatusMsg(res.message);
      await loadPapers();
      await loadDirections();
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "拉取论文失败");
    } finally {
      setLoading(null);
    }
  };

  const toggleStar = async (paper: Paper) => {
    await api.patch(`/arxiv/papers/${paper.id}`, { is_starred: !paper.is_starred });
    setPapers((prev) => prev.map((item) => item.id === paper.id ? { ...item, is_starred: !item.is_starred } : item));
  };

  const generateReport = async () => {
    if (!selectedDir) return;
    setStatusMsg("");
    setReportPreview("");
    setReportTaskId("");
    setSelectedReportId("");
    setLoading("report");
    try {
      const res = await api.post<{ data: { task_id: string } }>(`/arxiv/directions/${selectedDir}/daily-report`, {
        report_date: reportDate,
        max_papers: maxPapers,
        model_config_id: modelConfigId || undefined,
        template_id: templateId || undefined,
      });
      for (let i = 0; i < 90; i++) {
        setStatusMsg(`AI 正在生成日报... ${i * 2}s`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const task = await api.get<{ data: { status: string; output: string | null; error_message: string | null } }>(`/tasks/${res.data.task_id}`);
        if (task.data.status === "succeeded" && task.data.output) {
          setReportPreview(task.data.output);
          setReportTaskId(res.data.task_id);
          setStatusMsg("日报已生成");
          setLoading(null);
          await loadReports(selectedDir);
          return;
        }
        if (task.data.status === "failed") {
          setStatusMsg("日报生成失败：" + (task.data.error_message || ""));
          setLoading(null);
          return;
        }
      }
      setStatusMsg("日报生成轮询超时，请稍后到任务列表查看");
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "日报生成请求失败");
    } finally {
      setLoading(null);
    }
  };

  const exportReport = async () => {
    if (!visibleReport) return;
    if (reportTaskId && reportPreview) {
      try {
        await exportTaskMarkdown(reportTaskId);
        return;
      } catch (e: unknown) {
        setStatusMsg(e instanceof Error ? e.message : "统一导出失败，已使用本地导出");
      }
    }
    downloadMarkdown(visibleReport, ["晨枢AI", "arXiv日报", selectedDirection?.name || "未命名方向", reportDate]);
  };

  const paperStats = useMemo(() => [
    ["论文", papers.length],
    ["收藏", starredCount],
    ["最新", latestDate],
  ], [papers.length, starredCount, latestDate]);

  return (
    <div className="max-w-7xl">
      <div className="mb-5">
        <h1 className={`text-xl font-semibold ${t.text}`}>arXiv 论文日报</h1>
        <p className={`mt-1 text-sm ${t.textMuted}`}>维护研究方向，拉取最新论文，筛选后生成中文日报。</p>
      </div>

      {statusMsg && (
        <div className={`mb-4 rounded border px-3 py-2 text-sm ${t.inputBg} ${t.inputBorder} ${t.textMuted}`}>{statusMsg}</div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-5">
        <aside className="space-y-5 min-w-0">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className={`text-sm font-medium ${t.text}`}>研究方向</h2>
              <button onClick={() => showForm ? resetForm() : setShowForm(true)} className={secBtn}>{showForm ? "取消" : "新增"}</button>
            </div>

            {showForm && (
              <div className={`mb-3 rounded border p-3 space-y-2 ${t.border} ${t.card}`}>
                <input className={inp} placeholder="方向名称，如 AI Agent" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <textarea className={`${inp} h-16 resize-none`} placeholder="关键词，可用逗号或换行分隔" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
                <input className={inp} placeholder="排除词，可选" value={form.exclude_keywords} onChange={(e) => setForm({ ...form, exclude_keywords: e.target.value })} />
                <select className={inp} value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })}>
                  {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <button onClick={saveDirection} className={btn}>{editingId ? "更新方向" : "创建方向"}</button>
              </div>
            )}

            {loading === "directions" ? <Spinner text="加载方向..." /> :
             directions.length === 0 ? <EmptyState title="暂无方向" description="先创建一个研究方向" /> : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {directions.map((direction) => (
                  <div key={direction.id} className={`rounded border ${selectedDir === direction.id ? "border-sky-500" : t.border} ${t.card}`}>
                    <button onClick={() => { setSelectedDir(direction.id); setReportPreview(""); setReportTaskId(""); setSelectedReportId(""); }} className="w-full text-left px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-medium truncate ${t.text}`}>{direction.name}</span>
                        <span className={`text-xs ${t.textMuted}`}>{direction.categories?.[0] || ""}</span>
                      </div>
                      <p className={`mt-1 text-xs line-clamp-2 ${t.textMuted}`}>{direction.keywords?.join(", ") || "未设置关键词"}</p>
                    </button>
                    <div className={`flex items-center justify-between border-t px-3 py-1.5 ${t.border}`}>
                      <span className={`text-[11px] ${t.textMuted}`}>{direction.last_run_at ? new Date(direction.last_run_at).toLocaleString("zh-CN") : "未拉取"}</span>
                      <div className="flex gap-2">
                        <button onClick={() => editDirection(direction)} className={`text-xs ${t.accentText}`}>编辑</button>
                        <button onClick={() => deleteDirection(direction.id)} className="text-xs text-red-500">删除</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className={`text-sm font-medium mb-2 ${t.text}`}>历史日报</h2>
            {reports.length === 0 ? (
              <p className={`text-xs ${t.textMuted}`}>暂无历史日报</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {reports.map((report) => (
                  <button
                    key={report.id}
                    onClick={() => { setSelectedReportId(report.id); setReportPreview(""); setReportTaskId(""); }}
                    className={`w-full rounded border px-3 py-2 text-left ${selectedReportId === report.id ? "border-sky-500" : t.border} ${t.card}`}
                  >
                    <p className={`text-xs font-medium line-clamp-2 ${t.text}`}>{report.title}</p>
                    <p className={`mt-1 text-[11px] ${t.textMuted}`}>{report.report_date} · {report.paper_count} 篇</p>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>

        <main className="min-w-0 space-y-5">
          <section className={`border rounded p-4 ${t.border} ${t.card}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className={`text-lg font-semibold ${t.text}`}>{selectedDirection?.name || "请选择研究方向"}</h2>
                <p className={`mt-1 text-sm ${t.textMuted}`}>
                  {selectedDirection ? `${selectedDirection.categories?.join(", ") || "未设置分类"} · ${selectedDirection.keywords?.join(", ") || "未设置关键词"}` : "左侧选择方向后开始拉取论文"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={fetchLatest} disabled={!selectedDir || loading === "fetch"} className={btn}>{loading === "fetch" ? "拉取中..." : "拉取最新论文"}</button>
                <button onClick={() => setStarFilter(!starFilter)} disabled={!selectedDir} className={starFilter ? btn : secBtn}>{starFilter ? "仅看收藏" : "全部论文"}</button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              {paperStats.map(([label, value]) => (
                <div key={label} className={`rounded border px-3 py-2 ${t.inputBg} ${t.inputBorder}`}>
                  <p className={`text-xs ${t.textMuted}`}>{label}</p>
                  <p className={`text-sm font-semibold truncate ${t.text}`}>{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={`border rounded p-4 ${t.border} ${t.card}`}>
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px_160px] gap-3 items-end">
              <ModelSelector value={modelConfigId} onChange={setModelConfigId} />
              <div>
                <label className={`block text-xs mb-1 ${t.textMuted}`}>提示词模板</label>
                <select className={inp} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">内置论文日报模板</option>
                  {promptTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>{tpl.name}{tpl.is_default ? "（默认）" : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={`block text-xs mb-1 ${t.textMuted}`}>论文数量</label>
                <input className={inp} type="number" min={1} max={50} value={maxPapers} onChange={(e) => setMaxPapers(Number(e.target.value))} />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 mt-3">
              <div>
                <label className={`block text-xs mb-1 ${t.textMuted}`}>日报日期</label>
                <input className={inp} type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
              </div>
              <button onClick={generateReport} disabled={!selectedDir || papers.length === 0 || loading === "report"} className={btn}>
                {loading === "report" ? "生成中..." : "生成日报"}
              </button>
              {visibleReport && <button onClick={exportReport} className={secBtn}>导出 MD</button>}
            </div>
          </section>

          <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
            <section className="min-w-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className={`text-sm font-medium ${t.text}`}>论文列表</h2>
                {loading === "papers" && <span className={`text-xs ${t.textMuted}`}>加载中...</span>}
              </div>

              {!selectedDir ? (
                <div className={`flex items-center justify-center h-56 rounded border ${t.border} ${t.textMuted}`}>请选择或创建一个研究方向</div>
              ) : loading === "papers" ? <Spinner text="加载论文..." /> :
               papers.length === 0 ? <EmptyState title="暂无论文" description="点击“拉取最新论文”获取该方向论文" /> : (
                <div className="space-y-3 max-h-[760px] overflow-y-auto pr-1">
                  {papers.map((paper) => (
                    <article key={paper.id} className={`border rounded p-4 ${t.border} ${t.card}`}>
                      <div className="flex items-start gap-3">
                        <button onClick={() => toggleStar(paper)} className={`text-lg leading-none ${paper.is_starred ? "text-amber-400" : t.textMuted}`} title={paper.is_starred ? "取消收藏" : "收藏"}>★</button>
                        <div className="min-w-0 flex-1">
                          <a href={paper.abs_url || "#"} target="_blank" rel="noreferrer" className={`block text-sm font-medium hover:underline ${t.text}`}>{paper.title}</a>
                          <p className={`mt-1 text-xs ${t.textMuted}`}>
                            {(paper.authors || []).slice(0, 4).join(", ") || "未知作者"}
                            {paper.published_at && <span> · {new Date(paper.published_at).toLocaleDateString("zh-CN")}</span>}
                            <span> · {paper.arxiv_id}</span>
                          </p>
                          {paper.categories && <p className="mt-1 text-xs text-sky-500">{paper.categories.join(", ")}</p>}
                          {paper.abstract && <p className={`mt-2 text-xs leading-relaxed line-clamp-4 ${t.textMuted}`}>{paper.abstract}</p>}
                          <div className="flex gap-3 mt-2">
                            {paper.abs_url && <a className={`text-xs ${t.accentText}`} href={paper.abs_url} target="_blank" rel="noreferrer">摘要页</a>}
                            {paper.pdf_url && <a className={`text-xs ${t.accentText}`} href={paper.pdf_url} target="_blank" rel="noreferrer">PDF</a>}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="min-w-0">
              <h2 className={`text-sm font-medium mb-3 ${t.text}`}>日报预览</h2>
              {loading === "report" ? <Spinner text="AI 正在生成日报..." /> :
               visibleReport ? (
                <div className={`border rounded p-4 max-h-[760px] overflow-y-auto ${t.border} ${t.card}`}>
                  <pre className={`text-sm font-mono whitespace-pre-wrap leading-relaxed ${t.text}`}>{visibleReport}</pre>
                </div>
              ) : (
                <div className={`flex items-center justify-center h-56 rounded border ${t.border} ${t.textMuted}`}>生成日报或选择历史日报后在这里预览</div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
