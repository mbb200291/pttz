/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichContent } from "../RichContent";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("original body layout", () => {
  it("structures a trailing article footer and keeps its link clickable in original layout", () => {
    const url = "https://www.ptt.cc/bbs/Stock/M.1789390859.A.205.html";
    const text = `正文\n--\n\x1b[32m※ 發信站: 批踢踢實業坊(ptt.cc), 來自: 61.228.237.120 (臺灣)\n※ 文章網址: ${url}\x1b[0m`;
    render(<RichContent text={text} variant="body" />);
    const body = screen.getByRole("region", { name: "原始正文" });
    expect(body).not.toHaveTextContent("發信站");
    expect(screen.getByRole("region", { name: "文章資訊" })).toHaveTextContent("61.228.237.120 (臺灣)");
    expect(screen.getByRole("link", { name: url })).toHaveAttribute("href", url);
    fireEvent.click(screen.getByRole("button", { name: "原始排版" }));
    expect(screen.queryByRole("region", { name: "文章資訊" })).toBeNull();
    expect(body).toHaveTextContent("※ 發信站:");
    expect(body).toContainElement(screen.getByRole("link", { name: url }));
  });
  it.each([false, true])("renders YouTube at its source position, or below original layout (ANSI: %s)", (ansi) => {
    const url = "https://www.youtube.com/watch?v=WasUAA9rWSI";
    const displayedUrl = ansi ? "https://www.youtube.com/\x1b[33mwatch?v=WasUAA9rWSI\x1b[0m" : url;
    render(<RichContent text={`肥肥我在你水管看到\n\n${displayedUrl}\n\n好像當初華映員工上街遊行一樣`} variant="body" />);
    const source = screen.getByRole("region", { name: "原始正文" });
    expect(source).toHaveTextContent(url);
    const preview = screen.getByRole("button", { name: "播放 YouTube 影片" });
    expect(preview.querySelector("img")).toHaveAttribute("src", "https://img.youtube.com/vi/WasUAA9rWSI/hqdefault.jpg");
    expect(source).toContainElement(preview);
    const following = source.querySelector("pre:last-child")!;
    expect(following).toHaveTextContent("好像當初華映員工上街遊行一樣");
    expect(preview.compareDocumentPosition(following) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "原始排版" }));
    expect(source.querySelector("pre")?.textContent).toContain(url);
    const originalPreview = screen.getByRole("button", { name: "播放 YouTube 影片" });
    expect(source).not.toContainElement(originalPreview);
    fireEvent.click(screen.getByRole("button", { name: "原始排版" }));
    expect(screen.getAllByRole("button", { name: "播放 YouTube 影片" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "播放 YouTube 影片" }));
    expect(screen.getByTitle("YouTube video")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/WasUAA9rWSI?autoplay=1");
  });
  it("keeps colored text and source offsets around normalized images and multiple media", () => {
    render(<RichContent text={'\x1b[31m前 https://imgur.com/abc 後\nhttps://youtu.be/WasUAA9rWSI\n末\x1b[0m'} variant="body" />);
    const source = screen.getByRole("region", { name: "原始正文" });
    const blocks = source.querySelectorAll("pre");
    expect([...blocks].map(block => block.textContent)).toEqual(["前 ", " 後\n", "\n末"]);
    for (const block of blocks) expect(block.querySelector("span")).toHaveStyle({ color: "#f28b82" });
    expect(source.querySelector("img")).toHaveAttribute("src", "https://i.imgur.com/abc.jpg");
    expect(source.querySelectorAll("img")).toHaveLength(2);
  });
  it("preserves terminal-width box drawing and seamless block cells in original layout", () => {
    const text = "┌──────┐\n│█2   █2   │\n│██  ██  │\n└──────┘";
    render(<RichContent text={text} variant="body" />);
    fireEvent.click(screen.getByRole("button", { name: "原始排版" }));
    const source = screen.getByRole("region", { name: "原始正文" });
    expect(source.querySelector("pre")?.textContent).toBe(text);
    const cells = source.querySelectorAll<HTMLElement>("[data-terminal-wide]");
    expect(cells.length).toBe([...text].filter(char => char.charCodeAt(0) > 255).length);
    for (const cell of cells) expect(cell).toHaveStyle({ width: "2ch", height: "1.2em", verticalAlign: "top" });
    expect(source.querySelector('[data-terminal-glyph="█"] svg rect')).not.toBeNull();
    expect(source.querySelector('[data-terminal-glyph="─"] svg path')).not.toBeNull();
    expect(source.parentElement).toHaveStyle({ lineHeight: "1.2" });
  });
  it("shows only the right-aligned layout toggle without a status label", () => {
    render(<RichContent text="https://i.example.test/a.jpg" variant="body" />);
    const button = screen.getByRole("button", { name: "原始排版" });
    const toolbar = button.parentElement!;
    expect(toolbar.children).toHaveLength(1);
    expect(toolbar.lastElementChild).toBe(button);
    expect(button).toHaveClass("ml-auto");
    expect(screen.queryByText("媒體預覽（網址保留於正文）")).not.toBeInTheDocument();
    expect(screen.getByRole("link").querySelector("img")).toHaveAttribute("src", "https://i.example.test/a.jpg");
    fireEvent.click(button);
    expect(toolbar.children).toHaveLength(1);
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(toolbar.children).toHaveLength(1);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });
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
