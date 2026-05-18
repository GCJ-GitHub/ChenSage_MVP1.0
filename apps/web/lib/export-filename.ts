export function safeFilePart(value: string | null | undefined, fallback = "未命名", maxLength = 48) {
  const cleaned = (value || fallback)
    .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  const part = cleaned || fallback;
  return part.length > maxLength ? part.slice(0, maxLength).trim() : part;
}

export function filenameTimestamp(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("");
}

export function markdownFilename(parts: Array<string | null | undefined>) {
  const safeParts = parts
    .map((part) => safeFilePart(part, "", 36))
    .filter(Boolean);
  return `${safeParts.join(" - ")} - ${filenameTimestamp()}.md`;
}
