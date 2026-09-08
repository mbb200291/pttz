// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImagePreview } from "../MediaPreview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ImagePreview", () => {
  it("retries a transient image failure once before showing the fallback link", () => {
    vi.useFakeTimers();
    const url = "https://i.verb.tw/SRQh2Keh.jpg";
    const { container } = render(<ImagePreview url={url} />);

    const initialImage = container.querySelector("img");
    if (!initialImage) throw new Error("initial image was not rendered");
    expect(initialImage.getAttribute("src")).toBe(url);
    fireEvent.error(initialImage);

    expect(screen.queryByRole("link", { name: url })).toBeNull();
    act(() => vi.advanceTimersByTime(2_000));

    const retryImage = container.querySelector("img");
    if (!retryImage) throw new Error("retry image was not rendered");
    expect(retryImage.getAttribute("src")).toBe(
      "https://i.verb.tw/SRQh2Keh.jpg?pttzzz_retry=1",
    );
    fireEvent.error(retryImage);

    expect(screen.getByRole("link", { name: url }).getAttribute("href")).toBe(url);
  });

  it("resets retry state when the image URL changes", () => {
    vi.useFakeTimers();
    const firstUrl = "https://cdn.example.com/first.jpg";
    const secondUrl = "https://cdn.example.com/second.jpg";
    const { container, rerender } = render(<ImagePreview url={firstUrl} />);

    fireEvent.error(container.querySelector("img")!);
    act(() => vi.advanceTimersByTime(2_000));
    fireEvent.error(container.querySelector("img")!);
    expect(screen.getByRole("link", { name: firstUrl })).toBeTruthy();

    rerender(<ImagePreview url={secondUrl} />);

    expect(container.querySelector("img")?.getAttribute("src")).toBe(secondUrl);
    expect(screen.queryByRole("link", { name: firstUrl })).toBeNull();
  });
});
