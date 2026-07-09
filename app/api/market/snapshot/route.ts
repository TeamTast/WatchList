import { NextResponse, type NextRequest } from "next/server";
import { getMarketSnapshots } from "@/lib/market/providers";

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams
    .get("symbols")
    ?.split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);

  if (!symbols?.length) {
    return NextResponse.json({ quotes: [] });
  }

  const quotes = await getMarketSnapshots(symbols);
  return NextResponse.json({ quotes });
}
