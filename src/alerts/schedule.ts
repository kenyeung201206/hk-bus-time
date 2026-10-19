/**
 * Reminder minute marks: start, start-step, start-2·step … down to 1.
 * e.g. (10, 3) → [10, 7, 4, 1];  (15, 5) → [15, 10, 5, 1];  (6, 2) → [6, 4, 2, 1]
 */
export function reminderMarks(start: number, step: number): number[] {
  const s = Math.max(1, Math.floor(start));
  const st = Math.max(1, Math.floor(step));
  const marks: number[] = [];
  for (let m = s; m >= 1; m -= st) marks.push(m);
  if (marks[marks.length - 1] !== 1) marks.push(1);
  return marks;
}

/**
 * Given the marks still waiting and the bus's current minutes away, decide whether to
 * speak now. Speaks once even if several marks were crossed between two checks (it says
 * the real minutes), then drops every mark ≥ the current minutes.
 */
export function nextAnnouncement(pending: number[], minutes: number): { speak: number | null; pending: number[] } {
  const crossed = pending.filter((m) => minutes <= m);
  if (!crossed.length) return { speak: null, pending };
  return { speak: Math.max(minutes, 1), pending: pending.filter((m) => m < minutes) };
}
