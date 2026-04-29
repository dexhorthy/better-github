import { afterEach, describe, expect, mock, test } from "bun:test";
import { sendMagicLinkEmail } from "./auth-core";

describe("sendMagicLinkEmail", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("email link points to frontend root (/?token=) not API endpoint (/api/auth/verify)", async () => {
		let capturedBody: string | null = null;

		globalThis.fetch = mock(
			async (url: string | URL | Request, init?: RequestInit) => {
				if (typeof url === "string" && url.includes("api.resend.com")) {
					capturedBody = init?.body as string;
					return new Response(JSON.stringify({ id: "test-email-id" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
				return originalFetch(url, init);
			},
		) as unknown as typeof fetch;

		const token = "test-magic-token-123";
		const baseUrl = "https://better-github.example.com";

		await sendMagicLinkEmail(
			"test@example.com",
			token,
			baseUrl,
			"fake-resend-key",
			"example.com",
		);

		expect(capturedBody).not.toBeNull();
		if (!capturedBody) throw new Error("Expected email request body");
		const body = JSON.parse(capturedBody);

		expect(body.html).toContain(`${baseUrl}/?token=`);
		expect(body.html).not.toContain("/api/auth/verify");
	});

	test("email link contains URL-encoded token", async () => {
		let capturedBody: string | null = null;

		globalThis.fetch = mock(
			async (url: string | URL | Request, init?: RequestInit) => {
				if (typeof url === "string" && url.includes("api.resend.com")) {
					capturedBody = init?.body as string;
					return new Response(JSON.stringify({ id: "test-email-id" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
				return originalFetch(url, init);
			},
		) as unknown as typeof fetch;

		const token = "token+with/special=chars";
		const baseUrl = "https://example.com";

		await sendMagicLinkEmail(
			"test@example.com",
			token,
			baseUrl,
			"fake-resend-key",
			"example.com",
		);

		expect(capturedBody).not.toBeNull();
		if (!capturedBody) throw new Error("Expected email request body");
		const body = JSON.parse(capturedBody);

		expect(body.html).toContain(encodeURIComponent(token));
	});
});
