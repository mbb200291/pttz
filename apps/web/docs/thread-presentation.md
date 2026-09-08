# Web 介面的嵌套回文呈現

本文件定義 `apps/web` 對白皮書 THREAD-004 核心資料的呈現選擇。核心提供的原始回覆對象與定位是權威資料；以下規則只改變視覺層級。

## WEB-THREAD-001 最大顯示深度

1. Web 介面的最大顯示深度為三層。
2. 原始深度超過三層的回覆，提升為第三層的同層節點。
3. 提升只影響顯示父節點；回覆、推噓、編輯與撤回仍使用核心提供的原始 `replyId` 與回覆對象。

對應案例位於 [`fixtures/thread-presentation.json`](./fixtures/thread-presentation.json)。
