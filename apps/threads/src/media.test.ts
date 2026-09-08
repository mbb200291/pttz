/* @vitest-environment jsdom */
import { expect, it } from "vitest";
import { mediaFromText, updateMedia } from "./media";

it("recognizes direct HTTPS images and validated YouTube URLs in source order, deduplicating", () => {
  const media=mediaFromText("https://example.com/a.JPG?x=1 https://youtu.be/dQw4w9WgXcQ https://www.youtube.com/watch?v=dQw4w9WgXcQ https://example.com/a.JPG?x=1");
  expect(media).toHaveLength(2);
  expect(media[0].kind).toBe("image");
  expect(media[1].src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  expect(mediaFromText("http://example.com/a.jpg https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ https://youtube.com/watch?v=bad javascript:alert(1)")).toEqual([]);
});
it("supports shorts and imgur links without accepting credentials or malformed IDs", () => {
  expect(mediaFromText("https://youtube.com/shorts/dQw4w9WgXcQ https://imgur.com/abc123").map(m=>m.kind)).toEqual(["youtube","image"]);
  expect(mediaFromText("https://user:pass@example.com/a.jpg https://youtu.be/dQw4w9WgXcQmore")).toEqual([]);
});
it("keeps players across partial updates and exposes image failure and video source links", () => {
  const strip=document.createElement("div");
  const media=mediaFromText("https://example.com/a.jpg https://youtu.be/dQw4w9WgXcQ");
  updateMedia(strip,media);
  const frame=strip.querySelector("iframe")!;
  expect(frame.src).not.toContain("autoplay=1");
  expect(frame.title).toBeTruthy();
  updateMedia(strip,mediaFromText("https://example.com/a.jpg https://youtu.be/dQw4w9WgXcQ https://example.com/b.png"));
  expect(strip.querySelector("iframe")).toBe(frame);
  strip.querySelector("img")!.dispatchEvent(new Event("error"));
  expect(strip.querySelector("img")!.hidden).toBe(true);
  expect(strip.textContent).toContain("圖片無法載入");
  expect(strip.querySelectorAll("a")).toHaveLength(3);
});
it("does not detach a retained player when a preceding image disappears", () => {
  const strip=document.createElement("div");
  updateMedia(strip,mediaFromText("https://example.com/a.jpg https://youtu.be/dQw4w9WgXcQ"));
  const player=strip.querySelector("iframe")!.parentElement!;
  const observer=new MutationObserver(()=>{}); observer.observe(strip,{childList:true});
  updateMedia(strip,mediaFromText("https://youtu.be/dQw4w9WgXcQ"));
  expect(observer.takeRecords().some(record=>Array.from(record.removedNodes).includes(player))).toBe(false);
  observer.disconnect();
});
