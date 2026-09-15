export type BlockType = 'timer' | 'amrap' | 'emom' | 'rounds'

export interface ExerciseRef {
  provider: string
  provider_id?: string | null
  name: string
  image_url?: string | null
  reps?: number | null
  notes?: string | null
}

export interface EmomInterval {
  id: string
  name: string
  duration_seconds: number
  exercises: ExerciseRef[]
}

export interface BaseBlock {
  id: string
  type: BlockType
  name: string
  exercises: ExerciseRef[]
}

export interface TimerBlock extends BaseBlock {
  type: 'timer'
  duration_seconds: number
}

export interface AmrapBlock extends BaseBlock {
  type: 'amrap'
  duration_seconds: number
}

export interface EmomBlock extends BaseBlock {
  type: 'emom'
  rounds: number
  intervals: EmomInterval[]
  interval_seconds?: number | null
}

export interface RoundsBlock extends BaseBlock {
  type: 'rounds'
  rounds: number
  work_seconds: number
  rest_seconds: number
}

export type WorkoutBlock = TimerBlock | AmrapBlock | EmomBlock | RoundsBlock

export interface Workout {
  id?: number
  title: string
  description: string
  blocks: WorkoutBlock[]
  created_at?: string
  updated_at?: string
}

export interface ExerciseSearchResult {
  provider: string
  provider_id: string
  name: string
  image_url?: string | null
  category?: string | null
  equipment: string[]
  description?: string | null
}

export interface ExerciseLibraryStats {
  total: number
  local: number
  wger: number
  with_images: number
}

export interface ExerciseSyncResult {
  fetched: number
  upserted: number
  images_cached: number
  image_errors: number
}

export type HistoryStatus = 'completed' | 'aborted'

export interface WorkoutHistoryInput {
  workout_id?: number | null
  workout_title: string
  workout_snapshot: Workout
  status: HistoryStatus
  started_at: string
  finished_at: string
  elapsed_seconds: number
  completed_phases: number
  total_phases: number
}

export interface WorkoutHistoryEntry extends WorkoutHistoryInput {
  id: number
  created_at: string
}
