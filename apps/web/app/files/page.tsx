"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api-client";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import { useThemeConfig } from "@/lib/theme";

interface FileItem { id: string; original_name: string; mime_type: string | null; size_bytes: number; parse_status: string; created_at: string; }

export default function FilesPage() {
  const t = useThemeConfig();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => { api.get<{ data: { items: FileItem[] } }>("/files").then((r) => setFiles(r.data.items)).catch(console.error); };
  useEffect(() => { load(); }, []);

  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0]; if (!f) return; setUploading(true);
    const fd = new FormData(); fd.append("file", f);
    try { await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1"}/files`, { method: "POST", body: fd }); load(); } catch {}
    setUploading(false);
  };
  const fmtSize = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`;

  return (
    <div className="max-w-4xl">
      <h1 className={`text-xl font-semibold mb-6 ${t.text}`}>文件管理</h1>
      <div className="flex gap-3 mb-6">
        <input ref={fileRef} type="file" accept=".md,.txt,.pdf,.docx" className={`text-sm file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:text-white ${t.accent} ${t.accentHover} ${t.textMuted}`} />
        <button onClick={handleUpload} disabled={uploading} className={`px-4 py-2 text-sm rounded transition-colors disabled:opacity-50 text-white ${t.accent} ${t.accentHover}`}>{uploading ? "上传中..." : "上传"}</button>
        <span className={`text-xs self-center ${t.textMuted}`}>支持 .md .txt .pdf .docx</span>
      </div>
      {files.length === 0 ? <EmptyState title="暂无文件" description="上传简历、论文资料或写作素材，供 AI 任务引用" /> : (
        <div className={`border rounded-lg overflow-hidden ${t.border}`}>
          <table className="w-full text-sm">
            <thead><tr className={`border-b ${t.tableHeader} ${t.border}`}>
              <th className={`text-left px-4 py-2.5 text-xs font-medium ${t.textMuted}`}>文件名</th>
              <th className={`text-left px-4 py-2.5 text-xs font-medium ${t.textMuted}`}>大小</th>
              <th className={`text-left px-4 py-2.5 text-xs font-medium ${t.textMuted}`}>状态</th>
              <th className={`text-left px-4 py-2.5 text-xs font-medium ${t.textMuted}`}>上传时间</th>
            </tr></thead>
            <tbody>{files.map((f) => (
              <tr key={f.id} className={`border-b transition-colors ${t.border} ${t.tableRowHover}`}>
                <td className="px-4 py-2.5"><span className={t.text}>{f.original_name}</span></td>
                <td className={`px-4 py-2.5 text-xs ${t.textMuted}`}>{fmtSize(f.size_bytes)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={f.parse_status} /></td>
                <td className={`px-4 py-2.5 text-xs ${t.textMuted}`}>{new Date(f.created_at).toLocaleString("zh-CN", { month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit" })}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
