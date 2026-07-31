import { useId } from 'react'

interface SparklineProps {
  /** Percentage values (0–100) in chronological order. */
  values: number[]
  width?: number
  height?: number
  className?: string
}

/**
 * A tiny inline attendance-trend line with an area fill and an emphasized
 * endpoint. Self-contained SVG (no chart lib) since it's rendered many times
 * on the dashboard. Draws nothing meaningful below two points.
 */
export function Sparkline({ values, width = 96, height = 28, className }: SparklineProps) {
  const gradientId = useId()
  if (values.length < 2) {
    return (
      <svg width={width} height={height} className={className} aria-hidden="true">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--chart-axis)"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      </svg>
    )
  }

  const pad = 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = (width - pad * 2) / (values.length - 1)

  const points = values.map((v, i) => {
    const x = pad + i * stepX
    const y = pad + (1 - (v - min) / range) * (height - pad * 2)
    return [x, y] as const
  })

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`
  const [lastX, lastY] = points[points.length - 1]

  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.28} />
          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.2} fill="var(--chart-1)" />
    </svg>
  )
}
