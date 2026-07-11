import { NextResponse, type NextRequest } from "next/server";
import { getMarketHistory } from "@/lib/market/providers";
import { withSharedMarketCache } from "@/lib/market/server-cache";

const HISTORY_TTL_MS = 15 * 60_000;

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams
    .get("symbols")
    ?.split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean)
    .filter((symbol, index, all) => all.indexOf(symbol) === index)
    .sort()
    .slice(0, 50);

  if (!symbols?.length) {
    return NextResponse.json({ histories: [], fetchedAt: null });
  }

  const history = await withSharedMarketCache(
    `history:${process.env.MARKET_DATA_PROVIDER ?? "mock"}:${symbols.join(",")}`,
    HISTORY_TTL_MS,
    async () => ({
      histories: await getMarketHistory(symbols),
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
