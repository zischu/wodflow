import { useEffect, useRef, useState } from 'react'
import { Database, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { api } from '../lib/api'
import { useDialog } from '../lib/dialog'
import type { ExerciseLibraryStats, ExerciseSearchResult } from '../types'
import { ExerciseArtwork } from './ExerciseArtwork'

interface Props {
  open: boolean
  onClose: () => void
}

export function ExerciseManager({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<ExerciseSearchResult[]>([])
  const [stats, setStats] = useState<ExerciseLibraryStats | null>(null)
  const [newExercise, setNewExercise] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const queryRef = useRef(query)
  queryRef.current = query

  useDialog(open, onClose)

  async function refresh(search: string, currentRequest: number) {
    setLoading(true)
    setError('')
    try {
      const [nextStats, nextItems] = await Promise.all([
        api.exerciseStats(),
        search.trim() ? api.searchExercises(search.trim(), 1000) : api.listExercises(1000),
      ])
      if (requestId.current !== currentRequest) return
      setStats(nextStats)
      setItems(nextItems)
    } catch (cause) {
      if (requestId.current === currentRequest) {
        setError(cause instanceof Error ? cause.message : 'Übungsbibliothek konnte nicht geladen werden')
      }
    } finally {
      if (requestId.current === currentRequest) setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setQuery('')
    setError('')
    return () => { requestId.current += 1 }
  }, [open])

  useEffect(() => {
    if (!open) return
    const currentRequest = ++requestId.current
    const handle = window.setTimeout(() => {
      void refresh(query, currentRequest)
    }, 180)
    return () => window.clearTimeout(handle)
  }, [query, open])

  if (!open) return null

  async function syncRepDb() {
    setSyncing(true)
    setError('')
    try {
      await api.syncExercises()
      const currentRequest = ++requestId.current
      await refresh(queryRef.current, currentRequest)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'RepDB-Synchronisierung fehlgeschlagen')
    } finally {
      setSyncing(false)
    }
  }

  async function addCustomExercise() {
    const name = newExercise.trim()
    if (!name || creating) return
    setCreating(true)
    setError('')
    try {
      await api.createExercise(name)
      setNewExercise('')
      const currentRequest = ++requestId.current
      await refresh(queryRef.current, currentRequest)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Eigene Übung konnte nicht angelegt werden')
    } finally {
      setCreating(false)
    }
  }

  async function removeExercise(item: ExerciseSearchResult) {
    if (item.provider !== 'local' || item.provider_id.startsWith('builtin-')) return
    if (!window.confirm(`Eigene Übung „${item.name}“ wirklich löschen?`)) return

    setError('')
    try {
      await api.deleteExercise(item.provider, item.provider_id)
      const currentRequest = ++requestId.current
      await refresh(queryRef.current, currentRequest)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Übung konnte nicht gelöscht werden')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal exercise-manager-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-manager-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="exercise-manager-title">Übungsverwaltung</h2>
            <p className="library-summary"><Database size={13} /> Lokale Übungsbibliothek verwalten</p>
          </div>
          <div className="modal-head-actions">
            <button type="button" className="secondary-btn compact" onClick={syncRepDb} disabled={syncing}>
              <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Synchronisiert …' : 'RepDB aktualisieren'}
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Dialog schließen">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="exercise-manager-stats">
          <div><span>Gesamt</span><strong>{stats?.total ?? '–'}</strong></div>
          <div><span>RepDB</span><strong>{stats?.repdb ?? '–'}</strong></div>
          <div><span>Eigene</span><strong>{stats?.custom ?? '–'}</strong></div>
          <div><span>Mit Bild</span><strong>{stats?.with_images ?? '–'}</strong></div>
        </div>

        <div className="exercise-manager-create">
          <input
            value={newExercise}
            onChange={(event) => setNewExercise(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addCustomExercise()
            }}
            placeholder="Eigene Übung anlegen …"
            aria-label="Name der eigenen Übung"
          />
          <button
            type="button"
            className="primary-btn"
            disabled={!newExercise.trim() || creating}
            onClick={addCustomExercise}
          >
            <Plus size={16} /> {creating ? 'Wird angelegt …' : 'Anlegen'}
          </button>
        </div>

        <div className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Übungsbibliothek durchsuchen …"
            aria-label="Übungsbibliothek durchsuchen"
          />
        </div>

        {error && <div className="error-box exercise-manager-error">{error}</div>}
        <div className="exercise-manager-meta" aria-live="polite">
          <span>{loading ? 'Lädt …' : `${items.length} Übungen angezeigt`}</span>
          <span>{stats ? `${stats.builtin} integriert · ${stats.custom} selbst angelegt` : ''}</span>
        </div>

        <div className="exercise-results exercise-manager-results">
          {!loading && items.length === 0 && !error && <div className="empty">Keine Übungen gefunden.</div>}
          {items.map((item) => {
            const removable = item.provider === 'local' && !item.provider_id.startsWith('builtin-')
            return (
              <div className="exercise-manager-row" key={`${item.provider}-${item.provider_id}`}>
                <div className="exercise-thumb">
                  <ExerciseArtwork src={item.image_url} name={item.name} />
                </div>
                <div className="exercise-result-copy">
                  <strong>{item.name}</strong>
                  <span>{item.category || 'Übung'} · {item.provider === 'repdb' ? 'RepDB' : removable ? 'eigene Übung' : 'WODFlow'}</span>
                </div>
                {removable && (
                  <button
                    type="button"
                    className="icon-btn danger"
                    title="Eigene Übung löschen"
                    aria-label={`${item.name} löschen`}
                    onClick={() => void removeExercise(item)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="modal-foot">
          <span className="muted">Metadaten werden in IndexedDB gespeichert; Bilder werden beim Anzeigen offline gecacht.</span>
          <a className="repdb-attribution" href="https://repdb.co" target="_blank" rel="noreferrer">
            Exercise data by RepDB (repdb.co)
          </a>
        </div>
      </div>
    </div>
  )
}
