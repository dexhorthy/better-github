const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(value: string) {
	const diff = new Date(value).getTime() - Date.now();
	const minutes = Math.round(diff / 60000);
	if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");
	const hours = Math.round(minutes / 60);
	if (Math.abs(hours) < 24) return relativeTime.format(hours, "hour");
	return relativeTime.format(Math.round(hours / 24), "day");
}
