"use client";

import { useEffect, useId, useMemo, useRef } from "react";

import styles from "./market-field.module.css";

export type MarketFieldItem = {
  label: string;
  change: number;
};

export type MarketFieldProps = {
  items: MarketFieldItem[];
  theme?: "dark" | "light";
  className?: string;
};

type FieldItem = MarketFieldItem & {
  index: number;
  seed: number;
};

type FieldPalette = {
  axis: string;
  grid: string;
  neutral: string;
  positive: string;
  negative: string;
  tracer: string;
};

const palettes: Record<"dark" | "light", FieldPalette> = {
  dark: {
    axis: "rgba(183, 191, 188, 0.18)",
    grid: "rgba(183, 191, 188, 0.11)",
    neutral: "rgba(183, 191, 188, 0.38)",
    positive: "rgba(114, 217, 189, 0.64)",
    negative: "rgba(255, 90, 60, 0.62)",
    tracer: "rgba(238, 241, 239, 0.88)"
  },
  light: {
    axis: "rgba(16, 20, 21, 0.18)",
    grid: "rgba(16, 20, 21, 0.1)",
    neutral: "rgba(16, 20, 21, 0.42)",
    positive: "rgba(21, 111, 91, 0.66)",
    negative: "rgba(185, 54, 31, 0.68)",
    tracer: "rgba(16, 20, 21, 0.86)"
  }
};

const changeFormatter = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "always"
});

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hashLabel(label: string) {
  let hash = 2166136261;

  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function formatChange(change: number) {
  return `${changeFormatter.format(change)}%`;
}

function summarize(items: FieldItem[]) {
  if (!items.length) {
    return "市場ベクトルフィールド。表示できる騰落率データはありません。";
  }

  const rising = items.filter((item) => item.change > 0).length;
  const falling = items.filter((item) => item.change < 0).length;
  const unchanged = items.length - rising - falling;
  const details = items
    .slice(0, 8)
    .map((item) => `${item.label} ${formatChange(item.change)}`)
    .join("、");
  const remainder = items.length > 8 ? `、ほか${items.length - 8}銘柄` : "";

  return `市場ベクトルフィールド。${items.length}銘柄中、上昇${rising}、下落${falling}、変わらず${unchanged}。${details}${remainder}。`;
}

export function MarketField({ items, theme = "dark", className }: MarketFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const summaryId = useId();

  const fieldItems = useMemo<FieldItem[]>(
    () =>
      items
        .filter((item) => Number.isFinite(item.change))
        .map((item, index) => {
          const label = item.label.trim() || `ITEM-${String(index + 1).padStart(2, "0")}`;

          return {
            label,
            change: item.change,
            index,
            seed: hashLabel(label)
          };
        }),
    [items]
  );

  const summary = useMemo(() => summarize(fieldItems), [fieldItems]);
  const rising = fieldItems.filter((item) => item.change > 0).length;
  const falling = fieldItems.filter((item) => item.change < 0).length;
  const average = fieldItems.length
    ? fieldItems.reduce((total, item) => total + item.change, 0) / fieldItems.length
    : 0;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const root = rootRef.current!;

    if (!canvas || !root) {
      return;
    }

    const context = canvas.getContext("2d", { alpha: true })!;

    if (!context) {
      return;
    }

    const palette = palettes[theme];
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = reducedMotionQuery.matches;
    let intersecting = true;
    let pageVisible = document.visibilityState === "visible";
    let animationFrame: number | null = null;
    let width = 1;
    let height = 1;
    let pixelRatio = 1;

    const pointer = {
      active: false,
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0
    };

    const maxAbsoluteChange = Math.max(
      0.25,
      ...fieldItems.map((item) => Math.abs(item.change))
    );
    const streamItems = [...fieldItems]
      .sort((left, right) => Math.abs(right.change) - Math.abs(left.change))
      .slice(0, 7);

    function itemPosition(item: FieldItem) {
      return fieldItems.length <= 1 ? 0.5 : (item.index + 0.5) / fieldItems.length;
    }

    function colorForChange(change: number) {
      if (change > 0.005) {
        return palette.positive;
      }

      if (change < -0.005) {
        return palette.negative;
      }

      return palette.neutral;
    }

    function sampleChange(rowPosition: number) {
      if (!fieldItems.length) {
        return 0;
      }

      let totalWeight = 0;
      let weightedChange = 0;

      for (const item of fieldItems) {
        const distance = rowPosition - itemPosition(item);
        const weight = Math.exp(-(distance * distance) / 0.035);
        totalWeight += weight;
        weightedChange += (item.change / maxAbsoluteChange) * weight;
      }

      return totalWeight ? weightedChange / totalWeight : 0;
    }

    function streamY(item: FieldItem, x: number, time: number) {
      const horizontalPadding = 10;
      const fieldTop = Math.min(28, height * 0.3);
      const fieldBottom = Math.max(fieldTop + 8, height - 10);
      const fieldHeight = fieldBottom - fieldTop;
      const progress = clamp(
        (x - horizontalPadding) / Math.max(1, width - horizontalPadding * 2),
        0,
        1
      );
      const normalizedChange = clamp(item.change / maxAbsoluteChange, -1, 1);
      const seedPhase = ((item.seed % 997) / 997) * Math.PI * 2;
      const ambientPhase = reducedMotion ? 0 : time * 0.00012;
      const base = fieldTop + itemPosition(item) * fieldHeight;
      const slope = (progress - 0.5) * normalizedChange * fieldHeight * 0.58;
      const wave =
        Math.sin(progress * Math.PI * 2 + seedPhase + ambientPhase) *
        (0.65 + Math.abs(normalizedChange) * 0.9);
      let y = base - slope + wave;

      if (pointer.active && !reducedMotion) {
        const distanceX = x - pointer.x;
        const localWeight = Math.exp(-(distanceX * distanceX) / (2 * 54 * 54));
        const verticalDistance = y - pointer.y;
        y += clamp(verticalDistance * 0.16, -7, 7) * localWeight;
      }

      return y;
    }

    function drawVector(
      x: number,
      y: number,
      sampledChange: number,
      phase: number
    ) {
      let angle = -sampledChange * 0.48 + Math.sin(phase) * 0.035;

      if (pointer.active && !reducedMotion) {
        const deltaX = pointer.x - x;
        const deltaY = pointer.y - y;
        const distance = Math.hypot(deltaX, deltaY);
        const radius = Math.min(96, width * 0.32);

        if (distance > 0 && distance < radius) {
          const influence = Math.pow(1 - distance / radius, 2) * 0.42;
          const baseX = Math.cos(angle);
          const baseY = Math.sin(angle);
          const targetX = deltaX / distance;
          const targetY = deltaY / distance;
          angle = Math.atan2(
            baseY * (1 - influence) + targetY * influence,
            baseX * (1 - influence) + targetX * influence
          );
        }
      }

      const length = 5.5 + Math.abs(sampledChange) * 3.6;
      const endX = x + Math.cos(angle) * length;
      const endY = y + Math.sin(angle) * length;
      const wing = 1.8;

      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(endX, endY);
      context.moveTo(endX, endY);
      context.lineTo(
        endX - Math.cos(angle - 0.58) * wing,
        endY - Math.sin(angle - 0.58) * wing
      );
      context.moveTo(endX, endY);
      context.lineTo(
        endX - Math.cos(angle + 0.58) * wing,
        endY - Math.sin(angle + 0.58) * wing
      );
      context.strokeStyle = colorForChange(sampledChange);
      context.stroke();
    }

    function draw(time: number) {
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.lineWidth = 0.75;
      context.lineCap = "square";
      context.lineJoin = "miter";

      const horizontalPadding = 10;
      const fieldTop = Math.min(28, height * 0.3);
      const fieldBottom = Math.max(fieldTop + 8, height - 10);
      const fieldHeight = fieldBottom - fieldTop;
      const axisY = fieldTop + fieldHeight * 0.5;

      context.strokeStyle = palette.axis;
      context.beginPath();
      context.moveTo(horizontalPadding, axisY);
      context.lineTo(width - horizontalPadding, axisY);
      context.stroke();

      const tickCount = Math.max(4, Math.min(9, Math.floor(width / 42)));
      context.strokeStyle = palette.grid;
      context.beginPath();
      for (let tick = 0; tick <= tickCount; tick += 1) {
        const x =
          horizontalPadding +
          (tick / tickCount) * (width - horizontalPadding * 2);
        context.moveTo(x, axisY - 2);
        context.lineTo(x, axisY + 2);
      }
      context.stroke();

      const rowCount = Math.max(3, Math.min(5, Math.floor(fieldHeight / 13)));
      const columnCount = Math.max(6, Math.min(13, Math.floor(width / 27)));
      for (let row = 0; row < rowCount; row += 1) {
        const rowPosition = rowCount === 1 ? 0.5 : row / (rowCount - 1);
        const y = fieldTop + rowPosition * fieldHeight;
        const sampledChange = sampleChange(rowPosition);

        for (let column = 0; column < columnCount; column += 1) {
          const columnPosition =
            columnCount === 1 ? 0.5 : column / (columnCount - 1);
          const x =
            horizontalPadding +
            columnPosition * (width - horizontalPadding * 2);
          const phase =
            columnPosition * Math.PI * 2 +
            row * 0.83 +
            (reducedMotion ? 0 : time * 0.00011);
          drawVector(x, y, sampledChange, phase);
        }
      }

      for (const item of streamItems) {
        context.beginPath();
        const segmentCount = Math.max(18, Math.min(36, Math.floor(width / 10)));

        for (let segment = 0; segment <= segmentCount; segment += 1) {
          const x =
            horizontalPadding +
            (segment / segmentCount) * (width - horizontalPadding * 2);
          const y = streamY(item, x, time);

          if (segment === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        }

        context.strokeStyle = colorForChange(item.change);
        context.lineWidth = 1;
        context.stroke();

        const speed = 0.000035 + Math.abs(item.change / maxAbsoluteChange) * 0.000035;
        const offset = (item.seed % 1000) / 1000;
        const tracerProgress = reducedMotion ? offset : (offset + time * speed) % 1;
        const tracerX =
          horizontalPadding + tracerProgress * (width - horizontalPadding * 2);
        const tracerY = streamY(item, tracerX, time);
        context.fillStyle = palette.tracer;
        context.beginPath();
        context.rect(tracerX - 1, tracerY - 1, 2, 2);
        context.fill();
      }
    }

    function renderOnce() {
      draw(reducedMotion ? 0 : performance.now());
    }

    function canAnimate() {
      return !reducedMotion && intersecting && pageVisible && fieldItems.length > 0;
    }

    function animate(time: number) {
      animationFrame = null;

      if (!canAnimate()) {
        return;
      }

      pointer.x += (pointer.targetX - pointer.x) * 0.14;
      pointer.y += (pointer.targetY - pointer.y) * 0.14;
      draw(time);
      animationFrame = window.requestAnimationFrame(animate);
    }

    function syncAnimation() {
      if (canAnimate()) {
        if (animationFrame === null) {
          animationFrame = window.requestAnimationFrame(animate);
        }
      } else if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    }

    function resize() {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
      const backingWidth = Math.max(1, Math.round(width * pixelRatio));
      const backingHeight = Math.max(1, Math.round(height * pixelRatio));

      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
      }

      if (!pointer.x && !pointer.y) {
        pointer.x = width * 0.5;
        pointer.y = height * 0.5;
        pointer.targetX = pointer.x;
        pointer.targetY = pointer.y;
      }

      renderOnce();
    }

    function handlePointerMove(event: PointerEvent) {
      if (reducedMotion) {
        return;
      }

      const bounds = canvas.getBoundingClientRect();
      pointer.targetX = event.clientX - bounds.left;
      pointer.targetY = event.clientY - bounds.top;
      pointer.active = true;
      syncAnimation();
    }

    function handlePointerLeave() {
      pointer.active = false;
    }

    function handleVisibilityChange() {
      pageVisible = document.visibilityState === "visible";
      syncAnimation();

      if (pageVisible && !reducedMotion) {
        renderOnce();
      }
    }

    function handleReducedMotionChange() {
      reducedMotion = reducedMotionQuery.matches;

      if (reducedMotion) {
        pointer.active = false;
      }

      syncAnimation();
      renderOnce();
    }

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry?.isIntersecting ?? true;
        syncAnimation();

        if (intersecting) {
          renderOnce();
        }
      },
      { rootMargin: "48px", threshold: 0.01 }
    );

    resizeObserver.observe(canvas);
    intersectionObserver.observe(root);
    root.addEventListener("pointermove", handlePointerMove, { passive: true });
    root.addEventListener("pointerleave", handlePointerLeave);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("resize", resize, { passive: true });
    reducedMotionQuery.addEventListener("change", handleReducedMotionChange);

    resize();
    syncAnimation();

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }

      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerleave", handlePointerLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("resize", resize);
      reducedMotionQuery.removeEventListener("change", handleReducedMotionChange);
    };
  }, [fieldItems, theme]);

  return (
    <figure
      ref={rootRef}
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-theme={theme}
      aria-label="市場ベクトルフィールド"
      aria-describedby={summaryId}
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      <div className={styles.meta} aria-hidden="true">
        <span className={styles.identifier}>
          <span className={styles.statusMark} />
          MKT / FIELD
        </span>
        <span className={styles.average}>μ {formatChange(average)}</span>
      </div>
      <div className={styles.breadth} aria-hidden="true">
        <span>{String(fieldItems.length).padStart(2, "0")} INPUT</span>
        <span>
          {String(rising).padStart(2, "0")}↑ / {String(falling).padStart(2, "0")}↓
        </span>
      </div>
      <figcaption id={summaryId} className={styles.srOnly}>
        {summary}
      </figcaption>
    </figure>
  );
}

export default MarketField;
