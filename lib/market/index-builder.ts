import type { CustomIndex, Quote, SeriesPoint } from "@/lib/market/types";

export function buildIndexSeries(
  customIndex: CustomIndex,
  seriesByInstrument: Record<string, SeriesPoint[]>
): SeriesPoint[] {
  const memberSeries = customIndex.members
    .map((member) => ({
      ...member,
      series: seriesByInstrument[member.instrumentId] ?? []
    }))
    .filter((member) => member.series.length > 0);

  if (!memberSeries.length) {
    return [];
  }

  const shortestLength = Math.min(...memberSeries.map((member) => member.series.length));
  const totalWeight = memberSeries.reduce((sum, member) => sum + member.weight, 0) || 1;

  return Array.from({ length: shortestLength }, (_, index) => {
    const value = memberSeries.reduce((sum, member) => {
      const start = member.series[member.series.length - shortestLength].value;
      const point = member.series[member.series.length - shortestLength + index];
      return sum + (point.value / start) * customIndex.baseValue * (member.weight / totalWeight);
    }, 0);

    return {
      time: memberSeries[0].series[memberSeries[0].series.length - shortestLength + index].time,
      value: Number(value.toFixed(2))
    };
  });
}

export function buildIndexQuote(
  customIndex: CustomIndex,
  series: SeriesPoint[],
  source: Quote["source"] = "finnhub"
): Quote {
  const last = series.at(-1)?.value ?? customIndex.baseValue;
  const previous = series.at(-12)?.value ?? last;
  const values = series.map((point) => point.value);
  const change = last - previous;

  return {
    instrumentId: customIndex.id,
    price: last,
    previousClose: previous,
    change,
    changePercent: previous === 0 ? 0 : (change / previous) * 100,
    dayHigh: values.length ? Math.max(...values) : last,
    dayLow: values.length ? Math.min(...values) : last,
    timestamp: new Date().toISOString(),
    source,
    realtime: false
  };
}
