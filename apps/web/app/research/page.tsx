"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import ModelSelector from "@/components/common/ModelSelector";
import Spinner from "@/components/common/Spinner";
import StatusBadge from "@/components/common/StatusBadge";
import { useThemeConfig } from "@/lib/theme";
import { downloadMarkdown, exportTaskMarkdown } from "@/lib/task-export";

interface SourceInfo {
  id: string;
  url: string;
  title: string;
  source_type: string;
  task_id?: string;
  task_title?: string;
  fetch_status: string;
  summary: string | null;
  error_message: string | null;
  raw_text_preview: string;
  raw_text_length: number;
}

interface SourceDetail extends SourceInfo {
  raw_text: string;
  fetched_at: string | null;
}

interface SourcesResponse {
  task_status: string;
  task_error: string | null;
  sources: SourceInfo[];
}

interface PromptItem {
  id: string;
  name: string;
  sub_type: string;
  is_default: boolean;
}

interface BatchJob {
  title: string;
  url: string;
  requirements: string;
  templateId: string;
  modelConfigId: string;
}

interface BatchTask {
  task_id: string;
  title: string;
  url_count: number;
}

interface DiscoveredPage {
  url: string;
  title: string;
  depth: number;
  score: number;
}

const DEFAULT_REQUIREMENTS = "基于来源内容汇总核心事实、关键观点和可验证结论；每个重要结论都标注来源链接；不要编造来源中没有的信息。";
const SOURCE_TYPE_LABELS: Record<string, string> = {
  url: "网页",
  pdf: "PDF",
  json: "JSON",
  rss: "RSS/XML",
  csv: "CSV",
  text: "文本",
};

export default function ResearchPage() {
  const t = useThemeConfig();

  const [mode, setMode] = useState<"single" | "batch" | "site">("single");
  const [urls, setUrls] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [siteKeywords, setSiteKeywords] = useState("");
  const [siteDepth, setSiteDepth] = useState(1);
  const [siteMaxPages, setSiteMaxPages] = useState(10);
  const [autoGenerateSiteReport, setAutoGenerateSiteReport] = useState(false);
  const [requirements, setRequirements] = useState(DEFAULT_REQUIREMENTS);
  const [modelConfigId, setModelConfigId] = useState("");
  const [promptTemplates, setPromptTemplates] = useState<PromptItem[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [activeBatchJobIndex, setActiveBatchJobIndex] = useState(0);
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([{ title: "信息搜集任务 1", url: "", requirements: DEFAULT_REQUIREMENTS, templateId: "", modelConfigId: "" }]);
  const [batchTasks, setBatchTasks] = useState<BatchTask[]>([]);
  const [batchTaskSources, setBatchTaskSources] = useState<Record<string, SourceInfo[]>>({});
  const [discoveredPages, setDiscoveredPages] = useState<DiscoveredPage[]>([]);
  const [taskId, setTaskId] = useState("");
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [sourceDetails, setSourceDetails] = useState<Record<string, SourceDetail>>({});
  const [expandedSourceId, setExpandedSourceId] = useState("");
  const [report, setReport] = useState("");
  const [reportTaskId, setReportTaskId] = useState("");
  const [loading, setLoading] = useState<"crawl" | "report" | null>(null);
  const [refetchingId, setRefetchingId] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const inpClass = `w-full border rounded px-3 py-2 text-sm ${t.inputBg} ${t.inputBorder} ${t.inputText}`;
  const btnClass = `px-4 py-2 text-sm rounded transition-colors disabled:opacity-50 text-white ${t.accent} ${t.accentHover}`;
  const secBtn = `px-4 py-2 text-sm rounded border transition-colors ${t.inputBg} ${t.inputBorder} ${t.textMuted} hover:bg-gray-100 dark:hover:bg-zinc-800`;

  const successfulSources = sources.filter((source) => source.fetch_status === "succeeded");
  const usableSources = successfulSources.filter((source) => source.raw_text_length >= 200);
  const selectedUsableSources = usableSources.filter((source) => selectedSourceIds.includes(source.id));

  const clearActiveResearchView = () => {
    setTaskId("");
    setSources([]);
    setSelectedSourceIds([]);
    setSourceDetails({});
    setExpandedSourceId("");
    setReport("");
    setReportTaskId("");
    setStatusMsg("");
    setDiscoveredPages([]);
    setBatchTaskSources({});
  };

  const handleModeChange = (nextMode: "single" | "batch" | "site") => {
    if (nextMode === mode) return;
    setMode(nextMode);
    clearActiveResearchView();
  };

  useEffect(() => {
    api.get<{ data: { items: PromptItem[] } }>("/prompts?task_type=research&is_active=true")
      .then((res) => {
        const items = [...res.data.items].sort((a, b) => {
          if (a.sub_type === "信息汇总" && b.sub_type !== "信息汇总") return -1;
          if (a.sub_type !== "信息汇总" && b.sub_type === "信息汇总") return 1;
          if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
          return a.name.localeCompare(b.name, "zh-CN");
        });
        setPromptTemplates(items);
        const defaultTemplate = items.find((tpl) => tpl.sub_type === "信息汇总" && tpl.is_default) || items.find((tpl) => tpl.is_default);
        if (defaultTemplate) {
          setTemplateId(defaultTemplate.id);
          setBatchJobs((prev) => prev.map((job) => job.templateId ? job : { ...job, templateId: defaultTemplate.id }));
        }
      })
      .catch(() => {});
  }, []);

  const pollSources = async (tid: string) => {
    for (let i = 0; i < 45; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const res = await api.get<{ data: SourcesResponse }>(`/research/tasks/${tid}/sources`);
        const nextSources = res.data.sources;
        setSources(nextSources);
        const allDone = nextSources.every((source) => source.fetch_status === "succeeded" || source.fetch_status === "failed");
        if (res.data.task_status === "failed") {
          setStatusMsg(res.data.task_error || "所有来源抓取失败");
          setLoading(null);
          return null;
        }
        if (allDone && nextSources.length > 0) {
          setSelectedSourceIds(nextSources.filter((source) => source.fetch_status === "succeeded" && source.raw_text_length >= 200).map((source) => source.id));
          setLoading(null);
          return nextSources;
        }
      } catch {}
    }
    setStatusMsg("抓取轮询超时，请稍后刷新任务查看结果");
    setLoading(null);
    return null;
  };

  const waitForTaskSources = async (tid: string) => {
    for (let i = 0; i < 45; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const res = await api.get<{ data: SourcesResponse }>(`/research/tasks/${tid}/sources`);
        const nextSources = res.data.sources;
        const allDone = nextSources.every((source) => source.fetch_status === "succeeded" || source.fetch_status === "failed");
        if (res.data.task_status === "failed" || (allDone && nextSources.length > 0)) {
          return nextSources;
        }
      } catch {}
    }
    return [];
  };

  const flattenBatchSources = (tasks: BatchTask[], sourceMap: Record<string, SourceInfo[]>) =>
    tasks.flatMap((task) => (sourceMap[task.task_id] || []).map((source) => ({
      ...source,
      task_id: task.task_id,
      task_title: task.title,
    })));

  const handleCrawl = async () => {
    const urlList = urls.split("\n").map((url) => url.trim()).filter(Boolean);
    if (urlList.length === 0) {
      return setStatusMsg("请至少输入一个网页 URL 或 PDF 链接。");
    }
    if (urlList.length > 1) {
      return setStatusMsg("单组来源只支持一个网站；多个网站请使用“批量多任务”。");
    }
    setStatusMsg("");
    setLoading("crawl");
    setSources([]);
    setSelectedSourceIds([]);
    setSourceDetails({});
    setExpandedSourceId("");
    setReport("");
    try {
      const res = await api.post<{ data: { task_id: string; url_count: number } }>("/research/tasks", {
        title: `信息搜集 - ${new Date().toLocaleDateString("zh-CN")}`,
        urls: urlList,
        requirements,
        output_requirements: requirements,
        model_config_id: modelConfigId || undefined,
        template_id: templateId || undefined,
      });
      setTaskId(res.data.task_id);
      await pollSources(res.data.task_id);
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "请求失败");
      setLoading(null);
    }
  };

  const updateBatchJob = (index: number, patch: Partial<BatchJob>) => {
    setBatchJobs((prev) => prev.map((job, idx) => idx === index ? { ...job, ...patch } : job));
  };

  const addBatchJob = () => {
    setBatchJobs((prev) => [...prev, {
      title: `信息搜集任务 ${prev.length + 1}`,
      url: "",
      requirements,
      templateId,
      modelConfigId: "",
    }]);
    setActiveBatchJobIndex(batchJobs.length);
  };

  const removeBatchJob = (index: number) => {
    setBatchJobs((prev) => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index));
    setActiveBatchJobIndex((prev) => Math.max(0, Math.min(prev > index ? prev - 1 : prev, batchJobs.length - 2)));
  };

  const handleBatchCrawl = async () => {
    const jobs = batchJobs
      .map((job) => ({
        title: job.title,
        urls: [job.url.trim()].filter(Boolean),
        requirements: job.requirements || requirements,
        template_id: job.templateId || undefined,
        model_config_id: job.modelConfigId || undefined,
      }))
      .filter((job) => job.urls.length > 0);
    if (jobs.length === 0) {
      return setStatusMsg("请至少配置一个包含 URL 的批量任务。");
    }
    setStatusMsg("");
    setBatchTasks([]);
    setTaskId("");
    setSources([]);
    setSelectedSourceIds([]);
    setSourceDetails({});
    setExpandedSourceId("");
    setReport("");
    setBatchTaskSources({});
    setLoading("crawl");
    try {
      const res = await api.post<{ data: { tasks: BatchTask[]; errors: { index: number; message: string }[] } }>("/research/batch", {
        jobs,
      });
      const tasks = res.data.tasks;
      setBatchTasks(tasks);
      if (res.data.errors.length > 0) {
        setStatusMsg(`部分任务未创建：${res.data.errors.map((item) => `#${item.index} ${item.message}`).join("；")}`);
      }
      const entries = await Promise.all(tasks.map(async (task) => [task.task_id, await waitForTaskSources(task.task_id)] as const));
      const sourceMap = Object.fromEntries(entries);
      const flatSources = flattenBatchSources(tasks, sourceMap);
      setBatchTaskSources(sourceMap);
      setSources(flatSources);
      setSelectedSourceIds(flatSources.filter((source) => source.fetch_status === "succeeded" && source.raw_text_length >= 200).map((source) => source.id));
      setLoading(null);
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "批量任务创建失败");
      setLoading(null);
    }
  };

  const generateReportForTask = async (targetTaskId: string, sourceIds: string[]) => {
    const res = await api.post<{ data: { task_id: string } }>(`/research/tasks/${targetTaskId}/report`, {
      source_ids: sourceIds,
    });
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const taskRes = await api.get<{ data: { status: string; output: string | null; error_message: string | null } }>(`/tasks/${res.data.task_id}`);
      if (taskRes.data.status === "succeeded" && taskRes.data.output) {
        return taskRes.data.output;
      }
      if (taskRes.data.status === "failed") {
        throw new Error(taskRes.data.error_message || "报告生成失败");
      }
    }
    throw new Error("报告生成轮询超时");
  };

  const handleBatchGenerateReports = async () => {
    if (batchTasks.length === 0) {
      return setStatusMsg("请先创建并抓取批量任务。");
    }
    setStatusMsg("");
    setReport("");
    setReportTaskId("");
    setLoading("report");
    try {
      const sections = await Promise.all(batchTasks.map(async (task, index) => {
        const taskSources = batchTaskSources[task.task_id] || await waitForTaskSources(task.task_id);
        const usableIds = taskSources
          .filter((source) => source.fetch_status === "succeeded" && source.raw_text_length >= 200)
          .filter((source) => selectedSourceIds.includes(source.id))
          .map((source) => source.id);
        if (usableIds.length === 0) {
          return `## ${index + 1}. ${task.title}\n\n未找到可用于生成报告的有效来源。`;
        }
        try {
          const output = await generateReportForTask(task.task_id, usableIds);
          return `## ${index + 1}. ${task.title}\n\n${output}`;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : "报告生成失败";
          return `## ${index + 1}. ${task.title}\n\n生成失败：${message}`;
        }
      }));
      setReport(`# 批量信息搜集合并报告\n\n${sections.join("\n\n---\n\n")}`);
      setLoading(null);
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "批量合并报告生成失败");
      setLoading(null);
    }
  };

  const handleSiteSearch = async () => {
    if (!siteUrl.trim()) return setStatusMsg("请输入门户网站、arXiv 首页、证券网站或新闻首页 URL。");
    setStatusMsg("");
    setLoading("crawl");
    setSources([]);
    setSelectedSourceIds([]);
    setSourceDetails({});
    setExpandedSourceId("");
    setReport("");
    setDiscoveredPages([]);
    try {
      const res = await api.post<{ data: { task_id: string; discovered: DiscoveredPage[] } }>("/research/site-search", {
        start_url: siteUrl,
        keywords: siteKeywords,
        max_depth: siteDepth,
        max_pages: siteMaxPages,
        requirements,
        output_requirements: requirements,
        model_config_id: modelConfigId || undefined,
        template_id: mode === "batch" ? undefined : templateId || undefined,
      });
      setTaskId(res.data.task_id);
      setDiscoveredPages(res.data.discovered || []);
      const finalSources = await pollSources(res.data.task_id);
      if (autoGenerateSiteReport) {
        const usableIds = (finalSources || [])
          .filter((source) => source.fetch_status === "succeeded" && source.raw_text_length >= 200)
          .map((source) => source.id);
        if (usableIds.length > 0) {
          await runReport(res.data.task_id, usableIds);
        }
      }
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "站内关键词搜集失败");
      setLoading(null);
    }
  };

  const runReport = async (targetTaskId: string, sourceIds: string[]) => {
    if (sourceIds.length === 0) {
      setStatusMsg("请至少选择一个正文内容足够的来源生成报告。");
      return;
    }
    setStatusMsg("");
    setLoading("report");
    setReportTaskId("");
    try {
      const res = await api.post<{ data: { task_id: string } }>(`/research/tasks/${targetTaskId}/report`, {
        ...(mode === "batch" ? {} : { requirements, output_requirements: requirements }),
        model_config_id: modelConfigId || undefined,
        template_id: mode === "batch" ? undefined : templateId || undefined,
        source_ids: sourceIds,
      });
      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const taskRes = await api.get<{ data: { status: string; output: string | null; error_message: string | null } }>(`/tasks/${res.data.task_id}`);
        if (taskRes.data.status === "succeeded" && taskRes.data.output) {
          setReport(taskRes.data.output);
          setReportTaskId(res.data.task_id);
          setLoading(null);
          return;
        }
        if (taskRes.data.status === "failed") {
          setStatusMsg("报告生成失败: " + (taskRes.data.error_message || ""));
          setLoading(null);
          return;
        }
      }
      setStatusMsg("报告生成轮询超时，请稍后到任务列表查看");
      setLoading(null);
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "请求失败");
      setLoading(null);
    }
  };

  const handleGenerateReport = async () => {
    if (!taskId) return;
    await runReport(taskId, selectedUsableSources.map((source) => source.id));
  };

  const handleRefetch = async (sourceId: string) => {
    setStatusMsg("");
    setRefetchingId(sourceId);
    try {
      await api.post(`/research/sources/${sourceId}/refetch`);
      const batchSource = sources.find((source) => source.id === sourceId && source.task_id);
      if (mode === "batch" && batchSource?.task_id) {
        const res = await api.get<{ data: SourcesResponse }>(`/research/tasks/${batchSource.task_id}/sources`);
        const nextMap = { ...batchTaskSources, [batchSource.task_id]: res.data.sources };
        const flatSources = flattenBatchSources(batchTasks, nextMap);
        setBatchTaskSources(nextMap);
        setSources(flatSources);
        setSelectedSourceIds(flatSources.filter((source) => source.fetch_status === "succeeded" && source.raw_text_length >= 200).map((source) => source.id));
      } else if (taskId) {
        const res = await api.get<{ data: SourcesResponse }>(`/research/tasks/${taskId}/sources`);
        setSources(res.data.sources);
        setSelectedSourceIds(res.data.sources.filter((source) => source.fetch_status === "succeeded" && source.raw_text_length >= 200).map((source) => source.id));
      }
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "重新抓取失败");
    } finally {
      setRefetchingId("");
    }
  };

  const toggleSource = (sourceId: string) => {
    setSelectedSourceIds((prev) => prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId]);
  };

  const handleToggleDetail = async (sourceId: string) => {
    if (expandedSourceId === sourceId) {
      setExpandedSourceId("");
      return;
    }
    setExpandedSourceId(sourceId);
    if (sourceDetails[sourceId]) return;
    try {
      const res = await api.get<{ data: SourceDetail }>(`/research/sources/${sourceId}`);
      setSourceDetails((prev) => ({ ...prev, [sourceId]: res.data }));
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "读取来源详情失败");
    }
  };

  const handleExport = async () => {
    if (!report) return;
    if (reportTaskId && mode !== "batch") {
      try {
        await exportTaskMarkdown(reportTaskId);
        return;
      } catch (e: unknown) {
        setStatusMsg(e instanceof Error ? e.message : "统一导出失败，已使用本地导出");
      }
    }
    const sourceList = mode === "batch"
      ? batchTasks.map((task, index) => `${index + 1}. ${task.title}（${task.url_count} 个来源，任务 ID：${task.task_id}）`).join("\n")
      : sources.map((source, index) => `${index + 1}. ${source.title || source.url} - ${source.url} (${source.fetch_status}, ${source.raw_text_length} 字${selectedSourceIds.includes(source.id) ? "，已纳入报告" : "，未纳入报告"})`).join("\n");
    const text = `# 信息搜集报告\n\n## 输入来源\n\n${sourceList}\n\n---\n\n${report}`;
    const firstSource = selectedUsableSources[0] || usableSources[0] || sources[0];
    const sourceName = firstSource?.title || firstSource?.url || "未命名来源";
    downloadMarkdown(text, ["晨枢AI", mode === "batch" ? "批量信息搜集合并报告" : "信息搜集报告", mode === "batch" ? `${batchTasks.length}个任务` : sourceName]);
  };

  return (
    <div className="max-w-7xl">
      <h1 className={`text-xl font-semibold mb-2 ${t.text}`}>信息搜集与汇总</h1>
      <p className={`text-sm mb-5 ${t.textMuted}`}>输入明确网页或 PDF 链接，抓取正文后选择要纳入报告的来源，再让 AI 基于来源生成报告。</p>

      <div className={`inline-flex mb-5 rounded border p-1 ${t.inputBg} ${t.inputBorder}`}>
        {[
          ["single", "单组来源"],
          ["batch", "批量多任务"],
          ["site", "站内关键词"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => handleModeChange(value as "single" | "batch" | "site")}
            className={`px-3 py-1.5 text-sm rounded ${mode === value ? `${t.accent} text-white` : `${t.textMuted} hover:bg-gray-100 dark:hover:bg-zinc-800`}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] gap-5 mb-6">
        <div className="space-y-4 min-w-0">
          {mode === "single" && (
            <div>
              <label className={`block text-xs mb-1 ${t.textMuted}`}>网站 URL / PDF / JSON / RSS 链接（仅一个）</label>
              <textarea
                className={`${inpClass} h-20 resize-none`}
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="https://arxiv.org/abs/2605.12481"
              />
            </div>
          )}

          {mode === "site" && (
            <div className="space-y-3">
              <div>
                <label className={`block text-xs mb-1 ${t.textMuted}`}>起始网站 URL</label>
                <input className={inpClass} value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://arxiv.org/ 或 https://news.qq.com/" />
              </div>
              <div>
                <label className={`block text-xs mb-1 ${t.textMuted}`}>站内关键词（可选，可用逗号或换行分隔）</label>
                <textarea className={`${inpClass} h-20 resize-none`} value={siteKeywords} onChange={(e) => setSiteKeywords(e.target.value)} placeholder="留空时默认搜集站内关键、有用的信息&#10;英伟达&#10;量化交易" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs mb-1 ${t.textMuted}`}>点击深度</label>
                  <input className={inpClass} type="number" min={0} max={3} value={siteDepth} onChange={(e) => setSiteDepth(Number(e.target.value))} />
                </div>
                <div>
                  <label className={`block text-xs mb-1 ${t.textMuted}`}>最多页面</label>
                  <input className={inpClass} type="number" min={1} max={30} value={siteMaxPages} onChange={(e) => setSiteMaxPages(Number(e.target.value))} />
                </div>
              </div>
              <label className={`flex items-center gap-2 text-xs ${t.textMuted}`}>
                <input type="checkbox" checked={autoGenerateSiteReport} onChange={(e) => setAutoGenerateSiteReport(e.target.checked)} className="accent-sky-500" />
                抓取完成后自动生成报告
              </label>
            </div>
          )}

          {mode === "batch" && (
            <div className="space-y-3">
              <div className={`text-xs ${t.textMuted}`}>每个标签页是一个独立搜集任务。先并行搜集全部来源，确认右侧来源后，再在底部生成合并报告。</div>
              <div className="flex flex-wrap gap-2">
                {batchJobs.map((job, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveBatchJobIndex(index)}
                    className={`px-3 py-1.5 text-xs rounded border ${activeBatchJobIndex === index ? `${t.accent} text-white border-transparent` : `${t.inputBg} ${t.inputBorder} ${t.textMuted}`}`}
                    title={job.title}
                  >
                    任务 {index + 1}
                  </button>
                ))}
                <button onClick={addBatchJob} className={secBtn}>新增</button>
              </div>
              {batchJobs[activeBatchJobIndex] && (
                <div className={`border rounded p-3 ${t.border}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <input className={inpClass} value={batchJobs[activeBatchJobIndex].title} onChange={(e) => updateBatchJob(activeBatchJobIndex, { title: e.target.value })} />
                    <button className={secBtn} onClick={() => removeBatchJob(activeBatchJobIndex)} disabled={batchJobs.length <= 1}>删除</button>
                  </div>
                  <input className={`${inpClass} mb-2`} value={batchJobs[activeBatchJobIndex].url} onChange={(e) => updateBatchJob(activeBatchJobIndex, { url: e.target.value })} placeholder="这个任务的网站 URL / PDF / JSON / RSS" />
                  <ModelSelector value={batchJobs[activeBatchJobIndex].modelConfigId} onChange={(value) => updateBatchJob(activeBatchJobIndex, { modelConfigId: value })} />
                  <select className={`${inpClass} mt-2 mb-2`} value={batchJobs[activeBatchJobIndex].templateId} onChange={(e) => updateBatchJob(activeBatchJobIndex, { templateId: e.target.value })}>
                    <option value="">内置严谨汇总模板</option>
                    {promptTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>{tpl.name}{tpl.is_default ? "（默认）" : ""}{tpl.sub_type ? ` / ${tpl.sub_type}` : ""}</option>
                    ))}
                  </select>
                  <textarea className={`${inpClass} h-20 resize-none`} value={batchJobs[activeBatchJobIndex].requirements} onChange={(e) => updateBatchJob(activeBatchJobIndex, { requirements: e.target.value })} placeholder="这个任务的输出要求" />
                </div>
              )}
              {batchTasks.length > 0 && (
                <div className={`border rounded ${t.border}`}>
                  {batchTasks.map((task) => (
                    <div key={task.task_id} className={`flex items-center justify-between gap-2 px-3 py-2 border-b last:border-b-0 ${t.border}`}>
                      <span className={`text-sm truncate ${t.text}`}>{task.title}（{task.url_count} 个来源）</span>
                      <span className={`text-xs ${t.textMuted}`}>{(batchTaskSources[task.task_id] || []).length} 个抓取结果</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {mode !== "batch" && <div>
            <label className={`block text-xs mb-1 ${t.textMuted}`}>输出要求</label>
            <textarea
              className={`${inpClass} h-24 resize-none`}
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
            />
          </div>}
          {mode !== "batch" && <ModelSelector value={modelConfigId} onChange={setModelConfigId} />}
          {mode !== "batch" && <div>
            <label className={`block text-xs mb-1 ${t.textMuted}`}>提示词模板</label>
            <select className={inpClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">内置严谨汇总模板</option>
              {promptTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}{tpl.is_default ? "（默认）" : ""}{tpl.sub_type ? ` / ${tpl.sub_type}` : ""}</option>
              ))}
            </select>
            <p className={`mt-1 text-xs ${t.textMuted}`}>自定义模板会自动追加搜集要求和来源内容，推荐在模板里使用 {"{requirements}"} 和 {"{sources}"}。</p>
            {promptTemplates.length === 0 && (
              <a href="/settings/prompts" className={`mt-1 block text-xs ${t.accentText}`}>去提示词模板中新建 research / 信息汇总 模板</a>
            )}
          </div>}
          {statusMsg && <div className="p-2 border border-red-300 dark:border-red-800 rounded bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400">{statusMsg}</div>}
          <div className="flex flex-wrap gap-2">
            <button onClick={mode === "batch" ? handleBatchCrawl : mode === "site" ? handleSiteSearch : handleCrawl} disabled={loading === "crawl"} className={btnClass}>
              {loading === "crawl" ? "抓取中..." : mode === "batch" ? "创建批量任务" : mode === "site" ? "开始站内搜集" : "开始搜集"}
            </button>
            {mode !== "batch" && usableSources.length > 0 && (
              <button onClick={handleGenerateReport} disabled={loading === "report"} className={btnClass}>
                {loading === "report" ? "生成中..." : `生成报告（${selectedUsableSources.length} 个来源）`}
              </button>
            )}
          </div>
        </div>

        <div className="min-w-0">
          {mode === "site" && discoveredPages.length > 0 && (
            <div className={`mb-3 border rounded ${t.border}`}>
              <div className={`px-3 py-2 text-xs border-b ${t.border} ${t.textMuted}`}>已发现 {discoveredPages.length} 个相关页面</div>
              <div className="max-h-32 overflow-auto">
                {discoveredPages.map((page) => (
                  <a key={page.url} href={page.url} target="_blank" rel="noreferrer" className={`block px-3 py-2 text-xs border-b last:border-b-0 truncate ${t.border} ${t.text} hover:underline`}>
                    深度 {page.depth} / 命中 {page.score}：{page.title || page.url}
                  </a>
                ))}
              </div>
            </div>
          )}
          {loading === "crawl" && sources.length === 0 ? <Spinner text="正在抓取网页..." /> :
           sources.length === 0 ? (
            <div className={`flex items-center justify-center h-48 text-sm border rounded-lg ${t.border} ${t.textMuted}`}>
              {mode === "batch" ? "创建批量任务后，点击某个任务的“查看”来检查来源" : mode === "site" ? "输入起始网站和关键词后点击“开始站内搜集”" : "输入 URL 或 PDF 链接后点击“开始搜集”"}
            </div>
          ) : (
            <div className={`border rounded-lg overflow-hidden ${t.border}`}>
              <div className="max-h-[560px] overflow-auto">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-10" />
                  <col />
                  <col className="w-16" />
                  <col className="w-20" />
                  <col className="w-16" />
                </colgroup>
                <thead>
                  <tr className={`border-b ${t.tableHeader} ${t.border}`}>
                    <th className={`text-left px-3 py-2 text-xs font-medium ${t.textMuted} w-10`}>选</th>
                    <th className={`text-left px-3 py-2 text-xs font-medium ${t.textMuted}`}>来源</th>
                    <th className={`text-left px-3 py-2 text-xs font-medium ${t.textMuted} w-20`}>正文</th>
                    <th className={`text-left px-3 py-2 text-xs font-medium ${t.textMuted} w-20`}>状态</th>
                    <th className={`text-right px-3 py-2 text-xs font-medium ${t.textMuted} w-16`}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((source) => (
                    <tr key={source.id} className={`border-b align-top ${t.border} ${t.tableRowHover}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedSourceIds.includes(source.id)}
                          disabled={source.fetch_status !== "succeeded" || source.raw_text_length < 200}
                          onChange={() => toggleSource(source.id)}
                          className="accent-sky-500"
                        />
                      </td>
                      <td className="px-3 py-2 min-w-0 overflow-hidden">
                        {source.task_title && <p className={`mb-1 text-[11px] ${t.accentText}`}>{source.task_title}</p>}
                        <a href={source.url} target="_blank" title={source.title || source.url} className={`block truncate text-sm ${t.text} hover:underline`} rel="noreferrer">
                          {source.title || source.url.slice(0, 80)}
                        </a>
                        <p className={`text-xs mt-1 line-clamp-2 break-all ${t.textMuted}`}>{SOURCE_TYPE_LABELS[source.source_type] || source.source_type || "网页"} · {source.url}</p>
                        {source.raw_text_preview && <p className={`text-xs mt-1 line-clamp-3 break-words ${t.textMuted}`}>{source.raw_text_preview}</p>}
                        {source.error_message && <p className="text-xs text-red-500 mt-1 line-clamp-3 break-words">{source.error_message}</p>}
                        {expandedSourceId === source.id && (
                          <pre className={`mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded border p-2 text-xs ${t.inputBg} ${t.border} ${t.text}`}>
                            {sourceDetails[source.id]?.raw_text || "正在读取来源正文..."}
                          </pre>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-xs whitespace-nowrap ${source.raw_text_length >= 200 ? t.textMuted : "text-amber-500"}`}>
                        {source.raw_text_length} 字
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={source.fetch_status} /></td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <button onClick={() => handleToggleDetail(source.id)} className={`text-xs ${t.accentText}`}>
                            {expandedSourceId === source.id ? "收起" : "查看"}
                          </button>
                          <button
                            onClick={() => handleRefetch(source.id)}
                            disabled={refetchingId === source.id}
                            className={`text-xs disabled:opacity-50 ${t.accentText}`}
                          >
                            {refetchingId === source.id ? "重抓中" : "重抓"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs border-t ${t.border} ${t.textMuted}`}>
                <span>成功 {successfulSources.length} 个，可用于报告 {usableSources.length} 个，已选择 {selectedUsableSources.length} 个。少于 200 字的来源不会进入报告。</span>
                {mode === "batch" && usableSources.length > 0 && (
                  <button onClick={handleBatchGenerateReports} disabled={loading === "report"} className={btnClass}>
                    {loading === "report" ? "合并生成中..." : `下一步：生成合并报告（${selectedUsableSources.length} 个来源）`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {report && (
        <div className={`border rounded-lg p-5 ${t.border} ${t.card}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-lg font-semibold ${t.text}`}>汇总报告</h3>
            <button onClick={handleExport} className={secBtn}>导出 MD</button>
          </div>
          <pre className={`text-sm font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto ${t.text}`}>{report}</pre>
        </div>
      )}

      {loading === "report" && <Spinner text="AI 正在基于来源生成汇总报告..." />}
    </div>
  );
}
