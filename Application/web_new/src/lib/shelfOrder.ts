/**
 * Reading order for products on a shelf photo: top-left to bottom-right.
 *
 * This is a stand-in for real shelf detection. The planned version segments the
 * physical shelves and renders one strip per shelf; until then we infer rows
 * from the boxes themselves. Deliberately free of React and of any app types so
 * it can be unit tested and reused by the mobile app — keep it that way, and
 * keep it easy to delete when real shelf detection lands.
 */

/** Normalized [ymin, xmin, ymax, xmax], each 0-1, as the backend emits them. */
export type BBox = [number, number, number, number];

export interface ShelfItem {
  id: number;
  bbox: BBox;
}

export interface ShelfPosition {
  /** 1-based reading position across the whole photo. */
  num: number;
  /** 1-based row, counting from the top. */
  row: number;
  /** 1-based position within that row, counting from the left. */
  col: number;
}

export interface ShelfOrderResult {
  /** Item ids, in reading order. */
  order: number[];
  info: Record<number, ShelfPosition>;
  /** Mean vertical centre of each row, top to bottom. Its length is the row count. */
  rowMeans: number[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function centreY(bbox: BBox): number {
  return (bbox[0] + bbox[2]) / 2;
}

/**
 * Group boxes into rows, then order each row left to right.
 *
 * Rows are grown greedily down the photo: a box joins the current row while its
 * vertical centre is within half a median box-height of that row's running mean,
 * and starts a new row otherwise. Half the MEDIAN height (rather than each box's
 * own height) is what makes a row survive mixed product sizes — a tall cereal box
 * next to a short can still reads as one row.
 */
export function shelfOrder(items: ShelfItem[]): ShelfOrderResult {
  if (items.length === 0) return { order: [], info: {}, rowMeans: [] };

  const metrics = items.map((it) => ({
    id: it.id,
    cy: centreY(it.bbox),
    cx: (it.bbox[1] + it.bbox[3]) / 2,
    h: Math.abs(it.bbox[2] - it.bbox[0]),
  }));

  // Degenerate input (zero-height boxes) would make the threshold 0, which no
  // difference is strictly less than — every box would become its own row. The
  // epsilon keeps boxes that share a centre together.
  const med = median(metrics.map((m) => m.h));
  const threshold = med > 0 ? med * 0.5 : 1e-9;

  const rows: { mean: number; sum: number; members: typeof metrics }[] = [];
  for (const m of [...metrics].sort((a, b) => a.cy - b.cy)) {
    const current = rows[rows.length - 1];
    if (current && Math.abs(m.cy - current.mean) < threshold) {
      current.members.push(m);
      current.sum += m.cy;
      current.mean = current.sum / current.members.length;
    } else {
      rows.push({ mean: m.cy, sum: m.cy, members: [m] });
    }
  }

  const order: number[] = [];
  const info: Record<number, ShelfPosition> = {};
  let num = 0;
  rows.forEach((row, rowIdx) => {
    [...row.members]
      .sort((a, b) => a.cx - b.cx)
      .forEach((m, colIdx) => {
        num += 1;
        order.push(m.id);
        info[m.id] = { num, row: rowIdx + 1, col: colIdx + 1 };
      });
  });

  return { order, info, rowMeans: rows.map((r) => r.mean) };
}

/**
 * The 1-based row a box falls in, by nearest row mean.
 *
 * For extra facings of a product, which aren't part of the row-building pass —
 * the same sauce two shelves down still needs a row to name.
 */
export function rowOf(rowMeans: number[], bbox: BBox): number {
  if (rowMeans.length === 0) return 1;
  const cy = centreY(bbox);
  let best = 0;
  for (let i = 1; i < rowMeans.length; i += 1) {
    if (Math.abs(rowMeans[i] - cy) < Math.abs(rowMeans[best] - cy)) best = i;
  }
  return best + 1;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const lastTwo = Math.abs(n) % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (Math.abs(n) % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
