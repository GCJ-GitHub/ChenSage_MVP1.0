"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import ModelSelector from "@/components/common/ModelSelector";
import Spinner from "@/components/common/Spinner";
import { useThemeConfig } from "@/lib/theme";
import { downloadMarkdown, exportTaskMarkdown } from "@/lib/task-export";

interface FileItem {
  id: string; original_name: string; parse_status: string;
}

type Step = "upload" | "analyzing" | "analyzed" | "generating_q" | "ready" | "answering" | "generating_rev" | "done";

export default function InterviewPage() {
  const t = useThemeConfig();
  const [step, setStep] = useState<Step>("upload");

  // Step 1: Upload
  const [files, setFiles] = useState<FileItem[]>([]);
  const [resumeFileId, setResumeFileId] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [modelConfigId, setModelConfigId] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  // Analysis results
  const [analysis, setAnalysis] = useState("");
  const [analysisTaskId, setAnalysisTaskId] = useState("");

  // Questions
  const [questions, setQuestions] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState("medium");
  const focusAreas = ["项目经历", "技术能力", "岗位匹配"];
  const [questionCount, setQuestionCount] = useState(8);

  // Answering
  const [currentQi, setCurrentQi] = useState(0);
  const [answer, setAnswer] = useState("");
  const [evaluations, setEvaluations] = useState<string[]>([]);
  const [collectedResults, setCollectedResults] = useState("");

  // Review
  const [review, setReview] = useState("");
  const [reviewTaskId, setReviewTaskId] = useState("");

  useEffect(() => {
    api.get<{ data: { items: { id: string; original_name: string; parse_status: string }[] } }>("/files?parse_status=parsed")
      .then((r) => setFiles(r.data.items.filter((f) => f.parse_status === "parsed")))
      .catch(() => {});
  }, []);

  const pollTask = async (taskId: string, setter: (text: string) => void, onDone: () => void) => {
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const r = await api.get<{ data: { status: string; output: string | null; error_message: string | null } }>(`/tasks/${taskId}`);
        if (r.data.status === "succeeded" && r.data.output) {
          setter(r.data.output);
          onDone();
          return;
        }
        if (r.data.status === "failed") {
          setStatusMsg(`失败: ${r.data.error_message || "未知"}`);
          setStep("upload");
          return;
        }
      } catch {}
    }
    setStatusMsg("超时，请稍后重试");
    setStep("upload");
  };

  // Step 1: Analyze resume
  const handleAnalyze = async () => {
    if (!resumeFileId) return setStatusMsg("请选择简历文件");
    if (!jobDesc.trim()) return setStatusMsg("请输入岗位描述");
    setStatusMsg(""); setStep("analyzing");
    setReviewTaskId("");
    try {
      const r = await api.post<{ data: { task_id: string } }>("/interview/analyze", {
        resume_file_id: resumeFileId, job_description: jobDesc,
        model_config_id: modelConfigId || undefined,
      });
      setAnalysisTaskId(r.data.task_id);
      pollTask(r.data.task_id, setAnalysis, () => setStep("analyzed"));
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "请求失败");
      setStep("upload");
    }
  };

  // Step 2: Generate questions
  const handleGenQuestions = async () => {
    setStatusMsg(""); setStep("generating_q");
    try {
      const r = await api.post<{ data: { task_id: string } }>(`/interview/${analysisTaskId}/questions`, {
        question_count: questionCount, difficulty,
        focus_areas: focusAreas,
        model_config_id: modelConfigId || undefined,
      });
      pollTask(r.data.task_id, (text) => {
        // Parse questions from output
        const qs = text.split(/\n##\s*问题\s*\d+/).filter(Boolean)
          .map((q: string) => q.trim())
          .filter((q: string) => q.length > 10);
        if (qs.length > 0) {
          setQuestions(qs);
        } else {
          // fallback: use the whole text split by numbered lines
          const lines = text.split(/\n\d+[\.、]\s*/).filter((l: string) => l.trim().length > 20);
          setQuestions(lines.length > 1 ? lines : [text]);
        }
      }, () => setStep("ready"));
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "请求失败");
      setStep("analyzed");
    }
  };

  // Step 3: Answer question
  const handleSubmitAnswer = async () => {
    if (!answer.trim()) return setStatusMsg("请输入回答");
    setStatusMsg(""); setStep("answering");
    const q = questions[currentQi];
    try {
      const r = await api.post<{ data: { task_id: string } }>(`/interview/${analysisTaskId}/answers`, {
        question_id: `q_${currentQi}`,
        question: q,
        answer,
        model_config_id: modelConfigId || undefined,
      });
      pollTask(r.data.task_id, (evalText) => {
        const result = `\n---\n### 第 ${currentQi + 1} 题\n**问题**: ${q.slice(0, 200)}...\n\n**你的回答**: ${answer.slice(0, 200)}...\n\n**AI 评价**: ${evalText}\n`;
        const nextCollectedResults = collectedResults + result;
        setCollectedResults(nextCollectedResults);
        setEvaluations((prev) => [...prev, evalText]);
        setAnswer("");
        if (currentQi + 1 < questions.length) {
          setCurrentQi((i) => i + 1);
          setStep("ready");
        } else {
          // All done - auto save results and generate review
          setStep("generating_rev");
          saveResultsAndReview(nextCollectedResults);
        }
      }, () => {});
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "请求失败");
      setStep("ready");
    }
  };

  const saveResultsAndReview = async (fullResults: string) => {
    try {
      // Save accumulated results to parent task
      await api.post(`/interview/${analysisTaskId}/save-result`, { result: fullResults, replace: true });

      // Generate review
      const r = await api.post<{ data: { task_id: string } }>(`/interview/${analysisTaskId}/review`, {
        model_config_id: modelConfigId || undefined,
      });
      setReviewTaskId(r.data.task_id);
      pollTask(r.data.task_id, setReview, () => setStep("done"));
    } catch {}
  };

  const handleExport = async () => {
    const content = `# 面试复盘报告\n\n## 简历分析\n${analysis}\n\n## 面试记录\n${collectedResults}\n\n## 复盘总结\n${review}`;
    const resumeName = files.find((f) => f.id === resumeFileId)?.original_name || "未选择简历";
    const jobTitle = jobDesc.split(/\r?\n/).find((line) => line.trim()) || "未命名岗位";
    try {
      if (reviewTaskId) {
        await exportTaskMarkdown(reviewTaskId);
        return;
      }
    } catch (e: unknown) {
      setStatusMsg(e instanceof Error ? e.message : "统一导出失败，已使用本地导出");
    }
    downloadMarkdown(content, ["晨枢AI", "模拟面试复盘", resumeName, jobTitle]);
  };

  const stepLabels = [
    { key: "upload", label: "1. 上传分析" },
    { key: "analyzed", label: "2. 查看分析" },
    { key: "ready", label: "3. 模拟面试" },
    { key: "done", label: "4. 复盘报告" },
  ];

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold mb-1">简历与模拟面试</h1>
      <p className={`text-sm ${t.textMuted} mb-5`}>上传简历 → 岗位匹配 → 面试出题 → 逐题回答 → 复盘报告</p>

      {/* Step indicator */}
      <div className="flex gap-2 mb-6">
        {stepLabels.map((s) => {
          const active = step === s.key || (s.key === "analyzed" && ["generating_q", "ready", "answering", "generating_rev", "done"].includes(step));
          const done = (s.key === "upload" && step !== "upload") || (["analyzed", "ready", "done"].includes(s.key));
          return (
            <div key={s.key} className={`flex-1 h-1.5 rounded-full ${active || (s.key === "done" && step === "done") ? "bg-sky-500" : done ? "bg-zinc-400 dark:bg-zinc-600" : "${t.surface}"}`} />
          );
        })}
      </div>

      {statusMsg && (
        <div className="mb-4 p-3 border border-red-800 rounded bg-red-900/20 text-xs text-red-400">{statusMsg}</div>
      )}

      {/* Step 1: Upload + Job Description */}
      {(step === "upload" || step === "analyzing") && (
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-4">
            <div>
              <label className={`block text-xs ${t.textMuted} mb-1`}>选择简历文件</label>
              <select className={`w-full ${t.inputBg} ${t.inputBorder} rounded px-3 py-2 text-sm ${t.text}`}
                value={resumeFileId} onChange={(e) => setResumeFileId(e.target.value)}>
                <option value="">-- 选择已上传并解析的简历 --</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>{f.original_name}</option>
                ))}
              </select>
              {files.length === 0 && (
                <p className={`text-xs ${t.textMuted} mt-1`}>还没有已解析的文件，请先前往「文件管理」上传简历</p>
              )}
            </div>

            <div>
              <label className={`block text-xs ${t.textMuted} mb-1`}>岗位描述 (JD)</label>
              <textarea className={`w-full ${t.inputBg} ${t.inputBorder} rounded px-3 py-2 text-sm ${t.text} h-32 resize-none`}
                value={jobDesc} onChange={(e) => setJobDesc(e.target.value)}
                placeholder="粘贴目标岗位的 JD 描述...&#10;例如：负责 Python 后端开发，熟悉 FastAPI/Django..." />
            </div>

            <ModelSelector value={modelConfigId} onChange={setModelConfigId} />

            <button onClick={handleAnalyze}
              disabled={step === "analyzing" || !resumeFileId}
              className="w-full py-2 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-sm rounded transition-colors">
              {step === "analyzing" ? "分析中..." : "开始分析简历"}
            </button>
          </div>

          <div className="flex items-center justify-center text-center">
            {step === "analyzing" ? (
              <Spinner text="AI 正在分析简历..." />
            ) : (
              <p className={`text-sm ${t.textMuted}`}>上传简历 + 填写岗位 JD<br/>点击「开始分析」获取匹配度报告</p>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Analysis results + question config */}
      {(step === "analyzed" || step === "generating_q") && (
        <div className="grid grid-cols-2 gap-5">
          <div>
            <h3 className={`text-sm font-medium ${t.textMuted} mb-2`}>简历分析结果</h3>
            <div className={`${t.border} rounded-lg p-4 ${t.card} max-h-80 overflow-y-auto`}>
              <pre className={`text-sm ${t.text} font-mono whitespace-pre-wrap`}>{analysis}</pre>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className={`text-sm font-medium ${t.textMuted}`}>面试题设置</h3>
            <div className="flex gap-3">
              <div>
                <label className={`text-xs ${t.textMuted}`}>题数</label>
                <select className={`w-full ${t.inputBg} ${t.inputBorder} rounded px-3 py-2 text-sm ${t.text}`}
                  value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))}>
                  {[3,5,8,10,15,20].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className={`text-xs ${t.textMuted}`}>难度</label>
                <select className={`w-full ${t.inputBg} ${t.inputBorder} rounded px-3 py-2 text-sm ${t.text}`}
                  value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="easy">简单</option>
                  <option value="medium">中等</option>
                  <option value="hard">困难</option>
                </select>
              </div>
            </div>
            <ModelSelector value={modelConfigId} onChange={setModelConfigId} />
            <button onClick={handleGenQuestions}
              disabled={step === "generating_q"}
              className="w-full py-2 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-sm rounded transition-colors">
              {step === "generating_q" ? "生成中..." : "生成面试题"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Q&A - Answer questions */}
      {(step === "ready" || step === "answering") && currentQi < questions.length && (
        <div className="grid grid-cols-3 gap-5">
          <div className={`col-span-1 border-r ${t.border} pr-4 space-y-2 max-h-96 overflow-y-auto`}>
            <h3 className={`text-sm font-medium ${t.textMuted} mb-2`}>题目列表</h3>
            {questions.map((q, i) => (
              <button key={i}
                onClick={() => { setCurrentQi(i); setAnswer(""); }}
                className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                  i === currentQi ? "bg-sky-700 text-white" :
                  i < currentQi ? `${t.surface}/50 ${t.textMuted}` : `${t.inputBg} ${t.textMuted} hover:${t.surface}`
                }`}>
                <span className="font-medium">第 {i + 1} 题</span>
                <span className="block truncate">{q.slice(0, 60)}...</span>
              </button>
            ))}
          </div>

          <div className="col-span-2 space-y-4">
            <div className={`${t.border} rounded-lg p-4 ${t.card}`}>
              <p className={`text-xs ${t.textMuted} mb-1`}>第 {currentQi + 1} / {questions.length} 题</p>
              <p className={`text-sm ${t.text}`}>{questions[currentQi]}</p>
            </div>

            <div>
              <label className={`block text-xs ${t.textMuted} mb-1`}>你的回答</label>
              <textarea className={`w-full ${t.inputBg} ${t.inputBorder} rounded px-3 py-2 text-sm ${t.text} h-32 resize-none`}
                value={answer} onChange={(e) => setAnswer(e.target.value)}
                placeholder="输入你的回答..." disabled={step === "answering"} />
            </div>

            <div className="flex gap-2">
              <button onClick={handleSubmitAnswer}
                disabled={step === "answering" || !answer.trim()}
                className="flex-1 py-2 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-sm rounded transition-colors">
                {step === "answering" ? "评价中..." : "提交回答并获取评价"}
              </button>
              {currentQi > 0 && (
                <button onClick={() => { setCurrentQi((i) => i - 1); setAnswer(""); setStep("ready"); }}
                  className={`px-4 py-2 ${t.surface} ${t.cardHover} text-sm rounded`}>上一题</button>
              )}
            </div>

            {evaluations.length > 0 && evaluations[currentQi - 1] && (
              <div className={`${t.border} rounded-lg p-4 ${t.card}`}>
                <p className={`text-xs ${t.textMuted} mb-1`}>上一题评价</p>
                <pre className={`text-xs ${t.text} font-mono whitespace-pre-wrap`}>{evaluations[currentQi - 1]}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Review generating or done */}
      {(step === "generating_rev") && (
        <Spinner text="全部回答完成，正在生成复盘报告..." />
      )}

      {step === "done" && (
        <div className="space-y-5">
          <div className={`${t.border} rounded-lg p-5 ${t.card}`}>
            <h3 className={`text-lg font-semibold ${t.text} mb-3`}>面试复盘报告</h3>
            <pre className={`text-sm ${t.text} font-mono whitespace-pre-wrap max-h-96 overflow-y-auto`}>{review}</pre>
          </div>
          <div className="flex gap-3">
            <button onClick={handleExport}
              className="px-4 py-2 bg-sky-700 hover:bg-sky-600 text-sm rounded transition-colors">导出 Markdown</button>
            <button onClick={() => { setStep("upload"); setAnalysis(""); setQuestions([]); setEvaluations([]); setAnswer(""); setReview(""); setCurrentQi(0); setCollectedResults(""); }}
              className={`px-4 py-2 ${t.surface} ${t.cardHover} text-sm rounded transition-colors`}>重新开始</button>
          </div>
        </div>
      )}
    </div>
  );
}
