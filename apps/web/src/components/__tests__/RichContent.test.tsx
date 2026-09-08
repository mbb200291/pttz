/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RichContent } from "../RichContent";
afterEach(cleanup);

describe("original body layout", () => {
  it("preserves spaces and table URLs verbatim when original layout is selected", () => {
    const text = "  +---+--------------------------------+\n  |圖 | https://i.example.test/a.jpg    |\n  +---+--------------------------------+\n";
    render(<RichContent text={text} variant="body" />);
    fireEvent.click(screen.getByRole("button", { name: "原始排版" }));
    const source = screen.getByRole("region", { name: "原始正文" });
    expect(source.querySelector("pre")?.textContent).toBe(text);
    expect(source.querySelector("pre")).toHaveStyle({ whiteSpace: "pre" });
    expect(source.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: "自動換行" })).toBeInTheDocument();
  });
});
