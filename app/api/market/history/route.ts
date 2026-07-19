import { NextResponse, type NextRequest } from "next/server";
import { getMarketHistory, type MarketHistoryRange } from "@/lib/market/providers";
import { withSharedMarketCache } from "@/lib/market/server-cache";
import { parseMarketSymbolQuery } from "@/lib/market/symbol-query";

const HISTORY_TTL_MS = 15 * 60_000;
const HISTORY_CACHE_VERSION = "v2";

export async function GET(request: NextRequest) {
  const parsedSymbols = parseMarketSymbolQuery(request.nextUrl.searchParams.get("symbols"));
  const requestedRange = request.nextUrl.searchParams.get("range") ?? "1d";

  if (!parsedSymbols.ok) {
    return NextResponse.json({ error: parsedSymbols.error }, { status: 400 });
  }

  if (requestedRange !== "1d" && requestedRange !== "5d" && requestedRange !== "6mo") {
    return NextResponse.json({ error: "Unsupported history range." }, { status: 400 });
  }

  const { symbols } = parsedSymbols;
  const range: MarketHistoryRange = requestedRange;

  if (!symbols.length) {
    return NextResponse.json({ histories: [], fetchedAt: null });
  }

  const history = await withSharedMarketCache(
    `history:${HISTORY_CACHE_VERSION}:${process.env.MARKET_DATA_PROVIDER ?? "mock"}:${range}:${symbols.join(",")}`,
    HISTORY_TTL_MS,
    async () => ({
      histories: await getMarketHistory(symbols, range),
      fetchedAt: new Date().toISOString()
    })
  );

  return NextResponse.json(
    history,
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600"
      }
    }
  );
}
