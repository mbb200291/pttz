import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseAnsiText } from "../lib/ansiText";
import { parseContentSegments } from "../lib/ptt/contentSegments";
import { ImagePreview, YouTubePreview } from "./MediaPreview";

export function AdaptiveArticleBody({ text }: { text: string }) {
  const parsed = useMemo(() => parseAnsiText(text), [text]);
  const segments = useMemo(() => parseContentSegments(parsed.text), [parsed.text]);
  const container = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLPreElement>(null);
  const [fits, setFits] = useState(false);
  const [forced, setForced] = useState(false);

  useLayoutEffect(() => {
    let active = true;
    const update = () => {
      if (!active || !container.current || !measure.current) return;
      const available = container.current.getBoundingClientRect().width;
      setFits(available > 0 && measure.current.getBoundingClientRect().width <= available);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    if (container.current) observer?.observe(container.current);
    if (measure.current) observer?.observe(measure.current);
    window.addEventListener("resize", update);
    void document.fonts?.ready.then(update);
    return () => { active = false; observer?.disconnect(); window.removeEventListener("resize", update); };
  }, [parsed]);

  const original = forced || fits;
  // Give CJK/full-width glyphs two ASCII cells even when the fallback font differs.
  const runs = parsed.runs.map((run, i) => <span key={i} style={run.style}>{run.text.split(/([\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6])/u).map((part, j) => j % 2
    ? <span key={j} data-terminal-wide="true" style={{ display: "inline-block", width: "2ch", textAlign: "center" }}>{part}</span> : part)}</span>);
  return <div className="mb-8" style={{ minWidth: 0, maxWidth: "100%" }}>
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <button type="button" aria-pressed={forced} onClick={() => setForced(!forced)}
        title="強制保留原文行寬；再次點擊恢復自動排版"
        className="rounded border border-gray-600 px-3 py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ background: forced ? "var(--accent-dim, #283044)" : undefined }}>
        原始排版
      </button>
      <span className="text-xs text-gray-400">{forced ? "已鎖定原始排版 · 可左右捲動" : fits ? "自動 · 保留原文行寬" : "自動 · 適應寬度換行"}</span>
    </div>
    <div ref={container} style={{ position: "relative", minWidth: 0, maxWidth: "100%", overflow: "hidden", background: "#000", color: "#aaa", fontFamily: '"Noto Sans Mono CJK TC", ui-monospace, monospace', fontSize: 16, lineHeight: 1.5, fontVariantLigatures: "none" }}>
      <pre ref={measure} data-layout-measure="true" aria-hidden="true"
        style={{ position: "absolute", visibility: "hidden", pointerEvents: "none", whiteSpace: "pre", width: "max-content", margin: 0, font: "inherit", tabSize: 8 }}>{runs}</pre>
      <div role="region" aria-label="原始正文" tabIndex={original ? 0 : undefined} style={{ overflowX: original ? "auto" : "hidden", maxWidth: "100%" }}>
        <pre style={{ whiteSpace: original ? "pre" : "pre-wrap", overflowWrap: original ? "normal" : "anywhere", margin: 0, font: "inherit", tabSize: 8 }}>{runs}</pre>
      </div>
    </div>
    {segments.some(segment => segment.kind !== "text") && <div className="mt-4">
      <p className="mb-2 text-xs text-gray-400">媒體預覽（網址保留於正文）</p>
      {segments.map((segment, i) => segment.kind === "image"
        ? <ImagePreview key={i} url={segment.url} />
        : segment.kind === "youtube" ? <YouTubePreview key={i} videoId={segment.videoId} url={segment.url} /> : null)}
    </div>}
  </div>;
}
