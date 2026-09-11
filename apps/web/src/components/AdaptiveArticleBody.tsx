import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseAnsiText } from "../lib/ansiText";
import { isPreformattedArticle, readableAnsiStyle } from "../lib/articlePresentation";
import { parseContentSegments } from "../lib/ptt/contentSegments";
import { ImagePreview, YouTubePreview } from "./MediaPreview";
import { TerminalGlyph } from "./TerminalGlyph";

export function AdaptiveArticleBody({ text }: { text: string }) {
  const parsed = useMemo(() => parseAnsiText(text), [text]);
  const segments = useMemo(() => parseContentSegments(parsed.text), [parsed.text]);
  const container = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLPreElement>(null);
  const [fits, setFits] = useState(false);
  const [forced, setForced] = useState(false);
  const preformatted = useMemo(() => isPreformattedArticle(parsed.text), [parsed.text]);
  const monospace = forced || preformatted;

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
  }, [parsed, forced, monospace]);

  const original = forced || fits;
  // Match ptt-client's DBCS width for symbols as well as CJK characters.
  const runs = parsed.runs.map((run, i) => <span key={i} style={forced ? run.style : readableAnsiStyle(run)}>{monospace ? run.text.split(/([^\u0000-\u00ff])/u).map((part, j) => j % 2
    ? <TerminalGlyph key={j} text={part} /> : part) : run.text}</span>);
  return <div className="mb-8" style={{ minWidth: 0, maxWidth: "100%" }}>
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <span className="text-xs text-gray-400">{forced ? "原始排版" : "自動"}</span>
      <button type="button" aria-pressed={forced} onClick={() => setForced(!forced)}
        title="強制保留原文行寬；再次點擊恢復自動排版"
        className="ml-auto rounded border border-gray-600 px-3 py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ background: forced ? "var(--accent-dim, #283044)" : undefined }}>
        原始排版
      </button>
    </div>
    <div ref={container} style={{ position: "relative", minWidth: 0, maxWidth: "100%", overflow: "hidden", background: forced ? "#000" : undefined, color: forced ? "#aaa" : undefined, fontFamily: forced ? '"Noto Sans Mono CJK TC", ui-monospace, monospace' : preformatted ? "var(--font-mono)" : "var(--font)", fontSize: 16, lineHeight: monospace ? 1.2 : 1.5, fontVariantLigatures: monospace ? "none" : undefined }}>
      <pre ref={measure} data-layout-measure="true" aria-hidden="true"
        style={{ position: "absolute", visibility: "hidden", pointerEvents: "none", whiteSpace: "pre", width: "max-content", margin: 0, font: "inherit", tabSize: 8 }}>{runs}</pre>
      <div role="region" aria-label="原始正文" tabIndex={original ? 0 : undefined} style={{ overflowX: original ? "auto" : "hidden", maxWidth: "100%" }}>
        <pre style={{ whiteSpace: original ? "pre" : "pre-wrap", overflowWrap: original ? "normal" : "anywhere", margin: 0, font: "inherit", tabSize: 8 }}>{runs}</pre>
      </div>
    </div>
    {segments.some(segment => segment.kind !== "text") && <div className="mt-4">
      {segments.map((segment, i) => segment.kind === "image"
        ? <ImagePreview key={i} url={segment.url} />
        : segment.kind === "youtube" ? <YouTubePreview key={i} videoId={segment.videoId} url={segment.url} /> : null)}
    </div>}
  </div>;
}
