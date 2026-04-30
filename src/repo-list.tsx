import { BookOpen, Code2, LogOut, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { timeAgo } from "./format-time";
import type { GitRepository } from "./types";

type RepoListState =
	| { status: "loading" }
	| { status: "ready"; repos: GitRepository[] }
	| { status: "error"; message: string };

export function RepoList({
	auth,
	onSignOut,
	onSelectRepo,
}: {
	auth: { token: string; email: string };
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
