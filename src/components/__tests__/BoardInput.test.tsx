import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardInput } from "../BoardInput";

describe("BoardInput", () => {
  it("uses the design-token home surface and product copy", () => {
    const html = renderToStaticMarkup(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
      />,
    );

    expect(html).toContain("PTTZ");
    expect(html).toContain("計畫");
    expect(html).toContain("var(--bg)");
    expect(html).toContain("var(--surface)");
    expect(html).toContain("常用看板");
  });

  it("renders live popular board data when provided", () => {
    const html = renderToStaticMarkup(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
        popularBoards={[
          { name: "LiveBoard", zh: "實際熱門", online: "123" },
        ]}
      />,
    );

    expect(html).toContain("LiveBoard");
    expect(html).toContain("實際熱門");
    expect(html).toContain("123 在線");
    expect(html).not.toContain("28,420");
  });

  it("does not show fake online counts when live data is unavailable", () => {
    const html = renderToStaticMarkup(
      <BoardInput
        pttState="ready"
        wsStatus="connected"
        onEnter={() => {}}
      />,
    );

    expect(html).not.toContain("28,420");
    expect(html).not.toContain("12,880");
    expect(html).toContain("即時人數待同步");
  });
});
