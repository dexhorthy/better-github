import { BookOpen } from "lucide-react";

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
