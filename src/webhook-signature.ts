const DEFAULT_WEBHOOK_SECRET = "dev-webhook-secret-change-in-production";

function resolveSecret(secret?: string): string {
	if (secret) return secret;
	return process.env.WEBHOOK_SECRET ?? DEFAULT_WEBHOOK_SECRET;
}

export async function computeWebhookSignature(
	body: string,
	secret?: string,
): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(resolveSecret(secret)),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
	const hex = Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `sha256=${hex}`;
}

export async function verifyWebhookSignature(
	body: string,
	signatureHeader: string | undefined,
	secret?: string,
): Promise<boolean> {
	if (!signatureHeader) return false;
	const expected = await computeWebhookSignature(body, secret);
	if (signatureHeader.length !== expected.length) return false;
	let result = 0;
	for (let i = 0; i < expected.length; i++) {
		result |= signatureHeader.charCodeAt(i) ^ expected.charCodeAt(i);
	}
	return result === 0;
}
