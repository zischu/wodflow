import { useEffect, useMemo, useState } from 'react'
import { Database, ImageOff, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { api } from '../lib/api'
import type { ExerciseLibraryStats, ExerciseSearchResult } from '../types'

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
  const [error, setError] = useState('')

  async function refresh(search = query) {
    setLoading(true)
    setError('')
    try {
      const [nextStats, nextItems] = await Promise.all([
        api.exerciseStats(),
        search.trim() ? api.searchExercises(search.trim(), 200) : api.listExercises(200),
      ])
      setStats(nextStats)
      setItems(nextItems)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Exercise Library konnte nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void refresh('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => { void refresh(query) }, 180)
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open])

  const customCount = useMemo(() => items.filter((item) => item.provider === 'local' && !item.provider_id.startsWith('builtin-')).length, [items])

  if (!open) return null

  async function syncRepDb() {
    setSyncing(true)
    setError('')
    try {
      await api.syncExercises()
      await refresh(query)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'RepDB-Synchronisierung fehlgeschlagen')
    } finally {
      setSyncing(false)
    }
  }

  async function addCustomExercise() {
    const name = newExercise.trim()
    if (!name) return
    try {
      await api.createExercise(name)
      setNewExercise('')
      await refresh(query)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eigene Übung konnte nicht angelegt werden')
    }
  }

  async function removeExercise(item: ExerciseSearchResult) {
    if (item.provider !== 'local' || item.provider_id.startsWith('builtin-')) return
    await api.deleteExercise(item.provider, item.provider_id)
    await refresh(query)
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal exercise-manager-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Exercise Manager</h2>
            <p className="library-summary"><Database size={13} /> Lokale Exercise Library verwalten</p>
          </div>
          <div className="modal-head-actions">
            <button className="secondary-btn compact" onClick={syncRepDb} disabled={syncing || !navigator.onLine}>
              <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'RepDB …' : 'RepDB Sync'}
            </button>
            <button className="icon-btn" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        <div className="exercise-manager-stats">
          <div><span>Gesamt</span><strong>{stats?.total ?? '–'}</strong></div>
          <div><span>RepDB</span><strong>{stats?.repdb ?? '–'}</strong></div>
          <div><span>Lokal</span><strong>{stats?.local ?? '–'}</strong></div>
          <div><span>Mit Bild</span><strong>{stats?.with_images ?? '–'}</strong></div>
        </div>

        <div className="exercise-manager-create">
          <input
            value={newExercise}
            onChange={(e) => setNewExercise(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addCustomExercise() }}
            placeholder="Eigene Übung anlegen …"
          />
          <button className="primary-btn" disabled={!newExercise.trim()} onClick={addCustomExercise}><Plus size={16} /> Anlegen</button>
        </div>

        <div className="search-box">
          <Search size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Exercise Library durchsuchen …" />
        </div>

        {error && <div className="error-box exercise-manager-error">{error}</div>}
        <div className="exercise-manager-meta">
          <span>{loading ? 'Lädt …' : `${items.length} angezeigt`}</span>
          {customCount > 0 && <span>{customCount} eigene Übungen in dieser Ansicht</span>}
        </div>

        <div className="exercise-results exercise-manager-results">
          {!loading && items.length === 0 && !error && <div className="empty">Keine Übungen gefunden.</div>}
          {items.map((item) => {
            const removable = item.provider === 'local' && !item.provider_id.startsWith('builtin-')
            return (
              <div className="exercise-manager-row" key={`${item.provider}-${item.provider_id}`}>
                <div className="exercise-thumb">
                  {item.image_url ? <img src={item.image_url} alt="" /> : <ImageOff size={22} />}
                </div>
                <div className="exercise-result-copy">
                  <strong>{item.name}</strong>
                  <span>{item.category || 'Übung'} · {item.provider === 'repdb' ? 'RepDB' : removable ? 'eigene Übung' : 'WODFlow'}</span>
                </div>
                {removable && (
                  <button className="icon-btn danger" title="Eigene Übung löschen" onClick={() => void removeExercise(item)}>
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="modal-foot">
          <span className="muted">RepDB-Inhalte werden lokal in IndexedDB gespeichert. Eigene Übungen bleiben unabhängig vom Sync erhalten.</span>
          <a className="repdb-attribution" href="https://repdb.co" target="_blank" rel="noreferrer">Exercise data by RepDB (repdb.co)</a>
        </div>
      </div>
    </div>
  )
}
