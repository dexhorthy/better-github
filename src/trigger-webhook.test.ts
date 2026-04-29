import { describe, expect, test } from "bun:test";
import { triggerPushWebhook } from "./trigger-webhook";
import { computeWebhookSignature } from "./webhook-signature";

describe("triggerPushWebhook", () => {
	test("computes HMAC signature and POSTs payload", async () => {
		const calls: { url: string; init: RequestInit }[] = [];
		const fakeFetch = (async (url: string, init: RequestInit) => {
			calls.push({ url, init });
			return new Response('{"triggered":[]}', { status: 200 });
		}) as unknown as typeof fetch;

		const result = await triggerPushWebhook({
			owner: "dexhorthy",
			repo: "better-github",
			branch: "main",
			commitSha: "abc123",
			url: "https://example.test/api/webhooks/push",
			secret: "test-secret",
			fetchFn: fakeFetch,
		});

		expect(result.status).toBe(200);
		expect(calls.length).toBe(1);
		const call = calls[0];
		if (!call) throw new Error("expected one fetch call");
		expect(call.url).toBe("https://example.test/api/webhooks/push");
		expect(call.init.method).toBe("POST");

		const headers = call.init.headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("application/json");

		const body = call.init.body as string;
		expect(JSON.parse(body)).toEqual({
			owner: "dexhorthy",
			repo: "better-github",
			branch: "main",
			commitSha: "abc123",
		});

		const expectedSig = await computeWebhookSignature(body, "test-secret");
		expect(headers["X-Hub-Signature-256"]).toBe(expectedSig);
	});

	test("returns response status on non-2xx", async () => {
		const fakeFetch = (async () =>
			new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;

		const result = await triggerPushWebhook({
			owner: "o",
			repo: "r",
			branch: "main",
			commitSha: "deadbeef",
			url: "https://example.test/api/webhooks/push",
			secret: "wrong",
			fetchFn: fakeFetch,
		});

		expect(result.status).toBe(401);
		expect(result.body).toBe("unauthorized");
	});
});
