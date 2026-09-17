import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Pause, Play, RotateCcw, SkipForward, X } from 'lucide-react'
import type { Workout } from '../types'
import { saveHistoryWithFallback } from '../lib/api'
import { formatSeconds } from '../lib/time'
import { useDialog } from '../lib/dialog'
import { ExerciseArtwork } from './ExerciseArtwork'
import { advanceCountdown, buildPhases, type RunnerPhase } from '../lib/runner'

const PHASE_LABELS: Record<RunnerPhase['phase'], string> = {
  work: 'ARBEIT',
  rest: 'PAUSE',
  timer: 'TIMER',
  amrap: 'AMRAP',
  emom: 'EMOM',
}

type WakeLockSentinel = { release: () => Promise<void>; released?: boolean }

export function WorkoutRunner({
  workout,
  onClose,
  onHistorySaved,
}: {
  workout: Workout
  onClose: () => void
  onHistorySaved?: () => void
}) {
  const phases = useMemo(() => buildPhases(workout), [workout])
  const initialMs = (phases[0]?.seconds ?? 0) * 1000

  const [phaseIndex, setPhaseIndex] = useState(0)
  const [remainingMs, setRemainingMs] = useState(initialMs)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [completed, setCompleted] = useState(false)

  const phaseIndexRef = useRef(0)
  const remainingMsRef = useRef(initialMs)
  const elapsedMsRef = useRef(0)
  const lastTickRef = useRef<number | null>(null)
  const startedAt = useRef<Date | null>(null)
  const finalized = useRef(false)
  const runningRef = useRef(false)
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const wakeLockRequestPending = useRef(false)
  const phase = phases[phaseIndex]

  runningRef.current = running
  useDialog(true, () => { void close() })

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
      elapsed_seconds: Math.floor(elapsedMsRef.current / 1000),
      completed_phases: Math.min(phases.length, Math.max(0, completedPhases)),
      total_phases: phases.length,
    })
    onHistorySaved?.()
  }

  function applyPhase(index: number, milliseconds: number) {
    phaseIndexRef.current = index
    remainingMsRef.current = Math.max(0, milliseconds)
    setPhaseIndex(index)
    setRemainingMs(Math.max(0, milliseconds))
  }

  function finishWorkout() {
    setRunning(false)
    runningRef.current = false
    setCompleted(true)
    remainingMsRef.current = 0
    setRemainingMs(0)
    lastTickRef.current = null
    void finalize('completed', phases.length)
  }

  useEffect(() => {
    if (!running || phases.length === 0) return

    lastTickRef.current = Date.now()
    const timer = window.setInterval(() => {
      if (!runningRef.current) return
      const now = Date.now()
      const previous = lastTickRef.current ?? now
      let delta = Math.max(0, now - previous)
      lastTickRef.current = now
      if (delta === 0) return

      const next = advanceCountdown(
        phases,
        phaseIndexRef.current,
        remainingMsRef.current,
        delta,
      )

      elapsedMsRef.current += next.consumedMs
      setElapsed(Math.floor(elapsedMsRef.current / 1000))

      if (next.finished) {
        phaseIndexRef.current = next.phaseIndex
        setPhaseIndex(next.phaseIndex)
        finishWorkout()
      } else {
        applyPhase(next.phaseIndex, next.remainingMs)
      }
    }, 200)

    return () => window.clearInterval(timer)
  }, [running, phases])

  async function requestWakeLock() {
    if (!runningRef.current || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return
    if (wakeLockRequestPending.current || (wakeLock.current && !wakeLock.current.released)) return

    wakeLockRequestPending.current = true
    try {
      const sentinel = await (navigator as Navigator & {
        wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinel> }
      }).wakeLock.request('screen')
      if (!runningRef.current) {
        await sentinel.release().catch(() => undefined)
        return
      }
      wakeLock.current = sentinel
    } catch {
      wakeLock.current = null
    } finally {
      wakeLockRequestPending.current = false
    }
  }

  useEffect(() => {
    if (running) {
      void requestWakeLock()
    } else if (wakeLock.current) {
      void wakeLock.current.release().catch(() => undefined)
      wakeLock.current = null
    }
  }, [running])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && runningRef.current) void requestWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void wakeLock.current?.release().catch(() => undefined)
      wakeLock.current = null
    }
  }, [])

  function reset() {
    finalized.current = false
    startedAt.current = null
    setRunning(false)
    runningRef.current = false
    setCompleted(false)
    elapsedMsRef.current = 0
    setElapsed(0)
    applyPhase(0, (phases[0]?.seconds ?? 0) * 1000)
    lastTickRef.current = null
  }

  function toggleRunning() {
    if (completed || phases.length === 0) return
    if (!startedAt.current) startedAt.current = new Date()
    setRunning((current) => {
      const next = !current
      runningRef.current = next
      return next
    })
    lastTickRef.current = null
  }

  function skip() {
    if (completed || phases.length === 0) return
    const nextIndex = phaseIndexRef.current + 1
    if (nextIndex >= phases.length) {
      finishWorkout()
      return
    }
    applyPhase(nextIndex, phases[nextIndex].seconds * 1000)
    lastTickRef.current = runningRef.current ? Date.now() : null
  }

  async function close() {
    if (startedAt.current && !completed && !finalized.current) {
      const shouldClose = window.confirm('Laufendes Workout beenden und als abgebrochen speichern?')
      if (!shouldClose) return
      setRunning(false)
      runningRef.current = false
      lastTickRef.current = null
      await finalize('aborted', phaseIndexRef.current)
    }
    onClose()
  }

  if (!phase) {
    return (
      <div className="runner-shell runner-empty" role="dialog" aria-modal="true" aria-labelledby="runner-empty-title">
        <div>
          <h1 id="runner-empty-title">Kein ausführbarer Ablauf</h1>
          <p>Prüfe die Blöcke und füge den Work-/Rest-Blöcken Übungen hinzu.</p>
          <button type="button" className="primary-btn" onClick={onClose}>Zurück zum Editor</button>
        </div>
      </div>
    )
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000)
  const progress = phase.seconds > 0 ? 1 - remainingMs / (phase.seconds * 1000) : 0
  const heroExercise = !completed && phase.exercises.length === 1 ? phase.exercises[0] : null

  return (
    <div className="runner-shell" role="dialog" aria-modal="true" aria-labelledby="runner-title">
      <div className="runner-top">
        <div>
          <span className="runner-kicker">WODFLOW · LIVE</span>
          <h2 id="runner-title">{workout.title}</h2>
        </div>
        <button type="button" className="icon-btn light" onClick={() => void close()} aria-label="Workout schließen">
          <X size={22} />
        </button>
      </div>

      <div className="runner-center">
        <div className={`phase-pill phase-${phase.phase}`}>
          {completed ? 'ABGESCHLOSSEN' : PHASE_LABELS[phase.phase]}
        </div>
        <h1>{completed ? 'Workout abgeschlossen' : phase.label}</h1>

        {heroExercise?.image_url && (
          <div className="runner-exercise-image">
            <ExerciseArtwork src={heroExercise.image_url} name={heroExercise.name} eager />
          </div>
        )}

        {completed && <span className="runner-complete-label">Aktive Trainingszeit</span>}
        <div className="big-time">{formatSeconds(completed ? elapsed : remainingSeconds)}</div>

        <div
          className="progress-track"
          role="progressbar"
          aria-label="Fortschritt des aktuellen Intervalls"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={completed ? 100 : Math.round(Math.min(1, Math.max(0, progress)) * 100)}
        >
          <div
            className="progress-fill"
            style={{ width: `${completed ? 100 : Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>

        <div className="runner-stats">
          <span>Block {phase.blockIndex + 1}/{workout.blocks.length}</span>
          <span>Phase {phaseIndex + 1}/{phases.length}</span>
          {phase.round && <span>{phase.phase === 'emom' ? 'Zyklus' : 'Runde'} {phase.round}/{phase.block.type === 'emom' || phase.block.type === 'rounds' ? phase.block.rounds : phase.round}</span>}
          <span>Aktiv {formatSeconds(elapsed)}</span>
        </div>

        {!completed && phase.exercises.length > 0 && (
          <div className="runner-exercises">
            {phase.exercises.map((exercise, index) => (
              <div className="runner-exercise" key={`${exercise.provider_id ?? exercise.name}-${index}`}>
                <div className="runner-mini-image">
                  <ExerciseArtwork src={exercise.image_url} name={exercise.name} />
                </div>
                <span>{exercise.name}</span>
                {exercise.reps != null && <strong>{exercise.reps} Wdh.</strong>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="runner-controls">
        <button type="button" className="round-control" onClick={reset} aria-label="Workout zurücksetzen" title="Zurücksetzen">
          <RotateCcw size={22} />
        </button>
        <button
          type="button"
          className="play-control"
          onClick={completed ? () => void close() : toggleRunning}
          aria-label={completed ? 'Workout schließen' : running ? 'Pausieren' : 'Starten'}
        >
          {completed ? <Check size={32} /> : running ? <Pause size={32} /> : <Play size={32} fill="currentColor" />}
        </button>
        <button type="button" className="round-control" disabled={completed} onClick={skip} aria-label="Aktuelle Phase überspringen" title="Überspringen">
          <SkipForward size={22} />
        </button>
      </div>
    </div>
  )
}
