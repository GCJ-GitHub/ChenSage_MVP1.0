"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useThemeConfig } from "@/lib/theme";

interface ModelConfig {
  id: string; model_name: string; display_name: string | null;
  is_default: boolean; is_enabled: boolean;
  extra_params: { temperature?: number; max_tokens?: number; thinking_mode?: string } | null;
}

interface Props { value: string; onChange: (id: string) => void; className?: string; }

export default function ModelSelector({ value, onChange, className = "" }: Props) {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const t = useThemeConfig();

  useEffect(() => {
    api.get<{ data: { items: ModelConfig[] } }>("/models")
      .then((r) => setModels(r.data.items))
      .catch(() => {});
  }, []);

  const selected = models.find((m) => m.id === value);
  const params = selected?.extra_params;

  return (
    <div className={`space-y-1 ${className}`}>
      <label className={`block text-xs ${t.textMuted}`}>模型</label>
      <select className={`w-full border rounded px-3 py-2 text-sm ${t.inputBg} ${t.inputBorder} ${t.inputText}`}
        value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">自动（使用默认）</option>
        {models.filter((m) => m.is_enabled).map((m) => (
          <option key={m.id} value={m.id}>{m.display_name || m.model_name} ({m.model_name})</option>
        ))}
      </select>
      {params && (
        <div className={`flex gap-2 text-xs ${t.textMuted}`}>
          {params.thinking_mode && <span>思考: {params.thinking_mode}</span>}
          {params.temperature !== undefined && <span>Temp: {params.temperature}</span>}
          {params.max_tokens && <span>Tokens: {params.max_tokens}</span>}
        </div>
      )}
      {value === "" && <p className={`text-xs ${t.textMuted}`}>前往「模型设置」添加更多模型配置</p>}
    </div>
  );
}
