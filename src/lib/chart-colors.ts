// Categorical order and sequential ramp from the validated reference palette
// (dataviz skill, references/palette.md) — CSS custom properties defined in
// src/index.css for both themes, referenced here by role rather than by hex
// so light/dark swap automatically.

export const CHART_CATEGORICAL = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
]

export const CHART_CATEGORICAL_CAP = CHART_CATEGORICAL.length

export function categoricalColor(index: number): string {
  return CHART_CATEGORICAL[index % CHART_CATEGORICAL.length]
}

// Concrete hex swatches offered in the subject color picker. Kept as literal
// hexes (not the var(--chart-*) tokens) because a stored subject.color has to
// be a fixed value — it can't resolve a CSS variable at rest — and these are
// the light-theme reference hexes of the validated categorical palette.
export const SUBJECT_COLOR_SWATCHES = [
  '#2a78d6',
  '#008300',
  '#e87ba4',
  '#eda100',
  '#1baf7a',
  '#eb6834',
  '#4a3aa7',
  '#e34948',
]

/**
 * The color to draw a subject in: its own chosen `color` if set, otherwise the
 * palette slot for its position. One place so Week overview and Analytics
 * never disagree about a subject's color.
 */
export function resolveSubjectColor(color: string | null | undefined, fallbackIndex: number): string {
  return color ?? categoricalColor(fallbackIndex)
}

/** Sequential blue ramp, light -> dark, for magnitude encoding (the heatmap). */
export const CHART_SEQUENTIAL = ['var(--chart-seq-1)', 'var(--chart-seq-2)', 'var(--chart-seq-3)', 'var(--chart-seq-4)']

export function sequentialColor(percentage: number | null): string {
  if (percentage === null) return 'var(--muted)'
  if (percentage < 50) return CHART_SEQUENTIAL[0]
  if (percentage < 75) return CHART_SEQUENTIAL[1]
  if (percentage < 90) return CHART_SEQUENTIAL[2]
  return CHART_SEQUENTIAL[3]
}
