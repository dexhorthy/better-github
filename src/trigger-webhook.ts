import { computeWebhookSignature } from "./webhook-signature";

export const DEFAULT_WEBHOOK_URL =
	"https://better-github.dexter-de6.workers.dev/api/webhooks/push";

export type TriggerWebhookOptions = {
	owner: string;
	repo: string;
	branch: string;
	commitSha: string;
	url?: string;
	secret?: string;
	fetchFn?: typeof fetch;
};

export type TriggerWebhookResult = {
	status: number;
	body: string;
};

export async function triggerPushWebhook(
	options: TriggerWebhookOptions,
): Promise<TriggerWebhookResult> {
	const url = options.url ?? process.env.WEBHOOK_URL ?? DEFAULT_WEBHOOK_URL;
	const fetchFn = options.fetchFn ?? fetch;
	const body = JSON.stringify({
		owner: options.owner,
		repo: options.repo,
		branch: options.branch,
		commitSha: options.commitSha,
	});
	const signature = await computeWebhookSignature(body, options.secret);
	const response = await fetchFn(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Hub-Signature-256": signature,
		},
		body,
	});
	const text = await response.text();
	return { status: response.status, body: text };
}
