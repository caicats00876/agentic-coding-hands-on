import type { HealthResponse } from "@vibe-order/shared";
import { Hono } from "hono";

export const app = new Hono();

app.get("/health", (c) => {
	const body: HealthResponse = { status: "ok" };
	return c.json(body);
});
