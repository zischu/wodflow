import { useState } from 'react'
import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'
import { Clock3, Dumbbell, GripVertical, Plus, Repeat2, RotateCcw, Trash2, X } from 'lucide-react'
import type { EmomBlock, EmomInterval, ExerciseRef, WorkoutBlock } from '../types'
import { formatSeconds, blockDuration } from '../lib/time'
import { ExercisePicker } from './ExercisePicker'

const labels = {
  timer: { title: 'Timer', icon: Clock3 },
  amrap: { title: 'AMRAP', icon: RotateCcw },
  emom: { title: 'EMOM', icon: Repeat2 },
  rounds: { title: 'Runden', icon: Dumbbell },
}

interface Props {
  block: WorkoutBlock
  index: number
  onChange: (block: WorkoutBlock) => void
  onDelete: () => void
}

function NumberField({ label, value, onChange, min = 0, suffix }: { label: string; value: number; onChange: (n: number) => void; min?: number; suffix?: string }) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input type="number" min={min} value={value} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))} />
      {suffix && <em>{suffix}</em>}
    </label>
  )
}

function ExerciseStrip({ exercises, onChange, label = 'Übungen' }: { exercises: ExerciseRef[]; onChange: (items: ExerciseRef[]) => void; label?: string }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  function updateExercise(i: number, patch: Partial<ExerciseRef>) {
    const next = [...exercises]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }

  return (
    <div className="exercise-area nested-exercise-area">
      <div className="exercise-area-label">{label} <span>Wiederholungen direkt festlegen</span></div>
      <div className="exercise-strip">
        {exercises.map((exercise, i) => (
          <div className="exercise-chip" key={`${exercise.provider_id ?? exercise.name}-${i}`}>
            <div className="chip-image">
              {exercise.image_url ? <img src={exercise.image_url} alt="" /> : <span>{exercise.name.slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="chip-copy">
              <strong>{exercise.name}</strong>
              <div className="chip-reps">
                <input
                  type="number"
                  min="1"
                  value={exercise.reps ?? ''}
                  placeholder="Wdh."
                  onChange={(e) => updateExercise(i, { reps: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
            </div>
            <button className="chip-remove" onClick={() => onChange(exercises.filter((_, j) => j !== i))}><X size={14} /></button>
          </div>
        ))}
        <button className="add-exercise" onClick={() => setPickerOpen(true)}><Plus size={18} /> Übung</button>
      </div>
      <ExercisePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(exercise) => onChange([...exercises, exercise])} />
    </div>
  )
}

function normalizeEmom(block: EmomBlock): EmomBlock {
  if (block.intervals?.length) return block
  return {
    ...block,
    intervals: [{
      id: crypto.randomUUID(),
      name: 'Minute 1',
      duration_seconds: block.interval_seconds ?? 60,
      exercises: block.exercises ?? [],
    }],
    exercises: [],
  }
}

function EmomEditor({ block, onChange }: { block: EmomBlock; onChange: (block: EmomBlock) => void }) {
  const normalized = normalizeEmom(block)

  function updateInterval(id: string, patch: Partial<EmomInterval>) {
    onChange({ ...normalized, intervals: normalized.intervals.map((interval) => interval.id === id ? { ...interval, ...patch } : interval) })
  }

  function addInterval() {
    const number = normalized.intervals.length + 1
    onChange({
      ...normalized,
      intervals: [...normalized.intervals, { id: crypto.randomUUID(), name: `Minute ${number}`, duration_seconds: 60, exercises: [] }],
    })
  }

  return (
    <div className="emom-editor">
      <div className="block-config emom-cycle-config">
        <NumberField label="Sequenz wiederholen" value={normalized.rounds} min={1} suffix="×" onChange={(rounds) => onChange({ ...normalized, rounds })} />
        <span className="emom-help">Jedes Intervall kann eigene Übungen, Wiederholungen und Dauer besitzen.</span>
      </div>
      <div className="emom-intervals">
        {normalized.intervals.map((interval, index) => (
          <div className="emom-interval" key={interval.id}>
            <div className="emom-interval-head">
              <span className="emom-minute-index">{String(index + 1).padStart(2, '0')}</span>
              <input value={interval.name} onChange={(e) => updateInterval(interval.id, { name: e.target.value })} />
              <NumberField label="Dauer" value={interval.duration_seconds} min={5} suffix="s" onChange={(duration_seconds) => updateInterval(interval.id, { duration_seconds })} />
              <button className="icon-btn danger" disabled={normalized.intervals.length === 1} onClick={() => onChange({ ...normalized, intervals: normalized.intervals.filter((x) => x.id !== interval.id) })}><Trash2 size={15} /></button>
            </div>
            <ExerciseStrip exercises={interval.exercises} label="Übungen in diesem Intervall" onChange={(exercises) => updateInterval(interval.id, { exercises })} />
          </div>
        ))}
        <button className="add-emom-interval" onClick={addInterval}><Plus size={16} /> Intervall hinzufügen</button>
      </div>
    </div>
  )
}

export function BlockCard({ block, index, onChange, onDelete }: Props) {
  const sortable = useSortable({ id: block.id })
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }
  const meta = labels[block.type]
  const Icon = meta.icon

  return (
    <div ref={sortable.setNodeRef} style={style} className={`block-card block-${block.type} ${sortable.isDragging ? 'dragging' : ''}`}>
      <div className="block-accent" />
      <div className="block-card-main">
        <div className="block-head">
          <button className="drag-handle" {...sortable.attributes} {...sortable.listeners} aria-label="Block verschieben"><GripVertical size={21} /></button>
          <div className="block-index">{String(index + 1).padStart(2, '0')}</div>
          <div className="block-kind"><Icon size={17} /><span>{meta.title}</span></div>
          <input className="block-title-input" value={block.name} onChange={(e) => onChange({ ...block, name: e.target.value } as WorkoutBlock)} />
          <div className="block-duration">{formatSeconds(blockDuration(block))}</div>
          <button className="icon-btn danger" onClick={onDelete} title="Block löschen"><Trash2 size={17} /></button>
        </div>

        {block.type !== 'emom' && (
          <div className="block-config">
            {(block.type === 'timer' || block.type === 'amrap') && <>
              <NumberField label="Minuten" value={Math.floor(block.duration_seconds / 60)} min={0} suffix="min" onChange={(minutes) => onChange({ ...block, duration_seconds: Math.max(1, minutes * 60 + (block.duration_seconds % 60)) })} />
              <NumberField label="Sekunden" value={block.duration_seconds % 60} min={0} suffix="s" onChange={(seconds) => onChange({ ...block, duration_seconds: Math.max(1, Math.floor(block.duration_seconds / 60) * 60 + Math.min(59, seconds)) })} />
            </>}
            {block.type === 'rounds' && <>
              <NumberField label="Runden" value={block.rounds} min={1} onChange={(rounds) => onChange({ ...block, rounds })} />
              <NumberField label="Work" value={block.work_seconds} min={1} suffix="s" onChange={(work_seconds) => onChange({ ...block, work_seconds })} />
              <NumberField label="Rest" value={block.rest_seconds} suffix="s" onChange={(rest_seconds) => onChange({ ...block, rest_seconds })} />
            </>}
          </div>
        )}

        {block.type === 'emom' ? (
          <EmomEditor block={block} onChange={(next) => onChange(next)} />
        ) : (
          <ExerciseStrip exercises={block.exercises} onChange={(exercises) => onChange({ ...block, exercises } as WorkoutBlock)} />
        )}
      </div>
    </div>
  )
}
