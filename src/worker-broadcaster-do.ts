import type { WorkflowRun } from "./workflows";

type WSIncoming =
	| { type: "subscribe"; runId: string }
	| { type: "unsubscribe"; runId: string };

export class WorkflowBroadcaster {
	private clients = new Set<WebSocket>();
	private subscriptions = new Map<string, Set<WebSocket>>();
	private wsRuns = new WeakMap<WebSocket, Set<string>>();

	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);
		if (url.pathname === "/ws") {
			if (req.headers.get("upgrade") !== "websocket") {
				return new Response("expected websocket", { status: 400 });
			}
			const WSPair = (
				globalThis as unknown as {
					WebSocketPair: new () => Record<number, WebSocket>;
				}
			).WebSocketPair;
			const pair = new WSPair();
			const client = pair[0] as WebSocket;
			const server = pair[1] as WebSocket & { accept: () => void };
			server.accept();
			this.attach(server);
			return new Response(null, {
				status: 101,
				webSocket: client,
			} as ResponseInit & { webSocket: WebSocket });
		}
		if (url.pathname === "/broadcast" && req.method === "POST") {
			const run = (await req.json()) as WorkflowRun;
			this.broadcast(run);
			return new Response("ok");
		}
		return new Response("not found", { status: 404 });
	}

	private attach(ws: WebSocket) {
		this.clients.add(ws);
		this.wsRuns.set(ws, new Set());
		ws.addEventListener("message", (ev: MessageEvent) => {
			try {
				const raw = typeof ev.data === "string" ? ev.data : "";
				const data = JSON.parse(raw) as WSIncoming;
				const subs = this.wsRuns.get(ws) ?? new Set<string>();
				if (data.type === "subscribe") {
					subs.add(data.runId);
					let set = this.subscriptions.get(data.runId);
					if (!set) {
						set = new Set();
						this.subscriptions.set(data.runId, set);
					}
					set.add(ws);
				} else if (data.type === "unsubscribe") {
					subs.delete(data.runId);
					this.subscriptions.get(data.runId)?.delete(ws);
				}
				this.wsRuns.set(ws, subs);
			} catch {
				// ignore malformed
			}
		});
		const cleanup = () => {
			this.clients.delete(ws);
			const subs = this.wsRuns.get(ws);
			if (subs) {
				for (const id of subs) {
					this.subscriptions.get(id)?.delete(ws);
				}
			}
			this.wsRuns.delete(ws);
		};
		ws.addEventListener("close", cleanup);
		ws.addEventListener("error", cleanup);
	}

	private broadcast(run: WorkflowRun) {
		const detailed = JSON.stringify({ type: "run_update", run });
		const summaryRun = {
			id: run.id,
			workflowName: run.workflowName,
			repoOwner: run.repoOwner,
			repoName: run.repoName,
			branch: run.branch,
			commitSha: run.commitSha,
			status: run.status,
			startedAt: run.startedAt,
			completedAt: run.completedAt,
		};
		const summary = JSON.stringify({ type: "run_update", run: summaryRun });
		const subs = this.subscriptions.get(run.id);
		if (subs) {
			for (const ws of subs) {
				try {
					ws.send(detailed);
				} catch {
					// drop
				}
			}
		}
		for (const ws of this.clients) {
			if (subs?.has(ws)) continue;
			try {
				ws.send(summary);
			} catch {
				// drop
			}
		}
	}
}
