import { $ } from "bun";
import { freestyle } from "freestyle";
import { findFreestyleRepoId } from "./freestyle-git";
import { triggerPushWebhook } from "./trigger-webhook";

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

	const results = await Promise.all(
		paths.map(async (path) => {
			const file = Bun.file(path);
			if (!(await file.exists())) return null;
			return { path, content: await file.text() };
		}),
	);

	return results
		.filter((f): f is TrackedFile => f !== null)
		.sort((a, b) => a.path.localeCompare(b.path));
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

	if (result.commitSha && process.env.WEBHOOK_TRIGGER !== "0") {
		const owner = process.env.WEBHOOK_OWNER ?? "dexhorthy";
		const branch = process.env.WEBHOOK_BRANCH ?? DEFAULT_BRANCH;
		try {
			const webhook = await triggerPushWebhook({
				owner,
				repo: repoName,
				branch,
				commitSha: result.commitSha,
			});
			console.log(
				`Push webhook → ${webhook.status}${webhook.body ? `: ${webhook.body}` : ""}`,
			);
		} catch (err) {
			console.warn(
				`Push webhook failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}
}
