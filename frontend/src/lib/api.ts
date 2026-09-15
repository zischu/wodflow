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

function pickTranslation(item: Record<string, unknown>): Record<string, unknown> | null {
  const raw = item.translations ?? item.translation
  const translations = Array.isArray(raw) ? raw as Record<string, unknown>[] : raw && typeof raw === 'object' ? [raw as Record<string, unknown>] : []
  if (!translations.length) return null
  const english = translations.find((entry) => ['2', 'en', 'en-US'].includes(String(entry.language)))
  return english ?? translations[0]
}

function pickImage(item: Record<string, unknown>): string | null {
  const raw = item.images
  const images = Array.isArray(raw) ? raw as Record<string, unknown>[] : []
  if (!images.length) return null

  const main = images.find((image) => image.is_main === true) ?? images[0]
  const thumbnails = main.thumbnails && typeof main.thumbnails === 'object'
    ? main.thumbnails as Record<string, unknown>
    : {}

  // Prefer the original image. wger thumbnail URLs can be present before the
  // generated thumbnail itself is actually available, which otherwise leaves
  // us with a broken URL. Also ignore empty strings instead of treating them
  // as a valid nullish-coalescing candidate.
  const candidates = [main.image, thumbnails.medium, thumbnails.small]
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean)

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate, 'https://wger.de/')
      if (url.protocol === 'http:') url.protocol = 'https:'
      return url.href
    } catch {
      // Try the next candidate.
    }
  }

  return null
}

function mapWgerExercise(item: Record<string, unknown>): ExerciseSearchResult | null {
  const translation = pickTranslation(item)
  const name = String(translation?.name ?? translation?.name_original ?? item.name ?? '').trim()
  if (!name) return null
  const rawCategory = item.category
  const category = rawCategory && typeof rawCategory === 'object' ? String((rawCategory as Record<string, unknown>).name ?? '') : rawCategory ? String(rawCategory) : null
  const rawEquipment = Array.isArray(item.equipment) ? item.equipment : []
  const equipment = rawEquipment.map((value) => typeof value === 'object' && value ? String((value as Record<string, unknown>).name ?? '') : String(value)).filter(Boolean)
  const providerId = String(item.id ?? item.uuid ?? name)
  return {
    provider: 'wger',
    provider_id: providerId,
    name,
    image_url: pickImage(item),
    category,
    equipment,
    description: typeof translation?.description === 'string' ? translation.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null,
  }
}

async function syncWger(maxPages = 5): Promise<ExerciseSyncResult> {
  let fetched = 0
  let upserted = 0
  let offset = 0
  const limit = 100
  const db = await openDb()

  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetch(`https://wger.de/api/v2/exerciseinfo/?limit=${limit}&offset=${offset}`, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`wger Sync fehlgeschlagen (${response.status})`)
    const payload = await response.json() as { results?: Record<string, unknown>[]; next?: string | null }
    const items = payload.results ?? []
    if (!items.length) break

    const tx = db.transaction(EXERCISES, 'readwrite')
    const store = tx.objectStore(EXERCISES)
    for (const item of items) {
      const exercise = mapWgerExercise(item)
      if (!exercise) continue
      fetched += 1
      const stored: StoredExercise = { ...exercise, key: exerciseKey(exercise) }
      store.put(stored)
      upserted += 1
    }
    await txDone(tx)
    if (!payload.next || items.length < limit) break
    offset += limit
  }

  return { fetched, upserted, images_cached: 0, image_errors: 0 }
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
      .filter((item) => item.name.toLocaleLowerCase('de-DE').includes(needle))
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
      wger: items.filter((item) => item.provider === 'wger').length,
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

  syncExercises: () => syncWger(),

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
