import { HealthResponseSchema } from "@vibe-order/shared";
import { describe, expect, it } from "vitest";
import { app } from "./app.ts";

describe("GET /health", () => {
	it("200 と HealthResponse を返す", async () => {
		const res = await app.request("/health");

		expect(res.status).toBe(200);
		expect(HealthResponseSchema.safeParse(await res.json()).success).toBe(true);
	});
});
