import { useEffect, useState } from 'react'
import { Database, ImageOff, RefreshCw, Search, X } from 'lucide-react'
import { api } from '../lib/api'
import type { ExerciseLibraryStats, ExerciseRef, ExerciseSearchResult } from '../types'

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
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const current = await api.exerciseStats()
        if (cancelled) return
        setStats(current)
        if (current.repdb === 0 && navigator.onLine) {
          setSyncing(true)
          await api.syncExercises()
          if (!cancelled) setStats(await api.exerciseStats())
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'RepDB konnte nicht geladen werden')
      } finally {
        if (!cancelled) setSyncing(false)
      }
    })()
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!open || query.trim().length < 1) {
      setResults([])
      return
    }
    const handle = window.setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        setResults(await api.searchExercises(query.trim()))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lokale Übungssuche fehlgeschlagen')
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => window.clearTimeout(handle)
  }, [query, open])

  if (!open) return null

  async function syncLibrary() {
    setSyncing(true)
    setError('')
    try {
      await api.syncExercises()
      setStats(await api.exerciseStats())
      if (query.trim()) setResults(await api.searchExercises(query.trim()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Synchronisierung fehlgeschlagen')
    } finally {
      setSyncing(false)
    }
  }

  async function createCustom() {
    const name = query.trim()
    if (!name) return
    try {
      const result = await api.createExercise(name)
      onSelect({ provider: result.provider, provider_id: result.provider_id, name: result.name, image_url: result.image_url })
    } catch {
      // Offline fallback: the WOD can still reference the exercise, even if it
      // cannot be persisted to the server-side library right now.
      onSelect({ provider: 'local', name })
    }
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Übung hinzufügen</h2>
            <p className="library-summary"><Database size={13} /> Lokale Exercise-Datenbank {stats ? `· ${stats.total} Übungen · ${stats.with_images} mit Bild` : ''}</p>
          </div>
          <div className="modal-head-actions">
            <button className="secondary-btn compact" onClick={syncLibrary} disabled={syncing} title="RepDB Free in die lokale Exercise-Datenbank synchronisieren">
              <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'RepDB …' : 'RepDB Sync'}
            </button>
            <button className="icon-btn" onClick={onClose}><X size={20} /></button>
          </div>
        </div>
        <div className="search-box">
          <Search size={18} />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="z. B. push up, squat, lunge …" />
        </div>
        <div className="exercise-results">
          {loading && <div className="empty">Suche in lokaler Datenbank …</div>}
          {error && <div className="error-box">{error}</div>}
          {!loading && !error && query.length > 0 && results.length === 0 && <div className="empty">Keine lokale Übung gefunden.</div>}
          {results.map((result) => (
            <button
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
                {result.image_url ? <img src={result.image_url} alt="" /> : <ImageOff size={22} />}
              </div>
              <div className="exercise-result-copy">
                <strong>{result.name}</strong>
                <span>{result.category || 'Übung'} · {result.provider === 'repdb' ? 'RepDB' : 'lokal'}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="modal-foot">
          <button className="secondary-btn" disabled={!query.trim()} onClick={createCustom}>
            „{query.trim() || 'Eigene Übung'}“ als eigene lokale Übung anlegen
          </button>
          <a className="repdb-attribution" href="https://repdb.co" target="_blank" rel="noreferrer">Exercise data by RepDB (repdb.co)</a>
        </div>
      </div>
    </div>
  )
}
