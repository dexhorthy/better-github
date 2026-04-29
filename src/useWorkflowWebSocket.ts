import { useCallback, useEffect, useRef } from "react";
import type { WorkflowRun } from "./types";

type WSMessage =
	| { type: "subscribe"; runId: string }
	| { type: "unsubscribe"; runId: string }
	| { type: "run_update"; run: WorkflowRun };

export function useWorkflowWebSocket(
	onRunUpdate: (run: WorkflowRun) => void,
	subscribedRunId?: string,
) {
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

	const connect = useCallback(() => {
		if (typeof window === "undefined") return;

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

		ws.onopen = () => {
			wsRef.current = ws;
			if (subscribedRunId) {
				ws.send(JSON.stringify({ type: "subscribe", runId: subscribedRunId }));
			}
		};

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data) as WSMessage;
				if (data.type === "run_update") {
					onRunUpdate(data.run);
				}
			} catch {
				// Ignore malformed messages
			}
		};

		ws.onclose = () => {
			wsRef.current = null;
			reconnectTimeoutRef.current = setTimeout(connect, 3000);
		};

		ws.onerror = () => {
			ws.close();
		};

		return ws;
	}, [onRunUpdate, subscribedRunId]);

	useEffect(() => {
		const ws = connect();

		return () => {
			clearTimeout(reconnectTimeoutRef.current);
			ws?.close();
		};
	}, [connect]);

	useEffect(() => {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;

		if (subscribedRunId) {
			ws.send(JSON.stringify({ type: "subscribe", runId: subscribedRunId }));
		}

		return () => {
			if (subscribedRunId && ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "unsubscribe", runId: subscribedRunId }));
			}
		};
	}, [subscribedRunId]);
}
