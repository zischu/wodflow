import type { EmomBlock, Workout } from '../types'

function positiveInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 1
}

function nonNegativeInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

function emomDurations(block: EmomBlock): number[] {
  if (block.intervals?.length) return block.intervals.map((interval) => interval.duration_seconds)
  return [block.interval_seconds ?? 60]
}

export function validateWorkout(workout: Workout): string | null {
  if (!workout.title.trim()) return 'Bitte einen Namen für das WOD eingeben.'
  if (workout.blocks.length === 0) return 'Füge mindestens einen Block hinzu.'

  for (let index = 0; index < workout.blocks.length; index += 1) {
    const block = workout.blocks[index]
    const label = block.name.trim() || `Block ${index + 1}`

    if ((block.type === 'timer' || block.type === 'amrap') && !positiveInteger(block.duration_seconds)) {
      return `${label}: Die Dauer muss eine positive ganze Zahl sein.`
    }
    if (block.type === 'amrap' && block.exercises.length === 0) {
      return `${label}: Ein AMRAP benötigt mindestens eine Übung.`
    }
    if (block.type === 'rounds') {
      if (!positiveInteger(block.rounds) || !positiveInteger(block.work_seconds) || !nonNegativeInteger(block.rest_seconds)) {
        return `${label}: Runden und Zeiten sind ungültig.`
      }
      if (block.exercises.length === 0) {
        return `${label}: Ein Work-/Rest-Block benötigt mindestens eine Übung.`
      }
    }
    if (block.type === 'emom') {
      if (!positiveInteger(block.rounds)) return `${label}: Die Anzahl der Sequenzen ist ungültig.`
      const durations = emomDurations(block)
      if (durations.length === 0) return `${label}: Das EMOM benötigt mindestens ein Intervall.`
      if (durations.some((duration) => !positiveInteger(duration))) {
        return `${label}: Jedes Intervall benötigt eine positive ganzzahlige Dauer.`
      }
      const intervals = block.intervals?.length ? block.intervals : [{ exercises: block.exercises }]
      if (!intervals.some((interval) => interval.exercises.length > 0)) {
        return `${label}: Das EMOM benötigt mindestens eine Übung.`
      }
    }
  }

  return null
}
