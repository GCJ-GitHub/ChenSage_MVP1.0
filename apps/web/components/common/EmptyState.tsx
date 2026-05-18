"use client";

import { useThemeConfig } from "@/lib/theme";

interface Props {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

export default function EmptyState({ icon = "⊡", title, description, action }: Props) {
  const t = useThemeConfig();

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className={`text-4xl mb-4 ${t.textMuted}`}>{icon}</span>
      <p className={`text-sm font-medium mb-1 ${t.textMuted}`}>{title}</p>
      {description && <p className={`text-xs max-w-xs ${t.textMuted}`}>{description}</p>}
      {action && (
        <a href={action.href}
          className={`mt-4 inline-block px-4 py-2 rounded text-sm transition-colors ${t.inputBg} ${t.inputBorder} ${t.text} border`}>
          {action.label}
        </a>
      )}
    </div>
  );
}
