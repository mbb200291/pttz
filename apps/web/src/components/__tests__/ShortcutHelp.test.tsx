// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShortcutHelp } from "../ShortcutHelp";
afterEach(cleanup);

describe("shortcut help", () => {
  it.each(["home", "board", "article"] as const)("shows contextual shortcuts for %s and closes with Escape", (page) => {
    render(<ShortcutHelp page={page} />);
    fireEvent.keyDown(document.body, { key: "h" });
    expect(screen.getByRole("dialog", { name: "快捷鍵" })).toBeInTheDocument();
    expect(screen.getByText(page === "home" ? "輸入看板名稱" : page === "board" ? "設定推文數門檻" : "回應文章")).toBeInTheDocument();
    if (page !== "article") expect(screen.queryByText("回應文章")).toBeNull();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("ignores input, modifiers, held keys and existing dialogs", () => {
    const { rerender } = render(<><ShortcutHelp page="home" /><input aria-label="搜尋" /><div role="dialog">其他視窗</div></>);
    fireEvent.keyDown(document.body, { key: "h" });
    expect(screen.queryByRole("dialog", { name: "快捷鍵" })).toBeNull();
    rerender(<><ShortcutHelp page="home" /><input aria-label="搜尋" /></>);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "h" });
    for (const extra of [{ ctrlKey: true }, { isComposing: true }, { repeat: true }]) fireEvent.keyDown(document.body, { key: "h", ...extra });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("does not open for unsupported pages and removes its listener when unmounted", () => {
    const { unmount } = render(<ShortcutHelp page="compose" />);
    fireEvent.keyDown(document.body, { key: "h" });
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    expect(fireEvent.keyDown(document.body, { key: "h" })).toBe(true);
  });
});
