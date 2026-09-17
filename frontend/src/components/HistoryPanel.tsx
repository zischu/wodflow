import { History, Play, Trash2, X } from 'lucide-react'
import type { Workout, WorkoutHistoryEntry } from '../types'
import { formatSeconds } from '../lib/time'
import { useDialog } from '../lib/dialog'

export function HistoryPanel({
  entries,
  pendingCount,
  onClose,
  onDelete,
  onLoadWorkout,
}: {
  entries: WorkoutHistoryEntry[]
  pendingCount: number
  onClose: () => void
  onDelete: (id: number) => Promise<void> | void
  onLoadWorkout: (workout: Workout) => void
}) {
  useDialog(true, onClose)

  async function deleteEntry(entry: WorkoutHistoryEntry) {
    if (!window.confirm(`Training „${entry.workout_title}“ aus dem Verlauf löschen?`)) return
    await onDelete(entry.id)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="history-title">Trainingsverlauf</h2>
            <p>
              <History size={13} /> Abgeschlossene und abgebrochene Trainings
              {pendingCount > 0 ? ` · ${pendingCount} lokal vorgemerkt` : ''}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Dialog schließen">
            <X size={20} />
          </button>
        </div>

        <div className="history-list">
          {entries.length === 0 && <div className="empty">Noch kein Training im Verlauf.</div>}
          {entries.map((entry) => {
            const started = new Date(entry.started_at)
            const progress = entry.total_phases > 0
              ? Math.min(100, Math.max(0, Math.round(entry.completed_phases / entry.total_phases * 100)))
              : 0
            return (
              <div className="history-row" key={entry.id}>
                <div className={`history-status ${entry.status}`}>
                  {entry.status === 'completed' ? 'FERTIG' : 'ABBRUCH'}
                </div>
                <div className="history-main">
                  <strong>{entry.workout_title}</strong>
                  <span>
                    {Number.isNaN(started.getTime()) ? 'Unbekanntes Datum' : started.toLocaleString('de-DE')}
                    {' · '}{formatSeconds(entry.elapsed_seconds)} aktiv · {progress}% Ablauf
                  </span>
                </div>
                <button
                  type="button"
                  className="secondary-btn compact"
                  onClick={() => onLoadWorkout(entry.workout_snapshot)}
                  title="Workout-Kopie in den Editor laden"
                >
                  <Play size={14} /> Laden
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => void deleteEntry(entry)}
                  title="Verlaufseintrag löschen"
                  aria-label={`${entry.workout_title} aus dem Verlauf löschen`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
