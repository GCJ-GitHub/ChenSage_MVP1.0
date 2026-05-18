"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api-client";
import StatusBadge from "@/components/common/StatusBadge";
import { useThemeConfig } from "@/lib/theme";
import { exportTaskMarkdown } from "@/lib/task-export";

interface Task {
  id: string;
  type: string;
  title: string;
  status: string;
  description: string | null;
  input: Record<string, unknown>;
  output: string | null;
  error_message: string | null;
  model_config_id: string | null;
  model_name: string | null;
  elapsed_ms: number | null;
  created_at: string;
  updated_at: string;
  files?: { id: string; name: string; parse_status: string }[];
}

interface ModelConfig {
  id: string;
  model_name: string;
  display_name: string | null;
  is_default: boolean;
}

export default function TaskDetailPage() {
  const params = useParams();
  const t = useThemeConfig();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const streamRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api.get<{ data: Task }>(`/tasks/${params.id}`)
      .then((r) => setTask(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
    api.get<{ data: { items: ModelConfig[] } }>("/models")
      .then((r) => setModels(r.data.items))
      .catch(() => {});
  }, [params.id]);

  const handleRun = async () => {
    if (!task) return;
    await api.post(`/tasks/${task.id}/run`, { stream: true });

    setStreaming(true);
    setStreamText("");
    task.status = "running";
    setTask({ ...task });

    // Start SSE stream
    const controller = new AbortController();
    streamRef.current = controller;

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
      const resp = await fetch(`${baseUrl}/tasks/${task.id}/events`, {
        signal: controller.signal,
      });

      if (!resp.body) return;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.event === "delta") {
              setStreamText((prev) => prev + (data.text || ""));
            } else if (data.event === "done") {
              setStreaming(false);
              refreshTask();
            } else if (data.event === "error") {
              setStreamText((prev) => prev + "\n\n**错误**: " + data.message);
              setStreaming(false);
              refreshTask();
            }
          } catch {}
        }
      }
    } catch (e) {
      setStreamText((prev) => prev + "\n\n**错误**: " + (e instanceof Error ? e.message : "流式连接失败"));
      setStreaming(false);
      refreshTask();
    }
  };

  const refreshTask = () => {
    api.get<{ data: Task }>(`/tasks/${params.id}`)
      .then((r) => setTask(r.data))
      .catch(console.error);
  };

  const handleRetry = async () => {
    if (!task) return;
    await api.post(`/tasks/${task.id}/retry`);
    refreshTask();
  };

  const handleExport = async () => {
    if (!task) return;
    try {
      await exportTaskMarkdown(task.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "导出失败");
    }
  };

  const handleModelChange = async (modelConfigId: string) => {
    if (!task) return;
    await api.patch(`/tasks/${task.id}`, { model_config_id: modelConfigId });
    refreshTask();
  };

  if (loading) return <p className={`text-sm ${t.textMuted}`}>加载中...</p>;
  if (!task) return <p className="text-sm text-rose-500">任务不存在</p>;

  const displayOutput = streaming ? (streamText || "思考中...") : task.output;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1">
          <h1 className={`text-xl font-semibold ${t.text}`}>{task.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-sm ${t.textMuted}`}>{task.type}</span>
            <StatusBadge status={task.status} />
            <span className={`text-xs ${t.textMuted}`}>{new Date(task.created_at).toLocaleString("zh-CN")}</span>
            {task.model_name && <span className={`text-xs border rounded px-1.5 py-0.5 ${t.textMuted} ${t.border}`}>{task.model_name}</span>}
            {task.elapsed_ms != null && <span className={`text-xs ${t.textMuted}`}>耗时 {(task.elapsed_ms / 1000).toFixed(1)}s</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {/* Model selector */}
          {models.length > 0 && (
            <select
              className={`border rounded px-3 py-1.5 text-xs ${t.inputBg} ${t.inputBorder} ${t.inputText}`}
              value={task.model_config_id || ""}
              onChange={(e) => handleModelChange(e.target.value)}
            >
              <option value="">选择模型</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.display_name || m.model_name}</option>
              ))}
            </select>
          )}

          {task.status === "draft" && (
            <button onClick={handleRun} className={`px-4 py-2 text-sm rounded transition-colors text-white ${t.accent} ${t.accentHover}`}>
              开始执行
            </button>
          )}
          {task.status === "failed" && (
            <button onClick={handleRetry} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded transition-colors">
              重试
            </button>
          )}
          {task.status === "succeeded" && (
            <button onClick={handleRun} className={`px-4 py-2 text-sm rounded border transition-colors ${t.inputBg} ${t.inputBorder} ${t.text}`}>
              重新生成
            </button>
          )}
          <button onClick={handleExport} className={`px-4 py-2 text-sm rounded border transition-colors ${t.inputBg} ${t.inputBorder} ${t.text}`}>
            导出
          </button>
        </div>
      </div>

      {task.description && (
        <div className={`mb-4 p-3 border rounded text-sm ${t.border} ${t.card} ${t.textMuted}`}>
          {task.description}
        </div>
      )}

      {task.error_message && !streaming && (
        <div className="mb-4 p-3 border border-rose-300 dark:border-rose-800 rounded bg-rose-50 dark:bg-rose-950/30 text-sm text-rose-700 dark:text-rose-300">
          {task.error_message}
        </div>
      )}

      {task.files && task.files.length > 0 && (
        <div className="mb-4 flex gap-2 flex-wrap">
          {task.files.map((f) => (
            <span key={f.id} className={`px-2 py-1 border rounded text-xs ${t.border} ${t.textMuted}`}>
              {f.name}
            </span>
          ))}
        </div>
      )}

      <div className={`border rounded-lg p-5 min-h-48 ${t.border} ${t.card}`}>
        <h2 className={`text-sm font-medium mb-3 ${t.textMuted}`}>输出结果</h2>
        {streaming && !streamText && (
          <p className={`text-sm animate-pulse ${t.textMuted}`}>模型思考中...</p>
        )}
        {displayOutput ? (
          <pre className={`text-sm whitespace-pre-wrap font-mono leading-relaxed max-h-[60vh] overflow-y-auto ${t.text}`}>
            {displayOutput}
            {streaming && <span className="inline-block w-2 h-4 bg-cyan-400 animate-pulse ml-0.5" />}
          </pre>
        ) : (
          <p className={`text-sm ${t.textMuted}`}>
            {task.status === "draft" ? "点击「开始执行」让 AI 生成结果" :
             task.status === "queued" ? "等待执行中..." :
             task.status === "running" ? "生成中..." :
             "暂无输出"}
          </p>
        )}
      </div>
    </div>
  );
}
