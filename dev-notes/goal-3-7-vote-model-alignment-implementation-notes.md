# Goal 3／7 投票與回文模型對齊 Implementation Notes

## 基準

- Primary contract: `dev-notes/goal-7-vote-model-review.html`（25 cases）
- Supporting requirements: `dev-notes/spec.md` Goal 3／7
- Baseline: 26 test files、344 tests passed

## 已確認的現行差異

1. 現行流程先依作者聚合再解析 reply，會混合不同結構目標。
2. `推x樓 body／噓x樓 body` 會計票但不會掛成巢狀回覆。
3. vote regex 沒有樓號後邊界，`推12樓主` 會誤判。
4. 聚合群組的 `anchorOrder` 被更新為最後續行，與首次出現排序不符。
5. 文章分數從已顯示卡片計算，漏掉隱藏控制事件及巢狀 PTT 推噓類別。
6. 真／fake adapter 的回文投票仍使用 PTT 推／噓類別，而規格要求中立類別。
7. 目前沒有解析回文投票撤回及 Append／Replace／Withdraw 歷史。
8. UI 阻擋第三層繼續回覆，與「超過三層提升到第三層」不符。

## 實作決策

- 所有 regex 只解析行首，樓號後採明確 delimiter。
- 原始 PTT type 與內容 intent 是獨立軌道。
- 編輯 payload 只作為文字，不重新進入 intent parser。
- 純控制事件不參與可見內容聚合。
- 同作者、同結構目標、時限內且上一段可續接時才聚合；無前綴續行繼承該群組目標。
- 回覆聚合卡任一 `sourceFloor` 都映射到同一卡片。
- 文章原生 score 直接統計所有 raw push type；文章按鈕只呈現純文章投票的應用層狀態。
- HTML 與 `spec.md` 文字衝突時採 HTML；因此 `噓x樓 body` 為扣分加可見巢狀回覆。

## 實作紀錄

後續每個 TDD task 完成後補充測試、資料模型變更與相容性處理。
