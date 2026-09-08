# PTTZ 串流

Goal 12 的獨立唯讀介面範例。以 Threads 式單欄討論串流呈現跨看板文章，使用原生 HTML、CSS、TypeScript，不依賴現有 React UI，也不重新解析 PTT 文字。

## 版本與邊界

- 套件：`@pttzzz/threads-example` 0.1.0，private workspace。
- 使用 `@pttzzz/core` / `@pttzzz/browser` 0.1.0，支援規則 0.1.x。
- 只使用公開 API；沒有發文、回覆、推噓、編輯、刪除或修改最愛的入口。
- 規則與投票資料由核心提供；列表的 PTT 原生熱度不等於文章頁的提案文章推噓。

## 開發

在 repo 根目錄執行：

```bash
npm ci
npm run build:packages
npm run dev:threads
# 自訂位址與連接埠
npm run dev:threads -- --host 127.0.0.1 --port 5182
npm test -w @pttzzz/threads-example
npm run build -w @pttzzz/threads-example
```

加上 `?preview=1` 使用公開 fake gateway，無須真實 PTT 帳密。預覽沿用 fake gateway 的示例資料，畫面明確標示非即時熱門，且將推數門檻設為 0；正式連線固定為 20。預覽不會發送實站命令。

## 串流如何選文章

1. 以 `listBoards({source:{kind:"hot"},limit:5})` 取得前五個熱門看板。
2. 依序以 `filterArticles({board,minimumNativeScore:20,limit:6})` 讀取每板第一批結果，排除置頂與重複文章。
3. 各板輪流取一篇，維持來源順序；最多 30 篇，不做跨板數字排序，不把「爆」轉成假精確分數。
4. 單板失敗時顯示原因，其他已成功資料仍可閱讀；不偷偷改為無門檻列表。

這是熱門看板精選，不是全站熱門排名，也沒有個人化推薦。上述 limit 是 API 結果上限，不保證底層只讀一張終端畫面。第一版只手動更新，沒有背景輪詢或無限載入，也不預抓所有文章正文。

## 閱讀、狀態與呈現取捨

- 點文章才呼叫 `getArticle`。同時接收該次讀取的 partial/updated 事件，以請求世代、文章 identity、遞增 revision 過濾過期內容。
- 正文容器、返回按鈕與焦點在 partial 更新時保持穩定；討論可逐步更新，編輯歷程的互動展開於 final 後提供。
- 正文保留原始換行與空白，窄螢幕使用局部橫向捲動。第一版不嵌入第三方圖片或影片，也不執行內文 HTML。
- 巢狀關係由核心決定；視覺縮排最多三層，較深回覆仍顯示被回覆的作者，不改動核心樹、不顯示原始樓號。
- 文章頁顯示提案文章推噓，PTT 原始統計放在獨立展開區；回文保留原始類別及核心投票總數。
- 返回保留本次串流與捲動位置，恢復原文章按鈕焦點；不跨登入保存列表。
- 斷線／登出立即使舊請求失效並清除 session 資料。目前 browser gateway 關閉後不能重用，使用明確的「重新登入」重新載入頁面、建立新 client。瀏覽器 BFCache 返回也重新載入。
- 帳密只在表單與當次函式呼叫中使用；其他連線預設保留，PTT 要求重複登入選擇時才詢問。無自動重連或自動踢除。

## 部署

Vite 開發模式提供 `/ptt-ws` proxy 並加入 PTT 要求的 Origin。正式部署仍需依 [browser host 說明](../../packages/browser/README.md) 提供相容連線環境；不能把開發 proxy 當成已部署的服務。新 UI 與原有 Web UI 各自 build，不互相匯入。

相關文件：[白皮書](../../docs/whitepaper/pttzzz-core.md)、[UI 開發指南](../../packages/core/docs/DEVELOPMENT_GUIDE.md)。
