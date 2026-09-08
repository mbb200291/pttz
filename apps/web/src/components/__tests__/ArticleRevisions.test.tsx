import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ArticleRevisions } from "../ArticleRevisions";

describe("ArticleRevisions", () => {
  it("renders structured summaries as a separate revision section", () => {
    const html = renderToStaticMarkup(
      <ArticleRevisions
        revisions={[
          {
            summary: "修正數據來源",
            rawBlock: "※ PTTzzz 編輯摘要：修正數據來源",
            markerOffset: 10,
          },
        ]}
      />,
    );

    expect(html).toContain("編輯紀錄");
    expect(html).toContain("修正數據來源");
    expect(html).not.toContain("※ PTTzzz 編輯摘要");
  });

  it("renders nothing when no revisions exist", () => {
    expect(renderToStaticMarkup(<ArticleRevisions revisions={[]} />)).toBe("");
  });
});
