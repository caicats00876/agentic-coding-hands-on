import { describe, expect, it } from "vitest";
import { HealthResponseSchema } from "./index.ts";

describe("HealthResponseSchema", () => {
	it("status が ok のとき検証に成功する", () => {
		const result = HealthResponseSchema.safeParse({ status: "ok" });

		expect(result.success).toBe(true);
	});

	it("status が ok 以外のとき検証に失敗する", () => {
		const result = HealthResponseSchema.safeParse({ status: "ng" });

		expect(result.success).toBe(false);
	});
});
