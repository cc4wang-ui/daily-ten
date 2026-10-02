/* Playwright 設定（僅 dev）。App 沒有 build：測試直接把 repo 當靜態檔案伺服。
   環境變數：
     PORT             本次測試伺服器 port（預設 4173；多個工作目錄同時跑時各給不同 port）
     PARITY_BASE_DIR  拆 module 前的基準版本目錄（M1 等價比對用）；有設才啟動第二個伺服器
     BASE_PORT        基準伺服器 port（預設 PORT+1）
     PW_CHROMIUM_PATH 指定 Chromium 執行檔（版本不符時用） */
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PORT || 4173);
const BASE_PORT = Number(process.env.BASE_PORT || PORT + 1);
const parityDir = process.env.PARITY_BASE_DIR;
const chromiumPath = process.env.PW_CHROMIUM_PATH;

const server = (dir, port) => ({
  command: `node tools/serve.mjs "${dir}" ${port}`,
  url: `http://127.0.0.1:${port}/index.html`,
  reuseExistingServer: false,
  timeout: 30_000
});

export default defineConfig({
  testDir: 'tests',
  outputDir: 'test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    locale: 'zh-TW',
    timezoneId: 'Asia/Tokyo',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {})
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [server('.', PORT), ...(parityDir ? [server(parityDir, BASE_PORT)] : [])]
});
