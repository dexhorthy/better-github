export type GitUser = {
  login: string;
  name: string;
  avatarUrl: string;
};

export type GitRepository = {
  id: string;
  owner: string;
  name: string;
  description: string;
  visibility: "Public" | "Private";
  defaultBranch: string;
  stars: number;
  forks: number;
  watchers: number;
  language: string;
  license: string;
  updatedAt: string;
  topics: string[];
};

export type GitBranch = {
  name: string;
  isDefault: boolean;
  commitSha: string;
};

export type GitCommit = {
  sha: string;
  message: string;
  author: GitUser;
  committedAt: string;
};

export type GitPullRequest = {
  id: number;
  title: string;
  author: string;
  status: "open" | "draft" | "merged" | "closed";
  comments: number;
  updatedAt: string;
};

export type RepositoryOverview = {
  repository: GitRepository;
  branches: GitBranch[];
  commits: GitCommit[];
  pullRequests: GitPullRequest[];
  path: string;
  files: readonly {
    type: "directory" | "file";
    name: string;
    lastCommit: string;
    updatedAt: string;
  }[];
};
