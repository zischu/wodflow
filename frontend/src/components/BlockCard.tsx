import { useEffect, useState } from 'react'
import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'
import { Clock3, Dumbbell, GripVertical, Plus, Repeat2, RotateCcw, Trash2, X } from 'lucide-react'
import type { EmomBlock, EmomInterval, ExerciseRef, WorkoutBlock } from '../types'
import { formatSeconds, blockDuration } from '../lib/time'
import { ExercisePicker } from './ExercisePicker'
import { ExerciseArtwork } from './ExerciseArtwork'

const labels = {
  timer: { title: 'Timer', icon: Clock3 },
  amrap: { title: 'AMRAP', icon: RotateCcw },
  emom: { title: 'EMOM', icon: Repeat2 },
  rounds: { title: 'Work / Rest', icon: Dumbbell },
}

interface Props {
  block: WorkoutBlock
  index: number
  onChange: (block: WorkoutBlock) => void
  onDelete: () => void
}

function clampInteger(value: number, min: number, max?: number): number {
  const integer = Math.round(value)
  return Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, integer))
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  suffix,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  suffix?: string
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => setDraft(String(value)), [value])

  function commit() {
    const parsed = Number(draft)
    const next = clampInteger(Number.isFinite(parsed) ? parsed : min, min, max)
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="numeric"
        step="1"
        min={min}
        max={max}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        aria-label={label}
      />
      {suffix && <em>{suffix}</em>}
    </label>
  )
}

function RepsField({ value, onChange }: { value?: number | null; onChange: (value: number | null) => void }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))

  useEffect(() => setDraft(value == null ? '' : String(value)), [value])

  function commit() {
    if (!draft.trim()) {
      setDraft('')
      if (value != null) onChange(null)
      return
    }
    const parsed = Number(draft)
    const next = clampInteger(Number.isFinite(parsed) ? parsed : 1, 1)
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      step="1"
      min="1"
      value={draft}
      placeholder="Wdh."
      aria-label="Wiederholungen"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

function ExerciseStrip({
  exercises,
  onChange,
  label = 'Übungen',
}: {
  exercises: ExerciseRef[]
  onChange: (items: ExerciseRef[]) => void
  label?: string
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  function updateExercise(index: number, patch: Partial<ExerciseRef>) {
    const next = [...exercises]
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  return (
    <div className="exercise-area nested-exercise-area">
      <div className="exercise-area-label">
        {label}
        <span>Wiederholungen optional direkt festlegen</span>
      </div>
      <div className="exercise-strip">
        {exercises.map((exercise, index) => (
          <div className="exercise-chip" key={`${exercise.provider_id ?? exercise.name}-${index}`}>
            <div className="chip-image">
              <ExerciseArtwork src={exercise.image_url} name={exercise.name} />
            </div>
            <div className="chip-copy">
              <strong title={exercise.name}>{exercise.name}</strong>
              <div className="chip-reps">
                <RepsField value={exercise.reps} onChange={(reps) => updateExercise(index, { reps })} />
              </div>
            </div>
            <button
              type="button"
              className="chip-remove"
              onClick={() => onChange(exercises.filter((_, itemIndex) => itemIndex !== index))}
              aria-label={`${exercise.name} entfernen`}
              title="Übung entfernen"
            >
              <X size={15} />
            </button>
          </div>
        ))}
        <button type="button" className="add-exercise" onClick={() => setPickerOpen(true)}>
          <Plus size={18} /> Übung
        </button>
      </div>
      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(exercise) => onChange([...exercises, exercise])}
      />
    </div>
  )
}

function normalizeEmom(block: EmomBlock): EmomBlock {
  if (block.intervals?.length) return block
  return {
    ...block,
    intervals: [{
      id: `${block.id}-legacy-interval`,
      name: 'Intervall 1',
      duration_seconds: block.interval_seconds ?? 60,
      exercises: block.exercises ?? [],
    }],
    exercises: [],
  }
}

function EmomEditor({ block, onChange }: { block: EmomBlock; onChange: (block: EmomBlock) => void }) {
  const normalized = normalizeEmom(block)

  function updateInterval(id: string, patch: Partial<EmomInterval>) {
    onChange({
      ...normalized,
      intervals: normalized.intervals.map((interval) => interval.id === id ? { ...interval, ...patch } : interval),
    })
  }

  function addInterval() {
    const number = normalized.intervals.length + 1
    onChange({
      ...normalized,
      intervals: [
        ...normalized.intervals,
        { id: crypto.randomUUID(), name: `Intervall ${number}`, duration_seconds: 60, exercises: [] },
      ],
    })
  }

  return (
    <div className="emom-editor">
      <div className="block-config emom-cycle-config">
        <NumberField
          label="Sequenz"
          value={normalized.rounds}
          min={1}
          suffix="×"
          onChange={(rounds) => onChange({ ...normalized, rounds })}
        />
        <span className="emom-help">Die Intervalle werden in dieser Reihenfolge wiederholt.</span>
      </div>
      <div className="emom-intervals">
        {normalized.intervals.map((interval, index) => (
          <div className="emom-interval" key={interval.id}>
            <div className="emom-interval-head">
              <span className="emom-minute-index">{String(index + 1).padStart(2, '0')}</span>
              <input
                value={interval.name}
                onChange={(event) => updateInterval(interval.id, { name: event.target.value })}
                aria-label={`Name von Intervall ${index + 1}`}
              />
              <NumberField
                label="Dauer"
                value={interval.duration_seconds}
                min={1}
                suffix="s"
                onChange={(duration_seconds) => updateInterval(interval.id, { duration_seconds })}
              />
              <button
                type="button"
                className="icon-btn danger"
                disabled={normalized.intervals.length === 1}
                onClick={() => onChange({
                  ...normalized,
                  intervals: normalized.intervals.filter((item) => item.id !== interval.id),
                })}
                aria-label={`Intervall ${index + 1} löschen`}
                title="Intervall löschen"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <ExerciseStrip
              exercises={interval.exercises}
              label="Übungen in diesem Intervall"
              onChange={(exercises) => updateInterval(interval.id, { exercises })}
            />
          </div>
        ))}
        <button type="button" className="add-emom-interval" onClick={addInterval}>
          <Plus size={16} /> Intervall hinzufügen
        </button>
      </div>
    </div>
  )
}

export function BlockCard({ block, index, onChange, onDelete }: Props) {
  const sortable = useSortable({ id: block.id })
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  }
  const meta = labels[block.type]
  const Icon = meta.icon

  function deleteBlock() {
    const label = block.name.trim() || meta.title
    if (window.confirm(`Block „${label}“ wirklich löschen?`)) onDelete()
  }

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={`block-card block-${block.type} ${sortable.isDragging ? 'dragging' : ''}`}
    >
      <div className="block-accent" />
      <div className="block-card-main">
        <div className="block-head">
          <button
            type="button"
            className="drag-handle"
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label={`Block ${index + 1} verschieben`}
            title="Block verschieben"
          >
            <GripVertical size={21} />
          </button>
          <div className="block-index">{String(index + 1).padStart(2, '0')}</div>
          <div className="block-kind"><Icon size={17} /><span>{meta.title}</span></div>
          <input
            className="block-title-input"
            value={block.name}
            onChange={(event) => onChange({ ...block, name: event.target.value } as WorkoutBlock)}
            aria-label={`Name von Block ${index + 1}`}
          />
          <div className="block-duration">{formatSeconds(blockDuration(block))}</div>
          <button
            type="button"
            className="icon-btn danger"
            onClick={deleteBlock}
            aria-label={`Block ${index + 1} löschen`}
            title="Block löschen"
          >
            <Trash2 size={17} />
          </button>
        </div>

        {block.type !== 'emom' && (
          <div className="block-config">
            {(block.type === 'timer' || block.type === 'amrap') && <>
              <NumberField
                label="Minuten"
                value={Math.floor(block.duration_seconds / 60)}
                min={0}
                suffix="min"
                onChange={(minutes) => onChange({
                  ...block,
                  duration_seconds: Math.max(1, minutes * 60 + (block.duration_seconds % 60)),
                })}
              />
              <NumberField
                label="Sekunden"
                value={block.duration_seconds % 60}
                min={0}
                max={59}
                suffix="s"
                onChange={(seconds) => onChange({
                  ...block,
                  duration_seconds: Math.max(1, Math.floor(block.duration_seconds / 60) * 60 + seconds),
                })}
              />
            </>}
            {block.type === 'rounds' && <>
              <NumberField label="Runden" value={block.rounds} min={1} onChange={(rounds) => onChange({ ...block, rounds })} />
              <NumberField label="Work" value={block.work_seconds} min={1} suffix="s" onChange={(work_seconds) => onChange({ ...block, work_seconds })} />
              <NumberField label="Rest" value={block.rest_seconds} min={0} suffix="s" onChange={(rest_seconds) => onChange({ ...block, rest_seconds })} />
            </>}
          </div>
        )}

        {block.type === 'emom'
          ? <EmomEditor block={block} onChange={onChange} />
          : <ExerciseStrip exercises={block.exercises} onChange={(exercises) => onChange({ ...block, exercises } as WorkoutBlock)} />}
      </div>
    </div>
  )
}
