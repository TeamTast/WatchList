import type { Instrument } from "@/lib/market/types";

export type FinnhubStatus = "disabled" | "connecting" | "live" | "error" | "closed";

export interface FinnhubTrade {
  instrumentId: string;
  symbol: string;
  price: number;
  volume?: number;
  timestamp: number;
}

interface FinnhubTradeMessage {
  type?: string;
  data?: Array<{
    s: string;
    p: number;
    t: number;
    v?: number;
  }>;
}

const explicitFinnhubSymbols: Record<string, string> = {
  aapl: "AAPL",
  nvda: "NVDA",
  msft: "MSFT",
  tsla: "TSLA",
  "7203": "7203.T",
  "9984": "9984.T",
  "6758": "6758.T",
  "8306": "8306.T",
  usdjpy: "OANDA:USD_JPY",
  eurusd: "OANDA:EUR_USD",
  gbpjpy: "OANDA:GBP_JPY",
  audjpy: "OANDA:AUD_JPY"
};

export function toFinnhubSymbol(providerSymbol: string) {
  if (providerSymbol.endsWith(".US")) {
    return providerSymbol.replace(".US", "");
  }

  if (providerSymbol.endsWith(".TSE")) {
    return providerSymbol.replace(".TSE", ".T");
  }

  if (providerSymbol.endsWith(".FOREX")) {
    const pair = providerSymbol.replace(".FOREX", "");
    return `OANDA:${pair.slice(0, 3)}_${pair.slice(3)}`;
  }

  return providerSymbol;
}

export function getFinnhubSymbol(instrument: Instrument) {
  return explicitFinnhubSymbols[instrument.id] ?? toFinnhubSymbol(instrument.providerSymbol);
}

export function connectFinnhubTradeStream({
  token,
  instruments,
  onTrade,
  onStatus
}: {
  token: string;
  instruments: Instrument[];
  onTrade: (trade: FinnhubTrade) => void;
  onStatus: (status: FinnhubStatus) => void;
}) {
  const symbols = instruments
    .map((instrument) => ({
      instrumentId: instrument.id,
      symbol: getFinnhubSymbol(instrument)
    }))
    .filter((item) => Boolean(item.symbol));

  if (!token || !symbols.length) {
    onStatus("disabled");
    return () => undefined;
  }

  const symbolToInstrumentId = new Map(symbols.map((item) => [item.symbol, item.instrumentId]));
  const socket = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(token)}`);

  onStatus("connecting");

  socket.addEventListener("open", () => {
    onStatus("live");
    symbols.forEach(({ symbol }) => {
      socket.send(JSON.stringify({ type: "subscribe", symbol }));
    });
  });

  socket.addEventListener("message", (event) => {
    let message: FinnhubTradeMessage;

    try {
      message = JSON.parse(String(event.data)) as FinnhubTradeMessage;
    } catch {
      return;
    }

    if (message.type !== "trade" || !message.data) {
      return;
    }

    message.data.forEach((item) => {
      const instrumentId = symbolToInstrumentId.get(item.s);

      if (!instrumentId || !Number.isFinite(item.p)) {
        return;
      }

      onTrade({
        instrumentId,
        symbol: item.s,
        price: item.p,
        volume: item.v,
        timestamp: item.t
      });
    });
  });

  socket.addEventListener("error", () => onStatus("error"));
  socket.addEventListener("close", () => onStatus("closed"));

  return () => {
    if (socket.readyState === WebSocket.OPEN) {
      symbols.forEach(({ symbol }) => {
        socket.send(JSON.stringify({ type: "unsubscribe", symbol }));
      });
    }

    socket.close();
  };
}
