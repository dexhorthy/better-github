import type { ServerWebSocket } from "bun";
import type { WorkflowRun } from "./workflows";

export type WSMessage =
	| { type: "subscribe"; runId: string }
	| { type: "unsubscribe"; runId: string }
	| { type: "run_update"; run: WorkflowRun };

type ClientData = {
	subscribedRunIds: Set<string>;
};

const clients = new Set<ServerWebSocket<ClientData>>();
const runIdToClients = new Map<string, Set<ServerWebSocket<ClientData>>>();

export function handleOpen(ws: ServerWebSocket<ClientData>) {
	ws.data = { subscribedRunIds: new Set() };
	clients.add(ws);
}

export function handleMessage(
	ws: ServerWebSocket<ClientData>,
	message: string | Buffer,
) {
	try {
		const data = JSON.parse(
			typeof message === "string" ? message : message.toString(),
		) as WSMessage;

		if (data.type === "subscribe") {
			ws.data.subscribedRunIds.add(data.runId);
			if (!runIdToClients.has(data.runId)) {
				runIdToClients.set(data.runId, new Set());
			}
			runIdToClients.get(data.runId)?.add(ws);
		} else if (data.type === "unsubscribe") {
			ws.data.subscribedRunIds.delete(data.runId);
			runIdToClients.get(data.runId)?.delete(ws);
		}
	} catch {
		// Ignore malformed messages
	}
}

export function handleClose(ws: ServerWebSocket<ClientData>) {
	clients.delete(ws);
	for (const runId of ws.data.subscribedRunIds) {
		runIdToClients.get(runId)?.delete(ws);
	}
}

export function broadcastRunUpdate(run: WorkflowRun) {
	const message = JSON.stringify({ type: "run_update", run });

	const runClients = runIdToClients.get(run.id);
	if (runClients) {
		for (const ws of runClients) {
			ws.send(message);
		}
	}

	for (const ws of clients) {
		if (!ws.data.subscribedRunIds.has(run.id)) {
			ws.send(
				JSON.stringify({
					type: "run_update",
					run: {
						id: run.id,
						workflowName: run.workflowName,
						repoOwner: run.repoOwner,
						repoName: run.repoName,
						branch: run.branch,
						commitSha: run.commitSha,
						status: run.status,
						startedAt: run.startedAt,
						completedAt: run.completedAt,
					},
				}),
			);
		}
	}
}

export function getConnectedClientsCount(): number {
	return clients.size;
}
