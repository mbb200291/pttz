/**
 * RichContent — 將文字內容渲染為段落 + 圖片 / YouTube 預覽
 *
 * variant="body"  → 文章正文，用 <pre> 保留格式
 * variant="inline" → 推文內容，用 <span> 行內顯示
 */

import { useState } from "react";
import { parseContentSegments } from "../lib/ptt/contentSegments";
import { ImagePreview } from "./MediaPreview";
import { YouTubePreview } from "./MediaPreview";

interface RichContentProps {
  text: string;
  variant: "body" | "inline";
}

export function RichContent({ text, variant }: RichContentProps) {
  const [originalLayout, setOriginalLayout] = useState(false);
  const segments = parseContentSegments(text);

  if (variant === "body") {
    return (
      <div className="font-mono text-sm text-gray-200 leading-relaxed mb-8">
        <button type="button" aria-pressed={originalLayout} onClick={() => setOriginalLayout(!originalLayout)}
          className="mb-3 rounded border border-gray-600 px-3 py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2">
          {originalLayout ? "自動換行" : "原始排版"}
        </button>
        {originalLayout && <>
          <div role="region" aria-label="原始正文" tabIndex={0} style={{ overflowX: "auto", maxWidth: "100%" }}>
            <pre style={{ whiteSpace: "pre", margin: 0 }}>{text}</pre>
          </div>
          {segments.some((seg) => seg.kind !== "text") && <p className="mt-4 text-xs text-gray-400">媒體預覽（原文保留於上方）</p>}
        </>}
        {segments.map((seg, i) => {
          if (seg.kind === "image") {
            return <ImagePreview key={i} url={seg.url} />;
          }
          if (seg.kind === "youtube") {
            return <YouTubePreview key={i} videoId={seg.videoId} url={seg.url} />;
          }
          if (originalLayout) return null;
          return (
            <pre
              key={i}
              className="whitespace-pre-wrap break-words inline"
            >
              {seg.content}
            </pre>
          );
        })}
      </div>
    );
  }

  // inline variant for push content
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {segments.map((seg, i) => {
        if (seg.kind === "image") {
          return (
            <span key={i} className="block">
              <ImagePreview url={seg.url} />
            </span>
          );
        }
        if (seg.kind === "youtube") {
          return (
            <span key={i} className="block">
              <YouTubePreview videoId={seg.videoId} url={seg.url} />
            </span>
          );
        }
        return <span key={i}>{seg.content}</span>;
      })}
    </span>
  );
}
