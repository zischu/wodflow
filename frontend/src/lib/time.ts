import type { EmomBlock, WorkoutBlock } from '../types'

export function formatSeconds(total: number): string {
  const value = Math.max(0, Math.round(total))
  const h = Math.floor(value / 3600)
  const m = Math.floor((value % 3600) / 60)
  const s = value % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function emomIntervalDuration(block: EmomBlock): number {
  if (block.intervals?.length) return block.intervals.reduce((sum, interval) => sum + interval.duration_seconds, 0)
  return block.interval_seconds ?? 60
}

export function blockDuration(block: WorkoutBlock): number {
  switch (block.type) {
    case 'timer':
    case 'amrap':
      return block.duration_seconds
    case 'emom':
      return block.rounds * emomIntervalDuration(block)
    case 'rounds':
      return block.rounds * block.exercises.length * (block.work_seconds + block.rest_seconds)
  }
}

export function workoutDuration(blocks: WorkoutBlock[]): number {
  return blocks.reduce((sum, block) => sum + blockDuration(block), 0)
}
