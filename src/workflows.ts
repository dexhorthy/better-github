import { freestyle, VmBaseImage, VmSpec } from "freestyle";
import yaml from "js-yaml";

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
	status: "queued" | "in_progress" | "success" | "failure";
	conclusion?: "success" | "failure" | "cancelled";
	startedAt: string;
	completedAt?: string;
	logs?: string;
};

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

export async function executeWorkflowRun(
	workflow: Workflow,
	repoUrl: string,
	branch: string,
	_commitSha: string,
): Promise<{ success: boolean; logs: string }> {
	const logs: string[] = [];
	let success = true;

	for (const [_jobId, job] of Object.entries(workflow.jobs)) {
		logs.push(`\n=== Job: ${job.name} ===\n`);

		if (job.runsOn !== "freestyle-vm") {
			logs.push(`Skipping job: unsupported runner "${job.runsOn}"`);
			continue;
		}

		try {
			const spec = new VmSpec()
				.baseImage(new VmBaseImage("FROM oven/bun:1"))
				.rootfsSizeGb(10)
				.memSizeGb(2)
				.vcpuCount(2)
				.workdir("/app");

			const { vm, vmId } = await freestyle.vms.create(spec);
			logs.push(`VM created: ${vmId}`);

			try {
				for (const step of job.steps) {
					logs.push(`\n--- Step: ${step.name} ---`);

					if (step.uses === "checkout") {
						const cloneResult = await vm.exec({
							command: `git clone --depth 1 --branch ${branch} ${repoUrl} /app`,
							timeoutMs: 120000,
						});
						logs.push(cloneResult.stdout || "");
						if (cloneResult.exitCode !== 0) {
							logs.push(`Checkout failed: ${cloneResult.stderr}`);
							success = false;
							break;
						}
					} else if (step.run) {
						const result = await vm.exec({
							command: step.run,
							timeoutMs: 300000,
						});
						logs.push(result.stdout || "");
						if (result.exitCode !== 0) {
							logs.push(
								`Step failed (exit ${result.exitCode}): ${result.stderr}`,
							);
							success = false;
							break;
						}
					}
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

		if (!success) break;
	}

	return { success, logs: logs.join("\n") };
}
