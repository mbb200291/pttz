type Media = { kind: "image" | "youtube"; src: string; url: string };

// UI-only URL recognition; never interpret arbitrary article HTML.
export function mediaFromText(text: string): Media[] {
  const result: Media[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'「」]+/gi)) {
    try {
      const url = new URL(match[0].replace(/[),。；]+$/, ""));
      if (url.username || url.password || url.port) continue;
      let media: Media | undefined;
      const host = url.hostname.toLowerCase();
      const path = url.pathname.split("/").filter(Boolean);
      let videoId: string | null = null;
      if (host === "youtu.be" && path.length === 1) videoId = path[0];
      if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
        if (url.pathname === "/watch") videoId = url.searchParams.get("v");
        else if (path.length === 2 && ["shorts", "embed", "live"].includes(path[0])) videoId = path[1];
      }
      if (videoId && /^[\w-]{11}$/.test(videoId)) {
        media = { kind: "youtube", src: `https://www.youtube-nocookie.com/embed/${videoId}`, url: `https://www.youtube.com/watch?v=${videoId}` };
      } else if (url.protocol === "https:") {
        if (["imgur.com", "i.imgur.com"].includes(host) && /^\/[a-z0-9]+(?:\.(?:png|jpe?g|gif|webp))?$/i.test(url.pathname)) {
          media = { kind: "image", src: `https://i.imgur.com${url.pathname}${/\./.test(url.pathname) ? "" : ".jpg"}`, url: url.href };
        } else if (/\.(?:png|jpe?g|gif|webp)$/i.test(url.pathname)) {
          media = { kind: "image", src: url.href, url: url.href };
        }
      }
      if (media && !seen.has(media.src)) { seen.add(media.src); result.push(media); }
    } catch { /* Malformed URLs remain plain text. */ }
  }
  return result;
}

export function updateMedia(strip: HTMLElement, media: Media[]): void {
  strip.hidden = !media.length;
  const existing = new Map(Array.from(strip.children).map(child => [(child as HTMLElement).dataset.src, child]));
  const retained = new Set(media.map(entry => entry.src));
  for (const [src, child] of existing) {
    if (!src || !retained.has(src)) { child.remove(); existing.delete(src); }
  }
  media.forEach((entry, index) => {
    let figure = existing.get(entry.src) as HTMLElement | undefined;
    if (!figure) {
      figure = document.createElement("figure"); figure.dataset.src = entry.src;
      const link = document.createElement("a"); link.href = entry.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.textContent = entry.kind === "image" ? "開啟原圖" : "在 YouTube 觀看";
      if (entry.kind === "image") {
        const image = document.createElement("img"); image.src = entry.src; image.alt = `文章圖片 ${index + 1}`;
        image.loading = "lazy"; image.decoding = "async"; image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => { image.hidden = true; link.textContent = "圖片無法載入 · 開啟原圖"; });
        figure.append(image);
      } else {
        const frame = document.createElement("iframe"); frame.src = entry.src; frame.title = `YouTube 影片 ${index + 1}`;
        frame.loading = "lazy"; frame.allowFullscreen = true;
        frame.allow = "encrypted-media; picture-in-picture; fullscreen";
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        figure.append(frame);
      }
      figure.append(link);
    }
    // Do not move an existing iframe: reparenting can restart playback.
    if (strip.children[index] !== figure) strip.insertBefore(figure, strip.children[index] ?? null);
    existing.delete(entry.src);
  });
  for (const child of existing.values()) child.remove();
}
