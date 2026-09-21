# Goal 14：本機 PTT 測試環境

## 目標與設計

保留瀏覽器的同源 `/ptt-ws` 介面，由 Vite 開發代理選擇本機 TCP/Telnet 或正式 PTT WebSocket，不改 core 規則與 browser 公開 API。

- `npm run dev:local` 明確選本機；`npm run dev:ptt` 明確選正式站。
- `npm run dev` 讀取根目錄 `.env.local` 的 `PTT_TARGET`，未設定預設 local。
- 本機預設 `127.0.0.1:8888`，僅允許 loopback；設定錯誤或連線失敗時停止，不自動切正式站。
- 本機帳密保留於根目錄 `.env.local`，不使用 `VITE_` 前綴，不回傳瀏覽器、不提交。
- local/ptt 的明確 mode 優先於環境設定；切換須重新啟動開發伺服器。
- 本階段只處理開發環境，正式 build 行為不改；不將 local mode 靜默建置為正式站。

## 實作與驗證

### 1. 設定與 Telnet codec

- [x] 在 `apps/web/dev/pttTarget.test.ts` 測預設、明確 mode 優先與錯誤設定；以 `resolvePttTarget(mode, env)` 統一解析。
- [x] 在 `apps/web/dev/telnet.test.ts` 測跨封包協商、IAC escaping、Big5 原始位元組、terminal type 與 80×24 視窗協商。
- [x] 先確認測試失敗，再實作 `pttTarget.ts` 與 `telnet.ts`；不把 TCP data chunk 當作完整 Telnet 訊息。

### 2. 開發代理與指令

- [x] 在 `apps/web/dev/pttProxy.test.ts` 以本機 TCP／WS server 測真實雙向轉送、斷線、拒絕跨來源、精確路徑及正式模式 Origin。
- [x] 將 Vite 既有代理抽出為 `pttProxy.ts`；binary 原樣轉送，early input 有界排隊，socket／server 關閉時釋放資源。
- [x] 更新 root scripts、Vite 環境讀取與前端連線標示；不得曝露完整 env 或測試帳密。
- [x] 將新測試納入 `npm test`，更新型別檢查範圍。

### 3. 本機驗證與交付

- [x] 補 `.env.example`（帳密留空）、開發文件、實作筆記及 `implement.md`。
- [x] 以本機環境驗證連線／登入，不發文、推文、刪文或登入正式站；無法完成的部分明確記錄。
- [x] 跑 `npm run verify`、差異檢查與獨立審查；檢查帳密未入 Git／前端產物。完成階段後 commit，不推送或合併 dev。

## 審查重點

錯誤設定不得落入正式站；未就緒的上游不得漏掉輸入；Telnet 協商不能破壞中文字節；斷線／重啟不得殘留連線；帳密與來源限制不得因開發模式而省略。

## 第二階段：終端相容性與操作可靠性

### 目標與邊界

依據 [終端比對結果](goal-14-local-ptt-conformance.md)，共用操作流程支援已確認的畫面變體；只有冒號分隔等真正不同的格式參數依連線目標設定，不依開發／正式建置模式分流。

- 保留現有未提交改動；不修改 `spec.md`、不推送或合併 dev。
- browser 負責接收、狀態與文章身分；core 只處理容量和文字解析；UI 不辨識終端畫面。
- 接受明確列舉的畫面變體，不放寬文章身分與送達條件。未知提示停止寫入，不猜按鍵、不自動重送。
- AID、連續推噓與自動分段失敗先重現定位，不預設缺少網址或等待不足就是原因。
- 由同一實作者依序執行；使用 `superpowers:executing-plans`，各步先補失敗測試再修改。

### 4. 接收訊息與串流邊界

檔案：`apps/web/dev/pttProxy.ts`、`apps/web/dev/pttProxy.test.ts`、`packages/browser/src/internal/terminalDriver.ts`；如需獨立接收適配器，置於 `packages/browser/src/internal/`，不直接修改 node_modules。

- [ ] 補 2,154 bytes、連續大訊息及 Big5／ANSI 跨訊息案例，先確認原設定會失敗。測試須走實際接收端，不只驗證代理轉送成功。
- [ ] 查明 ptt-client 的接收及解碼邊界，採有界接收適配；若使用訊息切片，必須證明任意切點不遺失位元組且解碼狀態延續。不以單純提高 `blobSize` 作為完成條件。
- [ ] 驗證輸出與未切片資料相同、斷線會釋放緩衝、超限可控終止且沒有未捕捉例外；正式 WS 路徑同樣回歸。

### 5. 儲存提示的明確狀態分支

檔案：`packages/browser/src/internal/terminalDriver.ts`、`packages/browser/src/internal/terminalDriver.test.ts`；提示分類可抽為同目錄獨立模組。

- [ ] 使用本機 `[S]儲存`、正式 `[S/V]儲存` 和 Yes/No 快照補測試；正文提及「儲存」不得判為提示。
- [ ] 共用提示分類結果決定送 `s` 或 `y`，涵蓋發文、回覆文章、編輯文章；不依環境選按鍵。
- [ ] 測有／無簽名檔、額外選單項目、取消、拒絕與未識別畫面；修改成功須讀回內容，不能只靠站名、回到列表或編輯尾註。

### 6. AID 取得、驗證與編號失效

檔案：`packages/browser/src/internal/terminalDriver.ts`、`packages/browser/src/internal/terminalDriver.test.ts`、`packages/browser/src/gateway.ts` 與其既有測試。

- [ ] 保存 AID-only 開文失敗各階段的畫面與送鍵紀錄，建立可重播案例；分開測開文、Q 資訊、關閉資訊窗及取得文章內容。
- [ ] 用同一流程接受有／無網址的 Q 資訊，以看板與 AID 驗證；保留原 AID 大小寫資訊，不先假定可忽略大小寫。
- [ ] 補刪文後編號前移、同作者同標題不同 AID、過期列表及搜尋相對編號案例。編號是位置，不得在身分未確認時寫入。
- [ ] 刪除或重新整理後失效相關位置映射與列表資料，驗證後續分頁不漏列、不重複，也不拿舊快取覆蓋新文章。

### 7. 容量、逐段送達與讀回聚合

檔案：`packages/browser/src/internal/multipartReply.ts`、`multipartReply.test.ts`、`multipartTerminal.test.ts`、`terminalDriver.ts`、`terminalDriver.test.ts`、`packages/core/src/parser.ts`、`parser.test.ts`。

- [ ] 審核既有 local／ptt 分隔設定；同帳號兩種格式容量相差一欄，容量探測、確認解析、規劃與讀回使用一致參數。
- [ ] 對 `uncertain / 0 / 6` 增加失敗階段證據並重現；區分探測取消、確認拒絕、送出後斷線及讀回不符，不吞掉原因或盲目重送。
- [ ] 兩種格式共用測試矩陣：短文、滿容量、中英混合、符號、空白行、長度邊界、他人插入回覆、連續推噓與中途失敗。維持既有白皮書規則，不為測試改 expected。
- [ ] 走完整「原始終端文字 → parser → 聚合」驗證正文逐字相同；分段失敗保留未送內容，已確認片段不重送，不確定片段先讀回核對。

### 8. 驗證與交付

- [ ] 每個修正先執行對應測試確認紅燈，再確認綠燈；browser 使用 `npm test -w @pttzzz/browser`，core 使用 `npm test -w @pttzzz/core`，代理使用 web 的 dev 測試設定。
- [ ] 執行 `npm run verify` 與 `git diff --check`；確認既有正式站 fixture 全數通過，沒有帳密或未遮蔽診斷資料入版。
- [ ] 本機端到端測試僅使用測試帳號與自建 Test 文章；覆蓋發文、編輯、短推文、長文分段、讀回與刪文清理。無法執行時如實記錄，不以 mock 通過代替。
- [ ] 更新 `goal-14-implementation-notes.md`、比對文件及 `implement.md`，分別標明離線測試、本機實測與正式站快照回歸；完成可驗證階段後提交，不推送。

### 額外審查條件

任意封包切點不可破壞中文／ANSI；正文不能冒充提示；同名同作者文章不可混淆；缺省網址不能阻擋有效 AID；送出後斷線不可造成重複推文。上述條件分別由第 4 至 7 項測試覆蓋。

### 已授權追加重構

- 終端操作設定獨立於推文格式：明確指定 AID 開文需要一次或兩次 Enter，不根據未完成畫面補鍵。Q 返回看板後，必須以原 AID 重新定位，不開啟任意游標列。
- 編輯透過編輯器行列位置讀取正文邊界，只替換標頭與簽名／站台資訊之間的正文；保留後方推文、色碼與歷史，不用 reader 正文行數刪除整份檔案。儲存後重新讀取確認正文與身分。
- 已讀文章保存穩定 AID；索引對照隨列表世代失效，已開始長文固定原 AID。列表發現索引身分改變時捨棄舊頁，避免編號遞補造成錯誤合併。
- 補失敗／分片／同名文章與重編號測試，完整驗證及審查後提交；不推送。

### 交付檢查點（2026-09-21）

追加局部修正：回文送出前失敗保留具體原因（字數、字元、連線與文章狀態），UI 提供對應指引及唯讀重新載入。維持草稿與不確定寫入保護，先補各層回歸再實作；不將未知失敗歸咎於內容。

- [x] 有界串流接收、跨訊息 Big5／ANSI、斷線清理與上游 `send` 回歸。
- [x] 儲存／取消提示分類及正文限定編輯，未知狀態拒絕寫入。
- [x] 明確 AID 導覽、Q 資訊驗證、同名文章與位置失效回歸。
- [x] 本機分頁 AID 錨點與 UI 重載，終端 → gateway → core → hook 跨層測試。
- [x] 分段完整回顯及確認列驗證，實際六段草稿讀回聚合。
- [x] 本機自建文章完成短回文、長文、30 行正文編輯及刪文清理。依既有授權使用 Gossiping，本機未配置 Test。
- [x] 獨立審查的三項重要問題修正；測試維持 UI 公開 API 邊界。

上方原始驗證矩陣保留作為後續覆蓋清單；本機置底列、全部連續推噓限制組合及正式站實際操作未列為本輪實測通過。完整驗證結果記於實作筆記。

- [x] 全形縮排長文：保留原始草稿、補分段至讀回聚合及終端回顯測試，修正空白遺失；維持逐字還原檢查。
