/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichContent } from "../RichContent";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("original body layout", () => {
  it("preserves spaces and table URLs verbatim when original layout is selected", () => {
    const text = "  +---+--------------------------------+\n  |圖 | https://i.example.test/a.jpg    |\n  +---+--------------------------------+\n";
    render(<RichContent text={text} variant="body" />);
    fireEvent.click(screen.getByRole("button", { name: "原始排版" }));
    const source = screen.getByRole("region", { name: "原始正文" });
    expect(source.querySelector("pre")?.textContent).toBe(text);
    expect(source.querySelector("pre")).toHaveStyle({ whiteSpace: "pre" });
    expect(source.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "原始排版" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses measured container width and preserves manual original layout across resizes", () => {
    let width = 900;
    let resize = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe() {} disconnect = disconnect;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      return { width: this.dataset.layoutMeasure ? 700 : width } as DOMRect;
    });
    const { unmount } = render(<RichContent text="RK  TEAM\n1   桃猿" variant="body" />);
    const pre = screen.getByRole("region", { name: "原始正文" }).querySelector("pre");
    expect(pre).toHaveStyle({ whiteSpace: "pre" });
    act(() => { width = 320; resize(); });
    expect(pre).toHaveStyle({ whiteSpace: "pre-wrap" });
    const button = screen.getByRole("button", { name: "原始排版" });
    fireEvent.click(button);
    act(() => { width = 250; resize(); });
    expect(pre).toHaveStyle({ whiteSpace: "pre" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(pre).toHaveStyle({ whiteSpace: "pre-wrap" });
    act(() => { width = 900; resize(); });
    expect(pre).toHaveStyle({ whiteSpace: "pre" });
    unmount(); expect(disconnect).toHaveBeenCalled();
  });

  it("keeps ANSI color and literal text in both layouts without interpreting HTML", () => {
    render(<RichContent text={'\x1b[31m桃猿\x1b[0m <script>alert(1)</script>'} variant="body" />);
    const pre = screen.getByRole("region", { name: "原始正文" }).querySelector("pre")!;
    expect(pre.textContent).toBe('桃猿 <script>alert(1)</script>');
    expect(pre.querySelector("span")?.style.color).not.toBe("");
    expect(pre.querySelector("script")).toBeNull();
    expect(pre.querySelector('[data-terminal-wide]')).toHaveStyle({ width: "2ch" });
    fireEvent.click(screen.getByRole("button", { name: "原始排版" }));
    expect(pre.querySelector("span")?.style.color).not.toBe("");
  });
});
