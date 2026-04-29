import { freestyle } from "freestyle";
import type { FileContent, GitBranch, GitCommit, GitUser } from "./types";

const FREESTYLE_API_BASE = "https://api.freestyle.sh";

type FreestyleRepoEntry = {
  id: string;
  name?: string | null;
  accountId: string;
  visibility: string;
  branches?: Record<string, { default: boolean; name: string; target?: string | null }>;
  defaultBranch?: string;
};

type FreestyleListResponse = {
  repositories: FreestyleRepoEntry[];
  total: number;
  offset: number;
};

async function listFreestyleRepos(): Promise<FreestyleRepoEntry[]> {
  const apiKey = process.env.FREESTYLE_API_KEY;
  if (!apiKey) return [];

  const response = await fetch(`${FREESTYLE_API_BASE}/git/v1/repo?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) return [];

  const data = (await response.json()) as FreestyleListResponse;
  return data.repositories ?? [];
}

export async function findFreestyleRepoId(repoName: string): Promise<string | null> {
  const envRepoId = process.env.FREESTYLE_REPO_ID;
  if (envRepoId) return envRepoId;

  const repos = await listFreestyleRepos();
  const match = repos.find((r) => r.name === repoName);
  return match?.id ?? null;
}

export type FreestyleRepoData = {
  repository: {
    defaultBranch: string;
    visibility: "Public" | "Private";
    updatedAt: string;
  };
  branches: GitBranch[];
  commits: GitCommit[];
  files: { type: "directory" | "file"; name: string; lastCommit: string; updatedAt: string }[];
  fileContent?: FileContent;
  readme?: { text: string };
};

function makeGitUser(name: string, email: string): GitUser {
  return {
    login: email.split("@")[0] ?? name,
    name,
    avatarUrl: `https://avatars.githubusercontent.com/u/0?u=${encodeURIComponent(email)}&v=4`,
  };
}

export async function fetchFreestyleRepoData(repoName: string, path = ""): Promise<FreestyleRepoData | null> {
  try {
    const repoId = await findFreestyleRepoId(repoName);
    if (!repoId) return null;

    const repo = freestyle.git.repos.ref({ repoId });

    const [defaultBranchResult, branchesResult, commitsResult, contentsResult, readmeResult] =
      await Promise.allSettled([
        repo.branches.getDefaultBranch(),
        repo.branches.list(),
        repo.commits.list({ limit: 10 }),
        repo.contents.get({ path }),
        path === "" ? repo.contents.get({ path: "README.md" }) : Promise.reject(new Error("skip")),
      ]);

    const defaultBranch =
      defaultBranchResult.status === "fulfilled"
        ? defaultBranchResult.value.defaultBranch
        : "main";

    const branches: GitBranch[] =
      branchesResult.status === "fulfilled"
        ? branchesResult.value.branches.map((b) => ({
            name: b.name,
            isDefault: b.name === defaultBranch,
            commitSha: (b.commit ?? "").substring(0, 7),
          }))
        : [];

    const commits: GitCommit[] =
      commitsResult.status === "fulfilled"
        ? commitsResult.value.commits.slice(0, 5).map((c) => ({
            sha: c.sha.substring(0, 7),
            message: c.message.split("\n")[0] ?? c.message,
            author: makeGitUser(c.author.name, c.author.email),
            committedAt: c.author.date,
          }))
        : [];

    let files: FreestyleRepoData["files"] = [];
    let fileContent: FileContent | undefined;
    if (contentsResult.status === "fulfilled") {
      const contents = contentsResult.value;
      if (contents.type === "dir") {
        const latestMessage = commits[0]?.message ?? "Synced from Freestyle Git";
        files = contents.entries.map((entry) => ({
          type: entry.type === "dir" ? "directory" : "file",
          name: entry.name,
          lastCommit: latestMessage,
          updatedAt: new Date().toISOString(),
        }));
      } else if (contents.type === "file") {
        const text = Buffer.from(contents.content, "base64").toString("utf8");
        fileContent = {
          path: contents.path,
          name: contents.name,
          size: contents.size,
          text,
        };
      }
    }

    const latestCommit = commits[0];
    const updatedAt = latestCommit?.committedAt ?? new Date().toISOString();

    let readme: { text: string } | undefined;
    if (readmeResult.status === "fulfilled" && readmeResult.value.type === "file") {
      readme = { text: Buffer.from(readmeResult.value.content, "base64").toString("utf8") };
    }

    return {
      repository: {
        defaultBranch,
        visibility: "Public",
        updatedAt,
      },
      branches,
      commits,
      files,
      fileContent,
      readme,
    };
  } catch {
    return null;
  }
}
