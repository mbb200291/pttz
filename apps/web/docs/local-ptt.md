# 本機 PTT 開發環境

## 啟動與切換

需求：Node.js 20 以上、本機 PTT 已在 `127.0.0.1:8888` 提供 Telnet 服務。

首次安裝或更新套件原始碼後，先執行：

```bash
npm install
npm run build:packages
```

在專案根目錄選擇環境：

```bash
npm run dev:local # 本機 PTT
npm run dev:ptt   # 正式 PTT
npm run dev       # 依設定選擇，預設本機
```

切換前停止原本的開發伺服器，再重新啟動、重新載入網頁。登入畫面與首頁會顯示目前環境。正式站使用正式帳號，本機使用本機帳號；兩者資料不共用。本機連線失敗不會改連正式站。

## 設定

根目錄 `.env.example` 提供設定範例；將需要的設定加入 `.env.local`，不要覆蓋已保存的帳密。

```dotenv
PTT_TARGET=local
PTT_LOCAL_HOST=127.0.0.1
PTT_LOCAL_PORT=8888
```

`PTT_TARGET` 可為 `local` 或 `ptt`。`dev:local`／`dev:ptt` 優先於此設定。環境變數優先於環境檔；環境檔使用 Vite 的載入規則，目錄為專案根目錄。

本機 host 僅允許 `127.0.0.1`、`localhost`、`::1`，port 為 1–65535。代理只接受同來源網頁的 `/ptt-ws` 連線；請勿將開發伺服器公開到外網。

三組開發帳密儲存在 `.env.local` 的 `PTT_LOCAL_ACCOUNT_1`／`PTT_LOCAL_PASSWORD_1` 至第 3 組。這些設定不會自動填入登入表單，也不會送進前端程式。請在登入表單手動輸入；不要使用 `VITE_` 前綴保存帳密。`.env.local` 不提交 Git。

## 連線與測試

瀏覽器仍使用既有 `/ptt-ws`；Vite 在開發機上轉接 Telnet，保留 Big5 位元組並處理 Telnet 協商。正式模式則轉接官方 WebSocket。core 規則與 browser 公開 API 不變。

```bash
npm test       # 含設定、Telnet 協商、TCP／WebSocket 代理測試
npm run verify # 測試、型別檢查、建置、lint、套件 smoke test
```

自動測試使用臨時 loopback server，不需 PTT 帳密，也不連正式站。登入與終端操作需另在本機環境驗證；代理測試不代表所有文章操作已通過實測。

若網頁空白且提示套件 export 不存在，先執行 `npm run build:packages`，再重啟開發伺服器。若登入顯示斷線，先確認 `telnet localhost 8888` 可連接，再檢查啟動訊息的目標與埠號。

`npm run build`／`npm run preview` 不提供本機 Telnet 轉接，正式產物維持直接連官方 PTT。使用 `ptt-local` mode 建置或預覽會直接拒絕，避免誤連正式站。
