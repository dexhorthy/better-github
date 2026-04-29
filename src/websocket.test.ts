import { describe, expect, mock, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import {
	broadcastRunUpdate,
	getConnectedClientsCount,
	handleClose,
	handleMessage,
	handleOpen,
} from "./websocket";
import type { WorkflowRun } from "./workflows";

type ClientData = { subscribedRunIds: Set<string> };

function createMockWs(): ServerWebSocket<ClientData> & {
	sentMessages: string[];
} {
	const sentMessages: string[] = [];
	return {
		data: { subscribedRunIds: new Set() },
		send: mock((message: string) => {
			sentMessages.push(message);
			return 0;
		}),
		sentMessages,
		close: mock(),
		subscribe: mock(),
		unsubscribe: mock(),
		publish: mock(),
		publishText: mock(),
		publishBinary: mock(),
		cork: mock(),
		ping: mock(),
		pong: mock(),
		terminate: mock(),
		isSubscribed: mock(() => false),
		remoteAddress: "127.0.0.1",
		binaryType: "arraybuffer" as const,
		readyState: 1,
	} as unknown as ServerWebSocket<ClientData> & { sentMessages: string[] };
}

describe("WebSocket handlers", () => {
	test("handleOpen adds client and initializes data", () => {
		const ws = createMockWs();
		const initialCount = getConnectedClientsCount();

		handleOpen(ws);

		expect(getConnectedClientsCount()).toBe(initialCount + 1);
		expect(ws.data.subscribedRunIds).toBeInstanceOf(Set);
		expect(ws.data.subscribedRunIds.size).toBe(0);

		handleClose(ws);
	});

	test("handleMessage subscribes client to run", () => {
		const ws = createMockWs();
		handleOpen(ws);

		handleMessage(ws, JSON.stringify({ type: "subscribe", runId: "run-123" }));

		expect(ws.data.subscribedRunIds.has("run-123")).toBe(true);

		handleClose(ws);
	});

	test("handleMessage unsubscribes client from run", () => {
		const ws = createMockWs();
		handleOpen(ws);

		handleMessage(ws, JSON.stringify({ type: "subscribe", runId: "run-123" }));
		expect(ws.data.subscribedRunIds.has("run-123")).toBe(true);

		handleMessage(
			ws,
			JSON.stringify({ type: "unsubscribe", runId: "run-123" }),
		);
		expect(ws.data.subscribedRunIds.has("run-123")).toBe(false);

		handleClose(ws);
	});

	test("handleClose removes client", () => {
		const ws = createMockWs();
		handleOpen(ws);
		const countAfterOpen = getConnectedClientsCount();

		handleClose(ws);

		expect(getConnectedClientsCount()).toBe(countAfterOpen - 1);
	});

	test("broadcastRunUpdate sends full run to subscribed clients", () => {
		const ws = createMockWs();
		handleOpen(ws);
		handleMessage(ws, JSON.stringify({ type: "subscribe", runId: "run-456" }));

		const run: WorkflowRun = {
			id: "run-456",
			workflowName: "CI",
			repoOwner: "test",
			repoName: "repo",
			branch: "main",
			commitSha: "abc123",
			status: "in_progress",
			startedAt: new Date().toISOString(),
			steps: [{ name: "Build", status: "running" }],
		};

		broadcastRunUpdate(run);

		expect(ws.sentMessages.length).toBe(1);
		const message = JSON.parse(ws.sentMessages[0]);
		expect(message.type).toBe("run_update");
		expect(message.run.id).toBe("run-456");
		expect(message.run.steps).toEqual([{ name: "Build", status: "running" }]);

		handleClose(ws);
	});

	test("broadcastRunUpdate sends summary to non-subscribed clients", () => {
		const ws = createMockWs();
		handleOpen(ws);

		const run: WorkflowRun = {
			id: "run-789",
			workflowName: "Deploy",
			repoOwner: "test",
			repoName: "repo",
			branch: "main",
			commitSha: "def456",
			status: "success",
			startedAt: new Date().toISOString(),
			completedAt: new Date().toISOString(),
			steps: [{ name: "Deploy", status: "success", logs: "Deployed!" }],
		};

		broadcastRunUpdate(run);

		expect(ws.sentMessages.length).toBe(1);
		const message = JSON.parse(ws.sentMessages[0]);
		expect(message.type).toBe("run_update");
		expect(message.run.id).toBe("run-789");
		expect(message.run.steps).toBeUndefined();
		expect(message.run.logs).toBeUndefined();

		handleClose(ws);
	});

	test("handleMessage ignores malformed messages", () => {
		const ws = createMockWs();
		handleOpen(ws);

		handleMessage(ws, "not json");
		handleMessage(ws, "{}");
		handleMessage(ws, JSON.stringify({ type: "unknown" }));

		expect(ws.data.subscribedRunIds.size).toBe(0);

		handleClose(ws);
	});
});
