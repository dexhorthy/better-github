import { freestyle, VmBaseImage, VmSpec } from "freestyle";
import yaml from "js-yaml";
import type { WorkflowStepResult } from "./types";

export type WorkflowStep = {
	name: string;
	uses?: string;
	run?: string;
};

export type WorkflowJob = {
	name: string;
	runsOn: string;
	steps: WorkflowStep[];
};

export type Workflow = {
	name: string;
	on: {
		push?: { branches?: string[] };
		pull_request?: { branches?: string[] };
	};
	jobs: Record<string, WorkflowJob>;
};

export type WorkflowRun = {
	id: string;
	workflowName: string;
	repoOwner: string;
	repoName: string;
	branch: string;
	commitSha: string;
	status: "queued" | "in_progress" | "success" | "failure" | "cancelled";
	conclusion?: "success" | "failure" | "cancelled";
	startedAt: string;
	completedAt?: string;
	logs?: string;
	steps?: WorkflowStepResult[];
};

const cancelledRuns = new Set<string>();

export function requestCancellation(runId: string): void {
	cancelledRuns.add(runId);
}

export function isCancelled(runId: string): boolean {
	return cancelledRuns.has(runId);
}

export function clearCancellation(runId: string): void {
	cancelledRuns.delete(runId);
}

type WorkflowYaml = {
	name?: string;
	on?: {
		push?: { branches?: string[] };
		pull_request?: { branches?: string[] };
	};
	jobs?: Record<
		string,
		{
			"runs-on"?: string;
			steps?: Array<{ name?: string; uses?: string; run?: string }>;
		}
	>;
};

export function parseWorkflow(content: string): Workflow | null {
	try {
		const doc = yaml.load(content) as WorkflowYaml;
		if (!doc || typeof doc !== "object") return null;

		const jobs: Record<string, WorkflowJob> = {};
		for (const [jobId, jobDef] of Object.entries(doc.jobs ?? {})) {
			jobs[jobId] = {
				name: jobId,
				runsOn: jobDef["runs-on"] ?? "freestyle-vm",
				steps: (jobDef.steps ?? []).map((s) => ({
					name: s.name ?? "Unnamed step",
					uses: s.uses,
					run: s.run,
				})),
			};
		}

		return {
			name: doc.name ?? "Unnamed workflow",
			on: doc.on ?? {},
			jobs,
		};
	} catch {
		return null;
	}
}

export function shouldTrigger(
	workflow: Workflow,
	event: "push" | "pull_request",
	branch: string,
): boolean {
	const trigger = workflow.on[event];
	if (!trigger) return false;
	if (!trigger.branches || trigger.branches.length === 0) return true;
	return trigger.branches.includes(branch);
}

export type WorkflowRunResult = {
	success: boolean;
	logs: string;
	steps: WorkflowStepResult[];
	cancelled: boolean;
};

export function deriveTerminalStatus(result: WorkflowRunResult): {
	status: "success" | "failure" | "cancelled";
	conclusion: "success" | "failure" | "cancelled";
} {
	const status = result.cancelled
		? "cancelled"
		: result.success
			? "success"
			: "failure";
	return { status, conclusion: status };
}

export async function executeWorkflowRun(
	workflow: Workflow,
	repoUrl: string,
	branch: string,
	_commitSha: string,
	runId?: string,
): Promise<WorkflowRunResult> {
	const logs: string[] = [];
	const steps: WorkflowStepResult[] = [];
	let success = true;
	let cancelled = false;

	for (const [_jobId, job] of Object.entries(workflow.jobs)) {
		if (runId && isCancelled(runId)) {
			logs.push("\n=== Run cancelled ===\n");
			cancelled = true;
			clearCancellation(runId);
			break;
		}

		logs.push(`\n=== Job: ${job.name} ===\n`);

		if (job.runsOn !== "freestyle-vm") {
			logs.push(`Skipping job: unsupported runner "${job.runsOn}"`);
			continue;
		}

		try {
			const spec = new VmSpec()
				.baseImage(new VmBaseImage("FROM oven/bun:1"))
				.workdir("/app")
				.aptDeps("git");

			const { vm, vmId } = await freestyle.vms.create(spec);
			logs.push(`VM created: ${vmId}`);

			try {
				let shouldSkipRemaining = false;
				for (const step of job.steps) {
					if (runId && isCancelled(runId)) {
						logs.push("\n=== Run cancelled ===\n");
						cancelled = true;
						clearCancellation(runId);
						break;
					}

					const stepResult: WorkflowStepResult = {
						name: step.name,
						status: shouldSkipRemaining ? "skipped" : "running",
						startedAt: shouldSkipRemaining
							? undefined
							: new Date().toISOString(),
						logs: "",
					};

					if (shouldSkipRemaining) {
						steps.push(stepResult);
						continue;
					}

					logs.push(`\n--- Step: ${step.name} ---`);
					const stepLogs: string[] = [];

					if (step.uses === "checkout") {
						const cloneResult = await vm.exec({
							command: `git clone --depth 1 --branch ${branch} ${repoUrl} /app`,
							timeoutMs: 120000,
						});
						stepLogs.push(cloneResult.stdout || "");
						logs.push(cloneResult.stdout || "");
						if (cloneResult.statusCode !== 0) {
							stepLogs.push(`Checkout failed: ${cloneResult.stderr}`);
							logs.push(`Checkout failed: ${cloneResult.stderr}`);
							stepResult.status = "failure";
							stepResult.completedAt = new Date().toISOString();
							stepResult.logs = stepLogs.join("\n");
							steps.push(stepResult);
							success = false;
							shouldSkipRemaining = true;
							continue;
						}
						stepResult.status = "success";
					} else if (step.run) {
						const result = await vm.exec({
							command: step.run,
							timeoutMs: 300000,
						});
						stepLogs.push(result.stdout || "");
						logs.push(result.stdout || "");
						if (result.statusCode !== 0) {
							stepLogs.push(
								`Step failed (exit ${result.statusCode}): ${result.stderr}`,
							);
							logs.push(
								`Step failed (exit ${result.statusCode}): ${result.stderr}`,
							);
							stepResult.status = "failure";
							stepResult.completedAt = new Date().toISOString();
							stepResult.logs = stepLogs.join("\n");
							steps.push(stepResult);
							success = false;
							shouldSkipRemaining = true;
							continue;
						}
						stepResult.status = "success";
					} else {
						stepResult.status = "success";
					}

					stepResult.completedAt = new Date().toISOString();
					stepResult.logs = stepLogs.join("\n");
					steps.push(stepResult);
				}
			} finally {
				await vm.stop().catch(() => {});
				await vm.delete().catch(() => {});
				logs.push(`\nVM ${vmId} cleaned up`);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logs.push(`Job execution error: ${message}`);
			success = false;
		}

		if (!success || cancelled) break;
	}

	return {
		success: success && !cancelled,
		logs: logs.join("\n"),
		steps,
		cancelled,
	};
}
