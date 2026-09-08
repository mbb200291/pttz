/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { navigateList } from "./keyboardNavigation";
afterEach(cleanup);

function setup() {
  const open = vi.fn();
  const back = vi.fn();
  render(<div onKeyDown={(event) => navigateList(event, back)}>
    <button data-navigation-item onClick={open}>第一筆</button>
    <button data-navigation-item disabled>已刪除</button>
    <button data-navigation-item>第三筆</button>
    <input aria-label="搜尋" />
    <div role="button" tabIndex={0} data-navigation-item onClick={open}>看板<button>最愛</button></div>
  </div>);
  return { open, back, first: screen.getByText("第一筆"), third: screen.getByText("第三筆") };
}

describe("scoped keyboard navigation", () => {
  it("moves focus without opening and skips disabled rows", () => {
    const { first, third, open } = setup();
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(third).toHaveFocus();
    fireEvent.keyDown(third, { key: "ArrowUp" });
    expect(first).toHaveFocus();
    expect(open).not.toHaveBeenCalled();
  });
  it("opens with right arrow and goes back with left arrow", () => {
    const { first, open, back } = setup();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(open).toHaveBeenCalledOnce();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(back).toHaveBeenCalledOnce();
  });
  it("does not intercept inputs, composing text, modifiers or nested actions", () => {
    const { first, open, back } = setup();
    fireEvent.keyDown(screen.getByLabelText("搜尋"), { key: "ArrowLeft" });
    fireEvent.keyDown(first, { key: "ArrowRight", isComposing: true });
    fireEvent.keyDown(first, { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(screen.getByText("最愛"), { key: "ArrowRight" });
    expect(open).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
  it("activates non-button board cards using Enter", () => {
    const { open } = setup();
    fireEvent.keyDown(screen.getByText("看板"), { key: "Enter" });
    expect(open).toHaveBeenCalledOnce();
  });
});
