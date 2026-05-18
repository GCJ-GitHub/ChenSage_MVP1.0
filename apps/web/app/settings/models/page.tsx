"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import StatusBadge from "@/components/common/StatusBadge";
import { useThemeConfig } from "@/lib/theme";

interface ModelConfig {
  id: string; provider: string; base_url: string; model_name: string;
  display_name: string | null; is_default: boolean; is_enabled: boolean;
  last_test_status: string | null;
  extra_params: { temperature?: number; max_tokens?: number; thinking_mode?: string } | null;
}

const THINKING_MODES = [
  { value: "auto", label: "自动" }, { value: "fast", label: "快速" }, { value: "deep", label: "深度" },
];
const MODEL_PRESETS = [
  { label: "DeepSeek Chat", model: "deepseek-chat", mode: "auto", temp: 0.7, tokens: 4096 },
  { label: "DeepSeek Reasoner", model: "deepseek-reasoner", mode: "deep", temp: 1.0, tokens: 8192 },
];

interface ModelForm {
  provider: string;
  base_url: string;
  api_key: string;
  model_name: string;
  display_name: string;
  temperature: number;
  max_tokens: number;
  thinking_mode: string;
}

const initialForm: ModelForm = {
  provider: "",
  base_url: "",
  api_key: "",
  model_name: "",
  display_name: "",
  temperature: 0.7,
  max_tokens: 4096,
  thinking_mode: "auto",
};

const MODEL_TEXT_FIELDS: { key: keyof Pick<ModelForm, "provider" | "base_url" | "api_key" | "model_name" | "display_name">; label: string; type?: string; placeholder?: string }[] = [
  { key: "provider", label: "Provider" },
  { key: "base_url", label: "Base URL" },
  { key: "api_key", label: "API Key", type: "password", placeholder: "sk-..." },
  { key: "model_name", label: "模型名称" },
  { key: "display_name", label: "显示名称" },
];

export default function ModelSettingsPage() {
  const t = useThemeConfig();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ModelForm>(initialForm);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  const load = () => {
    api.get<{ data: { items: ModelConfig[] } }>("/models").then((r) => setModels(r.data.items)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    await api.post("/models", form);
    setForm(initialForm);
    setShowForm(false); load();
  };
  const handleTest = async (id: string) => {
    const r = await api.post<{ data: { status: string; message: string } }>(`/models/${id}/test`);
    setTestResult((p) => ({ ...p, [id]: r.data.status === "success" ? "连接成功" : r.data.message })); load();
  };
  const handleDelete = async (id: string) => { if (confirm("确认删除？")) { await api.delete(`/models/${id}`); load(); } };
  const handleDefault = async (id: string) => { await api.patch(`/models/${id}`, { is_default: true }); load(); };

  const inpClass = `w-full border rounded px-3 py-2 text-sm ${t.inputBg} ${t.inputBorder} ${t.inputText}`;
  const btnClass = `px-4 py-2 text-sm rounded transition-colors disabled:opacity-50 text-white ${t.accent} ${t.accentHover}`;
  const secBtn = `px-3 py-1.5 text-xs rounded border transition-colors ${t.inputBorder} ${t.textMuted} hover:bg-gray-100 dark:hover:bg-zinc-800`;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className={`text-xl font-semibold ${t.text}`}>模型设置</h1>
        <button onClick={() => setShowForm(!showForm)} className={secBtn}>{showForm ? "取消" : "添加模型"}</button>
      </div>

      {showForm && (
        <div className={`border rounded-lg p-5 mb-6 space-y-4 ${t.border} ${t.card}`}>
          <div className="flex gap-2">
            {MODEL_PRESETS.map((p) => (
              <button key={p.model} onClick={() => setForm({ ...form, model_name: p.model, temperature: p.temp, max_tokens: p.tokens, thinking_mode: p.mode, display_name: p.label })}
                className={`px-3 py-1.5 text-xs rounded border transition-colors ${form.model_name === p.model ? "border-sky-500 bg-sky-500/10 text-sky-500" : `${t.inputBorder} ${t.textMuted} hover:border-zinc-400`}`}>{p.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {MODEL_TEXT_FIELDS.map((field) => (
              <div key={field.key}>
                <label className={`block text-xs mb-1 ${t.textMuted}`}>{field.label}</label>
                <input type={field.type || "text"} className={inpClass} value={form[field.key]} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} placeholder={field.placeholder || ""} />
              </div>
            ))}
            <div>
              <label className={`block text-xs mb-1 ${t.textMuted}`}>思考模式</label>
              <select className={inpClass} value={form.thinking_mode} onChange={(e) => setForm({ ...form, thinking_mode: e.target.value })}>
                {THINKING_MODES.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
              </select>
            </div>
            <div>
              <label className={`block text-xs mb-1 ${t.textMuted}`}>Temperature ({form.temperature})</label>
              <input type="range" min="0" max="2" step="0.1" className="w-full accent-sky-500" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })} />
            </div>
            <div>
              <label className={`block text-xs mb-1 ${t.textMuted}`}>Max Tokens</label>
              <input type="number" className={inpClass} value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) || 4096 })} min={1} max={131072} />
            </div>
          </div>
          <button onClick={handleCreate} className={btnClass}>保存配置</button>
        </div>
      )}

      {models.length === 0 ? (
        <p className={`text-sm py-8 text-center ${t.textMuted}`}>暂无模型配置</p>
      ) : (
        <div className="space-y-3">
          {models.map((m) => {
            const p = m.extra_params || {};
            return (
              <div key={m.id} className={`border rounded-lg p-4 ${t.border} ${t.card}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className={`font-medium ${t.text}`}>{m.display_name || m.model_name}</span>
                    <span className={`text-xs ${t.textMuted}`}>{m.provider} / {m.model_name}</span>
                    {m.is_default && <span className="text-xs bg-sky-500/20 text-sky-500 px-1.5 py-0.5 rounded">默认</span>}
                    {p.thinking_mode && <span className={`text-xs ${t.textMuted}`}>思考: {THINKING_MODES.find((x) => x.value === p.thinking_mode)?.label || p.thinking_mode}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {testResult[m.id] && <span className={`text-xs ${t.textMuted}`}>{testResult[m.id]}</span>}
                    <StatusBadge status={m.last_test_status || (m.is_enabled ? "connected" : "unconfigured")} />
                  </div>
                </div>
                <div className={`flex items-center gap-1 text-xs ${t.textMuted}`}>
                  <span>Temp: {p.temperature ?? "—"}</span><span className="mx-1">|</span>
                  <span>Tokens: {p.max_tokens ?? "—"}</span>
                  {!m.is_default && (<><span className="mx-1">|</span><button onClick={() => handleDefault(m.id)} className={`${t.accentText} hover:underline`}>设为默认</button></>)}
                  <span className="mx-1">|</span><button onClick={() => handleTest(m.id)} className="hover:text-gray-700 dark:hover:text-zinc-200">测试</button>
                  <span className="mx-1">|</span><button onClick={() => handleDelete(m.id)} className="text-red-500 hover:text-red-400">删除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
