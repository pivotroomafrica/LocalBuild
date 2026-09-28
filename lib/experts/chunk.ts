/**
 * "Meet Our Experts" homepage marquee -- pure data-shaping, no rendering
 * or animation concerns (kept separate per the section's own DATA /
 * PRESENTATION / ANIMATION split). A row holds at most EXPERTS_PER_ROW
 * experts; the number of rows grows automatically with the expert count
 * -- callers must never hand-write row1/row2/row3, only call chunkExperts().
 */
export const EXPERTS_PER_ROW = 10;

export function chunkExperts<T>(experts: T[], perRow: number = EXPERTS_PER_ROW): T[][] {
  if (experts.length === 0) return [];
  const rows: T[][] = [];
  for (let i = 0; i < experts.length; i += perRow) {
    rows.push(experts.slice(i, i + perRow));
  }
  return rows;
}

export type MarqueeDirection = "left" | "right";

/** Row 0 moves right, row 1 moves left, row 2 moves right, ... */
export function directionForRow(rowIndex: number): MarqueeDirection {
  return rowIndex % 2 === 0 ? "right" : "left";
}
