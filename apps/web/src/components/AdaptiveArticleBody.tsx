import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseAnsiText } from "../lib/ansiText";
import { isPreformattedArticle, readableAnsiStyle } from "../lib/articlePresentation";
import { parseLocatedContentSegments, type ContentSegment } from "../lib/ptt/contentSegments";
import { ImagePreview, YouTubePreview } from "./MediaPreview";
import { TerminalGlyph } from "./TerminalGlyph";
import { parseArticleFooter } from "../lib/articleFooter";

export function AdaptiveArticleBody({ text }: { text: string }) {
  const parsed = useMemo(() => parseAnsiText(text), [text]);
  const footer = useMemo(() => parseArticleFooter(parsed.text), [parsed.text]);
  const container = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLPreElement>(null);
  const [fits, setFits] = useState(false);
  const [forced, setForced] = useState(false);
  const bodyEnd = !forced && footer ? footer.start : parsed.text.length;
  const segments = useMemo(() => parseLocatedContentSegments(parsed.text.slice(0, bodyEnd)), [parsed.text, bodyEnd]);
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
  const renderRuns = (start = 0, end = parsed.text.length) => {
    let offset = 0;
    return parsed.runs.map((run, i) => {
      const from = offset;
      offset += run.text.length;
      if (offset <= start || from >= end) return null;
      const value = run.text.slice(Math.max(0, start - from), end - from);
      return <span key={i} style={forced ? run.style : readableAnsiStyle(run)}>{monospace ? value.split(/([^\u0000-\u00ff])/u).map((part, j) => j % 2
        ? <TerminalGlyph key={j} text={part} /> : part) : value}</span>;
    });
  };
  const runs = renderRuns(0, bodyEnd);
  const originalRuns = forced && footer ? (() => {
    const start = parsed.text.indexOf(footer.url, footer.start);
    return <>{renderRuns(0, start)}<a href={footer.url} target="_blank" rel="noopener noreferrer" className="underline">{renderRuns(start, start + footer.url.length)}</a>{renderRuns(start + footer.url.length)}</>;
  })() : runs;
  const preview = (segment: ContentSegment, key: number) => segment.kind === "image"
    ? <ImagePreview key={key} url={segment.url} />
    : segment.kind === "youtube" ? <YouTubePreview key={key} videoId={segment.videoId} url={segment.url} /> : null;
  const textStyle = { whiteSpace: original ? "pre" : "pre-wrap", overflowWrap: original ? "normal" : "anywhere", margin: 0, font: "inherit", tabSize: 8 } as const;
  return <div className="mb-8" style={{ minWidth: 0, maxWidth: "100%" }}>
    <div className="mb-3 flex flex-wrap items-center gap-3">
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
        {forced || !segments.some(({ segment }) => segment.kind !== "text")
          ? <pre style={textStyle}>{originalRuns}</pre>
          : segments.map(({ segment, start, end }, i) => segment.kind === "text"
            ? <pre key={i} style={textStyle}>{renderRuns(start, end)}</pre>
            : preview(segment, i))}
      </div>
    </div>
    {!forced && footer && <section aria-label="文章資訊" className="mt-6 flex items-center gap-3 rounded-xl border p-3 sm:gap-4 sm:p-4" style={{ borderColor: "var(--border)", background: "var(--surface)", minWidth: 0 }}>
      <span className="flex shrink-0 items-center justify-center rounded-lg text-xs font-semibold" style={{ width: 42, height: 42, background: "var(--accent-dim)", color: "var(--accent)" }}>PTT</span>
      <div className="min-w-0 flex-1">
        <a href={footer.url} target="_blank" rel="noopener noreferrer" className="block underline decoration-transparent underline-offset-4 hover:decoration-current" style={{ color: "var(--text)", fontSize: 13, lineHeight: 1.6, overflowWrap: "anywhere" }}>{footer.url}</a>
        <p className="mb-0 mt-1 text-xs leading-relaxed" style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>{footer.station.replace(/\(ptt\.cc\)$/u, "")} · {footer.source.replace(/^(.+?)\s+\(([^()]+)\)$/u, "$2 · $1")}</p>
      </div>
      <a href={footer.url} target="_blank" rel="noopener noreferrer" aria-label="開啟 PTT 原文" className="shrink-0 p-1" style={{ color: "var(--accent)" }}><span aria-hidden="true">↗</span></a>
    </section>}
    {forced && segments.some(({ segment }) => segment.kind !== "text") && <div className="mt-4">
      {segments.map(({ segment }, i) => preview(segment, i))}
    </div>}
  </div>;
}
