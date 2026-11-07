export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins.toString().padStart(2, "0")}m`;
}

export function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export function formatTimeOnly(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export function formatSliderLabel(departureIso: string, hourOffset: number): string {
  try {
    const dep = new Date(departureIso);
    const target = new Date(dep.getTime() + hourOffset * 3600 * 1000);
    const timeStr = target.toLocaleTimeString(undefined, {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    return `+${hourOffset} h · ${timeStr}`;
  } catch {
    return `+${hourOffset} h`;
  }
}
