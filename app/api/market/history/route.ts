import { NextResponse, type NextRequest } from "next/server";
import { getMarketHistory } from "@/lib/market/providers";

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams
    .get("symbols")
    ?.split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);

  if (!symbols?.length) {
    return NextResponse.json({ histories: [] });
  }

  const histories = await getMarketHistory(symbols);
  return NextResponse.json({ histories });
}
