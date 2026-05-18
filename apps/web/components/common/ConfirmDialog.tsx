"use client";

import { useThemeConfig } from "@/lib/theme";

interface Props {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }: Props) {
  const t = useThemeConfig();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className={`rounded-lg p-6 w-96 shadow-xl ${t.surface} ${t.border} border`}>
        <h3 className={`text-base font-semibold mb-2 ${t.text}`}>{title}</h3>
        <p className={`text-sm mb-5 ${t.textMuted}`}>{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className={`px-4 py-2 text-sm rounded transition-colors ${t.textMuted} hover:text-gray-700 dark:hover:text-zinc-200`}>取消</button>
          <button onClick={onConfirm} className={`px-4 py-2 text-sm rounded transition-colors ${t.danger} ${t.dangerHover} ${t.dangerText}`}>确认</button>
        </div>
      </div>
    </div>
  );
}
