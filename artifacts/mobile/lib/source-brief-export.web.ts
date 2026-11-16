function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 24) || "brief";
}

export async function exportSourceBrief(markdown: string, taskId: string, format: "markdown" | "text" = "markdown"): Promise<void> {
  if (!markdown.trim()) throw new Error("There is no completed brief to export.");
  if (typeof document === "undefined") throw new Error("Markdown downloads are available when Kairos is open in a browser.");
  const blob = new Blob([markdown], { type: `${format === "markdown" ? "text/markdown" : "text/plain"};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kairos-source-brief-${safeFilePart(taskId)}.${format === "markdown" ? "md" : "txt"}`;
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
