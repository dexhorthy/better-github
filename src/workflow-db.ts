import { SQL } from "bun";
import { rowToWorkflowRun, type WorkflowRunRow } from "./workflow-run-row";
import type { WorkflowRun } from "./workflows";

const DATABASE_URL =
	process.env.DATABASE_URL ??
	"postgres://postgres:postgres@localhost:5434/better_github";

const sql = new SQL(DATABASE_URL);

let initialized = false;

export async function ensureWorkflowRunsTable(): Promise<void> {
	if (initialized) return;
	await sql`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_name TEXT NOT NULL,
      repo_owner TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      branch TEXT NOT NULL,
      commit_sha TEXT NOT NULL,
      status TEXT NOT NULL,
      conclusion TEXT,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      logs TEXT,
      steps JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
	// Add steps column if missing (for existing tables)
	await sql`
    ALTER TABLE workflow_runs
    ADD COLUMN IF NOT EXISTS logs TEXT
  `.catch(() => {});
	await sql`
    ALTER TABLE workflow_runs
    ADD COLUMN IF NOT EXISTS steps JSONB
  `.catch(() => {});
	initialized = true;
}

export async function insertWorkflowRun(run: WorkflowRun): Promise<void> {
	await ensureWorkflowRunsTable();
	const stepsJson = run.steps ? JSON.stringify(run.steps) : null;
	await sql`
    INSERT INTO workflow_runs (id, workflow_name, repo_owner, repo_name, branch, commit_sha, status, conclusion, started_at, completed_at, logs, steps)
    VALUES (${run.id}, ${run.workflowName}, ${run.repoOwner}, ${run.repoName}, ${run.branch}, ${run.commitSha}, ${run.status}, ${run.conclusion ?? null}, ${run.startedAt}, ${run.completedAt ?? null}, ${run.logs ?? null}, ${stepsJson})
  `;
}

export async function updateWorkflowRun(
	id: string,
	updates: Partial<
		Pick<
			WorkflowRun,
			"status" | "conclusion" | "completedAt" | "logs" | "steps"
		>
	>,
): Promise<void> {
	await ensureWorkflowRunsTable();
	const stepsJson = updates.steps ? JSON.stringify(updates.steps) : null;
	await sql`
    UPDATE workflow_runs
    SET
      status = COALESCE(${updates.status ?? null}, status),
      conclusion = COALESCE(${updates.conclusion ?? null}, conclusion),
      completed_at = COALESCE(${updates.completedAt ?? null}, completed_at),
      logs = COALESCE(${updates.logs ?? null}, logs),
      steps = COALESCE(${stepsJson}, steps)
    WHERE id = ${id}
  `;
}

export async function getWorkflowRun(id: string): Promise<WorkflowRun | null> {
	await ensureWorkflowRunsTable();
	const rows = await sql<
		WorkflowRunRow[]
	>`SELECT * FROM workflow_runs WHERE id = ${id}`;

	const row = rows[0];
	return row ? rowToWorkflowRun(row) : null;
}

export async function listWorkflowRuns(
	repoOwner: string,
	repoName: string,
	limit = 20,
): Promise<WorkflowRun[]> {
	await ensureWorkflowRunsTable();
	const rows = await sql<
		WorkflowRunRow[]
	>`SELECT * FROM workflow_runs WHERE repo_owner = ${repoOwner} AND repo_name = ${repoName} ORDER BY started_at DESC LIMIT ${limit}`;

	return rows.map(rowToWorkflowRun);
}
