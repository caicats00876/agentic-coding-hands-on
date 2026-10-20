// @ts-check
/*
 * ログイン名の文字数チェックの E2E テスト
 *  1. サーバー側の確認で拒否されたとき、エラーが正しい配置で表示され、名前を直せば入れること
 *  2. 画面側の確認で止めたとき、文字数表示が変わり、サーバーには何も送られないこと
 */
const { test, expect } = require('@playwright/test');

const FAMILY = '👨‍👩‍👧'; // ZWJ でつないだ絵文字(見た目 1 文字、UTF-16 で 8 単位)

/** 2 つの矩形が重なっているか */
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** エラーのトーストが、画面内に収まり、文字が切れず、入力欄とボタンに重ならないことを確かめる */
async function expectErrorToastLayout(page, message) {
  const toast = page.locator('.toast.error');
  await expect(toast).toBeVisible();
  await expect(toast.locator('.t-title')).toHaveText('エラー');
  await expect(toast.locator('.t-body')).toHaveText(message);

  const viewport = page.viewportSize();
  const box = await toast.boundingBox();
  expect(box, 'トーストの位置が取れる').not.toBeNull();
  if (!box || !viewport) return;
  expect(box.x, 'トーストの左端が画面内').toBeGreaterThanOrEqual(0);
  expect(box.y, 'トーストの上端が画面内').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'トーストの右端が画面内').toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height, 'トーストの下端が画面内').toBeLessThanOrEqual(viewport.height);

  const clipped = await toast.locator('.t-body').evaluate((el) => el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
  expect(clipped, 'エラー文が途中で切れていない').toBe(false);

  for (const sel of ['#login-name', '#login-form button[type="submit"]']) {
    const target = await page.locator(sel).boundingBox();
    expect(target, `${sel} の位置が取れる`).not.toBeNull();
    if (target) expect(overlaps(box, target), `トーストが ${sel} に重なっていない`).toBe(false);
  }
}

test('サーバー側で拒否されたとき、エラーが正しく表示され、名前を直せば入れる', async ({ page }) => {
  // 制限を入れる前に長い名前で登録した人を再現する。保存済みの名前はページを開くと確認なしで送られる
  const stored = 'あ'.repeat(21);
  await page.addInitScript((name) => {
    if (!sessionStorage.getItem('e2e.seeded')) {
      localStorage.setItem('vibe.name', name);
      sessionStorage.setItem('e2e.seeded', '1');
    }
  }, stored);
  await page.goto('/');

  await expectErrorToastLayout(page, '名前は20文字以内で入力してください');
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await expect(page.locator('#login-name')).toHaveValue(stored);
  await expect(page.locator('#login-name')).toBeFocused();

  await page.locator('#login-name').fill('あいうえお');
  await page.locator('#login-form button[type="submit"]').click();
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#login')).toBeHidden();
});

test('画面側で止めたとき、文字数表示が変わり、サーバーには送られない', async ({ page }) => {
  const sent = [];
  page.on('websocket', (ws) => ws.on('framesent', (f) => sent.push(String(f.payload))));
  await page.goto('/');

  const input = page.locator('#login-name');
  const counter = page.locator('#login-count');
  await expect(counter).toHaveText('0 / 20');

  await input.fill(FAMILY.repeat(20));
  await expect(input).toHaveValue(FAMILY.repeat(20)); // 入力欄で途中が切られていない
  await expect(counter).toHaveText('20 / 20');
  await expect(counter).not.toHaveClass(/over/);

  await input.fill(FAMILY.repeat(21));
  await expect(counter).toHaveText('21 / 20');
  await expect(counter).toHaveClass(/over/);

  await page.locator('#login-form button[type="submit"]').click();
  await expectErrorToastLayout(page, '名前は20文字以内で入力してください');
  await expect(page.locator('#app')).toBeHidden();
  expect(sent.filter((p) => p.includes('"hello"')), 'サーバーに hello が送られていない').toEqual([]);
});
