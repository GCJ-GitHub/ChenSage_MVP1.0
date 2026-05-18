/**
 * 晨枢 AI — 主题色彩配置
 * 所有组件的颜色均从这里引用，不直接在组件中写 Tailwind 颜色类
 * 新增主题只需在此文件追加，后期可改为从配置文件/数据库加载
 */

export interface ThemeTokens {
  name: string;
  bg: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentText: string;
  accentBg: string;
  card: string;
  cardHover: string;
  headerBg: string;
  headerBorder: string;
  sidebarBg: string;
  sidebarText: string;
  sidebarActive: string;
  sidebarActiveText: string;
  sidebarHover: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  tableHeader: string;
  tableRowHover: string;
  statusSuccess: string;
  statusRunning: string;
  statusFailed: string;
  statusDraft: string;
  danger: string;
  dangerHover: string;
  dangerText: string;
}

const dark: ThemeTokens = {
  name: "dark",
  bg: "bg-slate-950",
  surface: "bg-slate-900",
  border: "border-slate-800",
  text: "text-slate-100",
  textMuted: "text-slate-400",
  accent: "bg-cyan-600",
  accentHover: "hover:bg-cyan-500",
  accentText: "text-sky-400",
  accentBg: "bg-cyan-500/10",
  card: "bg-slate-900/70",
  cardHover: "hover:bg-slate-800/80",
  headerBg: "bg-slate-950/90",
  headerBorder: "border-slate-800",
  sidebarBg: "bg-slate-950",
  sidebarText: "text-slate-400",
  sidebarActive: "bg-cyan-600",
  sidebarActiveText: "text-white",
  sidebarHover: "hover:text-slate-100 hover:bg-slate-800",
  inputBg: "bg-slate-900",
  inputBorder: "border-slate-700",
  inputText: "text-slate-100 placeholder:text-slate-500",
  tableHeader: "bg-slate-900",
  tableRowHover: "hover:bg-slate-900/80",
  statusSuccess: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
  statusRunning: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/20",
  statusFailed: "bg-rose-500/15 text-rose-300 border border-rose-500/20",
  statusDraft: "bg-slate-700 text-slate-200 border border-slate-600",
  danger: "bg-rose-600",
  dangerHover: "hover:bg-rose-500",
  dangerText: "text-white",
};

const light: ThemeTokens = {
  name: "light",
  bg: "bg-slate-50",
  surface: "bg-white",
  border: "border-slate-200",
  text: "text-slate-950",
  textMuted: "text-slate-600",
  accent: "bg-cyan-700",
  accentHover: "hover:bg-cyan-600",
  accentText: "text-cyan-700",
  accentBg: "bg-cyan-50",
  card: "bg-white",
  cardHover: "hover:bg-slate-100",
  headerBg: "bg-white/90",
  headerBorder: "border-slate-200",
  sidebarBg: "bg-white",
  sidebarText: "text-slate-600",
  sidebarActive: "bg-cyan-700",
  sidebarActiveText: "text-white",
  sidebarHover: "hover:text-slate-950 hover:bg-slate-100",
  inputBg: "bg-white",
  inputBorder: "border-slate-300",
  inputText: "text-slate-950 placeholder:text-slate-400",
  tableHeader: "bg-slate-100",
  tableRowHover: "hover:bg-slate-100/80",
  statusSuccess: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  statusRunning: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  statusFailed: "bg-rose-50 text-rose-700 border border-rose-200",
  statusDraft: "bg-slate-100 text-slate-700 border border-slate-200",
  danger: "bg-rose-600",
  dangerHover: "hover:bg-rose-500",
  dangerText: "text-white",
};

export const themeTokens = { dark, light } as const;
export type ThemeMode = keyof typeof themeTokens;
