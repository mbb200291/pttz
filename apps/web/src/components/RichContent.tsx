/**
 * RichContent — 將文字內容渲染為段落 + 圖片 / YouTube 預覽
 *
 * variant="body"  → 文章正文，用 <pre> 保留格式
 * variant="inline" → 推文內容，用 <span> 行內顯示
 */

import { AdaptiveArticleBody } from "./AdaptiveArticleBody";
import { parseContentSegments } from "../lib/ptt/contentSegments";
import { ImagePreview } from "./MediaPreview";
import { YouTubePreview } from "./MediaPreview";

interface RichContentProps {
  text: string;
  variant: "body" | "inline";
}

export function RichContent({ text, variant }: RichContentProps) {
  const segments = parseContentSegments(text);

  if (variant === "body") {
    return <AdaptiveArticleBody text={text} />;
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
