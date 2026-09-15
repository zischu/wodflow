import type {
  ExerciseLibraryStats,
  ExerciseSearchResult,
  ExerciseSyncResult,
  Workout,
  WorkoutHistoryEntry,
  WorkoutHistoryInput,
} from '../types'

const DB_NAME = 'wodflow'
const DB_VERSION = 1
const WORKOUTS = 'workouts'
const HISTORY = 'history'
const EXERCISES = 'exercises'
const HISTORY_QUEUE_KEY = 'wodflow.pending-history.v2'

const BUILTIN_EXERCISES: ExerciseSearchResult[] = [
  'Air Squat', 'Push-up', 'Reverse Lunge', 'Forward Lunge', 'Glute Bridge', 'Plank',
  'Side Plank', 'High Knees', 'Squat to Reach', 'Mountain Climbers', 'Shadow Boxing',
  'Burpee', 'Sit-up', 'Crunch', 'Superman', 'Bear Crawl', 'Jumping Jack', 'Step Jack',
  'Hip Hinge', 'Good Morning', 'Calf Raise', 'Wall Sit', 'Dead Bug', 'Bird Dog',
  'Pike Push-up', 'Diamond Push-up', 'Incline Push-up', 'Single-leg Glute Bridge',
  'Skater Step', 'Inchworm', 'Hollow Hold', 'Leg Raise',
].map((name) => ({
  provider: 'local',
  provider_id: `builtin-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  name,
  image_url: null,
  category: 'Bodyweight',
  equipment: [],
  description: 'Built-in WODFlow exercise',
}))

type StoredWorkout = Workout & { id: number; created_at: string; updated_at: string }
type StoredExercise = ExerciseSearchResult & { key: string }

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(WORKOUTS)) db.createObjectStore(WORKOUTS, { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains(HISTORY)) db.createObjectStore(HISTORY, { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains(EXERCISES)) db.createObjectStore(EXERCISES, { keyPath: 'key' })
    }
    request.onsuccess = async () => {
      const db = request.result
      db.onversionchange = () => db.close()
      try {
        await seedExercises(db)
        resolve(db)
      } catch (error) {
        reject(error)
      }
    }
    request.onerror = () => reject(request.error ?? new Error('IndexedDB konnte nicht geöffnet werden'))
  })
  return dbPromise
}

async function seedExercises(db: IDBDatabase): Promise<void> {
  const countTx = db.transaction(EXERCISES, 'readonly')
  const count = await req(countTx.objectStore(EXERCISES).count())
  await txDone(countTx)
  if (count > 0) return

  const tx = db.transaction(EXERCISES, 'readwrite')
  const store = tx.objectStore(EXERCISES)
  for (const exercise of BUILTIN_EXERCISES) {
    const stored: StoredExercise = { ...exercise, key: `${exercise.provider}:${exercise.provider_id}` }
    store.put(stored)
  }
  await txDone(tx)
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readonly')
  const items = await req(tx.objectStore(storeName).getAll()) as T[]
  await txDone(tx)
  return items
}

async function deleteById(storeName: string, id: number): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(storeName, 'readwrite')
  tx.objectStore(storeName).delete(id)
  await txDone(tx)
}

function exerciseKey(exercise: ExerciseSearchResult): string {
  return `${exercise.provider}:${exercise.provider_id}`
}

function readPendingHistory(): WorkoutHistoryInput[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_QUEUE_KEY) ?? '[]') as WorkoutHistoryInput[]
  } catch {
    return []
  }
}

function writePendingHistory(items: WorkoutHistoryInput[]) {
  localStorage.setItem(HISTORY_QUEUE_KEY, JSON.stringify(items))
}

const REPDB_DATA_URL = 'https://raw.githubusercontent.com/RepDB/exercise-dataset/main/exercises.json'
const REPDB_ASSET_BASE = 'https://raw.githubusercontent.com/RepDB/exercise-dataset/main/'

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function repDbImageUrl(item: Record<string, unknown>): string | null {
  const images = item.images && typeof item.images === 'object' ? item.images as Record<string, unknown> : {}
  const flat = images.flat && typeof images.flat === 'object' ? images.flat as Record<string, unknown> : {}
  const relative = asString(flat.peak) || asString(flat.main) || asString(flat.start)
  if (!relative) return null
  try { return new URL(relative, REPDB_ASSET_BASE).href } catch { return null }
}

function mapRepDbExercise(item: Record<string, unknown>): ExerciseSearchResult | null {
  const nameDe = asString(item.name_de)
  const nameEn = asString(item.name_en)
  const nameEs = asString(item.name_es)
  const name = nameDe || nameEn || nameEs
  const providerId = asString(item.id)
  if (!name || !providerId) return null

  const equipmentRaw = item.equipment
  const equipment = Array.isArray(equipmentRaw)
    ? equipmentRaw.map(asString).filter(Boolean)
    : asString(equipmentRaw) ? [asString(equipmentRaw)] : []

  const aliases = [nameDe, nameEn, nameEs].filter((value, index, values) => value && values.indexOf(value) === index)
  const category = asString(item.category) || asString(item.body_part) || null
  const description = asString(item.description_de) || asString(item.description_en) || asString(item.description_es) || null

  return {
    provider: 'repdb',
    provider_id: providerId,
    name,
    aliases,
    image_url: repDbImageUrl(item),
    category,
    equipment,
    description,
  }
}

async function syncRepDb(): Promise<ExerciseSyncResult> {
  const response = await fetch(REPDB_DATA_URL, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`RepDB Sync fehlgeschlagen (${response.status})`)
  const payload = await response.json() as { exercises?: Record<string, unknown>[] }
  const items = payload.exercises ?? []
  if (!items.length) throw new Error('RepDB lieferte keine Übungen')

  const mapped = items.map(mapRepDbExercise).filter((item): item is ExerciseSearchResult => Boolean(item))
  const db = await openDb()

  // Replace old external-provider data atomically enough for a local-first app:
  // keep custom/built-in exercises, remove legacy wger and stale RepDB entries.
  const readTx = db.transaction(EXERCISES, 'readonly')
  const existing = await req(readTx.objectStore(EXERCISES).getAll()) as StoredExercise[]
  await txDone(readTx)

  const writeTx = db.transaction(EXERCISES, 'readwrite')
  const store = writeTx.objectStore(EXERCISES)
  for (const exercise of existing) {
    if (exercise.provider === 'wger' || exercise.provider === 'repdb') store.delete(exercise.key)
  }
  for (const exercise of mapped) {
    store.put({ ...exercise, key: exerciseKey(exercise) } satisfies StoredExercise)
  }
  await txDone(writeTx)

  return { fetched: items.length, upserted: mapped.length, images_cached: 0, image_errors: 0 }
}

export const api = {
  async listWorkouts(): Promise<Workout[]> {
    const items = await getAll<StoredWorkout>(WORKOUTS)
    return items.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  },

  async createWorkout(workout: Workout): Promise<Workout> {
    const db = await openDb()
    const now = new Date().toISOString()
    const tx = db.transaction(WORKOUTS, 'readwrite')
    const payload = { ...workout, id: undefined, created_at: now, updated_at: now }
    delete (payload as Partial<StoredWorkout>).id
    const id = Number(await req(tx.objectStore(WORKOUTS).add(payload)))
    await txDone(tx)
    return { ...payload, id }
  },

  async updateWorkout(id: number, workout: Workout): Promise<Workout> {
    const db = await openDb()
    const tx = db.transaction(WORKOUTS, 'readwrite')
    const store = tx.objectStore(WORKOUTS)
    const existing = await req(store.get(id)) as StoredWorkout | undefined
    const now = new Date().toISOString()
    const payload: StoredWorkout = {
      ...workout,
      id,
      created_at: existing?.created_at ?? workout.created_at ?? now,
      updated_at: now,
    }
    store.put(payload)
    await txDone(tx)
    return payload
  },

  deleteWorkout: (id: number) => deleteById(WORKOUTS, id),

  async searchExercises(q: string): Promise<ExerciseSearchResult[]> {
    const needle = q.trim().toLocaleLowerCase('de-DE')
    if (!needle) return []
    const items = await getAll<StoredExercise>(EXERCISES)
    return items
      .filter((item) => item.provider !== 'wger' && [item.name, ...(item.aliases ?? [])].some((value) => value.toLocaleLowerCase('de-DE').includes(needle)))
      .sort((a, b) => {
        const ae = a.name.toLocaleLowerCase('de-DE') === needle ? 0 : 1
        const be = b.name.toLocaleLowerCase('de-DE') === needle ? 0 : 1
        return ae - be || a.name.localeCompare(b.name, 'de-DE')
      })
      .slice(0, 24)
      .map(({ key: _key, ...item }) => item)
  },

  async exerciseStats(): Promise<ExerciseLibraryStats> {
    const items = await getAll<StoredExercise>(EXERCISES)
    return {
      total: items.length,
      local: items.filter((item) => item.provider === 'local').length,
      repdb: items.filter((item) => item.provider === 'repdb').length,
      with_images: items.filter((item) => Boolean(item.image_url)).length,
    }
  },

  async createExercise(name: string): Promise<ExerciseSearchResult> {
    const exercise: ExerciseSearchResult = {
      provider: 'local',
      provider_id: crypto.randomUUID(),
      name: name.trim(),
      image_url: null,
      category: 'Custom',
      equipment: [],
      description: null,
    }
    const db = await openDb()
    const tx = db.transaction(EXERCISES, 'readwrite')
    tx.objectStore(EXERCISES).put({ ...exercise, key: exerciseKey(exercise) } satisfies StoredExercise)
    await txDone(tx)
    return exercise
  },

  syncExercises: () => syncRepDb(),

  async listHistory(): Promise<WorkoutHistoryEntry[]> {
    const items = await getAll<WorkoutHistoryEntry>(HISTORY)
    return items.sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 100)
  },

  async createHistory(entry: WorkoutHistoryInput): Promise<WorkoutHistoryEntry> {
    const db = await openDb()
    const tx = db.transaction(HISTORY, 'readwrite')
    const created_at = new Date().toISOString()
    const id = Number(await req(tx.objectStore(HISTORY).add({ ...entry, created_at })))
    await txDone(tx)
    return { ...entry, id, created_at }
  },

  deleteHistory: (id: number) => deleteById(HISTORY, id),
}

export async function saveHistoryWithFallback(entry: WorkoutHistoryInput): Promise<boolean> {
  try {
    await api.createHistory(entry)
    return true
  } catch {
    writePendingHistory([...readPendingHistory(), entry])
    return false
  }
}

export async function flushPendingHistory(): Promise<number> {
  const pending = readPendingHistory()
  if (!pending.length) return 0
  const remaining: WorkoutHistoryInput[] = []
  let saved = 0
  for (const entry of pending) {
    try {
      await api.createHistory(entry)
      saved += 1
    } catch {
      remaining.push(entry)
    }
  }
  writePendingHistory(remaining)
  return saved
}

export function pendingHistoryCount(): number {
  return readPendingHistory().length
}
