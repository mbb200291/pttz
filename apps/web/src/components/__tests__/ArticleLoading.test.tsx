/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArticleData, UseArticleReturn } from "../../hooks/useArticle";
const mocks = vi.hoisted(() => ({ useArticle: vi.fn() }));
vi.mock("../../hooks/useArticle", () => ({ useArticle: mocks.useArticle }));
import { Article } from "../Article";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const article: ArticleData = {
  title: "[情報] 彩色表格", author: "alice", board: "Test", date: "9/11",
  body: "| 球隊 | 勝 |\n| \x1b[31m桃猿\x1b[0m | 8 |\nhttps://i.example.test/a.jpg",
  pushes: [], articleNotes: [], score: 0,
};
const state: UseArticleReturn = {
  article: null, partialArticle: null, cachedArticle: null, loading: true,
  reloading: false, error: null, reload: async () => true,
};

describe("article loading presentation", () => {
  it("updates partial vote totals in the same action row, including downward corrections", () => {
    const partial = { ...article, pushes: [] };
    mocks.useArticle.mockReturnValue({ ...state, partialArticle: partial });
    const props = { boardName: "Test", articleIndex: 1, onBack: () => {} };
    const { rerender } = render(<Article {...props} />);
    const row = screen.getByRole("group", { name: "文章推噓與回覆" });
    const push = within(row).getByRole("button", { name: "推" });
    expect(push).toHaveTextContent("—");
    expect(push).toBeDisabled();
    mocks.useArticle.mockReturnValue({ ...state, partialArticle: { ...partial, articleVotes: { pushCount: 12, booCount: 2, score: 10 } } });
    rerender(<Article {...props} />);
    expect(push).toHaveTextContent("12");
    mocks.useArticle.mockReturnValue({ ...state, article: { ...article, articleVotes: { pushCount: 9, booCount: 2, score: 7 } }, loading: false });
    rerender(<Article {...props} />);
    expect(screen.getByRole("group", { name: "文章推噓與回覆" })).toBe(row);
    expect(push).toHaveTextContent("9");
  });
  it.each(["partialArticle", "cachedArticle"] as const)("preserves formatted body and user layout across %s to final", (source) => {
    mocks.useArticle.mockReturnValue({ ...state, [source]: article });
    const props = { boardName: "Test", articleIndex: 1, onBack: () => {} };
    const { rerender } = render(<Article {...props} />);
    const body = screen.getByRole("region", { name: "原始正文" });
    expect(body.parentElement!.style.fontFamily).toBe("var(--font-mono)");
    expect(body.querySelectorAll("pre > span")[1]).toHaveStyle({ color: "#f28b82" });
    const image = document.querySelector("img");
    expect(image).toHaveAttribute("src", "https://i.example.test/a.jpg");
    fireEvent.click(screen.getByRole("button", { name: "原始排版" }));
    expect(body.querySelectorAll("pre > span")[1]).toHaveStyle({ color: "#aa0000" });

    mocks.useArticle.mockReturnValue({ ...state, article, loading: false });
    rerender(<Article {...props} />);
    expect(screen.getByRole("region", { name: "原始正文" })).toBe(body);
    expect(document.querySelector("img")).toBe(image);
    expect(screen.getByRole("button", { name: "原始排版" })).toHaveAttribute("aria-pressed", "true");
    expect(body.querySelectorAll("pre > span")[1]).toHaveStyle({ color: "#aa0000" });
    expect(screen.queryByText("完整討論串整理中…")).not.toBeInTheDocument();
    rerender(<Article {...props} articleIndex={2} />);
    expect(screen.getByRole("button", { name: "原始排版" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps a loading placeholder until body text is available", () => {
    mocks.useArticle.mockReturnValue({ ...state, partialArticle: { ...article, body: "" } });
    render(<Article boardName="Test" articleIndex={1} onBack={() => {}} />);
    expect(screen.getByText("文章內容載入中…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "原始排版" })).not.toBeInTheDocument();
  });
});
