"use client";

import { useThemeConfig } from "@/lib/theme";
import type { ThemeTokens } from "@/lib/theme-config";

type StatusToken = Extract<keyof ThemeTokens, "statusDraft" | "statusRunning" | "statusSuccess" | "statusFailed">;

const statusMap: Record<string, [string, StatusToken]> = {
  draft: ["草稿", "statusDraft"],
  queued: ["排队中", "statusRunning"],
  running: ["执行中", "statusRunning"],
  succeeded: ["已完成", "statusSuccess"],
  failed: ["已失败", "statusFailed"],
  cancelled: ["已取消", "statusDraft"],
  parsed: ["已解析", "statusSuccess"],
  uploading: ["上传中", "statusRunning"],
  parsing: ["解析中", "statusRunning"],
  connected: ["已连接", "statusSuccess"],
  unconfigured: ["未配置", "statusDraft"],
  pending: ["待抓取", "statusDraft"],
  fetching: ["抓取中", "statusRunning"],
  generated: ["已生成", "statusSuccess"],
  success: ["成功", "statusSuccess"],
};

interface Props { status: string; className?: string; }

export default function StatusBadge({ status, className = "" }: Props) {
  const t = useThemeConfig();
  const info = statusMap[status] || [status, "statusDraft"];
  const colorClass = t[info[1]] || t.statusDraft;

  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colorClass} ${className}`}>
      {info[0]}
    </span>
  );
}
