import { expect, test } from "@playwright/test";

test("見出しが表示される", async ({ page }) => {
	await page.goto("/");

	await expect(page.getByRole("heading", { name: "vibe-order" })).toBeVisible();
});
