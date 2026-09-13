# 指定文章 #1gfWDlNT：巢狀回文與回文推噓

2026-09-13 13:58–14:02（Asia/Taipei），依使用者授權在 Test 板 `#1gfWDlNT`（askz0，`test test`）實際新增 8 筆留言。**這 8 筆保留在真站；沒有刪除或編輯指定文章。** 本輪登入選 n 保留其他連線，結束正常登出（WebSocket 1000）。

- [52 張畫面索引](INDEX.md)
- [最終文章畫面](047.txt)
- [操作時間與按鍵](events.json)、[前後畫面對照](transitions.json)
- [9 個階段的規範期望](cases.json)、[來源與畫面 SHA-256](manifest.json)

## 實際送出的 8 筆

| 原始留言序號 | PTT 類別 | 內容 | 驗證用途 |
|---|---|---|---|
| 3 | → | 回2樓：pttzzz-R1357 第一層回覆測試。 | 回覆既有第 2 樓 mod980 的 `123` |
| 4 | → | 回3樓：pttzzz-R1357 第二層巢狀測試。 | 再回覆剛建立的回文，形成第二層 |
| 5 | → | 推2樓 | 第 2 樓由 0 變 +1 |
| 6 | → | 噓2樓 | 同一人換票，第 2 樓由 +1 變 -1 |
| 7 | → | 推3樓 | 巢狀回文由 0 變 +1 |
| 8 | → | 噓3樓 | 同一人換票，巢狀回文由 +1 變 -1 |
| 9 | → | 推2樓：pttzzz-R1357 帶文字推回文測試。 | 正文回覆第 2 樓，同時將票切回 +1 |
| 10 | → | 噓3樓：pttzzz-R1357 帶文字噓回文測試。 | 正文回覆第 3 筆，維持 -1，不累加成 -2 |

「樓」在 wire command 中指**原始留言序號**，不是聚合後 UI 的 `floorNumber`。本例 `reply:3` 的 `sourceFloors` 是 `[3]`，雖然 UI 樓層可能繼承根回文，第 4 筆仍必須用 `回3樓` 才能指向它。

最終可見節點：

```text
reply:1  askz0: 測試
reply:2  mod980: 123                         score +1
  reply:3  第一層回覆測試                    score -1
    reply:4  第二層巢狀測試
    reply:10 帶文字噓回文測試
  reply:9  帶文字推回文測試
```

原始第 5–8 筆屬純投票控制事件，不作一般回文顯示；帶正文的第 9–10 筆則保留為可見節點。每個回讀階段的 PTT 原生文章分數都是 1，因新增的 8 筆均為箭頭留言。

## 捕捉到的真站分支

[015.txt](015.txt) 有推／噓／箭頭類別選單。短時間再次按 X，[020.txt](020.txt) 顯示 `時間太近, 使用 → 加註方式`，直接進入箭頭輸入框；後續不再送類別數字，避免把它寫進正文。

這是本次觀察到的冷卻分支，不足以推定其他日期所有推文入口異常均為同一原因。此次沒有測試冷卻解除後的原生「推／噓」類別送出。

## 離線回歸驗證

新增 `packages/browser/src/internal/realPttNestedReplies.test.ts`，共 18 項測試：

- 9 個回讀階段透過現有 `parsePartialScreen` 驗證完整可見節點、`sourceFloors`、`replyTo`、正文、分數及投票名單。
- 8 個寫入前後差異：每次只新增一筆指定作者、內容與 neutral 類別的留言，既有留言保持一致。
- 1 個入口案例：區分類別選單與冷卻直接箭頭輸入，核對操作序列沒有額外類別按鍵。

在 repository 根目錄執行 `npm test -w @pttzzz/browser` 可一併執行這些測試；只跑本檔可在 `packages/browser` 執行：

```sh
npx vitest run src/internal/realPttNestedReplies.test.ts --config vitest.config.ts
```

本次為「真站 terminal 操作＋回讀」及「browser parser/core 離線驗證」，未透過 Web UI 或 public client 送出，也不等於 UI 巢狀顯示、public client 寫入、撤票、權限錯誤或並行修改都已通過。

## 保存限制

每張有 24 行文字、重建 ANSI、游標及行屬性 JSON；未記錄原始 WebSocket 封包。帳號與 IPv4 遮蔽、Big5 裝飾圖失真、遮蔽區座標限制沿用[初輪說明](../README.md#格式與使用限制)。`cases.json` 的期望是按操作語意明確指定，再與實作比對；沒有從 parser 輸出自動生成期望。
