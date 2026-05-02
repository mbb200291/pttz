import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadToImgur } from "../imgur";

// Provide a stub VITE_IMGUR_CLIENT_ID via import.meta.env
vi.stubEnv("VITE_IMGUR_CLIENT_ID", "test-client-id");

describe("uploadToImgur", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the link on a successful upload", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { link: "https://i.imgur.com/abc123.jpg" } }),
    } as Response);

    const file = new File(["content"], "test.jpg", { type: "image/jpeg" });
    const result = await uploadToImgur(file);

    expect(result).toBe("https://i.imgur.com/abc123.jpg");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.imgur.com/3/image",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Client-ID test-client-id",
        }),
      }),
    );
  });

  it("throws an Error when the response is not ok", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    } as Response);

    const file = new File(["content"], "test.jpg", { type: "image/jpeg" });
    await expect(uploadToImgur(file)).rejects.toThrow(
      "Imgur upload failed: 403 Forbidden",
    );
  });

  it("throws when VITE_IMGUR_CLIENT_ID is missing", async () => {
    vi.stubEnv("VITE_IMGUR_CLIENT_ID", "");
    const file = new File(["content"], "test.jpg", { type: "image/jpeg" });
    await expect(uploadToImgur(file)).rejects.toThrow("VITE_IMGUR_CLIENT_ID");
    vi.stubEnv("VITE_IMGUR_CLIENT_ID", "test-client-id");
  });

  it("propagates network errors", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValueOnce(new Error("timeout"));

    const file = new File(["content"], "test.jpg", { type: "image/jpeg" });
    await expect(uploadToImgur(file)).rejects.toThrow("timeout");
  });

  it("throws on non-image file type", async () => {
    const file = new File(["content"], "doc.pdf", { type: "application/pdf" });
    await expect(uploadToImgur(file)).rejects.toThrow("只支援圖片格式");
  });

  it("throws when file exceeds 10 MB", async () => {
    const file = new File(["content"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: 11 * 1024 * 1024 });
    await expect(uploadToImgur(file)).rejects.toThrow("圖片大小不可超過 10 MB");
  });
});
