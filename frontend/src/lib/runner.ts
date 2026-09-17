import type { EmomInterval, ExerciseRef, Workout, WorkoutBlock } from '../types'

export type RunnerPhase = {
  blockIndex: number
  block: WorkoutBlock
  label: string
  seconds: number
  exercises: ExerciseRef[]
  round?: number
  phase: 'work' | 'rest' | 'timer' | 'amrap' | 'emom'
}

function positiveSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1
}

function legacyEmomInterval(block: Extract<WorkoutBlock, { type: 'emom' }>): EmomInterval {
  return {
    id: `${block.id}-legacy`,
    name: 'Intervall 1',
    duration_seconds: block.interval_seconds ?? 60,
    exercises: block.exercises ?? [],
  }
}

export function buildPhases(workout: Workout): RunnerPhase[] {
  const phases: RunnerPhase[] = []

  workout.blocks.forEach((block, blockIndex) => {
    if (block.type === 'timer') {
      phases.push({
        blockIndex,
        block,
        label: block.name.trim() || 'Timer',
        seconds: positiveSeconds(block.duration_seconds),
        exercises: block.exercises ?? [],
        phase: 'timer',
      })
      return
    }

    if (block.type === 'amrap') {
      phases.push({
        blockIndex,
        block,
        label: block.name.trim() || 'AMRAP',
        seconds: positiveSeconds(block.duration_seconds),
        exercises: block.exercises ?? [],
        phase: 'amrap',
      })
      return
    }

    if (block.type === 'emom') {
      const intervals = block.intervals?.length ? block.intervals : [legacyEmomInterval(block)]
      const cycles = Number.isFinite(block.rounds) ? Math.max(1, Math.round(block.rounds)) : 1
      for (let cycle = 1; cycle <= cycles; cycle += 1) {
        intervals.forEach((interval, intervalIndex) => {
          phases.push({
            blockIndex,
            block,
            label: `${interval.name || `Intervall ${intervalIndex + 1}`} · Zyklus ${cycle}/${cycles}`,
            seconds: positiveSeconds(interval.duration_seconds),
            exercises: interval.exercises ?? [],
            round: cycle,
            phase: 'emom',
          })
        })
      }
      return
    }

    const rounds = Number.isFinite(block.rounds) ? Math.max(1, Math.round(block.rounds)) : 1
    const exercises = block.exercises ?? []
    for (let round = 1; round <= rounds; round += 1) {
      exercises.forEach((exercise, exerciseIndex) => {
        phases.push({
          blockIndex,
          block,
          label: `${exercise.name} · Runde ${round}/${rounds}`,
          seconds: positiveSeconds(block.work_seconds),
          exercises: [exercise],
          round,
          phase: 'work',
        })

        if (block.rest_seconds > 0) {
          const nextExercise = exercises[exerciseIndex + 1]
            ?? (round < rounds ? exercises[0] : undefined)
          phases.push({
            blockIndex,
            block,
            label: nextExercise ? `Pause · danach ${nextExercise.name}` : 'Pause',
            seconds: positiveSeconds(block.rest_seconds),
            exercises: nextExercise ? [nextExercise] : [],
            round,
            phase: 'rest',
          })
        }
      })
    }
  })

  return phases
}

export type CountdownAdvance = {
  phaseIndex: number
  remainingMs: number
  consumedMs: number
  finished: boolean
}

export function advanceCountdown(
  phases: readonly Pick<RunnerPhase, 'seconds'>[],
  currentPhaseIndex: number,
  currentRemainingMs: number,
  deltaMs: number,
): CountdownAdvance {
  if (phases.length === 0) {
    return { phaseIndex: 0, remainingMs: 0, consumedMs: 0, finished: true }
  }

  let phaseIndex = Math.min(phases.length - 1, Math.max(0, Math.trunc(currentPhaseIndex)))
  let remainingMs = Number.isFinite(currentRemainingMs)
    ? Math.max(0, currentRemainingMs)
    : positiveSeconds(phases[phaseIndex].seconds) * 1000
  let delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0
  let consumedMs = 0

  while (delta > 0) {
    if (remainingMs <= 0) {
      if (phaseIndex >= phases.length - 1) {
        return { phaseIndex, remainingMs: 0, consumedMs, finished: true }
      }
      phaseIndex += 1
      remainingMs = positiveSeconds(phases[phaseIndex].seconds) * 1000
    }

    const step = Math.min(delta, remainingMs)
    remainingMs -= step
    delta -= step
    consumedMs += step

    if (remainingMs === 0) {
      if (phaseIndex >= phases.length - 1) {
        return { phaseIndex, remainingMs: 0, consumedMs, finished: true }
      }
      phaseIndex += 1
      remainingMs = positiveSeconds(phases[phaseIndex].seconds) * 1000
    }
  }

  return { phaseIndex, remainingMs, consumedMs, finished: false }
}
