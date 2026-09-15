import { useEffect, useMemo, useState } from 'react'
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Activity, Clock3, Database, Dumbbell, FilePlus2, History, Play, Plus, Repeat2, RotateCcw, Save, Trash2, Wifi, WifiOff } from 'lucide-react'
import { api, flushPendingHistory, pendingHistoryCount } from './lib/api'
import { workoutDuration, formatSeconds } from './lib/time'
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
  if (type === 'emom') return {
    id: uid(), type, name: 'EMOM', rounds: 1, exercises: [], intervals: [
      { id: uid(), name: 'Minute 1', duration_seconds: 60, exercises: [] },
    ],
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
    { id: uid(), type: 'timer', name: 'Warm-up', duration_seconds: 300, exercises: [
      { provider: 'local', name: 'March in Place', reps: 20 },
      { provider: 'local', name: 'Air Squat', reps: 10 },
      { provider: 'local', name: 'Reverse Lunge', reps: 8 },
    ] },
    { id: uid(), type: 'amrap', name: 'Strength AMRAP', duration_seconds: 720, exercises: [
      { provider: 'local', name: 'Air Squat', reps: 12 },
      { provider: 'local', name: 'Push-up', reps: 10 },
      { provider: 'local', name: 'Reverse Lunge', reps: 10 },
      { provider: 'local', name: 'Glute Bridge', reps: 12 },
      { provider: 'local', name: 'Plank', reps: 1 },
    ] },
    { id: uid(), type: 'rounds', name: 'Conditioning', rounds: 5, work_seconds: 40, rest_seconds: 20, exercises: [
      { provider: 'local', name: 'High Knees', reps: 20 },
      { provider: 'local', name: 'Squat to Reach', reps: 12 },
      { provider: 'local', name: 'Mountain Climbers', reps: 20 },
      { provider: 'local', name: 'Reverse Lunge', reps: 10 },
      { provider: 'local', name: 'Shadow Boxing', reps: 20 },
    ] },
    { id: uid(), type: 'emom', name: 'Finisher', rounds: 2, exercises: [], intervals: [
      { id: uid(), name: 'Minute 1', duration_seconds: 60, exercises: [{ provider: 'local', name: 'Air Squat', reps: 10 }] },
      { id: uid(), name: 'Minute 2', duration_seconds: 60, exercises: [{ provider: 'local', name: 'Push-up', reps: 8 }] },
      { id: uid(), name: 'Minute 3', duration_seconds: 60, exercises: [{ provider: 'local', name: 'Mountain Climbers', reps: 20 }] },
    ] },
  ],
}

const blockButtons: { type: BlockType; label: string; hint: string; icon: typeof Clock3 }[] = [
  { type: 'timer', label: 'Timer', hint: 'Feste Dauer', icon: Clock3 },
  { type: 'amrap', label: 'AMRAP', hint: 'Runden in Zeit', icon: RotateCcw },
  { type: 'emom', label: 'EMOM', hint: 'Eigene Übungen je Intervall', icon: Repeat2 },
  { type: 'rounds', label: 'Work / Rest', hint: 'Runden mit Belastung/Pause', icon: Dumbbell },
]

export default function App() {
  const [workout, setWorkout] = useState<Workout>(demoWorkout)
  const [library, setLibrary] = useState<Workout[]>([])
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [exerciseManagerOpen, setExerciseManagerOpen] = useState(false)
  const [historyPending, setHistoryPending] = useState(pendingHistoryCount())
  const [saveState, setSaveState] = useState('')
  const [runner, setRunner] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const total = useMemo(() => workoutDuration(workout.blocks), [workout.blocks])

  useEffect(() => { api.listWorkouts().then(setLibrary).catch(() => undefined) }, [])

  useEffect(() => {
    async function syncOfflineHistory() {
      setOnline(navigator.onLine)
      await flushPendingHistory()
      setHistoryPending(pendingHistoryCount())
      if (historyOpen) api.listHistory().then(setHistory).catch(() => undefined)
    }
    window.addEventListener('online', syncOfflineHistory)
    window.addEventListener('offline', syncOfflineHistory)
    void syncOfflineHistory()
    return () => {
      window.removeEventListener('online', syncOfflineHistory)
      window.removeEventListener('offline', syncOfflineHistory)
    }
  }, [historyOpen])

  function addBlock(type: BlockType) {
    setWorkout((w) => ({ ...w, blocks: [...w.blocks, makeBlock(type)] }))
  }

  function dragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setWorkout((w) => {
      const oldIndex = w.blocks.findIndex((b) => b.id === active.id)
      const newIndex = w.blocks.findIndex((b) => b.id === over.id)
      return { ...w, blocks: arrayMove(w.blocks, oldIndex, newIndex) }
    })
  }

  async function save() {
    setSaveState('Speichert …')
    try {
      const saved = workout.id ? await api.updateWorkout(workout.id, workout) : await api.createWorkout(workout)
      setWorkout(saved)
      setLibrary(await api.listWorkouts())
      setSaveState('Gespeichert')
      window.setTimeout(() => setSaveState(''), 1800)
    } catch (e) {
      setSaveState(e instanceof Error ? e.message : 'Fehler')
    }
  }

  async function removeSaved(id: number) {
    await api.deleteWorkout(id)
    setLibrary(await api.listWorkouts())
    if (workout.id === id) setWorkout(freshWorkout())
  }

  async function openHistory() {
    setHistoryOpen(true)
    setHistoryPending(pendingHistoryCount())
    try { setHistory(await api.listHistory()) } catch { setHistory([]) }
  }

  async function refreshHistory() {
    setHistoryPending(pendingHistoryCount())
    try { setHistory(await api.listHistory()) } catch { /* Offline history remains queued locally. */ }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Activity size={21} /></div><div><strong>WODFlow</strong><span>workout composer · v{APP_VERSION}</span></div></div>

        <div className="sidebar-actions">
          <button className="new-workout-btn" onClick={() => setWorkout(freshWorkout())}><FilePlus2 size={17} /> Neues WOD</button>
          <button className="exercise-manager-btn" onClick={() => setExerciseManagerOpen(true)}><Database size={17} /> Exercise Manager</button>
        </div>

        <section className="block-palette">
          <div className="section-kicker">Block hinzufügen</div>
          <p className="muted">Baue das WOD Block für Block auf. Die Reihenfolge lässt sich anschließend per Drag & Drop ändern.</p>
          <div className="palette-grid">
            {blockButtons.map(({ type, label, hint, icon: Icon }) => (
              <button key={type} className={`palette-item palette-${type}`} onClick={() => addBlock(type)}>
                <span className="palette-icon"><Icon size={18} /></span>
                <span><strong>{label}</strong><small>{hint}</small></span>
                <Plus size={15} />
              </button>
            ))}
          </div>
        </section>

        <section className="library">
          <div className="section-kicker library-head"><span>Gespeicherte WODs</span><button className="history-link" onClick={openHistory}><History size={14} /> History</button></div>
          {library.length === 0 && <p className="muted">Noch keine WODs in der Datenbank.</p>}
          {library.map((item) => (
            <div className={`library-item ${item.id === workout.id ? 'active' : ''}`} key={item.id}>
              <button className="library-load" onClick={() => setWorkout(item)}>
                <strong>{item.title}</strong>
                <span>{formatSeconds(workoutDuration(item.blocks))} · {item.blocks.length} Blöcke</span>
              </button>
              <button className="library-delete" onClick={() => item.id && removeSaved(item.id)}><Trash2 size={14} /></button>
            </div>
          ))}
          <div className={`connection-state ${online ? 'online' : 'offline'}`}>{online ? <Wifi size={13} /> : <WifiOff size={13} />} {online ? 'Local-first · online · RepDB-Sync verfügbar' : 'Offline · WODs, History und Übungen bleiben lokal verfügbar'}</div>
          <div className="sidebar-footer">
            <a className="repdb-credit" href="https://repdb.co" target="_blank" rel="noreferrer">Exercise data by RepDB</a>
            <span className="app-version">WODFlow v{APP_VERSION}</span>
          </div>
        </section>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">WOD EDITOR</span>
            <input className="workout-title" value={workout.title} onChange={(e) => setWorkout({ ...workout, title: e.target.value })} />
            <input className="workout-description" value={workout.description} placeholder="Optionale Beschreibung" onChange={(e) => setWorkout({ ...workout, description: e.target.value })} />
          </div>
          <div className="top-actions">
            <div className="total-time"><span>Gesamt</span><strong>{formatSeconds(total)}</strong></div>
            <button className="secondary-btn" onClick={openHistory}><History size={17} /> History</button>
            <button className="secondary-btn" onClick={save}><Save size={17} /> {saveState || 'Speichern'}</button>
            <button className="primary-btn" onClick={() => setRunner(true)} disabled={workout.blocks.length === 0}><Play size={17} fill="currentColor" /> Start</button>
          </div>
        </header>

        <div className="composer">
          <div className="composer-head">
            <div><span className="section-kicker">Ablauf</span><h2>Workout Timeline</h2></div>
            <span className="composer-hint">Blöcke ziehen, um die Reihenfolge zu ändern</span>
          </div>
          <div className="timeline-line" />
          <DndContext sensors={sensors} onDragEnd={dragEnd}>
            <SortableContext items={workout.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <div className="blocks">
                {workout.blocks.map((block, index) => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    index={index}
                    onChange={(next) => setWorkout((w) => ({ ...w, blocks: w.blocks.map((b) => b.id === block.id ? next : b) }))}
                    onDelete={() => setWorkout((w) => ({ ...w, blocks: w.blocks.filter((b) => b.id !== block.id) }))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {workout.blocks.length === 0 && <div className="empty-composer"><Activity size={34} /><h3>Leere Timeline</h3><p>Wähle links einen Blocktyp aus und stelle ihn anschließend hier ein.</p></div>}
        </div>
      </main>
      {exerciseManagerOpen && <ExerciseManager open={exerciseManagerOpen} onClose={() => setExerciseManagerOpen(false)} />}
      {runner && <WorkoutRunner workout={workout} onClose={() => setRunner(false)} onHistorySaved={refreshHistory} />}
      {historyOpen && <HistoryPanel
        entries={history}
        pendingCount={historyPending}
        onClose={() => setHistoryOpen(false)}
        onDelete={async (id) => { await api.deleteHistory(id); setHistory(await api.listHistory()) }}
        onLoadWorkout={(snapshot) => { setWorkout({ ...snapshot, id: undefined, title: `${snapshot.title} (Kopie)` }); setHistoryOpen(false) }}
      />}
    </div>
  )
}
