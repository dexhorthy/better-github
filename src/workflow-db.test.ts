import { expect, test } from "bun:test";
import {
	getWorkflowRun,
	insertWorkflowRun,
	updateWorkflowRun,
} from "./workflow-db";
import type { WorkflowRun } from "./workflows";

test("workflow run logs and step logs persist across writes", async () => {
	const runId = `logs-test-${crypto.randomUUID()}`;
	const run: WorkflowRun = {
		id: runId,
		workflowName: "Log Persistence",
		repoOwner: "dexhorthy",
		repoName: "better-github",
		branch: "main",
		commitSha: "abc123",
		status: "queued",
		startedAt: new Date().toISOString(),
	};

	await insertWorkflowRun(run);
	await updateWorkflowRun(runId, {
		status: "success",
		conclusion: "success",
		completedAt: new Date().toISOString(),
		logs: "stdout line\nstderr line",
		steps: [
			{
				name: "Capture output",
				status: "success",
				logs: "step stdout\nstep stderr",
			},
		],
	});

	const saved = await getWorkflowRun(runId);
	expect(saved?.logs).toBe("stdout line\nstderr line");
	expect(saved?.steps?.[0]?.logs).toBe("step stdout\nstep stderr");
});

test("workflow run detail normalizes legacy JSON-string encoded steps", async () => {
	const runId = `legacy-steps-test-${crypto.randomUUID()}`;
	await insertWorkflowRun({
		id: runId,
		workflowName: "Legacy Steps",
		repoOwner: "dexhorthy",
		repoName: "better-github",
		branch: "main",
		commitSha: "def456",
		status: "success",
		startedAt: new Date().toISOString(),
		steps: JSON.stringify([
			{
				name: "Legacy output",
				status: "success",
				logs: "legacy step log",
			},
		]) as unknown as WorkflowRun["steps"],
	});

	const saved = await getWorkflowRun(runId);
	expect(saved?.steps?.[0]?.logs).toBe("legacy step log");
});
