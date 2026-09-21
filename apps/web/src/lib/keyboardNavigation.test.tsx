/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canUseShortcut } from "./keyboardNavigation";
afterEach(cleanup);

describe("fixed shortcut guards", () => {
  it("guards command shortcuts from editing, dialogs, selection and modifiers", () => {
    const command = vi.fn();
    const { container } = render(<div onKeyDown={(event) => {
      if (canUseShortcut(event)) command();
    }}>
      <button>Command target</button>
      <input aria-label="Command input" />
      <textarea aria-label="Command textarea" />
      <select aria-label="Command select"><option>one</option></select>
      <div contentEditable suppressContentEditableWarning>Editable</div>
      <video aria-label="Command video" />
    </div>);
    const target = screen.getByText("Command target");
    fireEvent.keyDown(target, { key: "x" });
    expect(command).toHaveBeenCalledOnce();
    command.mockClear();
    for (const element of container.querySelectorAll("input, textarea, select, [contenteditable], video")) {
      fireEvent.keyDown(element, { key: "x" });
    }
    for (const extra of [{ repeat: true }, { isComposing: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      fireEvent.keyDown(target, { key: "x", ...extra });
    }
    const selection = window.getSelection()!;
    selection.selectAllChildren(target);
    fireEvent.keyDown(target, { key: "x" });
    selection.removeAllRanges();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    target.parentElement!.append(dialog);
    fireEvent.keyDown(target, { key: "x" });
    fireEvent.keyDown(dialog, { key: "x" });
    expect(command).not.toHaveBeenCalled();
  });
});
