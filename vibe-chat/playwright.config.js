// @ts-check
/*
 * E2E テスト(Playwright)の設定
 *  - 一時フォルダと空いていそうなポートでサーバーを起動し、普段のデータ(data/)を汚さない
 *  - パソコンとスマホの 2 つの画面幅で同じテストを実行する
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { defineConfig } = require('@playwright/test');

// 設定ファイルはワーカーごとにも読み込まれるため、最初に決めた値を環境変数で引き継ぐ
process.env.E2E_PORT ||= String(3800 + Math.floor(Math.random() * 100));
process.env.E2E_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-e2e-'));
const PORT = Number(process.env.E2E_PORT);

module.exports = defineConfig({
  testDir: './e2e',
  // 1 つのサーバーを共有するので順番に実行する
  workers: 1,
  timeout: 30000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 375, height: 667 } } },
  ],
  webServer: {
    command: 'node server.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), HOST: '127.0.0.1', VIBE_DATA_DIR: process.env.E2E_DATA_DIR },
  },
});
