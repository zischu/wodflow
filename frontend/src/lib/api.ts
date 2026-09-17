import type {
  ExerciseLibraryStats,
  ExerciseSearchResult,
  ExerciseSyncResult,
  Workout,
  WorkoutHistoryEntry,
  WorkoutHistoryInput,
} from '../types'

const DB_NAME = 'wodflow'
const DB_VERSION = 2
const WORKOUTS = 'workouts'
const HISTORY = 'history'
const EXERCISES = 'exercises'
const HISTORY_QUEUE_KEY = 'wodflow.pending-history.v2'
const SUPPORTED_EXERCISE_PROVIDERS = new Set(['local', 'repdb'])

const builtin = (
  providerId: string,
  name: string,
  aliases: string[] = [],
): ExerciseSearchResult => ({
  provider: 'local',
  provider_id: `builtin-${providerId}`,
  name,
  aliases,
  image_url: null,
  category: 'Körpergewicht',
  equipment: [],
  description: 'In WODFlow integrierte Übung',
})

const BUILTIN_EXERCISES: ExerciseSearchResult[] = [
  builtin('air-squat', 'Kniebeuge', ['Air Squat', 'Squat']),
  builtin('push-up', 'Liegestütz', ['Push-up', 'Push Up']),
  builtin('reverse-lunge', 'Rückwärts-Ausfallschritt', ['Reverse Lunge']),
  builtin('forward-lunge', 'Vorwärts-Ausfallschritt', ['Forward Lunge']),
  builtin('glute-bridge', 'Glute Bridge', ['Beckenheben']),
  builtin('plank', 'Unterarmstütz', ['Plank']),
  builtin('side-plank', 'Seitstütz', ['Side Plank']),
  builtin('high-knees', 'Kniehebelauf', ['High Knees']),
  builtin('squat-to-reach', 'Kniebeuge mit Strecken', ['Squat to Reach']),
  builtin('mountain-climbers', 'Mountain Climbers', ['Bergsteiger']),
  builtin('shadow-boxing', 'Schattenboxen', ['Shadow Boxing']),
  builtin('burpee', 'Burpee'),
  builtin('sit-up', 'Sit-up'),
  builtin('crunch', 'Crunch'),
  builtin('superman', 'Superman'),
  builtin('bear-crawl', 'Bärengang', ['Bear Crawl']),
  builtin('jumping-jack', 'Hampelmann', ['Jumping Jack']),
  builtin('step-jack', 'Step Jack'),
  builtin('hip-hinge', 'Hip Hinge', ['Hüftbeuge']),
  builtin('good-morning', 'Good Morning'),
  builtin('calf-raise', 'Wadenheben', ['Calf Raise']),
  builtin('wall-sit', 'Wandsitz', ['Wall Sit']),
  builtin('dead-bug', 'Dead Bug'),
  builtin('bird-dog', 'Bird Dog'),
  builtin('pike-push-up', 'Pike Push-up'),
  builtin('diamond-push-up', 'Diamond Push-up'),
  builtin('incline-push-up', 'Erhöhter Liegestütz', ['Incline Push-up']),
  builtin('single-leg-glute-bridge', 'Einbeiniges Beckenheben', ['Single-leg Glute Bridge']),
  builtin('skater-step', 'Skater Step'),
  builtin('inchworm', 'Inchworm'),
  builtin('hollow-hold', 'Hollow Hold'),
  builtin('leg-raise', 'Beinheben', ['Leg Raise']),
]

type StoredWorkout = Workout & { id: number; created_at: string; updated_at: string }
type StoredExercise = ExerciseSearchResult & { key: string }

type RepDbSource = {
  dataUrl: string
  assetBase: string
}

const REPDB_SOURCES: RepDbSource[] = [
  {
    dataUrl: 'https://exercise-dataset.com/exercises.json',
    assetBase: 'https://exercise-dataset.com/',
  },
  {
    dataUrl: 'https://raw.githubusercontent.com/RepDB/exercise-dataset/main/exercises.json',
    assetBase: 'https://raw.githubusercontent.com/RepDB/exercise-dataset/main/',
  },
]

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB-Anfrage fehlgeschlagen'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB-Transaktion fehlgeschlagen'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB-Transaktion abgebrochen'))
  })
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    let settled = false

    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(WORKOUTS)) db.createObjectStore(WORKOUTS, { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains(HISTORY)) db.createObjectStore(HISTORY, { keyPath: 'id', autoIncrement: true })
      if (!db.objectStoreNames.contains(EXERCISES)) db.createObjectStore(EXERCISES, { keyPath: 'key' })
    }

    request.onsuccess = () => {
      const db = request.result
      if (settled) {
        db.close()
        return
      }

      const reset = () => {
        db.close()
        dbPromise = null
      }
      db.onversionchange = reset
      db.onclose = () => { dbPromise = null }

      void migrateAndSeedExercises(db)
        .then(() => {
          if (settled) {
            db.close()
            return
          }
          settled = true
          resolve(db)
        })
        .catch((error) => {
          reset()
          fail(error)
        })
    }

    request.onblocked = () => fail(new Error('WODFlow ist noch in einem anderen Tab geöffnet. Bitte den anderen Tab schließen und erneut versuchen.'))
    request.onerror = () => fail(request.error ?? new Error('IndexedDB konnte nicht geöffnet werden'))
  })

  dbPromise = opening.catch((error) => {
    dbPromise = null
    throw error
  })
  return dbPromise
}

async function migrateAndSeedExercises(db: IDBDatabase): Promise<void> {
  const readTx = db.transaction(EXERCISES, 'readonly')
  const existing = await req(readTx.objectStore(EXERCISES).getAll()) as StoredExercise[]
  await txDone(readTx)

  const writeTx = db.transaction(EXERCISES, 'readwrite')
  const store = writeTx.objectStore(EXERCISES)

  for (const exercise of existing) {
    if (!SUPPORTED_EXERCISE_PROVIDERS.has(exercise.provider)) store.delete(exercise.key)
  }
  for (const exercise of BUILTIN_EXERCISES) {
    store.put({ ...exercise, key: exerciseKey(exercise) } satisfies StoredExercise)
  }
  await txDone(writeTx)
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

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('de-DE')
}

function supportedExercises(items: StoredExercise[]): StoredExercise[] {
  return items.filter((item) => SUPPORTED_EXERCISE_PROVIDERS.has(item.provider))
}

function readPendingHistory(): WorkoutHistoryInput[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_QUEUE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed as WorkoutHistoryInput[] : []
  } catch {
    return []
  }
}

function writePendingHistory(items: WorkoutHistoryInput[]): void {
  try {
    localStorage.setItem(HISTORY_QUEUE_KEY, JSON.stringify(items))
  } catch {
    // IndexedDB remains the primary store. A blocked localStorage fallback must
    // not crash the workout runner.
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function repDbImageUrl(item: Record<string, unknown>, assetBase: string): string | null {
  const images = item.images && typeof item.images === 'object' ? item.images as Record<string, unknown> : {}
  const flat = images.flat && typeof images.flat === 'object' ? images.flat as Record<string, unknown> : {}
  const relative = asString(flat.main) || asString(flat.start) || asString(flat.peak)
  if (!relative) return null
  try {
    return new URL(relative, assetBase).href
  } catch {
    return null
  }
}

function mapRepDbExercise(item: Record<string, unknown>, assetBase: string): ExerciseSearchResult | null {
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
    image_url: repDbImageUrl(item, assetBase),
    category,
    equipment,
    description,
  }
}

async function fetchRepDb(): Promise<{ items: Record<string, unknown>[]; source: RepDbSource }> {
  const failures: string[] = []

  for (const source of REPDB_SOURCES) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12_000)
    try {
      const response = await fetch(source.dataUrl, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json() as { exercises?: unknown }
      if (!Array.isArray(payload.exercises) || payload.exercises.length === 0) {
        throw new Error('keine Übungen in der Antwort')
      }
      return { items: payload.exercises as Record<string, unknown>[], source }
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'Zeitüberschreitung'
        : error instanceof Error ? error.message : String(error)
      failures.push(message)
    } finally {
      window.clearTimeout(timeout)
    }
  }

  throw new Error(`RepDB-Synchronisierung fehlgeschlagen: ${failures.join(' · ')}`)
}

async function syncRepDb(): Promise<ExerciseSyncResult> {
  const { items, source } = await fetchRepDb()
  const mapped = items
    .map((item) => mapRepDbExercise(item, source.assetBase))
    .filter((item): item is ExerciseSearchResult => Boolean(item))

  if (mapped.length === 0) throw new Error('RepDB-Daten konnten nicht verarbeitet werden')

  const db = await openDb()
  const readTx = db.transaction(EXERCISES, 'readonly')
  const existing = await req(readTx.objectStore(EXERCISES).getAll()) as StoredExercise[]
  await txDone(readTx)

  const writeTx = db.transaction(EXERCISES, 'readwrite')
  const store = writeTx.objectStore(EXERCISES)
  for (const exercise of existing) {
    if (exercise.provider === 'repdb') store.delete(exercise.key)
  }
  for (const exercise of mapped) {
    store.put({ ...exercise, key: exerciseKey(exercise) } satisfies StoredExercise)
  }
  await txDone(writeTx)

  return {
    fetched: items.length,
    upserted: mapped.length,
    images_cached: 0,
    image_errors: 0,
  }
}

export const api = {
  async listWorkouts(): Promise<Workout[]> {
    const items = await getAll<StoredWorkout>(WORKOUTS)
    return items.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
  },

  async createWorkout(workout: Workout): Promise<Workout> {
    const db = await openDb()
    const now = new Date().toISOString()
    const { id: _id, ...rest } = workout
    const payload = { ...rest, created_at: now, updated_at: now }
    const tx = db.transaction(WORKOUTS, 'readwrite')
    const id = Number(await req(tx.objectStore(WORKOUTS).add(payload)))
    await txDone(tx)
    return { ...payload, id }
  },

  async updateWorkout(id: number, workout: Workout): Promise<Workout> {
    const db = await openDb()

    const readTx = db.transaction(WORKOUTS, 'readonly')
    const existing = await req(readTx.objectStore(WORKOUTS).get(id)) as StoredWorkout | undefined
    await txDone(readTx)

    const now = new Date().toISOString()
    const payload: StoredWorkout = {
      ...workout,
      id,
      created_at: existing?.created_at ?? workout.created_at ?? now,
      updated_at: now,
    }
    const writeTx = db.transaction(WORKOUTS, 'readwrite')
    writeTx.objectStore(WORKOUTS).put(payload)
    await txDone(writeTx)
    return payload
  },

  deleteWorkout: (id: number) => deleteById(WORKOUTS, id),

  async listExercises(limit = 1000): Promise<ExerciseSearchResult[]> {
    const items = supportedExercises(await getAll<StoredExercise>(EXERCISES))
    return items
      .sort((a, b) => a.name.localeCompare(b.name, 'de-DE'))
      .slice(0, Math.max(1, limit))
      .map(({ key: _key, ...item }) => item)
  },

  async searchExercises(q: string, limit = 40): Promise<ExerciseSearchResult[]> {
    const needle = normalizeText(q)
    if (!needle) return []

    const items = supportedExercises(await getAll<StoredExercise>(EXERCISES))
    return items
      .map((item) => {
        const searchable = [
          item.name,
          ...(item.aliases ?? []),
          item.category ?? '',
          ...item.equipment,
        ].map(normalizeText)
        const exact = searchable.some((value) => value === needle)
        const prefix = searchable.some((value) => value.startsWith(needle))
        const matches = searchable.some((value) => value.includes(needle))
        return { item, exact, prefix, matches }
      })
      .filter(({ matches }) => matches)
      .sort((a, b) => Number(b.exact) - Number(a.exact)
        || Number(b.prefix) - Number(a.prefix)
        || a.item.name.localeCompare(b.item.name, 'de-DE'))
      .slice(0, Math.max(1, limit))
      .map(({ item: { key: _key, ...item } }) => item)
  },

  async exerciseStats(): Promise<ExerciseLibraryStats> {
    const items = supportedExercises(await getAll<StoredExercise>(EXERCISES))
    const local = items.filter((item) => item.provider === 'local')
    return {
      total: items.length,
      builtin: local.filter((item) => item.provider_id.startsWith('builtin-')).length,
      custom: local.filter((item) => !item.provider_id.startsWith('builtin-')).length,
      repdb: items.filter((item) => item.provider === 'repdb').length,
      with_images: items.filter((item) => Boolean(item.image_url)).length,
    }
  },

  async createExercise(rawName: string): Promise<ExerciseSearchResult> {
    const name = rawName.replace(/\s+/g, ' ').trim()
    if (name.length < 2) throw new Error('Der Name muss mindestens zwei Zeichen enthalten')
    if (name.length > 80) throw new Error('Der Name darf höchstens 80 Zeichen enthalten')

    const items = supportedExercises(await getAll<StoredExercise>(EXERCISES))
    const normalizedName = normalizeText(name)
    const duplicate = items.find((item) => [item.name, ...(item.aliases ?? [])].some((value) => normalizeText(value) === normalizedName))
    if (duplicate) throw new Error(`„${duplicate.name}“ ist bereits in der Übungsbibliothek vorhanden`)

    const exercise: ExerciseSearchResult = {
      provider: 'local',
      provider_id: crypto.randomUUID(),
      name,
      image_url: null,
      category: 'Eigene Übung',
      equipment: [],
      description: null,
    }
    const db = await openDb()
    const tx = db.transaction(EXERCISES, 'readwrite')
    tx.objectStore(EXERCISES).put({ ...exercise, key: exerciseKey(exercise) } satisfies StoredExercise)
    await txDone(tx)
    return exercise
  },

  async deleteExercise(provider: string, providerId: string): Promise<void> {
    if (provider !== 'local' || providerId.startsWith('builtin-')) {
      throw new Error('Nur selbst angelegte Übungen können gelöscht werden')
    }
    const db = await openDb()
    const tx = db.transaction(EXERCISES, 'readwrite')
    tx.objectStore(EXERCISES).delete(`${provider}:${providerId}`)
    await txDone(tx)
  },

  syncExercises: () => syncRepDb(),

  async listHistory(): Promise<WorkoutHistoryEntry[]> {
    const items = await getAll<WorkoutHistoryEntry>(HISTORY)
    return items.sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? '')).slice(0, 100)
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
