export const SEGMENT_COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#3b82f6', '#ef4444', '#84cc16']

export function segmentColor(index: number) {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length]
}
