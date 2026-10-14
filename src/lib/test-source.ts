/**
 * Test helper for source-reading guard tests ("this function must not call X").
 *
 * Returns the text from `start` up to (not including) `end`. Throws with both marker names
 * when either marker is missing or `end` comes before `start`, so a renamed or moved
 * neighbor fails loudly instead of silently widening the slice (a missing end marker used
 * to make `indexOf` return -1 and the slice ran to the end of the file).
 */
export function sourceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  if (from < 0) throw new Error(`sourceBetween: start marker not found: ${JSON.stringify(start)}`);
  const to = source.indexOf(end, from + start.length);
  if (to < 0) {
    throw new Error(
      `sourceBetween: end marker not found after ${JSON.stringify(start)}: ${JSON.stringify(end)}`,
    );
  }
  return source.slice(from, to);
}
