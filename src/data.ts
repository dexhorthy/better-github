import type {
	GitBranch,
	GitCommit,
	GitPullRequest,
	GitRepository,
	GitUser,
} from "./types";

export const currentUser: GitUser = {
	login: "octocat",
	name: "The Octocat",
	avatarUrl:
		"https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
};

export const repositories: GitRepository[] = [
	{
		id: "better-github",
		owner: "dexhorthy",
		name: "better-github",
		description:
			"A focused clone of GitHub's repository experience for agent-built software.",
		visibility: "Public",
		defaultBranch: "main",
		stars: 128,
		forks: 14,
		watchers: 9,
		language: "TypeScript",
		license: "MIT",
		updatedAt: "2026-04-29T13:10:00.000Z",
		topics: ["github-clone", "vite", "hono", "freestyle-git"],
	},
	{
		id: "hello-world",
		owner: "dexhorthy",
		name: "hello-world",
		description:
			"A minimal example application demonstrating Freestyle Git hosting.",
		visibility: "Public",
		defaultBranch: "main",
		stars: 5,
		forks: 2,
		watchers: 1,
		language: "TypeScript",
		license: "MIT",
		updatedAt: "2026-04-28T10:00:00.000Z",
		topics: ["example", "freestyle-git"],
	},
];

export const branches: GitBranch[] = [
	{ name: "main", isDefault: true, commitSha: "9f7a61c" },
	{ name: "feature/repo-home", isDefault: false, commitSha: "7ac2e30" },
	{ name: "design/repository-shell", isDefault: false, commitSha: "4ab138d" },
];

export const commits: GitCommit[] = [
	{
		sha: "9f7a61c",
		message: "Build repository overview shell",
		author: currentUser,
		committedAt: "2026-04-29T13:06:00.000Z",
	},
	{
		sha: "7ac2e30",
		message: "Add mocked branch and pull request data",
		author: {
			login: "hubot",
			name: "Hubot",
			avatarUrl: "https://avatars.githubusercontent.com/u/7649605?v=4",
		},
		committedAt: "2026-04-29T12:44:00.000Z",
	},
	{
		sha: "4ab138d",
		message: "Create first pass navigation layout",
		author: currentUser,
		committedAt: "2026-04-29T12:15:00.000Z",
	},
];

export const pullRequests: GitPullRequest[] = [
	{
		id: 42,
		title: "Render repository code tab",
		author: "octocat",
		status: "open",
		comments: 6,
		updatedAt: "2026-04-29T12:51:00.000Z",
	},
	{
		id: 41,
		title: "Wire Freestyle Git repository metadata",
		author: "hubot",
		status: "draft",
		comments: 2,
		updatedAt: "2026-04-29T11:27:00.000Z",
	},
];

export const fileTree = [
	{
		type: "directory",
		name: ".github",
		lastCommit: "Add workflow placeholders",
		updatedAt: "2026-04-28T18:20:00.000Z",
	},
	{
		type: "directory",
		name: "src",
		lastCommit: "Build repository overview shell",
		updatedAt: "2026-04-29T13:06:00.000Z",
	},
	{
		type: "file",
		name: "README.md",
		lastCommit: "Document local setup",
		updatedAt: "2026-04-29T12:58:00.000Z",
	},
	{
		type: "file",
		name: "package.json",
		lastCommit: "Install Vite and Hono",
		updatedAt: "2026-04-29T12:49:00.000Z",
	},
	{
		type: "file",
		name: "PROGRESS_AND_NEXT_STEPS.md",
		lastCommit: "Track current implementation priorities",
		updatedAt: "2026-04-29T13:08:00.000Z",
	},
] as const;

export const fileTreeByPath = {
	"": fileTree,
	src: [
		{
			type: "file",
			name: "App.tsx",
			lastCommit: "Build repository overview shell",
			updatedAt: "2026-04-29T13:06:00.000Z",
		},
		{
			type: "file",
			name: "data.ts",
			lastCommit: "Add mocked repository data",
			updatedAt: "2026-04-29T12:44:00.000Z",
		},
		{
			type: "file",
			name: "freestyle-git.ts",
			lastCommit: "Wire Freestyle Git repository metadata",
			updatedAt: "2026-04-29T13:54:00.000Z",
		},
		{
			type: "file",
			name: "main.tsx",
			lastCommit: "Create Vite React entrypoint",
			updatedAt: "2026-04-29T12:20:00.000Z",
		},
		{
			type: "file",
			name: "server.ts",
			lastCommit: "Add Hono repository API",
			updatedAt: "2026-04-29T13:06:00.000Z",
		},
		{
			type: "file",
			name: "styles.css",
			lastCommit: "Build repository overview shell",
			updatedAt: "2026-04-29T13:06:00.000Z",
		},
	],
} as const;

export function getFixtureFilesForPath(path: string) {
	return fileTreeByPath[path as keyof typeof fileTreeByPath] ?? [];
}
