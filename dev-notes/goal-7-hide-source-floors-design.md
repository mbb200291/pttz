# 隱藏 PTT 原始樓號設計

## 目標

pttzzz 的一般閱讀畫面不顯示原始 PTT 樓號，避免聚合卡片出現 `1–2F` 或 `1、3F` 等實作資訊。

## 設計

- 移除回文卡片上的可見樓號 chip。
- `AggregatedPush.sourceFloors` 保持不變，繼續供回覆、投票、編輯與撤回定位。
- 每張回文卡片加入 `data-source-floors="1,3"`；此資料不顯示、不提供 tooltip，也不增加更多選單。
- 沒有來源樓號的合成節點不輸出該 attribute。

## 測試

- UI markup 不再包含 `1–2F` 或 `4、7F` 樓號 chip。
- 回文卡片仍包含對應的 `data-source-floors`。
- 既有回覆、投票及編輯功能仍使用 `sourceFloors[0]` 或完整範圍，不改變行為。

## 非目標

- 不修改 parser、聚合、樓號映射或送出格式。
- 不增加 tooltip、資訊按鈕、更多選單或除錯面板。
