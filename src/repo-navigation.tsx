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
