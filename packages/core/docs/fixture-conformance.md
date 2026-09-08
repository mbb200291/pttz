# 核心規則 fixture 驗證

本文件記錄此 repository 的 `@pttzzz/core` 如何執行 [`docs/fixtures/thread-events`](../../../docs/fixtures/thread-events/README.md) 符合性案例。Fixture 本身是實作無關的公開規範；以下命令只適用於本核心實作。

## 執行

只驗證 JSON 契約、Rule ID 與雙向覆蓋：

```bash
npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts --testNamePattern "fixture contract"
```

比較所有 fixture 與目前核心實作：

```bash
npm test -w @pttzzz/core -- --run src/whitepaperFixtures.test.ts
```

完整比較出現紅燈，代表目前實作尚未符合白皮書；後續應修正核心實作，而不是調整 fixture 迎合既有行為。
