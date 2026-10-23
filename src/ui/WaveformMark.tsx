import { useId } from "react";

export function WaveformMark({ size = 36 }: { size?: number }) {
  const id = useId();
  const bars = [0.28, 0.46, 0.68, 1, 0.68, 0.46, 0.28];
  const width = 6;
  const gap = 4;
  const height = 48;
  const viewWidth = bars.length * width + (bars.length - 1) * gap;
  return (
    <svg
      className="mark"
      width={size}
      height={Math.round((size * height) / viewWidth)}
      viewBox={`0 0 ${viewWidth} ${height}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fffaf3" />
          <stop offset="48%" stopColor="#ded8ce" />
          <stop offset="100%" stopColor="#9a948b" />
        </linearGradient>
      </defs>
      {bars.map((amount, index) => {
        const barHeight = amount * height;
        return (
          <rect
            key={index}
            x={index * (width + gap)}
            y={(height - barHeight) / 2}
            width={width}
            height={barHeight}
            rx="3"
            fill={`url(#${id})`}
          />
        );
      })}
    </svg>
  );
}
