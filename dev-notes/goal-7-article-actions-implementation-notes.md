# Goal 7 子項：作者推噓防護與文章動作列實作紀錄

## 完成範圍

- 文章作者不能對自己的文章按推或噓；ID 比對不分大小寫，按鈕 disabled 並固定顯示原因。
- 文章右上角固定顯示「刪除／編輯／回應」。刪除與編輯不是作者時保留但反灰，舊的右上「回文」入口已移除。
- 下方「回覆此文」維持一般 PTT 推文／箭頭加註用途。
- 「編輯」沿用既有 `compose-edit` 與 `editArticle()`，沒有建立第二套文章編輯邏輯。
- 「回應」開啟鎖定看板與單一 `Re:` 標題的全頁 Composer，送出後建立看板回應文章。
- 回應失敗時保留 Composer 與正文，顯示 adapter 原因；成功後返回原看板。

## PTT 原生回應流程

`replyArticleToBoard(request)` 進入 adapter serial queue，先用 index 或 AID 重新載入來源文章，核對作者與標題，再操作 PTT 終端。

依 PTT 官方 `mbbsd/bbs.c` 的 `do_reply()` 與 `do_generalboardreply()` 流程：

1. 開啟來源文章後送出 `y`。
2. 辨識回應目的地選單，明確送出 `F`，只回應到看板，不寄作者信箱。
3. 接受 PTT 產生的原 `Re:` 標題。
4. 進入 editor 後清除原生預填引文，寫入 UI 中可見的正文。
5. 儲存，處理分類規定與簽名檔提示，確認回到來源看板才回報成功。

任何定位、身分核對、權限、editor 或儲存確認失敗都回傳 `{ ok: false, reason }`；不會降級成一般 `postArticle()`。

## Fake Adapter

Fake Adapter 核對來源文章身分後，在同一看板建立下一個 index 的文章。標題用 `formatBoardReplyTitle()` 正規化成單一 `Re:`，作者是登入中的 fake 使用者，正文只包含 Composer 送出的內容。

## 測試覆蓋

- hook 完整轉交 `ReplyArticleToBoardRequest`。
- Fake Adapter 成功建立 `Re:` 文章、避免重複 `Re:`、拒絕過期文章身分。
- 正式 adapter 核對來源身分、只選 F 看板、接受原標題、清除引文、逐行寫入、儲存與簽名檔提示。
- Composer 鎖定看板／標題、隱藏分類、正文必填、pending disabled。
- Article 固定三按鈕、作者權限、移除上方回文入口與保留下方「回覆此文」。
- App 成功返回看板；失敗保留回應 Composer 並顯示原因。

自動化測試全部使用 fake adapter、mock action 或模擬終端畫面，不會對真實 PTT 發文、推噓、編輯或刪除。
