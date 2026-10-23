import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App.tsx";

describe("App", () => {
	it("見出しを表示する", () => {
		const html = renderToString(<App />);

		expect(html).toContain("vibe-order");
	});
});
