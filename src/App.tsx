import {
	ArrowLeft,
	Ban,
	BookOpen,
	Bot,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	CircleDot,
	Clock,
	Code2,
	Eye,
	File,
	FileCode,
	Folder,
	FolderOpen,
	GitBranch,
	GitCommitHorizontal,
	GitFork,
	GitPullRequest,
	History,
	Loader2,
	LockKeyhole,
	LogOut,
	Play,
	Plus,
	Search,
	SkipForward,
	Star,
	StopCircle,
	Trash2,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
	GitRepository,
	RepositoryOverview,
	WorkflowFile,
	WorkflowRun,
	WorkflowStepResult,
} from "./types";
import { useWorkflowWebSocket } from "./useWorkflowWebSocket";
import "./styles.css";

type LoadState =
	| { status: "loading" }
	| { status: "ready"; data: RepositoryOverview }
	| { status: "error"; message: string };

type RepoListState =
	| { status: "loading" }
	| { status: "ready"; repos: GitRepository[] }
	| { status: "error"; message: string };

export type Route =
	| { page: "repos" }
	| { page: "repo"; owner: string; repo: string };

export function parseRoute(pathname: string): Route {
	const parts = pathname.split("/").filter(Boolean);
	if (parts.length >= 2)
		return { page: "repo", owner: parts[0], repo: parts[1] };
	return { page: "repos" };
}

type AuthState =
	| { status: "unauthenticated" }
	| { status: "authenticated"; token: string; email: string };

const AUTH_TOKEN_KEY = "better-github-token";
const AUTH_EMAIL_KEY = "better-github-email";

function loadStoredAuth(): AuthState {
	if (typeof window === "undefined") return { status: "unauthenticated" };
	const token = localStorage.getItem(AUTH_TOKEN_KEY);
	const email = localStorage.getItem(AUTH_EMAIL_KEY);
	if (token && email) return { status: "authenticated", token, email };
	return { status: "unauthenticated" };
}

export function AuthForm({
	onAuth,
}: {
	onAuth: (token: string, email: string) => void;
}) {
	const [email, setEmail] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [sent, setSent] = useState(false);

	// If the URL has ?token=... auto-verify on mount
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const token = params.get("token");
		if (!token) return;
		// Clear the token from the URL immediately
		window.history.replaceState({}, "", window.location.pathname);
		fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
			.then((r) => r.json())
			.then((body) => {
				const b = body as { token?: string; email?: string; error?: string };
				if (b.token && b.email) {
					onAuth(b.token, b.email);
				} else {
					setError(b.error ?? "Magic link verification failed");
				}
			})
			.catch(() => setError("Network error verifying magic link"));
	}, [onAuth]);

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const response = await fetch("/api/auth/request-link", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});
			const body = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !body.ok) {
				setError(body.error ?? "Failed to send magic link");
				return;
			}
			setSent(true);
		} catch {
			setError("Network error. Please try again.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<main className="app-shell auth-page">
			<header className="topbar">
				<div className="brand">
					<Code2 size={28} aria-hidden="true" />
					<span>Better GitHub</span>
				</div>
			</header>
			<div className="auth-container">
				<div className="auth-card">
					<Code2 size={48} aria-hidden="true" className="auth-logo" />
					<h1 className="auth-title">Sign in to Better GitHub</h1>
					{sent ? (
						<div className="auth-sent" data-testid="auth-sent">
							<p>
								Check your email — we sent a sign-in link to{" "}
								<strong>{email}</strong>.
							</p>
							<p className="auth-hint">The link expires in 15 minutes.</p>
							<button
								type="button"
								className="auth-resend"
								onClick={() => setSent(false)}
							>
								Use a different email
							</button>
						</div>
					) : (
						<form
							className="auth-form"
							onSubmit={handleSubmit}
							data-testid="auth-form"
						>
							<label className="auth-label">
								Email address
								<input
									className="auth-input"
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
									autoComplete="email"
									data-testid="auth-email"
								/>
							</label>
							{error && (
								<p className="auth-error" role="alert" data-testid="auth-error">
									{error}
								</p>
							)}
							<button
								className="auth-submit"
								type="submit"
								disabled={loading}
								data-testid="auth-submit"
							>
								{loading ? "Sending…" : "Send magic link"}
							</button>
						</form>
					)}
				</div>
			</div>
		</main>
	);
}

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function timeAgo(value: string) {
	const diff = new Date(value).getTime() - Date.now();
	const minutes = Math.round(diff / 60000);
	if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");
	const hours = Math.round(minutes / 60);
	if (Math.abs(hours) < 24) return relativeTime.format(hours, "hour");
	return relativeTime.format(Math.round(hours / 24), "day");
}

export function readPathFromSearch(search: string): string {
	const params = new URLSearchParams(search);
	const value = params.get("path") ?? "";
	return value.replace(/^\/+|\/+$/g, "");
}

export function buildPathSearch(path: string): string {
	const trimmed = path.replace(/^\/+|\/+$/g, "");
	return trimmed ? `?path=${encodeURIComponent(trimmed)}` : "";
}

export function RepoBreadcrumb({
	onBack,
	owner,
}: {
	onBack: () => void;
	owner: string;
}) {
	return (
		<nav className="repo-breadcrumb" aria-label="Repository breadcrumb">
			<a
				className="repo-breadcrumb-home"
				data-testid="repo-breadcrumb-home"
				href="/"
				onClick={(event) => {
					if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
						return;
					event.preventDefault();
					onBack();
				}}
			>
				Better GitHub
			</a>
			<span className="repo-breadcrumb-sep" aria-hidden="true">
				{" "}
				/{" "}
			</span>
			<span className="repo-breadcrumb-owner">{owner}</span>
		</nav>
	);
}

export function RepoHomeLink({
	name,
	onHome,
	href = "/",
}: {
	name: string;
	onHome: () => void;
	href?: string;
}) {
	return (
		<a
			className="repo-home-link"
			data-testid="repo-home-link"
			href={href}
			onClick={(event) => {
				if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
					return;
				event.preventDefault();
				onHome();
			}}
		>
			<strong>{name}</strong>
		</a>
	);
}

export function ReadmePreview({ text }: { text: string }) {
	return (
		<div className="readme-preview" data-testid="repo-readme">
			<div className="readme-header">
				<BookOpen size={16} aria-hidden="true" />
				<strong>README.md</strong>
			</div>
			<pre className="readme-body">{text}</pre>
		</div>
	);
}

export function RepoList({
	auth,
	onSignOut,
	onSelectRepo,
}: {
	auth: Extract<AuthState, { status: "authenticated" }>;
	onSignOut: () => void;
	onSelectRepo: (owner: string, repo: string) => void;
}) {
	const [state, setState] = useState<RepoListState>({ status: "loading" });

	useEffect(() => {
		fetch("/api/repos", {
			headers: { Authorization: `Bearer ${auth.token}` },
		})
			.then((r) => {
				if (r.status === 401) {
					onSignOut();
					throw new Error("Session expired. Please sign in again.");
				}
				if (!r.ok) throw new Error("Could not load repositories");
				return r.json() as Promise<GitRepository[]>;
			})
			.then((repos) => setState({ status: "ready", repos }))
			.catch((e: Error) => setState({ status: "error", message: e.message }));
	}, [auth.token, onSignOut]);

	return (
		<main className="app-shell">
			<header className="topbar">
				<div className="brand">
					<Code2 size={28} aria-hidden="true" />
					<span>Better GitHub</span>
				</div>
				<label className="search">
					<Search size={16} aria-hidden="true" />
					<input
						placeholder="Search or jump to..."
						aria-label="Search or jump to"
					/>
				</label>
				<div className="topbar-user">
					<span className="topbar-email">{auth.email}</span>
					<button
						type="button"
						className="signout-button"
						onClick={onSignOut}
						data-testid="signout-button"
						title="Sign out"
					>
						<LogOut size={16} aria-hidden="true" />
						Sign out
					</button>
				</div>
			</header>

			<div className="repos-container">
				<h1 className="repos-heading">Repositories</h1>
				{state.status === "loading" && (
					<p className="repos-status">Loading repositories…</p>
				)}
				{state.status === "error" && (
					<p className="repos-status repos-error">{state.message}</p>
				)}
				{state.status === "ready" && (
					<div className="repo-list" data-testid="repo-list">
						{state.repos.map((r) => (
							<article
								className="repo-list-item"
								key={r.id}
								data-testid="repo-list-item"
							>
								<div className="repo-list-item-header">
									<BookOpen size={16} aria-hidden="true" />
									<a
										className="repo-list-name"
										href={`/${r.owner}/${r.name}`}
										onClick={(e) => {
											if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
												return;
											e.preventDefault();
											onSelectRepo(r.owner, r.name);
										}}
									>
										{r.owner}/{r.name}
									</a>
									<span className="visibility">{r.visibility}</span>
								</div>
								{r.description && (
									<p className="repo-list-description">{r.description}</p>
								)}
								<div className="repo-list-meta">
									{r.language && <span>{r.language}</span>}
									<time dateTime={r.updatedAt}>
										Updated {timeAgo(r.updatedAt)}
									</time>
								</div>
							</article>
						))}
					</div>
				)}
			</div>
		</main>
	);
}

export function LineNumberedCode({ text }: { text: string }) {
	const lines = text.split("\n");

	return (
		<pre className="file-viewer-body">
			<code>
				{lines.map((line, index) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: line index is the stable identity for static file contents
					<span className="code-line" key={`${index}-${line}`}>
						<span className="line-number" aria-hidden="true">
							{index + 1}
						</span>
						<span className="line-text">{line || " "}</span>
					</span>
				))}
			</code>
		</pre>
	);
}

type WorkflowRunsState =
	| { status: "loading" }
	| { status: "ready"; runs: WorkflowRun[] }
	| { status: "error"; message: string };

type WorkflowFilesState =
	| { status: "loading" }
	| { status: "ready"; files: WorkflowFile[] }
	| { status: "error"; message: string };

const DEFAULT_WORKFLOW_CONTENT = `name: New Workflow
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: freestyle-vm
    steps:
      - name: Checkout
        uses: checkout
      - name: Install dependencies
        run: bun install
      - name: Run tests
        run: bun test
`;

export function WorkflowEditor({
	auth,
	owner,
	repo,
	onBack,
}: {
	auth: { token: string };
	owner: string;
	repo: string;
	onBack: () => void;
}) {
	const [state, setState] = useState<WorkflowFilesState>({ status: "loading" });
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [editedContent, setEditedContent] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [newFileName, setNewFileName] = useState("");
	const [createError, setCreateError] = useState<string | null>(null);
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	const loadWorkflows = () => {
		fetch(
			`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/workflows`,
			{
				headers: { Authorization: `Bearer ${auth.token}` },
			},
		)
			.then((r) => {
				if (!r.ok) throw new Error("Could not load workflows");
				return r.json() as Promise<WorkflowFile[]>;
			})
			.then((files) => {
				setState({ status: "ready", files });
				if (files.length > 0 && !selectedFile) {
					setSelectedFile(files[0].name);
				}
			})
			.catch((e: Error) => setState({ status: "error", message: e.message }));
	};

	useEffect(() => {
		loadWorkflows();
	}, [auth.token, owner, repo]);

	const selectedWorkflow =
		state.status === "ready"
			? state.files.find((f) => f.name === selectedFile)
			: null;

	const currentContent = editedContent ?? selectedWorkflow?.content ?? "";
	const hasChanges = editedContent !== null && editedContent !== selectedWorkflow?.content;

	const handleSave = async () => {
		if (!selectedFile || !editedContent) return;
		setSaving(true);
		setSaveError(null);

		try {
			const response = await fetch(
				`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/workflows/${encodeURIComponent(selectedFile)}`,
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${auth.token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ content: editedContent }),
				},
			);

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error((data as { error?: string }).error ?? "Failed to save");
			}

			setEditedContent(null);
			loadWorkflows();
		} catch (e) {
			setSaveError(e instanceof Error ? e.message : "Failed to save");
		} finally {
			setSaving(false);
		}
	};

	const handleSelectFile = (fileName: string) => {
		setSelectedFile(fileName);
		setEditedContent(null);
		setSaveError(null);
		setIsCreating(false);
		setConfirmingDelete(false);
		setDeleteError(null);
	};

	const handleDelete = async () => {
		if (!selectedFile) return;
		setDeleting(true);
		setDeleteError(null);

		try {
			const response = await fetch(
				`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/workflows/${encodeURIComponent(selectedFile)}`,
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${auth.token}`,
					},
				},
			);

			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				throw new Error((data as { error?: string }).error ?? "Failed to delete");
			}

			setSelectedFile(null);
			setConfirmingDelete(false);
			loadWorkflows();
		} catch (e) {
			setDeleteError(e instanceof Error ? e.message : "Failed to delete");
		} finally {
			setDeleting(false);
		}
	};

	const handleStartCreate = () => {
		setIsCreating(true);
		setSelectedFile(null);
		setNewFileName("");
		setEditedContent(DEFAULT_WORKFLOW_CONTENT);
		setCreateError(null);
		setSaveError(null);
	};

	const handleCancelCreate = () => {
		setIsCreating(false);
		setEditedContent(null);
		setCreateError(null);
		if (state.status === "ready" && state.files.length > 0) {
			setSelectedFile(state.files[0].name);
		}
	};

	const handleCreate = async () => {
		if (!newFileName.trim()) {
			setCreateError("Please enter a file name");
			return;
		}
		if (!editedContent) {
			setCreateError("Please enter workflow content");
			return;
		}

		setSaving(true);
		setCreateError(null);

		try {
			const response = await fetch(
				`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/workflows`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${auth.token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ name: newFileName.trim(), content: editedContent }),
				},
			);

			const data = await response.json() as { ok?: boolean; name?: string; error?: string };
			if (!response.ok) {
				throw new Error(data.error ?? "Failed to create workflow");
			}

			setIsCreating(false);
			setEditedContent(null);
			setNewFileName("");
			loadWorkflows();
			if (data.name) {
				setSelectedFile(data.name);
			}
		} catch (e) {
			setCreateError(e instanceof Error ? e.message : "Failed to create workflow");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="workflow-editor" data-testid="workflow-editor">
			<div className="workflow-editor-header">
				<button
					type="button"
					className="workflow-editor-back"
					onClick={onBack}
					data-testid="workflow-editor-back"
				>
					<ArrowLeft size={16} aria-hidden="true" />
					Back to runs
				</button>
				<h2>Workflow files</h2>
				<button
					type="button"
					className="workflow-create-btn"
					onClick={handleStartCreate}
					data-testid="workflow-create-btn"
				>
					<Plus size={16} aria-hidden="true" />
					New workflow
				</button>
			</div>

			{state.status === "loading" && (
				<p className="workflow-editor-status">Loading workflows...</p>
			)}
			{state.status === "error" && (
				<p className="workflow-editor-status workflow-editor-error">
					{state.message}
				</p>
			)}
			{state.status === "ready" && state.files.length === 0 && (
				<p className="workflow-editor-status">
					No workflow files found in .better-github/workflows/
				</p>
			)}
			{(state.status === "ready" && state.files.length > 0) || isCreating ? (
				<div className="workflow-editor-content">
					<div className="workflow-file-list" data-testid="workflow-file-list">
						{state.status === "ready" && state.files.map((file) => (
							<button
								type="button"
								className={`workflow-file-item ${selectedFile === file.name && !isCreating ? "selected" : ""}`}
								key={file.name}
								onClick={() => handleSelectFile(file.name)}
								data-testid="workflow-file-item"
							>
								<FileCode size={16} aria-hidden="true" />
								{file.name}
							</button>
						))}
					</div>
					{isCreating ? (
						<div
							className="workflow-file-content"
							data-testid="workflow-create-form"
						>
							<div className="workflow-file-header">
								<FileCode size={16} aria-hidden="true" />
								<input
									type="text"
									className="workflow-name-input"
									placeholder="workflow-name.yml"
									value={newFileName}
									onChange={(e) => setNewFileName(e.target.value)}
									data-testid="workflow-name-input"
								/>
								<div className="workflow-file-actions">
									<button
										type="button"
										className="workflow-cancel-btn"
										onClick={handleCancelCreate}
										data-testid="workflow-cancel-btn"
									>
										Cancel
									</button>
									<button
										type="button"
										className="workflow-save-btn"
										onClick={handleCreate}
										disabled={saving}
										data-testid="workflow-create-submit"
									>
										{saving ? "Creating..." : "Create"}
									</button>
								</div>
							</div>
							{createError && (
								<p className="workflow-save-error" data-testid="workflow-create-error">
									{createError}
								</p>
							)}
							<textarea
								className="workflow-textarea"
								value={editedContent ?? ""}
								onChange={(e) => setEditedContent(e.target.value)}
								spellCheck={false}
								data-testid="workflow-create-textarea"
							/>
						</div>
					) : selectedWorkflow && (
						<div
							className="workflow-file-content"
							data-testid="workflow-file-content"
						>
							<div className="workflow-file-header">
								<FileCode size={16} aria-hidden="true" />
								<strong>{selectedWorkflow.name}</strong>
								{hasChanges && (
									<span className="workflow-unsaved-indicator" data-testid="workflow-unsaved">
										(unsaved)
									</span>
								)}
								<div className="workflow-file-actions">
									{confirmingDelete ? (
										<>
											<span className="workflow-delete-confirm-text">Delete this workflow?</span>
											<button
												type="button"
												className="workflow-cancel-btn"
												onClick={() => setConfirmingDelete(false)}
												disabled={deleting}
												data-testid="workflow-delete-cancel"
											>
												Cancel
											</button>
											<button
												type="button"
												className="workflow-delete-confirm-btn"
												onClick={handleDelete}
												disabled={deleting}
												data-testid="workflow-delete-confirm"
											>
												{deleting ? "Deleting..." : "Confirm Delete"}
											</button>
										</>
									) : (
										<>
											<button
												type="button"
												className="workflow-delete-btn"
												onClick={() => setConfirmingDelete(true)}
												data-testid="workflow-delete-btn"
											>
												<Trash2 size={16} aria-hidden="true" />
												Delete
											</button>
											<button
												type="button"
												className="workflow-save-btn"
												onClick={handleSave}
												disabled={!hasChanges || saving}
												data-testid="workflow-save-btn"
											>
												{saving ? "Saving..." : "Save"}
											</button>
										</>
									)}
								</div>
							</div>
							{deleteError && (
								<p className="workflow-save-error" data-testid="workflow-delete-error">
									{deleteError}
								</p>
							)}
							{saveError && (
								<p className="workflow-save-error" data-testid="workflow-save-error">
									{saveError}
								</p>
							)}
							<textarea
								className="workflow-textarea"
								value={currentContent}
								onChange={(e) => setEditedContent(e.target.value)}
								spellCheck={false}
								data-testid="workflow-textarea"
							/>
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}

function RunStatusIcon({ status }: { status: WorkflowRun["status"] }) {
	switch (status) {
		case "queued":
			return (
				<Clock size={16} className="run-status-queued" aria-label="Queued" />
			);
		case "in_progress":
			return (
				<Loader2
					size={16}
					className="run-status-running"
					aria-label="In progress"
				/>
			);
		case "success":
			return (
				<CheckCircle2
					size={16}
					className="run-status-success"
					aria-label="Success"
				/>
			);
		case "failure":
			return (
				<XCircle
					size={16}
					className="run-status-failure"
					aria-label="Failure"
				/>
			);
		case "cancelled":
			return (
				<Ban
					size={16}
					className="run-status-cancelled"
					aria-label="Cancelled"
				/>
			);
	}
}

function StepStatusIcon({ status }: { status: WorkflowStepResult["status"] }) {
	switch (status) {
		case "pending":
			return (
				<Clock size={16} className="step-status-pending" aria-label="Pending" />
			);
		case "running":
			return (
				<Loader2
					size={16}
					className="step-status-running"
					aria-label="Running"
				/>
			);
		case "success":
			return (
				<CheckCircle2
					size={16}
					className="step-status-success"
					aria-label="Success"
				/>
			);
		case "failure":
			return (
				<XCircle
					size={16}
					className="step-status-failure"
					aria-label="Failure"
				/>
			);
		case "skipped":
			return (
				<SkipForward
					size={16}
					className="step-status-skipped"
					aria-label="Skipped"
				/>
			);
	}
}

export function RunDetail({
	run,
	onBack,
	onCancel,
	onRerun,
	cancelling = false,
	rerunning = false,
}: {
	run: WorkflowRun;
	onBack: () => void;
	onCancel?: () => void;
	onRerun?: () => void;
	cancelling?: boolean;
	rerunning?: boolean;
}) {
	const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
	const isCancellable = run.status === "queued" || run.status === "in_progress";
	const isRerunnable =
		run.status === "success" ||
		run.status === "failure" ||
		run.status === "cancelled";

	const toggleStep = (stepName: string) => {
		setExpandedSteps((prev) => {
			const next = new Set(prev);
			if (next.has(stepName)) {
				next.delete(stepName);
			} else {
				next.add(stepName);
			}
			return next;
		});
	};

	const steps = run.steps ?? [];

	return (
		<div className="run-detail" data-testid="run-detail">
			<div className="run-detail-header">
				<button
					type="button"
					className="run-detail-back"
					onClick={onBack}
					data-testid="run-detail-back"
				>
					<ArrowLeft size={16} aria-hidden="true" />
					All workflow runs
				</button>
			</div>
			<div className="run-detail-title">
				<RunStatusIcon status={run.status} />
				<h2>{run.workflowName}</h2>
				<span className="run-status-badge" data-status={run.status}>
					{run.status === "in_progress" ? "In progress" : run.status}
				</span>
				{isCancellable && onCancel && (
					<button
						type="button"
						className="cancel-run-button"
						onClick={onCancel}
						disabled={cancelling}
						data-testid="cancel-run-button"
					>
						<StopCircle size={16} aria-hidden="true" />
						{cancelling ? "Cancelling..." : "Cancel"}
					</button>
				)}
				{isRerunnable && onRerun && (
					<button
						type="button"
						className="rerun-button"
						onClick={onRerun}
						disabled={rerunning}
						data-testid="rerun-button"
					>
						<Play size={16} aria-hidden="true" />
						{rerunning ? "Re-running..." : "Re-run"}
					</button>
				)}
			</div>
			<div className="run-detail-meta">
				<span>{run.branch}</span>
				<span>·</span>
				<span>{run.commitSha.slice(0, 7)}</span>
				<span>·</span>
				<span>Started {timeAgo(run.startedAt)}</span>
				{run.completedAt && (
					<>
						<span>·</span>
						<span>Completed {timeAgo(run.completedAt)}</span>
					</>
				)}
			</div>

			<div className="run-steps" data-testid="run-steps">
				<h3>Steps</h3>
				{steps.length === 0 ? (
					<p className="run-steps-empty">No step details available yet.</p>
				) : (
					<div className="steps-list">
						{steps.map((step) => {
							const isExpanded = expandedSteps.has(step.name);
							const hasLogs = step.logs && step.logs.trim().length > 0;
							return (
								<div
									className="step-item"
									key={step.name}
									data-testid="step-item"
								>
									<button
										type="button"
										className="step-header"
										onClick={() => hasLogs && toggleStep(step.name)}
										disabled={!hasLogs}
									>
										{hasLogs ? (
											isExpanded ? (
												<ChevronDown size={16} aria-hidden="true" />
											) : (
												<ChevronRight size={16} aria-hidden="true" />
											)
										) : (
											<span className="step-chevron-placeholder" />
										)}
										<StepStatusIcon status={step.status} />
										<span className="step-name">{step.name}</span>
										<span className="step-status-text">{step.status}</span>
									</button>
									{isExpanded && hasLogs && (
										<pre className="step-logs" data-testid="step-logs">
											{step.logs}
										</pre>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>

			{run.logs && (
				<div className="run-full-logs">
					<h3>Full logs</h3>
					<pre className="run-logs-content" data-testid="run-logs">
						{run.logs}
					</pre>
				</div>
			)}
		</div>
	);
}

type ActionsView = "runs" | "run-detail" | "workflows";

export function ActionsTab({
	auth,
	owner,
	repo,
	onSignOut,
}: {
	auth: Extract<AuthState, { status: "authenticated" }>;
	owner: string;
	repo: string;
	onSignOut: () => void;
}) {
	const [state, setState] = useState<WorkflowRunsState>({ status: "loading" });
	const [triggering, setTriggering] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [rerunning, setRerunning] = useState(false);
	const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
	const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);
	const [view, setView] = useState<ActionsView>("runs");

	const handleRunUpdate = useCallback(
		(updatedRun: WorkflowRun) => {
			setState((prev) => {
				if (prev.status !== "ready") return prev;
				const existingIndex = prev.runs.findIndex(
					(r) => r.id === updatedRun.id,
				);
				if (existingIndex >= 0) {
					const newRuns = [...prev.runs];
					newRuns[existingIndex] = updatedRun;
					return { status: "ready", runs: newRuns };
				}
				return { status: "ready", runs: [updatedRun, ...prev.runs] };
			});
			if (selectedRunId === updatedRun.id) {
				setSelectedRun(updatedRun);
			}
		},
		[selectedRunId],
	);

	useWorkflowWebSocket(handleRunUpdate, selectedRunId ?? undefined);

	const fetchRuns = useCallback(() => {
		fetch(
			`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs`,
			{
				headers: { Authorization: `Bearer ${auth.token}` },
			},
		)
			.then((r) => {
				if (r.status === 401) {
					onSignOut();
					throw new Error("Session expired");
				}
				if (!r.ok) throw new Error("Could not load workflow runs");
				return r.json() as Promise<WorkflowRun[]>;
			})
			.then((runs) => setState({ status: "ready", runs }))
			.catch((e: Error) => setState({ status: "error", message: e.message }));
	}, [auth.token, owner, repo, onSignOut]);

	const fetchRunDetail = useCallback(
		(runId: string) => {
			fetch(
				`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}`,
				{
					headers: { Authorization: `Bearer ${auth.token}` },
				},
			)
				.then((r) => {
					if (r.status === 401) {
						onSignOut();
						throw new Error("Session expired");
					}
					if (!r.ok) throw new Error("Could not load run details");
					return r.json() as Promise<WorkflowRun>;
				})
				.then((run) => setSelectedRun(run))
				.catch(() => {});
		},
		[auth.token, owner, repo, onSignOut],
	);

	useEffect(() => {
		fetchRuns();
	}, [fetchRuns]);

	useEffect(() => {
		if (!selectedRunId) {
			setSelectedRun(null);
			return;
		}
		fetchRunDetail(selectedRunId);
	}, [selectedRunId, fetchRunDetail]);

	const triggerRun = async () => {
		setTriggering(true);
		try {
			const response = await fetch(
				`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${auth.token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ branch: "main" }),
				},
			);
			if (response.ok) {
				fetchRuns();
			}
		} finally {
			setTriggering(false);
		}
	};

	const cancelRun = async (runId: string) => {
		setCancelling(true);
		try {
			await fetch(
				`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/cancel`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${auth.token}`,
					},
				},
			);
		} finally {
			setCancelling(false);
		}
	};

	const rerunWorkflow = async (runId: string) => {
		setRerunning(true);
		try {
			const response = await fetch(
				`/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${auth.token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ rerunOf: runId }),
				},
			);
			if (response.ok) {
				const newRun = (await response.json()) as { id: string };
				setSelectedRunId(newRun.id);
				fetchRuns();
			}
		} finally {
			setRerunning(false);
		}
	};

	if (view === "workflows") {
		return (
			<section className="actions-tab" data-testid="actions-tab">
				<WorkflowEditor
					auth={auth}
					owner={owner}
					repo={repo}
					onBack={() => setView("runs")}
				/>
			</section>
		);
	}

	if (selectedRun) {
		return (
			<section className="actions-tab" data-testid="actions-tab">
				<RunDetail
					run={selectedRun}
					onBack={() => setSelectedRunId(null)}
					onCancel={() => cancelRun(selectedRun.id)}
					onRerun={() => rerunWorkflow(selectedRun.id)}
					cancelling={cancelling}
					rerunning={rerunning}
				/>
			</section>
		);
	}

	return (
		<section className="actions-tab" data-testid="actions-tab">
			<div className="actions-header">
				<h2>Workflow runs</h2>
				<div className="actions-header-buttons">
					<button
						type="button"
						className="view-workflows-button"
						onClick={() => setView("workflows")}
						data-testid="view-workflows-button"
					>
						<FileCode size={16} aria-hidden="true" />
						View workflows
					</button>
					<button
						type="button"
						className="trigger-run-button"
						onClick={triggerRun}
						disabled={triggering}
					>
						<Play size={16} aria-hidden="true" />
						{triggering ? "Triggering..." : "Run workflow"}
					</button>
				</div>
			</div>
			{state.status === "loading" && (
				<p className="actions-status">Loading workflow runs...</p>
			)}
			{state.status === "error" && (
				<p className="actions-status actions-error">{state.message}</p>
			)}
			{state.status === "ready" && state.runs.length === 0 && (
				<p className="actions-status">
					No workflow runs yet. Click "Run workflow" to start one.
				</p>
			)}
			{state.status === "ready" && state.runs.length > 0 && (
				<div className="runs-list" data-testid="runs-list">
					{state.runs.map((run) => (
						<button
							type="button"
							className="run-item"
							key={run.id}
							data-testid="run-item"
							onClick={() => setSelectedRunId(run.id)}
						>
							<RunStatusIcon status={run.status} />
							<div className="run-info">
								<strong>{run.workflowName}</strong>
								<span className="run-meta">
									{run.branch} · {run.commitSha.slice(0, 7)} ·{" "}
									{timeAgo(run.startedAt)}
								</span>
							</div>
							<span className="run-status-badge" data-status={run.status}>
								{run.status === "in_progress" ? "In progress" : run.status}
							</span>
						</button>
					))}
				</div>
			)}
		</section>
	);
}

type RepoTab = "code" | "actions";

function RepoBrowser({
	auth,
	onSignOut,
	owner,
	repo,
	onBack,
}: {
	auth: Extract<AuthState, { status: "authenticated" }>;
	onSignOut: () => void;
	owner: string;
	repo: string;
	onBack: () => void;
}) {
	const [state, setState] = useState<LoadState>({ status: "loading" });
	const [activeTab, setActiveTab] = useState<RepoTab>("code");
	const [path, setPath] = useState(() =>
		typeof window === "undefined"
			? ""
			: readPathFromSearch(window.location.search),
	);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const desired = buildPathSearch(path);
		if (window.location.search !== desired) {
			window.history.pushState(
				{ path },
				"",
				`${window.location.pathname}${desired}`,
			);
		}
	}, [path]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const handle = () => setPath(readPathFromSearch(window.location.search));
		window.addEventListener("popstate", handle);
		return () => window.removeEventListener("popstate", handle);
	}, []);

	useEffect(() => {
		const params = new URLSearchParams();
		if (path) params.set("path", path);
		const url = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${params.size ? `?${params}` : ""}`;

		setState({ status: "loading" });
		fetch(url, {
			headers: { Authorization: `Bearer ${auth.token}` },
		})
			.then((response) => {
				if (response.status === 401) {
					onSignOut();
					throw new Error("Session expired. Please sign in again.");
				}
				if (!response.ok) throw new Error("Repository could not be loaded");
				return response.json() as Promise<RepositoryOverview>;
			})
			.then((data) => setState({ status: "ready", data }))
			.catch((error: Error) =>
				setState({ status: "error", message: error.message }),
			);
	}, [path, auth.token, onSignOut, owner, repo]);

	const activePrs = useMemo(() => {
		if (state.status !== "ready") return 0;
		return state.data.pullRequests.filter(
			(pullRequest) => pullRequest.status === "open",
		).length;
	}, [state]);

	if (state.status === "loading") {
		return <main className="app-shell loading">Loading repository...</main>;
	}

	if (state.status === "error") {
		return <main className="app-shell loading">{state.message}</main>;
	}

	const {
		repository,
		branches,
		commits,
		files,
		pullRequests,
		fileContent,
		readme,
	} = state.data;
	const latestCommit = commits[0];
	const pathSegments = state.data.path.split("/").filter(Boolean);
	const openDirectory = (name: string) =>
		setPath(path ? `${path}/${name}` : name);
	const openFile = (name: string) => setPath(path ? `${path}/${name}` : name);
	const openPathSegment = (index: number) =>
		setPath(pathSegments.slice(0, index + 1).join("/"));

	return (
		<main className="app-shell">
			<header className="topbar">
				<div className="brand">
					<Code2 size={28} aria-hidden="true" />
					<span>Better GitHub</span>
				</div>
				<label className="search">
					<Search size={16} aria-hidden="true" />
					<input
						placeholder="Search or jump to..."
						aria-label="Search or jump to"
					/>
				</label>
				<div className="topbar-user">
					<span className="topbar-email">{auth.email}</span>
					<button
						type="button"
						className="signout-button"
						onClick={onSignOut}
						data-testid="signout-button"
						title="Sign out"
					>
						<LogOut size={16} aria-hidden="true" />
						Sign out
					</button>
				</div>
			</header>

			<RepoBreadcrumb onBack={onBack} owner={owner} />

			<section className="repo-header">
				<div>
					<div className="repo-title">
						<BookOpen size={20} aria-hidden="true" />
						<span>{repository.owner}</span>
						<span className="slash">/</span>
						<RepoHomeLink
							name={repository.name}
							onHome={() => setPath("")}
							href={`/${owner}/${repo}`}
						/>
						<span className="visibility">{repository.visibility}</span>
					</div>
					<p>{repository.description}</p>
				</div>
				<div className="repo-actions">
					<button type="button">
						<Eye size={16} aria-hidden="true" />
						Watch <strong>{repository.watchers}</strong>
					</button>
					<button type="button">
						<GitFork size={16} aria-hidden="true" />
						Fork <strong>{repository.forks}</strong>
					</button>
					<button type="button">
						<Star size={16} aria-hidden="true" />
						Star <strong>{repository.stars}</strong>
					</button>
				</div>
			</section>

			<nav className="repo-tabs" aria-label="Repository">
				<button
					type="button"
					className={activeTab === "code" ? "active" : ""}
					onClick={() => setActiveTab("code")}
					data-testid="tab-code"
				>
					<Code2 size={16} aria-hidden="true" />
					Code
				</button>
				<button type="button" disabled>
					<GitPullRequest size={16} aria-hidden="true" />
					Pull requests <span>{activePrs}</span>
				</button>
				<button
					type="button"
					className={activeTab === "actions" ? "active" : ""}
					onClick={() => setActiveTab("actions")}
					data-testid="tab-actions"
				>
					<History size={16} aria-hidden="true" />
					Actions
				</button>
			</nav>

			<div className="content-grid">
				{activeTab === "code" ? (
					<section className="repo-main" id="code" aria-label="Code">
						<div className="code-toolbar">
							<button className="branch-button" type="button">
								<GitBranch size={16} aria-hidden="true" />
								{repository.defaultBranch}
							</button>
							<span>{branches.length} branches</span>
							<span>{commits.length} commits</span>
							<button className="code-button" type="button">
								<Code2 size={16} aria-hidden="true" />
								Code
							</button>
						</div>
						<nav className="path-breadcrumbs" aria-label="Directory path">
							<button type="button" onClick={() => setPath("")}>
								<FolderOpen size={16} aria-hidden="true" />
								{repository.name}
							</button>
							{pathSegments.map((segment, index) => (
								<span key={pathSegments.slice(0, index + 1).join("/")}>
									<span className="path-separator">/</span>
									<button type="button" onClick={() => openPathSegment(index)}>
										{segment}
									</button>
								</span>
							))}
						</nav>
						<div className="latest-commit">
							{latestCommit ? (
								<>
									<img src={latestCommit.author.avatarUrl} alt="" />
									<strong>{latestCommit.author.login}</strong>
									<span>{latestCommit.message}</span>
									<code>{latestCommit.sha}</code>
								</>
							) : (
								<span>No commits yet</span>
							)}
						</div>
						{fileContent ? (
							<section
								className="file-viewer"
								aria-label={`Contents of ${fileContent.path}`}
							>
								<div className="file-viewer-header">
									<File size={16} aria-hidden="true" />
									<strong>{fileContent.name}</strong>
									<span>{fileContent.size} bytes</span>
								</div>
								<LineNumberedCode text={fileContent.text} />
							</section>
						) : (
							<>
								<div className="file-list">
									{files.map((item) => {
										const Icon = item.type === "directory" ? Folder : File;
										const rowName =
											item.type === "directory" ? (
												<button
													className="file-link"
													type="button"
													onClick={() => openDirectory(item.name)}
												>
													{item.name}
												</button>
											) : (
												<button
													className="file-link"
													type="button"
													onClick={() => openFile(item.name)}
												>
													{item.name}
												</button>
											);
										return (
											<div className="file-row" key={item.name}>
												<Icon size={18} aria-hidden="true" />
												{rowName}
												<span>{item.lastCommit}</span>
												<time dateTime={item.updatedAt}>
													{timeAgo(item.updatedAt)}
												</time>
											</div>
										);
									})}
								</div>
								{readme && !path && <ReadmePreview text={readme.text} />}
							</>
						)}
					</section>
				) : (
					<ActionsTab
						auth={auth}
						owner={owner}
						repo={repo}
						onSignOut={onSignOut}
					/>
				)}

				<aside className="sidebar" aria-label="Repository details">
					<section>
						<h2>About</h2>
						<p>{repository.description}</p>
						<div className="meta-row">
							<CircleDot size={14} aria-hidden="true" />
							{repository.language}
						</div>
						<div className="meta-row">
							<LockKeyhole size={14} aria-hidden="true" />
							{repository.license} license
						</div>
						<div className="topics">
							{repository.topics.map((topic) => (
								<span key={topic}>{topic}</span>
							))}
						</div>
					</section>
					<section id="pulls">
						<h2>Pull requests</h2>
						{pullRequests.map((pullRequest) => (
							<article className="pull-card" key={pullRequest.id}>
								<GitPullRequest size={16} aria-hidden="true" />
								<div>
									<strong>{pullRequest.title}</strong>
									<span>
										#{pullRequest.id} by {pullRequest.author} ·{" "}
										{pullRequest.status}
									</span>
								</div>
							</article>
						))}
					</section>
					<section id="history">
						<h2>Recent commits</h2>
						{commits.map((commit) => (
							<article className="commit-card" key={commit.sha}>
								<GitCommitHorizontal size={16} aria-hidden="true" />
								<div>
									<strong>{commit.message}</strong>
									<span>{commit.sha}</span>
								</div>
							</article>
						))}
					</section>
					<section>
						<h2>Automation</h2>
						<div className="meta-row">
							<Bot size={14} aria-hidden="true" />
							Freestyle Git content synced
						</div>
					</section>
				</aside>
			</div>
		</main>
	);
}

function App() {
	const [auth, setAuth] = useState<AuthState>(() => loadStoredAuth());
	const [route, setRoute] = useState<Route>(() =>
		typeof window === "undefined"
			? { page: "repos" }
			: parseRoute(window.location.pathname),
	);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const handle = () => setRoute(parseRoute(window.location.pathname));
		window.addEventListener("popstate", handle);
		return () => window.removeEventListener("popstate", handle);
	}, []);

	function navigateTo(pathname: string) {
		window.history.pushState({}, "", pathname);
		setRoute(parseRoute(pathname));
	}

	function handleAuth(token: string, email: string) {
		if (typeof window !== "undefined") {
			localStorage.setItem(AUTH_TOKEN_KEY, token);
			localStorage.setItem(AUTH_EMAIL_KEY, email);
		}
		setAuth({ status: "authenticated", token, email });
	}

	function handleSignOut() {
		if (typeof window !== "undefined") {
			localStorage.removeItem(AUTH_TOKEN_KEY);
			localStorage.removeItem(AUTH_EMAIL_KEY);
		}
		setAuth({ status: "unauthenticated" });
	}

	if (auth.status === "unauthenticated") {
		return <AuthForm onAuth={handleAuth} />;
	}

	if (route.page === "repos") {
		return (
			<RepoList
				auth={auth}
				onSignOut={handleSignOut}
				onSelectRepo={(owner, repo) => navigateTo(`/${owner}/${repo}`)}
			/>
		);
	}

	return (
		<RepoBrowser
			auth={auth}
			onSignOut={handleSignOut}
			owner={route.owner}
			repo={route.repo}
			onBack={() => navigateTo("/")}
		/>
	);
}

export default App;
