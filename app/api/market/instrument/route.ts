import { NextResponse, type NextRequest } from "next/server";
import { getInstrumentName, searchInstrumentsByName } from "@/lib/market/providers";

const japaneseProviderSymbolPattern = /^(?:\d{4}|\d{3}[A-Z])\.TSE$/;

export async function GET(request: NextRequest) {
  const providerSymbol = request.nextUrl.searchParams.get("providerSymbol")?.trim().toUpperCase() ?? "";
  const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";

  if (query) {
    if (query.length > 80) {
      return NextResponse.json({ instruments: [] }, { status: 400 });
    }

    const instruments = await searchInstrumentsByName(query);
    return NextResponse.json(
      { instruments },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400"
        }
      }
    );
  }

  if (!japaneseProviderSymbolPattern.test(providerSymbol)) {
    return NextResponse.json({ name: null }, { status: 400 });
  }

  const name = await getInstrumentName(providerSymbol);
  return NextResponse.json(
    { name },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800"
      }
    }
  );
}
