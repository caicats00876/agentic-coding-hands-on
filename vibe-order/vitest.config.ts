import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: ["packages/*"],
		coverage: {
			provider: "v8",
			include: ["packages/*/src/**/*.{ts,tsx}"],
			// 起動処理だけのファイルは対象外（docs/memo.md に記録）
			exclude: [
				"**/*.test.{ts,tsx}",
				"packages/backend/src/index.ts",
				"packages/frontend/src/main.tsx",
			],
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 80,
				statements: 80,
			},
		},
	},
});
