const WEBHOOK_SECRET =
	process.env.WEBHOOK_SECRET ?? "dev-webhook-secret-change-in-production";

export async function computeWebhookSignature(body: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(WEBHOOK_SECRET),
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
): Promise<boolean> {
	if (!signatureHeader) return false;
	const expected = await computeWebhookSignature(body);
	if (signatureHeader.length !== expected.length) return false;
	let result = 0;
	for (let i = 0; i < expected.length; i++) {
		result |= signatureHeader.charCodeAt(i) ^ expected.charCodeAt(i);
	}
	return result === 0;
}
