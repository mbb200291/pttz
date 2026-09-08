/**
 * MediaPreview — 圖片與 YouTube 預覽元件
 *
 * ImagePreview：顯示縮圖，onError fallback 回純文字 URL
 * YouTubePreview：顯示縮圖，點擊後展開 iframe（click-to-play）
 */

import { useEffect, useState } from "react";

interface ImagePreviewProps {
  url: string;
}

function retryImageUrl(url: string): string {
  const retryUrl = new URL(url);
  retryUrl.searchParams.set("pttzzz_retry", "1");
  return retryUrl.toString();
}

export function ImagePreview({ url }: ImagePreviewProps) {
  const [phase, setPhase] = useState<
    "initial" | "waiting" | "retrying" | "failed"
  >("initial");

  useEffect(() => {
    setPhase("initial");
  }, [url]);

  useEffect(() => {
    if (phase !== "waiting") return;
    const timer = window.setTimeout(() => setPhase("retrying"), 2_000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "failed") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-400 hover:underline break-all text-sm"
      >
        {url}
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block my-2">
      <img
        src={phase === "retrying" ? retryImageUrl(url) : url}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => {
          if (phase === "initial") setPhase("waiting");
          else if (phase === "retrying") setPhase("failed");
        }}
        className="max-w-full rounded-lg max-h-96 object-contain bg-gray-800"
      />
    </a>
  );
}

interface YouTubePreviewProps {
  videoId: string;
  url: string;
}

export function YouTubePreview({ videoId, url }: YouTubePreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  if (expanded) {
    return (
      <div className="my-2 w-full aspect-video rounded-lg overflow-hidden bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className="relative block my-2 rounded-lg overflow-hidden group w-full max-w-sm"
      aria-label="播放 YouTube 影片"
    >
      <img
        src={thumbUrl}
        alt="YouTube thumbnail"
        referrerPolicy="no-referrer"
        loading="lazy"
        className="w-full object-cover bg-gray-800"
      />
      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
        <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" fill="white" className="w-7 h-7 ml-1">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
      {/* URL hint */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-xs text-gray-300 truncate text-left">
        {url}
      </div>
    </button>
  );
}
