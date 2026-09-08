import { describe, expect, it } from "vitest";
import { parseContentSegments } from "../contentSegments";

describe("parseContentSegments", () => {
  it("recognizes HTTPS image URLs from arbitrary hosts", () => {
    expect(parseContentSegments([
      "心得：",
      "https://i.meee.com.tw/Q0css7f.png",
      "https://cdn.example.com/photo.JPEG?size=large#preview",
    ].join("\n"))).toEqual([
      { kind: "text", content: "心得：\n" },
      { kind: "image", url: "https://i.meee.com.tw/Q0css7f.png" },
      { kind: "text", content: "\n" },
      { kind: "image", url: "https://cdn.example.com/photo.JPEG?size=large#preview" },
    ]);
  });

  it("keeps HTTP and extensionless URLs as plain text", () => {
    const text = "http://cdn.example.com/photo.png\nhttps://example.com/image/123";
    expect(parseContentSegments(text)).toEqual([{ kind: "text", content: text }]);
  });
});
