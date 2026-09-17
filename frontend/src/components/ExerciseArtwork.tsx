import { useEffect, useState } from 'react'

export function ExerciseArtwork({
  src,
  name,
  eager = false,
}: {
  src?: string | null
  name: string
  eager?: boolean
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [src])

  if (!src || failed) {
    return <span className="exercise-image-fallback" aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || '?'}</span>
  }

  return (
    <img
      src={src}
      alt={`${name} – Übungsdarstellung`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
