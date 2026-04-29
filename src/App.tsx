import {
	BookOpen,
	Bot,
	CircleDot,
	Code2,
	Eye,
	File,
	Folder,
	FolderOpen,
	GitBranch,
	GitCommitHorizontal,
	GitFork,
	GitPullRequest,
	History,
	LockKeyhole,
	LogOut,
	Search,
	Star,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GitRepository, RepositoryOverview } from "./types";
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
				<a className="active" href="#code">
					<Code2 size={16} aria-hidden="true" />
					Code
				</a>
				<a href="#pulls">
					<GitPullRequest size={16} aria-hidden="true" />
					Pull requests <span>{activePrs}</span>
				</a>
				<a href="#history">
					<History size={16} aria-hidden="true" />
					Actions
				</a>
			</nav>

			<div className="content-grid">
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
