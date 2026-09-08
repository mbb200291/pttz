# Result 與 uncertain write

所有預期的 PTT 操作失敗使用 0.1 `Result`。完整 error/outcome 定義見 [contracts](../../../../packages/core/docs/contracts.md)。

```ts
import type { ArticleKey, PttzzzClient, Result } from "@pttzzz/core";

function presentWriteResult(result: Result<void>): void {
  if (result.ok) {
    showSuccess("操作完成");
    return;
  }

  const { error } = result;
  if (error.outcome === "uncertain") {
    showWarning("無法確認是否送出；請重新載入，不會自動重試。");
  } else if (error.outcome === "sent") {
    showWarning("內容已送出，但確認失敗；請重新載入確認。");
  } else {
    showError(error.message);
    setManualRetryEnabled(error.outcome === "not-sent" && error.retryable);
  }
}

export async function submitReply(
  client: PttzzzClient,
  article: ArticleKey,
  replyId: string,
  contentFromUser: string,
) {
  const result = await client.replyToReply({
    article,
    replyId,
    content: contentFromUser,
    pushType: "neutral",
  });
  presentWriteResult(result);
}
```

`retryable` 不足以授權自動 retry；`uncertain` 可能已被 PTT 接受，重送會產生重複內容。只有 `outcome === "not-sent"` 且 `retryable` 時，UI 才應提供由使用者觸發的重試。
