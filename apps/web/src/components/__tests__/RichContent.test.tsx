/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichContent } from "../RichContent";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("original body layout", () => {
  it("uses website defaults for unstyled prose even when the original line fits", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      return { width: this.dataset.layoutMeasure ? 100 : 900 } as DOMRect;
    });
    render(<RichContent text={"普通中文文章。\n第二行文字。"} variant="body" />);
    const source = screen.getByRole("region", { name: "原始正文" });
    const surface = source.parentElement!;
    expect(surface.style.background).toBe("");
    expect(surface.style.color).toBe("");
    expect(surface.style.fontFamily).toBe("var(--font)");
    expect(source.querySelector("span")?.getAttribute("style")).toBeNull();
    expect(source.querySelector("[data-terminal-wide]")).toBeNull();
    expect(source.querySelector("pre")).toHaveStyle({ whiteSpace: "pre" });
  });
  it("uses monospace for table-like text without imposing terminal colors", () => {
    render(<RichContent text={"| 球隊 | 勝 |\n| 桃猿 | 8 |"} variant="body" />);
    const source = screen.getByRole("region", { name: "原始正文" });
    expect(source.parentElement!.style.fontFamily).toBe("var(--font-mono)");
    expect(source.parentElement!.style.background).toBe("");
    expect(source.querySelector("[data-terminal-wide]")).toHaveStyle({ width: "2ch" });
  });
  it("maps only authored colors in automatic mode and restores raw terminal styles on manual lock", () => {
    render(<RichContent text={"普通\x1b[31m紅\x1b[44m藍底\x1b[39;49m恢復"} variant="body" />);
    const source = screen.getByRole("region", { name: "原始正文" });
    const spans = () => source.querySelectorAll<HTMLSpanElement>("pre > span");
    expect(spans()[0].style.color).toBe("");
    expect(spans()[1]).toHaveStyle({ color: "#f28b82" });
    expect(spans()[1].style.backgroundColor).toBe("");
    expect(spans()[2]).toHaveStyle({ backgroundColor: "#263753" });
    expect(spans()[3].style.color).toBe("");
    const button = screen.getByRole("button", { name: "原始排版" });
    fireEvent.click(button);
    expect(source.parentElement).toHaveStyle({ background: "#000" });
    expect(spans()[0]).toHaveStyle({ color: "#aaaaaa", backgroundColor: "#000000" });
    expect(spans()[1]).toHaveStyle({ color: "#aa0000" });
    expect(spans()[2]).toHaveStyle({ backgroundColor: "#0000aa" });
    expect(source.parentElement!.style.fontFamily).toContain("monospace");
    fireEvent.click(button);
    expect(spans()[0].style.color).toBe("");
    expect(spans()[1]).toHaveStyle({ color: "#f28b82" });
    expect(source.parentElement!.style.fontFamily).toBe("var(--font)");
    expect(source.parentElement!.style.background).toBe("");
  });
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
    expect(pre.querySelector('[data-terminal-wide]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "原始排版" }));
    expect(pre.querySelector('[data-terminal-wide]')).toHaveStyle({ width: "2ch" });
    expect(pre.querySelector("span")?.style.color).not.toBe("");
  });
});
