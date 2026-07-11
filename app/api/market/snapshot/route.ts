import { NextResponse, type NextRequest } from "next/server";
import { getMarketSnapshots } from "@/lib/market/providers";
import { withSharedMarketCache } from "@/lib/market/server-cache";

const SNAPSHOT_TTL_MS = 60_000;

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
    return NextResponse.json({ quotes: [], fetchedAt: null });
  }

  const snapshot = await withSharedMarketCache(
    `snapshot:${process.env.MARKET_DATA_PROVIDER ?? "mock"}:${symbols.join(",")}`,
    SNAPSHOT_TTL_MS,
    async () => ({
      quotes: await getMarketSnapshots(symbols),
      fetchedAt: new Date().toISOString()
    })
  );

  return NextResponse.json(
    snapshot,
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
      }
    }
  );
}
