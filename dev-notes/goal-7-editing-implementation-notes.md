# Goal 7 編輯功能實作筆記

設計依據見 `goal-7-editing-design.md`，執行步驟見 `goal-7-editing-implementation-plan.md`。

## 已完成行為

- 文章編輯會預填目前標題與正文；簽名檔、既有 PTT `※ 編輯:` 區段不會出現在可編輯正文中。
- 每次成功編輯會附加單行 `※ PTTzzz 編輯摘要：...` marker。Parser 會把 marker 從正文抽離，轉為獨立 revision，顯示在正文末端、回文區上方。
- 摘要會移除 ANSI、control character 與換行、壓縮空白，最長保留 120 字元；空摘要不允許送出。
- Fake adapter 會驗證登入狀態、作者、標題與文章 index，真正更新 localStorage；不再回傳未保存的假成功。
- 推文的「編輯」不修改 PTT 舊推文，而是送出中立新推文，格式為補充、更正或撤回。聚合推文撤回會使用 `sourceFloors` 的最小至最大樓層。
- 文章與推文編輯只有在 adapter 回傳成功後才離開編輯畫面或 reload；失敗會顯示具體原因並保留草稿。

## 正式 PTT 文章編輯狀態機

1. 先完整讀取指定文章，比對 expected author 與 title；身分不同時不送出 `E`。
2. 回到正常看板畫面，依 article index 重開文章，再由可見畫面重新確認作者與標題。
3. 送 `E` 後必須同時辨識「文章編輯」以及 `Ctrl-X`、插入模式或取代模式字樣，才允許輸入正文。
4. 使用 `Esc+,` 回到編輯器頂端，依原始文章與既有 revision 行數送出對應次數的 `Ctrl-Y`，再逐行輸入新正文、保留 footer、舊 revision 與新摘要。
   原文或替換內容超過 2,000 行時會在進入 editor 前停止，避免產生不受控的終端刪除命令。
5. 送 `Ctrl-X` 後必須辨識儲存確認提示，回答 `y`；最後還要辨識更新完成、文章閱讀畫面或已返回目標看板，才回傳成功。
6. 無法進入 editor 或無法取得儲存提示時會嘗試 `Ctrl-X` 後回答 `n`，或使用 `Ctrl-C` 取消。若送出 `y` 後無法確認結果，會回傳「請重新載入檢查」，不宣稱成功。

## Red / Green 驗證

- Parser、action contract、fake adapter、正式 adapter、文章 UI 與推文 UI 都先新增會失敗的測試，再實作至通過。
- Node 26 下 jsdom 缺少 storage origin 的基線問題，透過 `src/test/setup.ts` 提供測試用 storage fallback；此修正不影響正式 runtime。
- 2026-07-17 完整回歸：22 個 test files、294 tests 全數通過。
- ESLint：0 errors、6 個既有 warnings；本次程式沒有新增 warning。
- TypeScript 與 Vite production build 成功；仍有既有的大於 500 kB chunk 警告。

## 安全限制與未驗證項目

- 本次沒有使用真實 PTT 帳密，也沒有對真站執行任何文章或推文寫入。正式狀態機目前以 deterministic bot screen tests 驗證。
- PTT 畫面文字若改版，editor／save prompt pattern 可能需要調整；失敗時預設保守停止，不繼續輸入。
- PTT 編輯器是終端逐行操作，網路中斷或伺服器延遲仍可能造成結果不明；UI 會要求重新載入確認，不做樂觀更新。
- 「撤回」是新增聲明推文，不會刪除 PTT 上既有推文；這是 PTT 資料模型限制下的產品語意。
