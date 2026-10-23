import { useEffect, useRef } from "react";

export function Waveform({
  peaks,
  color,
  width,
  height,
}: {
  peaks: Float32Array;
  color: string;
  width: number;
  height: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    canvas.width = Math.floor(safeWidth * dpr);
    canvas.height = Math.floor(safeHeight * dpr);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, safeWidth, safeHeight);
    const mid = safeHeight / 2;
    const buckets = Math.max(1, Math.floor(peaks.length / 2));
    const step = safeWidth / buckets;
    context.fillStyle = color;
    let loud = false;
    for (let i = 0; i < buckets; i += 1) {
      const min = peaks[i * 2] ?? 0;
      const max = peaks[i * 2 + 1] ?? 0;
      if (Math.abs(min) > 0.001 || Math.abs(max) > 0.001) loud = true;
      const y = mid + min * (mid - 2);
      const bar = Math.max(1, (max - min) * (mid - 2));
      context.fillRect(i * step, y, Math.max(1, step - 0.4), bar);
    }
    if (!loud) {
      context.fillRect(0, mid, safeWidth, 1);
    }
  }, [peaks, color, width, height]);
  return <canvas ref={ref} className="wave" style={{ width: Math.max(1, width), height }} aria-hidden="true" />;
}
