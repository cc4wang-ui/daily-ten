# v-next mockup（設計目標）

Cross 2026-10-02 看過的 v-next 設計（Artifact「Daily Ten — v-next Mockup」：https://claude.ai/artifact/Ukn9oDTvc42ahV1cJg3nbX）。這裡放原始畫板（`*.dc.html`，設計畫布元件，需畫布 runtime 才能互動）與靜態渲染截圖（`*.png`，示意資料）。

| 畫面 | 截圖 | 原始檔 | 上線版本（D26） |
|---|---|---|---|
| 今日（P1） | `main-p1.png` | `Main.dc.html` | V1 |
| 早安打卡 | `checkin-p1.png`、`checkin-p1-after.png` | `CheckIn.dc.html` | V1 |
| 週回顧 | `weekly.png` | `Weekly.dc.html` | V2 |
| 季度目標＋探索清單 | `season.png` | `Season.dc.html` | V2（探索清單 V4） |
| 統計 | `stats.png` | `Stats.dc.html` | V3 |
| 成就 | `achievements.png` | `Achievements.dc.html` | V3 |
| Perfect Day | `perfectday.png` | `PerfectDay.dc.html` | V2 |

實作時 CLAUDE.md §2 優先於 mockup：
- 字型用系統字，不載入 Google Fonts（離線、check-repo 前端掃描）。
- 動畫只用 transform／opacity（環用 rotate＋opacity 呈現）。
- 觸控 ≥44px、文字對比 ≥ WCAG AA（mockup 有兩處 11px 字未達標、「‹ 今日」高 37px）。
- 「第 3 週解鎖」等時程文案改為條件制（§1.2）。
