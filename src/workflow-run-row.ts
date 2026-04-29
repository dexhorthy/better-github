import type { WorkflowStepResult } from "./types";
import type { WorkflowRun } from "./workflows";

export type WorkflowRunRow = {
	id: string;
	workflow_name: string;
	repo_owner: string;
	repo_name: string;
	branch: string;
	commit_sha: string;
	status: string;
	conclusion: string | null;
	started_at: string;
	completed_at: string | null;
	logs: string | null;
	steps: WorkflowStepResult[] | string | null;
};

export function parseSteps(
	steps: WorkflowStepResult[] | string | null | undefined,
): WorkflowStepResult[] | undefined {
	if (!steps) return undefined;
	if (typeof steps !== "string") return steps;
	try {
		const parsed = JSON.parse(steps) as unknown;
		if (typeof parsed === "string") return parseSteps(parsed);
		return Array.isArray(parsed) ? (parsed as WorkflowStepResult[]) : undefined;
	} catch {
		return undefined;
	}
}

export type WorkflowRunUpdates = Partial<
	Pick<WorkflowRun, "status" | "conclusion" | "completedAt" | "logs" | "steps">
>;

export interface WorkflowRunRepository {
	insert(run: WorkflowRun): Promise<void>;
	update(id: string, updates: WorkflowRunUpdates): Promise<void>;
	get(id: string): Promise<WorkflowRun | null>;
	list(owner: string, repo: string, limit?: number): Promise<WorkflowRun[]>;
}

export function rowToWorkflowRun(row: WorkflowRunRow): WorkflowRun {
	return {
		id: row.id,
		workflowName: row.workflow_name,
		repoOwner: row.repo_owner,
		repoName: row.repo_name,
		branch: row.branch,
		commitSha: row.commit_sha,
		status: row.status as WorkflowRun["status"],
		conclusion: (row.conclusion ?? undefined) as WorkflowRun["conclusion"],
		startedAt: row.started_at,
		completedAt: row.completed_at ?? undefined,
		logs: row.logs ?? undefined,
		steps: parseSteps(row.steps),
	};
}
