import type { ArticleRevision } from "../lib/ptt/parser";

export function ArticleRevisions({
  revisions,
}: {
  revisions: ArticleRevision[];
}): JSX.Element | null {
  if (revisions.length === 0) return null;

  return (
    <details
      style={{
        margin: "20px 0 24px",
        padding: "12px 14px",
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--surface)",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        編輯紀錄（{revisions.length}）
      </summary>
      <ol
        style={{
          margin: "12px 0 0",
          paddingLeft: 22,
          color: "var(--text-muted)",
          fontSize: 13,
          lineHeight: 1.7,
        }}
      >
        {revisions.map((revision, index) => (
          <li key={`${revision.markerOffset}-${index}`}>{revision.summary}</li>
        ))}
      </ol>
    </details>
  );
}
