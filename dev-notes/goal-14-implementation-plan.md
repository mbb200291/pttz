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
