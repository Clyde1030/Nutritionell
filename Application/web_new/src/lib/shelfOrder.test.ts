import { describe, expect, it } from 'vitest';
import { ordinal, rowOf, shelfOrder, type ShelfItem } from './shelfOrder';

/** Boxes are [ymin, xmin, ymax, xmax]. */
const box = (ymin: number, xmin: number, ymax: number, xmax: number): ShelfItem['bbox'] =>
  [ymin, xmin, ymax, xmax];

describe('shelfOrder', () => {
  it('numbers three clean rows top-left to bottom-right', () => {
    // 3 rows of 3, every box the same size, fed in deliberately scrambled order
    // so the result can only come from the sorting, not from the input order.
    const items: ShelfItem[] = [
      { id: 8, bbox: box(0.75, 0.40, 0.95, 0.60) },
      { id: 2, bbox: box(0.05, 0.40, 0.25, 0.60) },
      { id: 6, bbox: box(0.40, 0.70, 0.60, 0.90) },
      { id: 1, bbox: box(0.05, 0.05, 0.25, 0.25) },
      { id: 9, bbox: box(0.75, 0.70, 0.95, 0.90) },
      { id: 4, bbox: box(0.40, 0.05, 0.60, 0.25) },
      { id: 3, bbox: box(0.05, 0.70, 0.25, 0.90) },
      { id: 7, bbox: box(0.75, 0.05, 0.95, 0.25) },
      { id: 5, bbox: box(0.40, 0.40, 0.60, 0.60) },
    ];

    const { order, info, rowMeans } = shelfOrder(items);

    expect(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rowMeans).toHaveLength(3);
    expect(info[1]).toEqual({ num: 1, row: 1, col: 1 });
    expect(info[5]).toEqual({ num: 5, row: 2, col: 2 });
    expect(info[9]).toEqual({ num: 9, row: 3, col: 3 });
  });

  it('keeps a row together when the products have very different heights', () => {
    // A tall cereal box beside two short cans. Their vertical centres differ,
    // but by less than half the median height, so this is one row — this is the
    // case that a naive "same ymin" grouping gets wrong.
    const items: ShelfItem[] = [
      { id: 1, bbox: box(0.10, 0.05, 0.50, 0.25) },  // tall,  h 0.40, cy 0.30
      { id: 2, bbox: box(0.25, 0.30, 0.45, 0.50) },  // short, h 0.20, cy 0.35
      { id: 3, bbox: box(0.26, 0.55, 0.46, 0.75) },  // short, h 0.20, cy 0.36
    ];

    const { order, info, rowMeans } = shelfOrder(items);

    expect(rowMeans).toHaveLength(1);
    expect(order).toEqual([1, 2, 3]);
    expect(info[1].row).toBe(1);
    expect(info[2].row).toBe(1);
    expect(info[3].row).toBe(1);
    expect(info[3].col).toBe(3);
  });

  it('handles a single product', () => {
    const { order, info, rowMeans } = shelfOrder([{ id: 42, bbox: box(0.3, 0.3, 0.5, 0.5) }]);

    expect(order).toEqual([42]);
    expect(info[42]).toEqual({ num: 1, row: 1, col: 1 });
    expect(rowMeans).toEqual([0.4]);
  });

  it('handles no products at all', () => {
    expect(shelfOrder([])).toEqual({ order: [], info: {}, rowMeans: [] });
  });

  it('gives every facing of one product the same number', () => {
    // Only unique products are numbered; a duplicate facing shows its product's
    // number, and finds its own row through rowOf. Here product 1 has a second
    // facing two rows down.
    const items: ShelfItem[] = [
      { id: 1, bbox: box(0.05, 0.05, 0.25, 0.25) },
      { id: 2, bbox: box(0.05, 0.40, 0.25, 0.60) },
      { id: 3, bbox: box(0.70, 0.05, 0.90, 0.25) },
    ];
    const duplicateOfProduct1 = box(0.70, 0.40, 0.90, 0.60);

    const { info, rowMeans } = shelfOrder(items);

    expect(rowMeans).toHaveLength(2);
    // Both facings of product 1 are labelled "#1"...
    expect(info[1].num).toBe(1);
    // ...but the duplicate sits on row 2, where its own box is.
    expect(info[1].row).toBe(1);
    expect(rowOf(rowMeans, duplicateOfProduct1)).toBe(2);
    // And the duplicate never takes a number of its own: 3 products, 3 numbers.
    expect(Object.keys(info)).toHaveLength(3);
  });
});

describe('rowOf', () => {
  it('picks the nearest row mean', () => {
    const rowMeans = [0.15, 0.5, 0.85];
    expect(rowOf(rowMeans, box(0.05, 0, 0.25, 1))).toBe(1);
    expect(rowOf(rowMeans, box(0.44, 0, 0.60, 1))).toBe(2);
    expect(rowOf(rowMeans, box(0.80, 0, 0.98, 1))).toBe(3);
  });

  it('falls back to row 1 when there are no rows', () => {
    expect(rowOf([], box(0.1, 0, 0.2, 1))).toBe(1);
  });
});

describe('ordinal', () => {
  it('suffixes correctly, including the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th',
      '21st', '22nd', '23rd', '101st', '111th',
    ]);
  });
});
