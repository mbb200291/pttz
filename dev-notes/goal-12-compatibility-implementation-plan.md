# Goal 12 新版核心適配

實作狀態：四項已完成此輪範圍，並經讀取模組及整體審查；AID 缺少時採安全停用，尚未新增全文章的 AID 解析能力。測試與限制見 [實作紀錄](goal-12-compatibility-implementation-notes.md)。

## 範圍

依已確認的 dev 同步檢視，補彩色正文、撤回與編輯歷史、本機代理及穩定分享。維持唯讀，不修改聚合規則、不推送或合併 dev，不連線 PTT 寫入。工作基準為 fe8b71b。

## Task 1：安全彩色正文

- 新增 Threads 專用文字呈現模組與測試，不修改 app.ts。提供 renderArticleBody(element, text) 與 plainArticleText(text)。
- 使用安全文字節點及受控 SGR 樣式，保留預設網站字體色彩，僅呈現作者明確指定的前景／底色／高亮。保留空白及換行，未知控制碼不顯示、不執行。
- 可重用公開 core ANSI 解析能力；不 deep-import core、不匯入 React UI。圖片及影片辨識使用去控制碼的文字。
- 測試真實 ANSI、reset、前景／背景、HTML 字面文字、安全性與重複更新。

## Task 2：撤回與歷史

- 新增 Threads replyPresentation.ts 與測試，不修改 app.ts。提供 renderReplies(replies, final): HTMLElement。
- 保留 visible=false 節點的位置及子樹，以「此回覆已撤回」替代內文；不露出撤回原文及歷史。
- 可見回覆歷史使用 originalVersion 與 edit.resultContent，舊資料缺少 resultContent 時只使用可確認內容，不自行套用更正規則。
- 不顯示 append／replace 等開發標籤，保留作者、回覆關係及原有縮排界線。
- 測試撤回父節點、子回覆、原始版本、多次區段更正與惡意 HTML 字面內容。

## Task 3：共用開發代理

- 將 Web 既有代理／目標設定抽至共用 dev/（或等價 repo 內共用目錄），兩個 UI 共用，保持原代理測試。
- Threads 加 local／ptt 啟動指令與目標標記，入口使用相符 pushFormat、terminalProtocol；preview 不連線。
- 保留 local 僅開發環境限制、預設正式站、資源清理與現有 Web 指令。
- 修改範圍限 Vite／代理／啟動入口／package 設定及對應測試，不碰 app.ts、樣式及 Threads README（主 agent 統整）。

## Task 4：分享與整合

- 主 agent 整合三個模組，文章分享只使用穩定 AID；先從公開 Article 資料取得已核對身分，不以可變 index 建立新分享連結。
- 若公開資料無 AID，不猜測；保留簡短不可用狀態。仍接受既有 index 入站連結以免破壞原入口。
- 補 core 原始文章 → Threads DOM 的 ANSI／歷史回歸、AID 分享與過期結果測試。
- 更新面向使用者 README 及 dev-notes；完整 verify、檢視 diff，完成可驗證階段後提交本分支。

## 分工及驗證

- 獨立模組由三個 sub-agent 在互不重疊檔案上處理；app.ts 與整合測試僅主 agent 修改。代理 agent 可修改 main.ts、package.json，其他 agent 不修改。
- 各項先 RED 後 GREEN，回報測試證據；主 agent 統一跑完整 verify，另做整體審查。原始 fixture expected 不為遷就實作修改。
- 本輪不新增規則版本。若需要新的公開 API 或無法確定文章身分，先評估既有契約可達成的安全方案。
