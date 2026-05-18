"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api-client";
import ModelSelector from "@/components/common/ModelSelector";
import Spinner from "@/components/common/Spinner";
import { useThemeConfig } from "@/lib/theme";
import { downloadMarkdown, exportTaskMarkdown } from "@/lib/task-export";

interface PromptItem { id: string; name: string; }

interface TypeConfig {
  id: string; label: string; icon: string;
  fields: { key: string; label: string; placeholder: string; rows?: number }[];
}

const CONTENT_TYPES: TypeConfig[] = [
  { id: "论文草稿", label: "论文", icon: "▣", fields: [
    { key: "topic", label: "研究主题", placeholder: "研究课题名称..." },
    { key: "structure", label: "结构要求", placeholder: "摘要/引言/方法/实验/结论..." },
    { key: "materials", label: "参考资料", placeholder: "已有文献、数据集、实验结果..." },
    { key: "style", label: "风格", placeholder: "学术严谨/综述性..." },
  ]},
  { id: "专利草稿", label: "专利", icon: "◈", fields: [
    { key: "topic", label: "技术方案名称", placeholder: "发明名称..." },
    { key: "innovation", label: "创新点", placeholder: "与现有技术相比的创新之处..." },
    { key: "scenario", label: "应用场景", placeholder: "技术可应用的领域和场景..." },
    { key: "tech_details", label: "技术细节", placeholder: "实现方式、架构、算法等..." },
  ]},
  { id: "小说", label: "小说", icon: "◆", fields: [
    { key: "topic", label: "题材/主题", placeholder: "都市/奇幻/科幻/历史..." },
    { key: "characters", label: "人物设定", placeholder: "主角、配角的人设和关系..." },
    { key: "world", label: "世界观", placeholder: "故事背景、时代、规则..." },
    { key: "style", label: "风格", placeholder: "温暖/悬疑/热血/幽默..." },
  ]},
  { id: "剧本", label: "剧本", icon: "◇", fields: [
    { key: "topic", label: "题材/类型", placeholder: "电影/电视剧/话剧..." },
    { key: "characters", label: "角色设定", placeholder: "主要角色的性格和关系..." },
    { key: "scenes", label: "场景/冲突", placeholder: "主要场景和冲突点..." },
    { key: "style", label: "风格", placeholder: "轻快/沉重/戏剧化..." },
  ]},
  { id: "歌词", label: "歌词", icon: "♫", fields: [
    { key: "topic", label: "主题/情绪", placeholder: "爱情/励志/怀旧/愤怒..." },
    { key: "rhyme_style", label: "押韵要求", placeholder: "单押/双押/自由..." },
    { key: "structure", label: "结构", placeholder: "主歌-副歌-主歌-桥段-副歌..." },
    { key: "style", label: "风格", placeholder: "流行/说唱/民谣/古风..." },
  ]},
  { id: "小红书", label: "小红书", icon: "♡", fields: [
    { key: "topic", label: "主题", placeholder: "分享的主题..." },
    { key: "audience", label: "目标受众", placeholder: "学生/职场人/宝妈/数码控..." },
    { key: "tone", label: "口吻", placeholder: "种草力强/真实分享/专业测评..." },
    { key: "tags", label: "标签", placeholder: "用逗号分隔的标签..." },
  ]},
  { id: "知乎", label: "知乎", icon: "?", fields: [
    { key: "topic", label: "问题", placeholder: "要回答的问题..." },
    { key: "viewpoint", label: "核心观点", placeholder: "你的立场和核心论点..." },
    { key: "evidence", label: "论据", placeholder: "支撑观点的数据、案例、引用..." },
    { key: "style", label: "风格", placeholder: "理性分析/讲故事/硬核科普..." },
  ]},
  { id: "公众号", label: "公众号", icon: "✉", fields: [
    { key: "topic", label: "选题", placeholder: "文章的选题..." },
    { key: "audience", label: "读者画像", placeholder: "目标读者群体的画像..." },
    { key: "structure", label: "期望结构", placeholder: "开场+观点1+观点2+总结..." },
    { key: "style", label: "风格", placeholder: "有温度/犀利/深度长文..." },
  ]},
];

const REWRITE_TYPES = [
  { id: "polish", label: "润色", icon: "✨" },
  { id: "expand", label: "扩写", icon: "⤢" },
  { id: "shorten", label: "缩写", icon: "⤡" },
  { id: "change_style", label: "改风格", icon: "↻" },
  { id: "platform_adapt", label: "平台适配", icon: "⊡" },
];

export default function ContentPage() {
  const t = useThemeConfig();
  const [typeIdx, setTypeIdx] = useState(7); // default: 公众号
  const ct = CONTENT_TYPES[typeIdx];

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [availableFiles, setAvailableFiles] = useState<{ id: string; original_name: string }[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [modelConfigId, setModelConfigId] = useState("");
  const [promptTemplates, setPromptTemplates] = useState<PromptItem[]>([]);
  const [templateId, setTemplateId] = useState("");

  const [outline, setOutline] = useState("");
  const [draft, setDraft] = useState("");
  const [outlineTaskId, setOutlineTaskId] = useState("");
  const [draftTaskId, setDraftTaskId] = useState("");
  const [loading, setLoading] = useState<"outline" | "draft" | "rewrite" | null>(null);
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    api.get<{ data: { items: { id: string; original_name: string; parse_status: string }[] } }>("/files?parse_status=parsed")
      .then((r) => setAvailableFiles(r.data.items.filter((f) => f.parse_status === "parsed")))
      .catch(() => {});
  }, []);

  // 当类型变化时，重新拉取对应的模板
  useEffect(() => {
    const sub = CONTENT_TYPES[typeIdx].id;
    api.get<{ data: { items: { id: string; name: string }[] } }>(`/prompts?task_type=content&sub_type=${encodeURIComponent(sub)}&is_active=true`)
      .then((r) => {
        if (r.data.items.length > 0) {
          setPromptTemplates(r.data.items);
        } else {
          // 没有细分模板就拉通用的
          api.get<{ data: { items: { id: string; name: string }[] } }>("/prompts?task_type=content&is_active=true")
            .then((r2) => setPromptTemplates(r2.data.items))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [typeIdx]);

  const handleTypeChange = (idx: number) => {
    setTypeIdx(idx);
    setFormValues({});
    setOutline("");
    setDraft("");
    setOutlineTaskId("");
    setDraftTaskId("");
    setTemplateId("");
  };

  const pollTask = async (taskId: string, setter: (t: string) => void, done: () => void) => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const r = await api.get<{ data: { status: string; output: string | null; error_message: string | null } }>(`/tasks/${taskId}`);
        if (r.data.status === "succeeded" && r.data.output) { setter(r.data.output); done(); return; }
        if (r.data.status === "failed") { setStatusMsg("失败: " + (r.data.error_message || "未知")); done(); return; }
      } catch {}
    }
    setStatusMsg("超时"); done();
  };

  const toPromptVars = (): Record<string, string> => {
    const v: Record<string, string> = {};
    for (const f of ct.fields) v[f.key] = formValues[f.key] || "";
    return v;
  };

  const handleOutline = async () => {
    const vars = toPromptVars();
    if (!vars.topic?.trim()) return setStatusMsg("请填写主题");
    setStatusMsg(""); setLoading("outline");
    try {
      const r = await api.post<{ data: { task_id: string } }>("/content/outline", {
        content_type: ct.id, topic: vars.topic, style: vars.style || "", length: "medium",
        materials: Object.entries(vars).filter(([k]) => k !== "topic").map(([k, v]) => `**${ct.fields.find(f => f.key === k)?.label}**: ${v}`).join("\n\n"),
        file_ids: selectedFileIds, model_config_id: modelConfigId || undefined,
        template_id: templateId || undefined,
      });
      setOutlineTaskId(r.data.task_id);
      pollTask(r.data.task_id, setOutline, () => setLoading(null));
    } catch (e: unknown) { setStatusMsg(e instanceof Error ? e.message : "请求失败"); setLoading(null); }
  };

  const handleDraft = async () => {
    if (!outline && !toPromptVars().topic?.trim()) return setStatusMsg("请先生成大纲");
    setStatusMsg(""); setLoading("draft");
    try {
      const r = await api.post<{ data: { task_id: string } }>("/content/draft", {
        content_type: ct.id, topic: toPromptVars().topic || "", outline, style: formValues.style || "",
        length: "medium", materials: "", file_ids: selectedFileIds,
        model_config_id: modelConfigId || undefined,
      });
      setDraftTaskId(r.data.task_id);
      pollTask(r.data.task_id, setDraft, () => setLoading(null));
    } catch (e: unknown) { setStatusMsg(e instanceof Error ? e.message : "请求失败"); setLoading(null); }
  };

  const handleRewrite = async (rw: string) => {
    if (!draft) return; setStatusMsg(""); setLoading("rewrite");
    try {
      const r = await api.post<{ data: { task_id: string } }>("/content/rewrite", {
        source_content: draft, rewrite_type: rw, target_style: formValues.style || "",
        content_type: ct.id, model_config_id: modelConfigId || undefined,
      });
      setDraftTaskId(r.data.task_id);
      pollTask(r.data.task_id, setDraft, () => setLoading(null));
    } catch (e: unknown) { setStatusMsg(e instanceof Error ? e.message : "请求失败"); setLoading(null); }
  };

  const handleExport = async () => {
    const text = draft || outline; if (!text) return;
    const exportTaskId = draft ? draftTaskId : outlineTaskId;
    try {
      if (exportTaskId) {
        await exportTaskMarkdown(exportTaskId);
        return;
      }
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "统一导出失败，已使用本地导出");
    }
    downloadMarkdown(text, ["晨枢AI", "内容创作", ct.label, formValues.topic || "未命名主题", draft ? "正文" : "大纲"]);
  };

  return (
    <div className="max-w-5xl">
      <h1 className={`text-xl font-semibold mb-2 ${t.text}`}>内容创作</h1>
      <p className={`text-sm mb-5 ${t.textMuted}`}>大纲 → 正文 → 改写 · 每种文体有专属输入项</p>

      {/* Type tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto">
        {CONTENT_TYPES.map((tp, i) => (
          <button key={tp.id} onClick={() => handleTypeChange(i)}
            className={`px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors ${
              i === typeIdx ? `${t.accent} text-white` : `${t.inputBg} ${t.inputBorder} ${t.textMuted} border`
            }`}>{tp.icon} {tp.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Input panel — dynamic fields per type */}
        <div className="space-y-3">
          {ct.fields.map((f) => (
            <div key={f.key}>
              <label className={`block text-xs mb-1 ${t.textMuted}`}>{f.label}</label>
              {f.rows && f.rows > 1 ? (
                <textarea className={`w-full border rounded px-3 py-2 text-sm resize-none ${t.inputBg} ${t.inputBorder} ${t.inputText}`}
                  style={{ height: f.rows * 24 }}
                  value={formValues[f.key] || ""}
                  onChange={(e) => setFormValues({ ...formValues, [f.key]: e.target.value })}
                  placeholder={f.placeholder} />
              ) : (
                <input className={`w-full border rounded px-3 py-2 text-sm ${t.inputBg} ${t.inputBorder} ${t.inputText}`}
                  value={formValues[f.key] || ""}
                  onChange={(e) => setFormValues({ ...formValues, [f.key]: e.target.value })}
                  placeholder={f.placeholder} />
              )}
            </div>
          ))}

          {availableFiles.length > 0 && (
            <div>
              <label className={`block text-xs mb-1 ${t.textMuted}`}>引用文件</label>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {availableFiles.map((f) => (
                  <label key={f.id} className={`flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer ${
                    selectedFileIds.includes(f.id) ? `${t.accentBg} ${t.accentText}` : t.textMuted
                  }`}>
                    <input type="checkbox" checked={selectedFileIds.includes(f.id)} onChange={() => setSelectedFileIds(p => p.includes(f.id) ? p.filter(x => x !== f.id) : [...p, f.id])} className="accent-sky-500" />
                    {f.original_name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <ModelSelector value={modelConfigId} onChange={setModelConfigId} />

          {promptTemplates.length > 0 && (
            <div>
              <label className={`block text-xs mb-1 ${t.textMuted}`}>提示词模板</label>
              <select className={`w-full border rounded px-3 py-2 text-sm ${t.inputBg} ${t.inputBorder} ${t.inputText}`}
                value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">默认模板</option>
                {promptTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {statusMsg && <div className="p-2 border border-red-300 dark:border-red-800 rounded bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400">{statusMsg}</div>}

          <button onClick={handleOutline} disabled={loading === "outline"}
            className="w-full py-2 text-sm rounded transition-colors disabled:opacity-50 bg-sky-700 hover:bg-sky-600 text-white">
            {loading === "outline" ? "生成大纲中..." : "1. 生成大纲"}
          </button>
          <button onClick={handleDraft} disabled={loading === "draft" || !outline}
            className="w-full py-2 text-sm rounded transition-colors disabled:opacity-50 bg-sky-700 hover:bg-sky-600 text-white">
            {loading === "draft" ? "生成正文中..." : "2. 生成正文"}
          </button>
        </div>

        {/* Outputs */}
        <div className="col-span-2 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-medium ${t.textMuted}`}>大纲</h3>
              {outline && <button onClick={() => navigator.clipboard.writeText(outline)} className={`text-xs ${t.accentText}`}>复制</button>}
            </div>
            {loading === "outline" ? <Spinner text="AI 正在生成大纲..." /> : (
              <textarea className={`w-full border rounded-lg px-4 py-3 text-sm h-40 resize-none font-mono ${t.inputBg} ${t.border} ${t.text}`}
                value={outline} onChange={(e) => setOutline(e.target.value)}
                placeholder="大纲将在此显示，你可以手动编辑..." />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-medium ${t.textMuted}`}>正文</h3>
              <div className="flex gap-1">
                {draft && <button onClick={handleExport} className="text-xs text-sky-500 px-2">导出 MD</button>}
                {draft && <button onClick={() => navigator.clipboard.writeText(draft)} className={`text-xs px-2 ${t.accentText}`}>复制</button>}
              </div>
            </div>
            {loading === "draft" ? <Spinner text="AI 正在撰写正文..." /> : (
              <div className={`border rounded-lg overflow-hidden ${t.border}`}>
                <pre className={`w-full px-4 py-3 text-sm h-64 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap ${t.inputBg} ${t.text}`}>
                  {draft || <span className={t.textMuted}>先生成大纲，再生成正文</span>}
                </pre>
              </div>
            )}
          </div>

          {draft && !loading && (
            <div>
              <h3 className={`text-sm font-medium mb-2 ${t.textMuted}`}>改写操作</h3>
              <div className="flex gap-2">
                {REWRITE_TYPES.map((rw) => (
                  <button key={rw.id} onClick={() => handleRewrite(rw.id)} disabled={loading === "rewrite"}
                    className={`px-3 py-1.5 rounded text-sm border transition-colors ${t.inputBg} ${t.inputBorder} ${t.text}`}>
                    {rw.icon} {rw.label}
                  </button>
                ))}
              </div>
              {loading === "rewrite" && <div className="mt-3"><Spinner text="改写中..." /></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
