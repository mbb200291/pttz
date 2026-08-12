# Goal 8：回文投票一致性 Implementation Notes

## 結果

- 回文 `score` 改由已去重的明確投票者清單推導。
- 同一回文送票期間以同步 guard 阻止重複 PTT 推文。
- pending 狀態只鎖定目標回文，成功與失敗皆會解除。
- 投票命令沿用 PTT 原始推文樓號；隱藏命令不會改變後續目標解析。

## 實作細節

- `pushVoters` 與 `booVoters` 是回文分數的唯一來源，公式為 `pushVoters.length - booVoters.length`。
- 一般 `回x樓：` 不再參與父回文 `score`，即使該回覆使用 PTT 推或噓類別送出。
- React state 負責呈現按鈕 disabled 狀態，ref 內的 `Set` 負責同一 render 期間的同步防重。
- 鎖定範圍是單一回文；不同回文仍可同時送票。
- action 成功後才更新目前使用者的投票狀態並重新載入文章；失敗時保留原狀態並解除鎖定。

## 樓號

投票 pattern 的樓號對應 PTT 原始推文樓號。純投票推文雖不顯示成回文，仍占用 PTT 的原始樓號；後續卡片保留 `sourceFloors`，UI 送票也取 `sourceFloors[0]`，因此視覺上可能跳號，但投票目標仍一致。

## 未納入範圍

- 文章與回文的投票撤回由 Goal 9 處理。
- 回文 Append、Replace、Withdraw 解析由 Goal 10 處理。
