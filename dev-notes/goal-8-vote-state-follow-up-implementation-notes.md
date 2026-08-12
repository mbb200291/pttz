# Goal 8 Follow-up：投票狀態與文章投票隱藏 Implementation Notes

## 結果

- 單獨 `推`／`噓` 保留為文章投票資料，但不再顯示於完整或 progressive 討論串。
- 文章投票方向以內容語意修正，因此既有 `→ user: 噓` 仍計為文章噓。
- 回文 voter ID 採不分大小寫比對，同一帳號只保留最後方向。
- 點擊已選方向不再建立假的本地撤回狀態，也不會送出重複投票。
- 推噓切換後，optimistic count 先移除舊方向再加入新方向；parser 確認後清除 override。
- adapter 必須確認 PTT 類型選單及內容輸入階段，才會送出推噓內容。

## 文章投票事件

`detectArticleVote()` 只辨識 trim 後恰為 `推` 或 `噓` 的內容。事件仍存在於 `ArticleData.pushes`，讓 `calcArticleScore` 與文章統計使用；`PushThread` 與 `LightweightPushList` 則在呈現前排除事件。

含有其他文字的 `推 好文`、`噓 原因` 不會被隱藏。`推x樓`／`噓x樓` 仍由回文投票 parser 處理。

## 最後一票與 UI 狀態

`normalizePttId()` 取 PTT ID 並轉為小寫。聚合器 voter map、舊方向移除及 UI 的 current user 判斷都使用相同規則。

回文投票在 Goal 9 前只使用未投票、已推、已噓三個解析狀態，不允許按已選方向產生本地 0。真正撤回仍需送出持久化指令，不能只改 React state。

Optimistic override 在新的 article data 顯示相同方向時移除，避免後續 voter 人數更新被舊的本地 count 遮蔽。

## PTT 類型選擇

送出 `X` 後會輪詢等待類型選單。選單出現後依序選擇：

- push：`1`
- boo：`2`
- neutral：`3`

選擇後還必須確認內容輸入 prompt，才會傳送內容。push／boo 未看見類型選單時會送 Ctrl-C 取消並回傳失敗，不自動重試或降級成 neutral。

PTT 可能對文章作者本人強制使用 `→`。本次修正選擇拒絕把該結果當成成功的推／噓，以符合系統推噓必須使用 PTT 原生限制的規格。

## 驗證界線

所有送出測試使用 fake terminal，未使用真實帳號發文或回文。實站驗證需要另行授權。
