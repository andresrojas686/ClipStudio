import { useEffect, useState } from 'react'
import { checkHealth, type YtHealth } from '../lib/youtube'

let healthCache: Promise<YtHealth | null> | null = null

/** null mientras se comprueba; false si no hay API local (build estático). */
export function useYoutubeAvailable() {
  const [health, setHealth] = useState<YtHealth | null | false>(null)
  useEffect(() => {
    let alive = true
    ;(healthCache ??= checkHealth()).then((h) => alive && setHealth(h ?? false))
    return () => {
      alive = false
    }
  }, [])
  return health
}
