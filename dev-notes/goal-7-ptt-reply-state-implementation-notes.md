# Goal 7 PTT 回文狀態修正 Implementation Notes

## 完成內容

- 原作者在文章回覆與樓層回覆 Composer 中只能選擇 `→`；`推`、`噓` disabled，提示使用 PTT 原文 `作者本人, 使用 → 加註方式`。
- neutral-only 同時存在於 UI selector 與 `Article` 提交端，避免 stale state 或程式呼叫送出非 neutral 類型。
- 推文 adapter 使用 `ActionResult.code` 區分 `push-entry-timeout`、`push-content-prompt-timeout`、`push-confirm-timeout`，UI 不再覆蓋具體 reason。
- 只有前兩種「尚未送出內容」的失敗可以重新載入目標文章並重試一次；確認提示逾時代表結果不明，絕不自動重送。
- 原生回應到看板流程辨識 `文章已發表，請按任意鍵繼續`，按 Enter 後整理至原看板。
- 回應發表結果仍不明時，adapter 先嘗試返回原看板，再要求使用者重新整理檢查；正文不會重送。

## 實作細節與踩坑

1. PTTzzz UI 與 ptt-client terminal 是兩個不同狀態來源。上一個操作若停在完成提示，下一個 `X` 不一定會開啟推文選單，因此 pre-content failure 必須先重載文章再重試。
2. 成功重試前的 reload 只負責重新進入目標文章；推文成功後仍需第二次 reload 才能取得新回文，不能省略。
3. `按任意鍵繼續` 畫面可能同時包含 `文章已發表`。completion loop 必須先處理 continuation，否則會提早回傳成功而沒有按鍵歸位。
4. 回到看板本身不是文章確實發表的證據。若沒有 success/continuation 證據，cleanup 完成後仍回傳不確定結果。
5. `push-confirm-timeout` 發生時正文已交給 PTT；即使畫面沒有確認提示，也可能已經發表，因此不可自動重送。

## 測試策略

- adapter unit tests 使用短 timeout override 覆蓋三種推文失敗階段與回應 completion timeout。
- Composer tests 同時覆蓋 `reply`、`reply-push` 的 neutral-only UI 與 payload。
- Article tests 驗證 safe retry 最多一次、成功後資料刷新，以及 uncertain result 保留草稿與 adapter reason。
- 真站測試未自動執行，因 repository 指示禁止在未明確授權下發文或回文。
