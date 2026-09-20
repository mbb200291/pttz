# Goal 14 實作紀錄

- 分支：`feature/goal-14-local-ptt`。沿用使用者指定的新分支與主工作目錄，不額外建立 worktree。
- 設計已獲同意，依計畫直接實作；Vite 同源代理轉接本機 TCP 8888，正式站路徑保留 WebSocket。
- 使用 Vite mode `ptt-local`／`ptt-live`，避免與 Vite 的 `.local` 環境檔命名混淆。
- 帳密已保存於根目錄 `.env.local`，檔案權限 0600 且被 Git 忽略。文件只描述設定鍵，不收錄帳密。
- 預檢：設定解析提供目標給代理；Telnet codec 只供 local TCP；前端只取得安全標示。無 core 規則變更。
- 參考：[Vite 環境與模式](https://vite.dev/guide/env-and-mode)、Telnet RFC 854／856／1073。

## 實作與回歸

- Telnet 使用串流狀態機處理跨封包 IAC／協商，維持 Big5 原始位元組；提供 VT100 與 80×24 視窗。
- 上游握手前輸入有界排隊；空訊息略過。socket 關閉、錯誤、開發服務重啟都清理上游連線。
- 來源限制為 loopback Host 與同源 Origin，防止僅比較兩者相等所留下的 DNS rebinding 缺口。
- 以受控上游 WebSocket 延遲握手，透過 ping/pong 確認代理已收到輸入後才完成握手，驗證排隊順序，不依賴固定等待。
- Vitest 使用無 HTTP server 的 Vite middleware mode，該模式不安裝代理；dev 測試另用 Node 設定，避免前端 polyfill 干擾 TCP 模組。
- `tsconfig.node.json` 納入代理與測試；新測試已加入預設 `npm test`。
- 登入與首頁只顯示連線目標，不載入帳密；移除原有「不會上傳任何伺服器」的不正確說明。

## 本機實測（2026-09-20）

- 瀏覽器 → `127.0.0.1:5184/ptt-ws` → 本機 TCP `127.0.0.1:8888`。
- 第 2 組帳號成功登入，畫面顯示「已登入 PTT」；點選登出後顯示「已登出」與連線關閉。
- 第 1 組登入確認可抵達重複登入提示；測試中修改代理觸發 Vite 重載，因此不將該次流程列為完整登入成功。
- 沒有踢除其他連線，未登入正式站，沒有發文、推文、編輯或刪文。第 3 組帳號尚未實測。
- 初次開啟頁面遇到既有 core 舊 dist 缺少 export；重建套件後恢復。文件加入首次安裝／更新原始碼後執行 `npm run build:packages` 的前置步驟。
- 獨立審查提出來源限制與空訊息佇列兩項問題，補測試、確認 RED→GREEN 並修正後複查無重大阻擋。

## 完整驗證

- `npm run verify` 通過：core 443、browser 394、web 365、開發代理 21、smoke helpers 11 項測試，型別檢查、正式建置與 package smoke 通過。
- lint 無錯誤；保留既有 9 個 React Fast Refresh 警告（包含其他 worktree），建置仍有既有 chunk 大小提示。
- `.env.local` 已被 Git 忽略且權限為 0600；6 個本機帳密欄位未出現在正式前端產物。`git diff --check` 通過。
