# Goal 12 新版核心適配紀錄

## 實作

- 三個 sub-agent 分別處理 ANSI 呈現、撤回／歷史、共用代理；主 agent 處理分享與整合。修改範圍分離，app.ts 由主 agent 統一接線。
- 正文只建立安全文字節點與受控樣式；解析 SGR 前景、底色、高亮與 reset，其他終端控制序列不顯示。一般文字繼承網站樣式，媒體辨識使用去除控制碼的正文。
- 撤回回覆保留淡色虛線占位與子回覆，不顯示舊內容、票數及歷史。歷史由 `originalVersion` 與 `resultContent` 呈現，不自行重算區段更正。未編輯回覆不顯示歷史。
- Web 與 Threads 共用 repo `dev/` 代理、目標設定及 Telnet codec；沒有把 terminal 邏輯搬入 UI。Threads 支援 local／ptt 指令、對應 protocol／pushFormat，登入前標示目標，preview 使用 fake gateway。
- 新分享連結僅使用有效 AID，不再發出 index 連結；保留既有 index 連結的讀取入口。

## 範圍決策

- 沿用已確認的四項適配方案，以獨立檔案分工，不另開分支或重寫核心規則。整合及審查集中在 Goal 12 worktree。
- AID 不可從正文任意網址猜測。公開 DTO 尚未保證將列表 index 解析為已核對 AID，故無 AID 時先停用分享；代價是目前許多列表文章仍不能分享。完整開放需另補公開穩定身分能力，不把安全停用宣稱為完整解析功能。
- Web 保持原本預設目標；Threads 未提供設定時保持正式站。`PTT_TARGET` 可覆寫預設，明確命令模式優先。避免共用工具抽取改變既有連線目的地。

## 回歸與審查

- 分享先確認可變 index 與不合法 AID 的 RED，再阻擋產生連結。
- 原始終端文字經真實 core 解析到 Threads DOM：覆蓋 ANSI 安全、五顆愛心的原始版本、兩次區段更正後完整內容、撤回父回覆及子樹。
- 整合回歸抓到未編輯回覆誤建歷史，原 agent 修正並補測；讀取模組審查已通過。
- 共用代理審查抓到 Threads 預設站台被改為 local，交回原 agent 補預設／設定／明確模式優先順序測試。
- 瀏覽器僅使用 fake 預覽：串流載入、原位展開及巢狀回覆可操作；未登入或寫入本機／正式 PTT。彩色及編輯／撤回情境由跨層 DOM 回歸覆蓋，不宣稱已實站驗證。

## 驗證

- 最終 `npm run verify` exit 0：core 448、browser 467、web 382、開發代理 21、Threads 98、smoke helpers 11。兩個 UI 型別檢查／建置與 package smoke 通過；lint 0 errors／3 個既有 warnings，bundle 大小提示仍在。
- 讀取模組審查及整體審查皆通過，沒有未解決的重大問題；`git diff --check` 通過。
- 前一輪完整驗證遇到同時進行中的預設目標與登入標記 RED，修正完成後從頭重跑上述驗證，不以局部綠燈代替完整結果。
