import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  sortableKeyboardCoordinates,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  Dumbbell,
  FilePlus2,
  History,
  Menu,
  Play,
  Plus,
  Repeat2,
  RotateCcw,
  Save,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { api, flushPendingHistory, pendingHistoryCount } from './lib/api'
import { workoutDuration, formatSeconds } from './lib/time'
import { validateWorkout } from './lib/workout'
import type { BlockType, Workout, WorkoutBlock, WorkoutHistoryEntry } from './types'
import { BlockCard } from './components/BlockCard'
import { WorkoutRunner } from './components/WorkoutRunner'
import { HistoryPanel } from './components/HistoryPanel'
import { ExerciseManager } from './components/ExerciseManager'
import { APP_VERSION } from './version'

const uid = () => crypto.randomUUID()

function makeBlock(type: BlockType): WorkoutBlock {
  if (type === 'timer') return { id: uid(), type, name: 'Timer', duration_seconds: 300, exercises: [] }
  if (type === 'amrap') return { id: uid(), type, name: 'AMRAP', duration_seconds: 720, exercises: [] }
  if (type === 'emom') {
    return {
      id: uid(),
      type,
      name: 'EMOM',
      rounds: 1,
      exercises: [],
      intervals: [{ id: uid(), name: 'Intervall 1', duration_seconds: 60, exercises: [] }],
    }
  }
  return { id: uid(), type, name: 'Work / Rest', rounds: 5, work_seconds: 40, rest_seconds: 20, exercises: [] }
}

function freshWorkout(): Workout {
  return { title: 'Neues WOD', description: '', blocks: [] }
}

const demoWorkout: Workout = {
  title: 'Bodyweight WOD 47',
  description: 'Manuell aufgebautes WOD aus Timer, AMRAP, Work/Rest und EMOM.',
  blocks: [
    {
      id: uid(),
      type: 'timer',
      name: 'Warm-up',
      duration_seconds: 300,
      exercises: [
        { provider: 'local', name: 'Marschieren am Platz', reps: 20 },
        { provider: 'local', name: 'Kniebeuge', reps: 10 },
        { provider: 'local', name: 'Rückwärts-Ausfallschritt', reps: 8 },
      ],
    },
    {
      id: uid(),
      type: 'amrap',
      name: 'Kraft-AMRAP',
      duration_seconds: 720,
      exercises: [
        { provider: 'local', name: 'Kniebeuge', reps: 12 },
        { provider: 'local', name: 'Liegestütz', reps: 10 },
        { provider: 'local', name: 'Rückwärts-Ausfallschritt', reps: 10 },
        { provider: 'local', name: 'Glute Bridge', reps: 12 },
        { provider: 'local', name: 'Unterarmstütz', reps: 1 },
      ],
    },
    {
      id: uid(),
      type: 'rounds',
      name: 'Conditioning',
      rounds: 5,
      work_seconds: 40,
      rest_seconds: 20,
      exercises: [
        { provider: 'local', name: 'Kniehebelauf', reps: 20 },
        { provider: 'local', name: 'Kniebeuge mit Strecken', reps: 12 },
        { provider: 'local', name: 'Mountain Climbers', reps: 20 },
        { provider: 'local', name: 'Rückwärts-Ausfallschritt', reps: 10 },
        { provider: 'local', name: 'Schattenboxen', reps: 20 },
      ],
    },
    {
      id: uid(),
      type: 'emom',
      name: 'Finisher',
      rounds: 2,
      exercises: [],
      intervals: [
        { id: uid(), name: 'Intervall 1', duration_seconds: 60, exercises: [{ provider: 'local', name: 'Kniebeuge', reps: 10 }] },
        { id: uid(), name: 'Intervall 2', duration_seconds: 60, exercises: [{ provider: 'local', name: 'Liegestütz', reps: 8 }] },
        { id: uid(), name: 'Intervall 3', duration_seconds: 60, exercises: [{ provider: 'local', name: 'Mountain Climbers', reps: 20 }] },
      ],
    },
  ],
}

const blockButtons: { type: BlockType; label: string; hint: string; icon: typeof Clock3 }[] = [
  { type: 'timer', label: 'Timer', hint: 'Feste Dauer', icon: Clock3 },
  { type: 'amrap', label: 'AMRAP', hint: 'Runden in vorgegebener Zeit', icon: RotateCcw },
  { type: 'emom', label: 'EMOM', hint: 'Eigene Übungen je Intervall', icon: Repeat2 },
  { type: 'rounds', label: 'Work / Rest', hint: 'Belastung und Pause je Übung', icon: Dumbbell },
]

type Notice = { type: 'error' | 'success' | 'info'; message: string }

function workoutFingerprint(workout: Workout): string {
  return JSON.stringify({
    id: workout.id ?? null,
    title: workout.title,
    description: workout.description,
    blocks: workout.blocks,
  })
}

export default function App() {
  const [workout, setWorkout] = useState<Workout>(demoWorkout)
  const [baseline, setBaseline] = useState<string | null>(() => workoutFingerprint(demoWorkout))
  const [library, setLibrary] = useState<Workout[]>([])
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [exerciseManagerOpen, setExerciseManagerOpen] = useState(false)
  const [historyPending, setHistoryPending] = useState(pendingHistoryCount())
  const [saveState, setSaveState] = useState('')
  const [saving, setSaving] = useState(false)
  const [runner, setRunner] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const saveMessageTimer = useRef<number | null>(null)
  const savingRef = useRef(false)
  const documentToken = useRef(uid())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const total = useMemo(() => workoutDuration(workout.blocks), [workout.blocks])
  const isDirty = useMemo(() => baseline === null || workoutFingerprint(workout) !== baseline, [workout, baseline])

  useEffect(() => {
    void api.listWorkouts()
      .then(setLibrary)
      .catch((cause) => setNotice({
        type: 'error',
        message: cause instanceof Error ? cause.message : 'Gespeicherte WODs konnten nicht geladen werden.',
      }))
  }, [])

  useEffect(() => {
    async function refreshLocalState() {
      setOnline(navigator.onLine)
      await flushPendingHistory()
      setHistoryPending(pendingHistoryCount())
      if (historyOpen) {
        void api.listHistory().then(setHistory).catch(() => undefined)
      }
    }

    window.addEventListener('online', refreshLocalState)
    window.addEventListener('offline', refreshLocalState)
    void refreshLocalState()
    return () => {
      window.removeEventListener('online', refreshLocalState)
      window.removeEventListener('offline', refreshLocalState)
    }
  }, [historyOpen])

  useEffect(() => {
    if (!isDirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [isDirty])

  useEffect(() => () => {
    if (saveMessageTimer.current != null) window.clearTimeout(saveMessageTimer.current)
  }, [])

  function confirmDiscard(): boolean {
    return !isDirty || window.confirm('Ungespeicherte Änderungen verwerfen?')
  }

  function replaceWorkout(next: Workout, persisted = Boolean(next.id)) {
    if (!confirmDiscard()) return
    documentToken.current = uid()
    setWorkout(structuredClone(next))
    setBaseline(persisted ? workoutFingerprint(next) : null)
    setNotice(null)
    setSidebarOpen(false)
  }

  function newWorkout() {
    const next = freshWorkout()
    if (!confirmDiscard()) return
    documentToken.current = uid()
    setWorkout(next)
    setBaseline(workoutFingerprint(next))
    setNotice(null)
    setSidebarOpen(false)
  }

  function addBlock(type: BlockType) {
    setWorkout((current) => ({ ...current, blocks: [...current.blocks, makeBlock(type)] }))
    setNotice(null)
    setSidebarOpen(false)
  }

  function dragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setWorkout((current) => {
      const oldIndex = current.blocks.findIndex((block) => block.id === active.id)
      const newIndex = current.blocks.findIndex((block) => block.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return current
      return { ...current, blocks: arrayMove(current.blocks, oldIndex, newIndex) }
    })
  }

  async function save() {
    if (savingRef.current) return
    if (!workout.title.trim()) {
      setNotice({ type: 'error', message: 'Bitte einen Namen für das WOD eingeben.' })
      return
    }

    const snapshot: Workout = structuredClone({ ...workout, title: workout.title.trim() })
    const snapshotFingerprint = workoutFingerprint(snapshot)
    const savingDocumentToken = documentToken.current
    savingRef.current = true
    setSaving(true)
    setSaveState('Speichert …')
    setNotice(null)

    try {
      const saved = snapshot.id
        ? await api.updateWorkout(snapshot.id, snapshot)
        : await api.createWorkout(snapshot)

      if (documentToken.current === savingDocumentToken) {
        setWorkout((current) => {
          if (workoutFingerprint(current) === snapshotFingerprint) return saved
          return {
            ...current,
            id: saved.id,
            created_at: saved.created_at,
            updated_at: saved.updated_at,
          }
        })
        setBaseline(workoutFingerprint(saved))
      }
      setLibrary((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
      setSaveState('Gespeichert')
      setNotice({ type: 'success', message: 'WOD lokal gespeichert.' })

      // The write already succeeded. A secondary refresh failure must not be
      // reported as a failed save or encourage the user to save a duplicate.
      void api.listWorkouts().then(setLibrary).catch(() => undefined)

      if (saveMessageTimer.current != null) window.clearTimeout(saveMessageTimer.current)
      saveMessageTimer.current = window.setTimeout(() => {
        setSaveState('')
        setNotice((current) => current?.type === 'success' ? null : current)
      }, 1800)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Speichern fehlgeschlagen.'
      setSaveState('Fehler')
      setNotice({ type: 'error', message })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function removeSaved(item: Workout) {
    if (!item.id || savingRef.current) return
    const activeWithChanges = workout.id === item.id && isDirty
    const message = activeWithChanges
      ? `WOD „${item.title}“ einschließlich der ungespeicherten Änderungen löschen?`
      : `WOD „${item.title}“ wirklich löschen?`
    if (!window.confirm(message)) return

    try {
      await api.deleteWorkout(item.id)
      setLibrary((current) => current.filter((candidate) => candidate.id !== item.id))
      if (workout.id === item.id) {
        const next = freshWorkout()
        documentToken.current = uid()
        setWorkout(next)
        setBaseline(workoutFingerprint(next))
      }
      void api.listWorkouts().then(setLibrary).catch(() => undefined)
    } catch (cause) {
      setNotice({
        type: 'error',
        message: cause instanceof Error ? cause.message : 'WOD konnte nicht gelöscht werden.',
      })
    }
  }

  async function openHistory() {
    setHistoryOpen(true)
    setSidebarOpen(false)
    setHistoryPending(pendingHistoryCount())
    try {
      setHistory(await api.listHistory())
    } catch (cause) {
      setHistory([])
      setNotice({
        type: 'error',
        message: cause instanceof Error ? cause.message : 'Trainingsverlauf konnte nicht geladen werden.',
      })
    }
  }

  async function refreshHistory() {
    setHistoryPending(pendingHistoryCount())
    try {
      setHistory(await api.listHistory())
    } catch {
      // A failed IndexedDB write remains in the local fallback queue.
    }
  }

  function startWorkout() {
    const issue = validateWorkout(workout)
    if (issue) {
      setNotice({ type: 'error', message: issue })
      return
    }
    setNotice(null)
    setRunner(true)
  }

  const editorState = workout.id
    ? isDirty ? 'Ungespeicherte Änderungen' : 'Gespeichert'
    : baseline === null ? 'Noch nicht gespeichert' : isDirty ? 'Ungespeicherte Änderungen' : 'Entwurf'

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Activity size={21} /></div>
          <div className="brand-copy">
            <div className="brand-title"><strong>WODFlow</strong><span className="version-badge">v{APP_VERSION}</span></div>
            <span>WOD-Editor</span>
          </div>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((current) => !current)}
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? 'Menü schließen' : 'Menü öffnen'}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <div className="sidebar-actions">
          <button type="button" className="new-workout-btn" onClick={newWorkout} disabled={saving}>
            <FilePlus2 size={17} /> Neues WOD
          </button>
          <button
            type="button"
            className="exercise-manager-btn"
            onClick={() => {
              setExerciseManagerOpen(true)
              setSidebarOpen(false)
            }}
          >
            <Database size={17} /> Übungsverwaltung
          </button>
        </div>

        <section className="block-palette">
          <div className="section-kicker">Block hinzufügen</div>
          <p className="muted">Baue das WOD Block für Block auf. Die Reihenfolge lässt sich per Drag & Drop ändern.</p>
          <div className="palette-grid">
            {blockButtons.map(({ type, label, hint, icon: Icon }) => (
              <button key={type} type="button" className={`palette-item palette-${type}`} onClick={() => addBlock(type)}>
                <span className="palette-icon"><Icon size={18} /></span>
                <span><strong>{label}</strong><small>{hint}</small></span>
                <Plus size={15} />
              </button>
            ))}
          </div>
        </section>

        <section className="library">
          <div className="section-kicker library-head">
            <span>Gespeicherte WODs</span>
            <button type="button" className="history-link" onClick={() => void openHistory()}>
              <History size={14} /> Verlauf
            </button>
          </div>
          {library.length === 0 && <p className="muted">Noch keine WODs lokal gespeichert.</p>}
          <div className="library-list">
            {library.map((item) => (
              <div className={`library-item ${item.id === workout.id ? 'active' : ''}`} key={item.id}>
                <button type="button" className="library-load" onClick={() => replaceWorkout(item)} disabled={saving}>
                  <strong>{item.title}</strong>
                  <span>{formatSeconds(workoutDuration(item.blocks))} · {item.blocks.length} Blöcke</span>
                </button>
                <button
                  type="button"
                  className="library-delete"
                  onClick={() => void removeSaved(item)}
                  aria-label={`${item.title} löschen`}
                  title="WOD löschen"
                  disabled={saving}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className={`connection-state ${online ? 'online' : 'offline'}`}>
            {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            {online ? 'Lokal gespeichert · RepDB-Sync verfügbar' : 'Offline · lokale Daten bleiben verfügbar'}
          </div>
          <div className="sidebar-footer">
            <a className="repdb-credit" href="https://repdb.co" target="_blank" rel="noreferrer">
              Exercise data by RepDB
            </a>
          </div>
        </section>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="workout-meta">
            <div className="eyebrow-row">
              <span className="eyebrow">WOD-EDITOR</span>
              <span className={`editor-state ${isDirty ? 'dirty' : ''}`}>{editorState}</span>
            </div>
            <input
              className="workout-title"
              value={workout.title}
              onChange={(event) => setWorkout({ ...workout, title: event.target.value })}
              aria-label="Name des WODs"
            />
            <input
              className="workout-description"
              value={workout.description}
              placeholder="Optionale Beschreibung"
              onChange={(event) => setWorkout({ ...workout, description: event.target.value })}
              aria-label="Beschreibung des WODs"
            />
          </div>
          <div className="top-actions">
            <div className="total-time"><span>Gesamt</span><strong>{formatSeconds(total)}</strong></div>
            <button type="button" className="secondary-btn" onClick={() => void openHistory()}>
              <History size={17} /> Verlauf
            </button>
            <button type="button" className="secondary-btn" onClick={() => void save()} disabled={saving}>
              <Save size={17} /> {saveState || 'Speichern'}
            </button>
            <button type="button" className="primary-btn" onClick={startWorkout} disabled={workout.blocks.length === 0}>
              <Play size={17} fill="currentColor" /> Start
            </button>
          </div>
        </header>

        {notice && (
          <div className={`app-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
            {notice.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{notice.message}</span>
            <button type="button" className="icon-btn" onClick={() => setNotice(null)} aria-label="Hinweis schließen">
              <X size={17} />
            </button>
          </div>
        )}

        <div className="composer">
          <div className="composer-head">
            <div><span className="section-kicker">Ablauf</span><h2>Workout-Timeline</h2></div>
            <span className="composer-hint">Blöcke am Griff ziehen, um die Reihenfolge zu ändern</span>
          </div>
          <div className="timeline-line" />
          <DndContext sensors={sensors} onDragEnd={dragEnd}>
            <SortableContext items={workout.blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
              <div className="blocks">
                {workout.blocks.map((block, index) => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    index={index}
                    onChange={(next) => setWorkout((current) => ({
                      ...current,
                      blocks: current.blocks.map((item) => item.id === block.id ? next : item),
                    }))}
                    onDelete={() => setWorkout((current) => ({
                      ...current,
                      blocks: current.blocks.filter((item) => item.id !== block.id),
                    }))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {workout.blocks.length === 0 && (
            <div className="empty-composer">
              <Activity size={34} />
              <h3>Leere Timeline</h3>
              <p>Öffne das Menü und füge den ersten Block hinzu.</p>
            </div>
          )}
        </div>
      </main>

      {exerciseManagerOpen && (
        <ExerciseManager open={exerciseManagerOpen} onClose={() => setExerciseManagerOpen(false)} />
      )}
      {runner && (
        <WorkoutRunner workout={workout} onClose={() => setRunner(false)} onHistorySaved={refreshHistory} />
      )}
      {historyOpen && (
        <HistoryPanel
          entries={history}
          pendingCount={historyPending}
          onClose={() => setHistoryOpen(false)}
          onDelete={async (id) => {
            try {
              await api.deleteHistory(id)
              setHistory((current) => current.filter((entry) => entry.id !== id))
              void api.listHistory().then(setHistory).catch(() => undefined)
            } catch (cause) {
              setNotice({
                type: 'error',
                message: cause instanceof Error ? cause.message : 'Verlaufseintrag konnte nicht gelöscht werden.',
              })
            }
          }}
          onLoadWorkout={(snapshot) => {
            const copy = { ...structuredClone(snapshot), id: undefined, title: `${snapshot.title} (Kopie)` }
            if (!confirmDiscard()) return
            documentToken.current = uid()
            setWorkout(copy)
            setBaseline(null)
            setHistoryOpen(false)
          }}
        />
      )}
    </div>
  )
}
