import { $ } from "bun";
import { freestyle } from "freestyle";
import { findFreestyleRepoId } from "./freestyle-git";

const DEFAULT_BRANCH = "main";
const DEFAULT_AUTHOR = {
	name: "Better GitHub Bot",
	email: "better-github@example.com",
};

type TrackedFile = {
	path: string;
	content: string;
};

export async function collectTrackedTextFiles(): Promise<TrackedFile[]> {
	const output = await $`git ls-files -z`.text();
	const paths = output.split("\0").filter(Boolean);

	const files = await Promise.all(
		paths.map(async (path) => ({
			path,
			content: await Bun.file(path).text(),
		})),
	);

	return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function ensureFreestyleRepoWithContent(
	repoName: string,
): Promise<{
	repoId: string;
	created: boolean;
	commitSha?: string;
	fileCount: number;
}> {
	const files = await collectTrackedTextFiles();
	const repoId = await findFreestyleRepoId(repoName);

	if (!repoId) {
		const created = await freestyle.git.repos.create({
			name: repoName,
			public: true,
			defaultBranch: DEFAULT_BRANCH,
			import: {
				type: "files",
				files: Object.fromEntries(
					files.map((file) => [file.path, file.content]),
				),
				commitMessage: "Import better-github workspace",
				authorName: DEFAULT_AUTHOR.name,
				authorEmail: DEFAULT_AUTHOR.email,
			},
		});

		return {
			repoId: created.repoId,
			created: true,
			fileCount: files.length,
		};
	}

	const repo = freestyle.git.repos.ref({ repoId });
	const result = await repo.commits.create({
		branch: DEFAULT_BRANCH,
		message: "Sync better-github workspace content",
		files,
		author: DEFAULT_AUTHOR,
	});

	return {
		repoId,
		created: false,
		commitSha: result.commit.sha,
		fileCount: files.length,
	};
}

if (import.meta.main) {
	const repoName = process.argv[2] ?? "better-github";
	const result = await ensureFreestyleRepoWithContent(repoName);
	const action = result.created ? "created" : "updated";
	const commit = result.commitSha
		? ` at ${result.commitSha.substring(0, 7)}`
		: "";

	console.log(
		`Freestyle repo ${action}: ${result.repoId}${commit} (${result.fileCount} files)`,
	);
}
