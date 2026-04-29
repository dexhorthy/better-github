import {
  BookOpen,
  Bot,
  CircleDot,
  Code2,
  Eye,
  File,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  History,
  LockKeyhole,
  Search,
  Star,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RepositoryOverview } from "./types";
import "./styles.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: RepositoryOverview }
  | { status: "error"; message: string };

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function timeAgo(value: string) {
  const diff = new Date(value).getTime() - Date.now();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeTime.format(hours, "hour");
  return relativeTime.format(Math.round(hours / 24), "day");
}

function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    fetch("/api/repos/dexhorthy/better-github")
      .then((response) => {
        if (!response.ok) throw new Error("Repository could not be loaded");
        return response.json() as Promise<RepositoryOverview>;
      })
      .then((data) => setState({ status: "ready", data }))
      .catch((error: Error) => setState({ status: "error", message: error.message }));
  }, []);

  const activePrs = useMemo(() => {
    if (state.status !== "ready") return 0;
    return state.data.pullRequests.filter((pullRequest) => pullRequest.status === "open").length;
  }, [state]);

  if (state.status === "loading") {
    return <main className="app-shell loading">Loading repository...</main>;
  }

  if (state.status === "error") {
    return <main className="app-shell loading">{state.message}</main>;
  }

  const { repository, branches, commits, files, pullRequests } = state.data;
  const latestCommit = commits[0];

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Code2 size={28} aria-hidden="true" />
          <span>Better GitHub</span>
        </div>
        <label className="search">
          <Search size={16} aria-hidden="true" />
          <input placeholder="Search or jump to..." aria-label="Search or jump to" />
        </label>
        <img className="avatar" src="https://avatars.githubusercontent.com/u/583231?v=4" alt="Octocat profile" />
      </header>

      <section className="repo-header">
        <div>
          <div className="repo-title">
            <BookOpen size={20} aria-hidden="true" />
            <span>{repository.owner}</span>
            <span className="slash">/</span>
            <strong>{repository.name}</strong>
            <span className="visibility">{repository.visibility}</span>
          </div>
          <p>{repository.description}</p>
        </div>
        <div className="repo-actions" aria-label="Repository stats">
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
          <div className="file-list">
            {files.map((item) => {
              const Icon = item.type === "directory" ? Folder : File;
              return (
                <div className="file-row" key={item.name}>
                  <Icon size={18} aria-hidden="true" />
                  <strong>{item.name}</strong>
                  <span>{item.lastCommit}</span>
                  <time dateTime={item.updatedAt}>{timeAgo(item.updatedAt)}</time>
                </div>
              );
            })}
          </div>
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
                    #{pullRequest.id} by {pullRequest.author} · {pullRequest.status}
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
              Freestyle Git integration pending
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

export default App;
