import type { EmomBlock, WorkoutBlock } from '../types'

export function formatSeconds(total: number): string {
  const value = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0
  const h = Math.floor(value / 3600)
  const m = Math.floor((value % 3600) / 60)
  const s = value % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function emomIntervalDuration(block: EmomBlock): number {
  if (block.intervals?.length) {
    return block.intervals.reduce((sum, interval) => sum + Math.max(1, interval.duration_seconds || 0), 0)
  }
  return Math.max(1, block.interval_seconds ?? 60)
}

export function blockDuration(block: WorkoutBlock): number {
  switch (block.type) {
    case 'timer':
    case 'amrap':
      return Math.max(0, block.duration_seconds || 0)
    case 'emom':
      return Math.max(0, block.rounds || 0) * emomIntervalDuration(block)
    case 'rounds':
      return Math.max(0, block.rounds || 0) * block.exercises.length * (Math.max(0, block.work_seconds || 0) + Math.max(0, block.rest_seconds || 0))
  }
}

export function workoutDuration(blocks: WorkoutBlock[]): number {
  return blocks.reduce((sum, block) => sum + blockDuration(block), 0)
}
