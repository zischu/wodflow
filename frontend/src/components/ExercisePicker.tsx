import { useEffect, useRef, useState } from 'react'
import { Database, RefreshCw, Search, X } from 'lucide-react'
import { api } from '../lib/api'
import { useDialog } from '../lib/dialog'
import type { ExerciseLibraryStats, ExerciseRef, ExerciseSearchResult } from '../types'
import { ExerciseArtwork } from './ExerciseArtwork'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (exercise: ExerciseRef) => void
}

export function ExercisePicker({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ExerciseSearchResult[]>([])
  const [stats, setStats] = useState<ExerciseLibraryStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const sessionId = useRef(0)
  const searchRequestId = useRef(0)
  const queryRef = useRef(query)
  queryRef.current = query

  useDialog(open, onClose)

  async function loadResults(search: string, currentRequest: number) {
    setLoading(true)
    setError('')
    try {
      const items = search.trim()
        ? await api.searchExercises(search.trim(), 60)
        : await api.listExercises(60)
      if (searchRequestId.current === currentRequest) setResults(items)
    } catch (cause) {
      if (searchRequestId.current === currentRequest) {
        setError(cause instanceof Error ? cause.message : 'Übungsbibliothek konnte nicht geladen werden')
      }
    } finally {
      if (searchRequestId.current === currentRequest) setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setQuery('')
    setError('')
    const currentSession = ++sessionId.current

    void (async () => {
      try {
        let currentStats = await api.exerciseStats()
        if (sessionId.current !== currentSession) return
        setStats(currentStats)

        if (currentStats.repdb === 0 && navigator.onLine) {
          setSyncing(true)
          try {
            await api.syncExercises()
            currentStats = await api.exerciseStats()
            if (sessionId.current !== currentSession) return
            setStats(currentStats)
          } catch (cause) {
            if (sessionId.current === currentSession) {
              setError(cause instanceof Error ? cause.message : 'RepDB konnte nicht geladen werden')
            }
          }
        }
        const currentRequest = ++searchRequestId.current
        await loadResults(queryRef.current, currentRequest)
      } catch (cause) {
        if (sessionId.current === currentSession) {
          setError(cause instanceof Error ? cause.message : 'Übungsbibliothek konnte nicht geladen werden')
        }
      } finally {
        if (sessionId.current === currentSession) setSyncing(false)
      }
    })()

    return () => {
      sessionId.current += 1
      searchRequestId.current += 1
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const currentRequest = ++searchRequestId.current
    const handle = window.setTimeout(() => {
      void loadResults(query, currentRequest)
    }, 180)
    return () => window.clearTimeout(handle)
  }, [query, open])

  if (!open) return null

  async function syncLibrary() {
    const currentSession = sessionId.current
    setSyncing(true)
    setError('')
    try {
      await api.syncExercises()
      if (sessionId.current !== currentSession) return
      setStats(await api.exerciseStats())
      const currentRequest = ++searchRequestId.current
      await loadResults(queryRef.current, currentRequest)
    } catch (cause) {
      if (sessionId.current === currentSession) {
        setError(cause instanceof Error ? cause.message : 'Synchronisierung fehlgeschlagen')
      }
    } finally {
      if (sessionId.current === currentSession) setSyncing(false)
    }
  }

  async function createCustom() {
    const name = query.trim()
    if (!name || creating) return
    setCreating(true)
    setError('')
    try {
      const result = await api.createExercise(name)
      onSelect({
        provider: result.provider,
        provider_id: result.provider_id,
        name: result.name,
        image_url: result.image_url,
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Eigene Übung konnte nicht angelegt werden')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="exercise-picker-title">Übung hinzufügen</h2>
            <p className="library-summary">
              <Database size={13} /> Lokale Übungsbibliothek
              {stats ? ` · ${stats.total} Übungen · ${stats.with_images} mit Bild` : ''}
            </p>
          </div>
          <div className="modal-head-actions">
            <button
              type="button"
              className="secondary-btn compact"
              onClick={syncLibrary}
              disabled={syncing}
              title="RepDB Free mit der lokalen Übungsbibliothek synchronisieren"
            >
              <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Synchronisiert …' : 'RepDB aktualisieren'}
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Dialog schließen">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="search-box">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Übung suchen …"
            aria-label="Übung suchen"
          />
        </div>

        <div className="result-meta" aria-live="polite">
          <span>{loading ? 'Suche läuft …' : `${results.length} Treffer angezeigt`}</span>
          {!navigator.onLine && <span>Offline – lokale Daten werden verwendet</span>}
        </div>

        <div className="exercise-results">
          {error && <div className="error-box">{error}</div>}
          {!loading && results.length === 0 && !error && (
            <div className="empty">Keine passende Übung gefunden.</div>
          )}
          {results.map((result) => (
            <button
              type="button"
              key={`${result.provider}-${result.provider_id}`}
              className="exercise-result"
              onClick={() => {
                onSelect({
                  provider: result.provider,
                  provider_id: result.provider_id,
                  name: result.name,
                  image_url: result.image_url,
                })
                onClose()
              }}
            >
              <div className="exercise-thumb">
                <ExerciseArtwork src={result.image_url} name={result.name} />
              </div>
              <div className="exercise-result-copy">
                <strong>{result.name}</strong>
                <span>{result.category || 'Übung'} · {result.provider === 'repdb' ? 'RepDB' : 'lokal'}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="secondary-btn custom-exercise-btn"
            disabled={!query.trim() || creating}
            onClick={createCustom}
          >
            {creating ? 'Wird angelegt …' : `„${query.trim() || 'Eigene Übung'}“ lokal anlegen`}
          </button>
          <a className="repdb-attribution" href="https://repdb.co" target="_blank" rel="noreferrer">
            Exercise data by RepDB (repdb.co)
          </a>
        </div>
      </div>
    </div>
  )
}
