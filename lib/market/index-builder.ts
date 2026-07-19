import type { CustomIndex, MarketCandle, Quote, SeriesPoint } from "@/lib/market/types";

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

export function buildIndexCandles(
  customIndex: CustomIndex,
  candlesByInstrument: Record<string, MarketCandle[]>
): MarketCandle[] {
  const members = customIndex.members
    .map((member) => ({
      ...member,
      candles: candlesByInstrument[member.instrumentId] ?? []
    }))
    .filter((member) => member.candles.length > 0);

  if (!members.length) {
    return [];
  }

  const candlesByTime = members.map((member) => new Map(member.candles.map((candle) => [candle.time, candle])));
  const commonTimes = members[0].candles
    .map((candle) => candle.time)
    .filter((time) => candlesByTime.every((candles) => candles.has(time)));

  if (!commonTimes.length) {
    return [];
  }

  const totalWeight = members.reduce((sum, member) => sum + member.weight, 0) || 1;
  const startingCloseByMember = members.map((_, index) => candlesByTime[index].get(commonTimes[0])!.close);

  return commonTimes.map((time) => {
    const combined = members.reduce(
      (result, member, index) => {
        const candle = candlesByTime[index].get(time)!;
        const factor = customIndex.baseValue * (member.weight / totalWeight) / startingCloseByMember[index];

        result.open += candle.open * factor;
        result.high += candle.high * factor;
        result.low += candle.low * factor;
        result.close += candle.close * factor;
        return result;
      },
      { open: 0, high: 0, low: 0, close: 0 }
    );

    return {
      time,
      open: Number(combined.open.toFixed(2)),
      high: Number(combined.high.toFixed(2)),
      low: Number(combined.low.toFixed(2)),
      close: Number(combined.close.toFixed(2))
    };
  });
}
