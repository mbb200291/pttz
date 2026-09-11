/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TerminalGlyph } from "../TerminalGlyph";
afterEach(cleanup);

it.each([
  ["█", 0, 0, 2, 2], ["▀", 0, 0, 2, 1], ["▄", 0, 1, 2, 1],
  ["▁", 0, 1.75, 2, 0.25], ["▌", 0, 0, 1, 2], ["▐", 1, 0, 1, 2],
])("draws %s as its correct terminal cell fraction", (text, x, y, width, height) => {
  const { container } = render(<TerminalGlyph text={String(text)} />);
  const rect = container.querySelector("rect");
  for (const [name, value] of Object.entries({ x, y, width, height })) {
    expect(rect).toHaveAttribute(name, String(value));
  }
  expect(container.textContent).toBe(text);
});
