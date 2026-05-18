import { markdownFilename } from "@/lib/export-filename";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1";

function apiOrigin() {
  try {
    return new URL(API_BASE).origin;
  } catch {
    return "";
  }
}

function resolveDownloadUrl(downloadUrl: string) {
  if (/^https?:\/\//i.test(downloadUrl)) return downloadUrl;
  if (downloadUrl.startsWith("/api/")) return `${apiOrigin()}${downloadUrl}`;
  if (downloadUrl.startsWith("/")) return `${API_BASE}${downloadUrl}`;
  return `${API_BASE}/${downloadUrl}`;
}

export function downloadMarkdown(content: string, filenameParts: Array<string | null | undefined>) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = markdownFilename(filenameParts);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export async function exportTaskMarkdown(taskId: string) {
  const resp = await fetch(`${API_BASE}/export/tasks/${taskId}`, { method: "POST" });
  const json = await resp.json();

  if (!resp.ok || !json.success) {
    throw new Error(json?.detail?.message || json?.error?.message || json?.message || "导出失败");
  }

  const link = document.createElement("a");
  link.href = resolveDownloadUrl(json.data.download_url);
  link.download = json.data.file_name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
