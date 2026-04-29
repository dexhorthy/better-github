import type { D1Database } from "@cloudflare/workers-types";
import {
	rowToWorkflowRun,
	type WorkflowRunRepository,
	type WorkflowRunRow,
	type WorkflowRunUpdates,
} from "./workflow-run-row";
import type { WorkflowRun } from "./workflows";

export async function listWorkflowRunsD1(
	db: D1Database,
	owner: string,
	repo: string,
	limit = 20,
): Promise<WorkflowRun[]> {
	const result = await db
		.prepare(
			"SELECT * FROM workflow_runs WHERE repo_owner = ? AND repo_name = ? ORDER BY started_at DESC LIMIT ?",
		)
		.bind(owner, repo, limit)
		.all<WorkflowRunRow>();
	return (result.results ?? []).map(rowToWorkflowRun);
}

export async function getWorkflowRunD1(
	db: D1Database,
	runId: string,
): Promise<WorkflowRun | null> {
	const row = await db
		.prepare("SELECT * FROM workflow_runs WHERE id = ?")
		.bind(runId)
		.first<WorkflowRunRow>();
	return row ? rowToWorkflowRun(row) : null;
}

export async function insertWorkflowRunD1(
	db: D1Database,
	run: WorkflowRun,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO workflow_runs (
        id,
        workflow_name,
        repo_owner,
        repo_name,
        branch,
        commit_sha,
        status,
        conclusion,
        started_at,
        completed_at,
        logs,
        steps
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			run.id,
			run.workflowName,
			run.repoOwner,
			run.repoName,
			run.branch,
			run.commitSha,
			run.status,
			run.conclusion ?? null,
			run.startedAt,
			run.completedAt ?? null,
			run.logs ?? null,
			run.steps ? JSON.stringify(run.steps) : null,
		)
		.run();
}

export async function updateWorkflowRunD1(
	db: D1Database,
	id: string,
	updates: WorkflowRunUpdates,
): Promise<void> {
	await db
		.prepare(
			`UPDATE workflow_runs
      SET
        status = COALESCE(?, status),
        conclusion = COALESCE(?, conclusion),
        completed_at = COALESCE(?, completed_at),
        logs = COALESCE(?, logs),
        steps = COALESCE(?, steps)
      WHERE id = ?`,
		)
		.bind(
			updates.status ?? null,
			updates.conclusion ?? null,
			updates.completedAt ?? null,
			updates.logs ?? null,
			updates.steps ? JSON.stringify(updates.steps) : null,
			id,
		)
		.run();
}

export function makeD1WorkflowRunRepo(db: D1Database): WorkflowRunRepository {
	return {
		insert: (run) => insertWorkflowRunD1(db, run),
		update: (id, updates) => updateWorkflowRunD1(db, id, updates),
		get: (id) => getWorkflowRunD1(db, id),
		list: (owner, repo, limit) => listWorkflowRunsD1(db, owner, repo, limit),
	};
}
