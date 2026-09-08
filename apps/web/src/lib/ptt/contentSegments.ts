/**
 * parseContentSegments
 *
 * 將文字內容（文章 body 或推文 content）解析為 ContentSegment 陣列。
 * 支援的 URL 類型：
 *   - imgur 圖片（https://i.imgur.com/<id>.<ext> 或 https://imgur.com/<id>.<ext>）
 *   - 任意 HTTPS 主機上的直接圖片網址（png / jpg / jpeg / gif / webp）
 *   - YouTube 影片（youtube.com/watch?v=<id> 或 youtu.be/<id>）
 * 其餘文字保留為純文字段落。
 */

export type ContentSegment =
  | { kind: "text"; content: string }
  | { kind: "image"; url: string }
  | { kind: "youtube"; videoId: string; url: string };

// Combined URL pattern to find positions of all media URLs
const MEDIA_URL_RE =
  /(?:https:\/\/[^\s?#]+\.(?:png|jpe?g|gif|webp)(?:[?#][^\s]*)?|https?:\/\/(?:(?:i\.)?imgur\.com\/[A-Za-z0-9]+(?:\.[A-Za-z]+)?|(?:www\.|m\.)?youtube\.com\/watch\?[^\s#]*v=[A-Za-z0-9_-]{11}[^\s#]*|youtu\.be\/[A-Za-z0-9_-]{11}[^\s]*))/gi;

function extractYouTubeId(url: string): string | null {
  // Reset lastIndex since we're reusing the regex
  const ytWatch = /[?&]v=([A-Za-z0-9_-]{11})/i.exec(url);
  if (ytWatch) return ytWatch[1];
  const ytShort = /youtu\.be\/([A-Za-z0-9_-]{11})/i.exec(url);
  if (ytShort) return ytShort[1];
  return null;
}

function isImgurUrl(url: string): boolean {
  return /^https?:\/\/(?:i\.)?imgur\.com\//i.test(url);
}

function isDirectHttpsImageUrl(url: string): boolean {
  return /^https:\/\/[^\s?#]+\.(?:png|jpe?g|gif|webp)(?:[?#][^\s]*)?$/i.test(url);
}

function isYouTubeUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch|^https?:\/\/youtu\.be\//i.test(url);
}

function normalizeImgurUrl(url: string): string {
  // Ensure we use the direct image URL (i.imgur.com)
  // Strip query params
  const clean = url.split("?")[0].split("#")[0];
  // If no extension, add .jpg as fallback
  if (!/\.[a-z]{3,4}$/i.test(clean)) {
    return clean.replace(/^https?:\/\/imgur\.com\//, "https://i.imgur.com/") + ".jpg";
  }
  return clean.replace(/^https?:\/\/imgur\.com\//, "https://i.imgur.com/");
}

export function parseContentSegments(text: string): ContentSegment[] {
  if (!text) return [];

  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  MEDIA_URL_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = MEDIA_URL_RE.exec(text)) !== null) {
    const url = match[0];
    const start = match.index;

    // Push any text before this URL
    if (start > lastIndex) {
      const textChunk = text.slice(lastIndex, start);
      if (textChunk) {
        segments.push({ kind: "text", content: textChunk });
      }
    }

    if (isYouTubeUrl(url)) {
      const videoId = extractYouTubeId(url);
      if (videoId) {
        segments.push({ kind: "youtube", videoId, url });
      } else {
        segments.push({ kind: "text", content: url });
      }
    } else if (isImgurUrl(url) || isDirectHttpsImageUrl(url)) {
      segments.push({
        kind: "image",
        url: isImgurUrl(url) ? normalizeImgurUrl(url) : url,
      });
    } else {
      segments.push({ kind: "text", content: url });
    }

    lastIndex = start + url.length;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) {
      segments.push({ kind: "text", content: remaining });
    }
  }

  return segments.length > 0 ? segments : [{ kind: "text", content: text }];
}
