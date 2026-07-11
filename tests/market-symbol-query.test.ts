import assert from "node:assert/strict";
import test from "node:test";
import { parseMarketSymbolQuery } from "../lib/market/symbol-query.ts";

test("normalizes, deduplicates, and sorts provider symbols", () => {
  assert.deepEqual(parseMarketSymbolQuery(" msft.us, AAPL.US,msft.us,^n225, oanda:usd_jpy "), {
    ok: true,
    symbols: ["AAPL.US", "MSFT.US", "OANDA:USD_JPY", "^N225"]
  });
});

test("treats missing and empty entries as an empty query", () => {
  assert.deepEqual(parseMarketSymbolQuery(null), { ok: true, symbols: [] });
  assert.deepEqual(parseMarketSymbolQuery(" , , "), { ok: true, symbols: [] });
});

test("accepts every supported provider-symbol character", () => {
  assert.deepEqual(parseMarketSymbolQuery("abc.12^x=y_z:w-q"), {
    ok: true,
    symbols: ["ABC.12^X=Y_Z:W-Q"]
  });
});

test("rejects invalid characters", () => {
  const result = parseMarketSymbolQuery("AAPL.US,USD/JPY");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /position 2 contains invalid characters/);
  }
});

test("rejects provider symbols longer than 32 characters", () => {
  const result = parseMarketSymbolQuery("A".repeat(33));

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /at most 32 characters/);
  }
});

test("rejects more than 50 unique symbols without rejecting duplicates", () => {
  const fiftySymbols = Array.from({ length: 50 }, (_, index) => `SYM${index}`);

  assert.equal(parseMarketSymbolQuery([...fiftySymbols, "SYM0"].join(",")).ok, true);

  const result = parseMarketSymbolQuery([...fiftySymbols, "SYM50"].join(","));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /maximum of 50 unique provider symbols/);
  }
});
