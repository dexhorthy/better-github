import {
	branches,
	commits,
	getFixtureFilesForPath,
	pullRequests,
	type repositories,
} from "./data";
import type { FreestyleRepoData } from "./freestyle-git";
import type { RepositoryOverview } from "./types";

export function buildRepositoryOverview(
	fixture: (typeof repositories)[number],
	path: string,
	liveData: FreestyleRepoData | null,
): RepositoryOverview {
	return {
		repository: liveData
			? {
					...fixture,
					defaultBranch: liveData.repository.defaultBranch,
					visibility: liveData.repository.visibility,
					updatedAt: liveData.repository.updatedAt,
				}
			: fixture,
		branches: liveData?.branches.length ? liveData.branches : branches,
		commits: liveData?.commits.length ? liveData.commits : commits,
		pullRequests,
		path,
		files: liveData?.fileContent
			? []
			: liveData?.files.length
				? liveData.files
				: getFixtureFilesForPath(path),
		fileContent: liveData?.fileContent,
		readme: liveData?.readme,
	};
}
