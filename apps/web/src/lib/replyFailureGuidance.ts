import type { ReplyDraftIssue } from "@pttzzz/core";

export function replyFailureGuidance(issue?: ReplyDraftIssue): { message: string; reload: boolean } {
  switch (issue?.kind) {
    case "too-long": return { message: `超出 ${issue.excessColumns / 2} 個全形字（${issue.excessColumns} 個半形字），請縮短內容後再送出。上限為 500 個全形字。`, reload: false };
    case "unsupported-characters": return { message: `PTT 不支援 ${issue.characters.slice(0, 8).join("、")}${issue.characters.length > 8 ? "等字元" : ""}，請刪除或替換後再送出。`, reload: false };
    case "connection": return { message: "PTT 連線或登入已失效，請先複製草稿，重新登入後再送出。", reload: false };
    case "article-unavailable": return { message: "目前無法確認這篇文章，請重新載入文章後再送出。", reload: true };
    case "capacity": return { message: "未能確認推文輸入欄位，請重新載入文章後再送出。", reload: true };
    case "content-layout": return { message: issue.reason === "control-characters"
      ? "內容含 Tab 或其他控制字元，請移除或改用一般空白後再送出。"
      : issue.reason === "leading-space"
        ? "段落或分段開頭的空白無法保留，請移除縮排，或調整空白附近的換行後再送出。"
        : "目前的換行或行尾符號無法完整分段，請調整段落後再送出。", reload: false };
    default: return { message: "暫時無法開始送出，請先重新載入文章；若仍失敗，請稍後再試。", reload: true };
  }
}
