export interface ArticleSummary {
  index: number;
  mark: string;
  pushCount: string;
  date: string;
  author: string;
  title: string;
  fixed?: boolean;
}

// UI-only editable-article helpers retained by the reference app; protocol
// parsing and reply projection belong to @pttzzz/core.

export interface ArticleEditRecord {
  marker: string;
  content: string;
  rawBlock: string;
  markerOffset: number;
}

export interface ArticleRevision {
  summary: string;
  rawBlock: string;
  markerOffset: number;
}

export function splitArticleEditableContent(body: string): {
  editableBody: string;
  preservedFooter: string;
} {
  const lines = body.replace(/\r\n?/gu, "\n").split("\n");
  const footerStart = lines.findIndex((line) => {
    const plain = line.trim();
    return plain === "--" || /^※\s*(?:編輯|PTTzzz 編輯摘要)：/u.test(plain);
  });
  return footerStart < 0
    ? { editableBody: body.trimEnd(), preservedFooter: "" }
    : {
        editableBody: lines.slice(0, footerStart).join("\n").trimEnd(),
        preservedFooter: lines.slice(footerStart).join("\n").trimEnd(),
      };
}
