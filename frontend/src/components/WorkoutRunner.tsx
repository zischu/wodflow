import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw, SkipForward, X } from 'lucide-react'
import type { EmomInterval, ExerciseRef, Workout, WorkoutBlock } from '../types'
import { saveHistoryWithFallback } from '../lib/api'
import { formatSeconds } from '../lib/time'

type Phase = {
  blockIndex: number
  block: WorkoutBlock
  label: string
  seconds: number
  exercises: ExerciseRef[]
  round?: number
  phase: 'work' | 'rest' | 'timer' | 'amrap' | 'emom'
}

function legacyEmomInterval(block: Extract<WorkoutBlock, { type: 'emom' }>): EmomInterval {
  return {
    id: `${block.id}-legacy`,
    name: 'Minute 1',
    duration_seconds: block.interval_seconds ?? 60,
    exercises: block.exercises ?? [],
  }
}

export function buildPhases(workout: Workout): Phase[] {
  const phases: Phase[] = []
  workout.blocks.forEach((block, blockIndex) => {
    if (block.type === 'timer') {
      phases.push({ blockIndex, block, label: block.name, seconds: block.duration_seconds, exercises: block.exercises, phase: 'timer' })
    } else if (block.type === 'amrap') {
      phases.push({ blockIndex, block, label: block.name, seconds: block.duration_seconds, exercises: block.exercises, phase: 'amrap' })
    } else if (block.type === 'emom') {
      const intervals = block.intervals?.length ? block.intervals : [legacyEmomInterval(block)]
      for (let cycle = 1; cycle <= block.rounds; cycle++) {
        intervals.forEach((interval, intervalIndex) => {
          phases.push({
            blockIndex,
            block,
            label: `${interval.name || `Intervall ${intervalIndex + 1}`} · Zyklus ${cycle}/${block.rounds}`,
            seconds: interval.duration_seconds,
            exercises: interval.exercises,
            round: cycle,
            phase: 'emom',
          })
        })
      }
    } else {
      for (let round = 1; round <= block.rounds; round++) {
        block.exercises.forEach((exercise) => {
          phases.push({ blockIndex, block, label: `${exercise.name} · Runde ${round}/${block.rounds}`, seconds: block.work_seconds, exercises: [exercise], round, phase: 'work' })
          if (block.rest_seconds > 0) phases.push({ blockIndex, block, label: 'Rest', seconds: block.rest_seconds, exercises: [exercise], round, phase: 'rest' })
        })
      }
    }
  })
  return phases
}

export function WorkoutRunner({ workout, onClose, onHistorySaved }: { workout: Workout; onClose: () => void; onHistorySaved?: () => void }) {
  const phases = useMemo(() => buildPhases(workout), [workout])
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [remaining, setRemaining] = useState(phases[0]?.seconds ?? 0)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef(0)
  const [completed, setCompleted] = useState(false)
  const lastTick = useRef<number | null>(null)
  const startedAt = useRef<Date | null>(null)
  const finalized = useRef(false)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)
  const phase = phases[phaseIndex]

  useEffect(() => {
    setRemaining(phases[phaseIndex]?.seconds ?? 0)
    lastTick.current = null
  }, [phaseIndex, phases])

  useEffect(() => {
    if (!running || !phase) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      if (lastTick.current == null) {
        lastTick.current = now
        return
      }
      const step = Math.floor((now - lastTick.current) / 1000)
      if (step < 1) return
      lastTick.current += step * 1000
      elapsedRef.current += step
      setElapsed(elapsedRef.current)
      setRemaining((old) => {
        const next = old - step
        if (next > 0) return next
        window.setTimeout(() => {
          if (phaseIndex >= phases.length - 1) {
            setRunning(false)
            setCompleted(true)
            void finalize('completed', phases.length)
          } else {
            setPhaseIndex((i) => i + 1)
          }
        }, 0)
        return 0
      })
    }, 200)
    return () => window.clearInterval(timer)
  // finalize intentionally reads refs/state at the time it is called.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase, phaseIndex, phases.length])

  useEffect(() => {
    async function updateWakeLock() {
      if (running && 'wakeLock' in navigator) {
        try {
          wakeLock.current = await (navigator as Navigator & { wakeLock: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen')
        } catch { /* Browser/OS may reject wake lock. */ }
      } else if (wakeLock.current) {
        await wakeLock.current.release().catch(() => undefined)
        wakeLock.current = null
      }
    }
    void updateWakeLock()
    return () => { void wakeLock.current?.release().catch(() => undefined) }
  }, [running])

  if (!phase) return null
  const progress = phase.seconds > 0 ? (phase.seconds - remaining) / phase.seconds : 0

  async function finalize(status: 'completed' | 'aborted', completedPhases: number) {
    if (!startedAt.current || finalized.current) return
    finalized.current = true
    await saveHistoryWithFallback({
      workout_id: workout.id ?? null,
      workout_title: workout.title,
      workout_snapshot: workout,
      status,
      started_at: startedAt.current.toISOString(),
      finished_at: new Date().toISOString(),
      elapsed_seconds: elapsedRef.current,
      completed_phases: completedPhases,
      total_phases: phases.length,
    })
    onHistorySaved?.()
  }

  function reset() {
    finalized.current = false
    startedAt.current = null
    setRunning(false)
    setCompleted(false)
    elapsedRef.current = 0
    setElapsed(0)
    setPhaseIndex(0)
    setRemaining(phases[0]?.seconds ?? 0)
    lastTick.current = null
  }

  function toggleRunning() {
    if (!startedAt.current) startedAt.current = new Date()
    setRunning((x) => !x)
    lastTick.current = null
  }

  function close() {
    if (startedAt.current && !finalized.current && !completed) void finalize('aborted', phaseIndex)
    onClose()
  }

  return (
    <div className="runner-shell">
      <div className="runner-top">
        <div>
          <span className="runner-kicker">WODFLOW · LIVE</span>
          <h2>{workout.title}</h2>
        </div>
        <button className="icon-btn light" onClick={close}><X size={22} /></button>
      </div>

      <div className="runner-center">
        <div className={`phase-pill phase-${phase.phase}`}>{completed ? 'COMPLETED' : phase.phase.toUpperCase()}</div>
        <h1>{completed ? 'Workout abgeschlossen' : phase.label}</h1>
        {!completed && phase.exercises.length === 1 && phase.exercises[0].image_url && <img className="runner-exercise-image" src={phase.exercises[0].image_url ?? ''} alt="" />}
        <div className="big-time">{formatSeconds(remaining)}</div>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} /></div>
        <div className="runner-stats">
          <span>Block {phase.blockIndex + 1}/{workout.blocks.length}</span>
          <span>Phase {phaseIndex + 1}/{phases.length}</span>
          <span>Aktiv {formatSeconds(elapsed)}</span>
        </div>

        {!completed && phase.exercises.length > 0 && (
          <div className="runner-exercises">
            {phase.exercises.map((exercise, i) => (
              <div className="runner-exercise" key={`${exercise.name}-${i}`}>
                <div className="runner-mini-image">{exercise.image_url ? <img src={exercise.image_url} alt="" /> : exercise.name.slice(0, 1)}</div>
                <span>{exercise.name}</span>
                {exercise.reps && <strong>{exercise.reps} reps</strong>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="runner-controls">
        <button className="round-control" onClick={reset}><RotateCcw size={22} /></button>
        <button className="play-control" onClick={toggleRunning} disabled={completed}>
          {running ? <Pause size={32} /> : <Play size={32} fill="currentColor" />}
        </button>
        <button className="round-control" disabled={completed} onClick={() => setPhaseIndex((i) => Math.min(phases.length - 1, i + 1))}><SkipForward size={22} /></button>
      </div>
    </div>
  )
}
