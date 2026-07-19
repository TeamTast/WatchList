import assert from "node:assert/strict";
import test from "node:test";
import { buildIndexCandles } from "../lib/market/index-builder.ts";
import type { CustomIndex, MarketCandle } from "../lib/market/types.ts";

const customIndex: CustomIndex = {
  id: "test-index",
  name: "Test index",
  baseValue: 100,
  weighting: "equal",
  members: [
    { instrumentId: "a", weight: 1 },
    { instrumentId: "b", weight: 1 }
  ]
};

const candlesByInstrument: Record<string, MarketCandle[]> = {
  a: [
    { time: 1, open: 8, high: 10, low: 7, close: 9 },
    { time: 2, open: 9, high: 11, low: 8, close: 10 },
    { time: 3, open: 11, high: 13, low: 10, close: 12 }
  ],
  b: [
    { time: 2, open: 19, high: 21, low: 18, close: 20 },
    { time: 3, open: 18, high: 22, low: 17, close: 21 }
  ]
};

test("builds weighted candles only for common trading dates", () => {
  assert.deepEqual(buildIndexCandles(customIndex, candlesByInstrument), [
    { time: 2, open: 92.5, high: 107.5, low: 85, close: 100 },
    { time: 3, open: 100, high: 120, low: 92.5, close: 112.5 }
  ]);
});
