# Jev 阻力標記公開摘要判斷 · 2026-10-19

使用 [TypeSafe API](https://docs.typesafe.ai/api)，實際模型 jev-1.13.0。只依已公開 PR 與 QA 摘要，不直接檢查 App／圖片，不是動作審核或完整需求完成認證。完整 CI 與正式 v27 尚待驗證。

| 面向 | 判斷 | 選項機率 | confidence |
| --- | --- | --- | --- |
| movement | partial | 0.95 | 0.92 |
| help | partial | 1 | 1 |
| timing | partial | 0.99 | 0.98 |
| program | partial | 1 | 1 |
| navigation | partial | 1 | 1 |
| mvp | ship_mvp | 0.96 | 0.92 |

[完整請求與回應](./jev-resistance-feedback-2026-10-19.json)。媒體仍45/73、28缺示範、完整影片0；阻力是使用者自訂標記，不量測實際帶子阻力。不同摘要的機率不能當作改善幅度。認證僅使用無回顯 stdin，不存入報告。
