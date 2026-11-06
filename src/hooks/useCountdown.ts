import { useEffect, useState } from 'react'
export function useCountdown(secs: number, onDone: () => void) {
  const [left, setLeft] = useState(secs)
  useEffect(() => { if (left <= 0) { onDone(); return } const t = setTimeout(() => setLeft(l => l - 1), 1000); return () => clearTimeout(t) }, [left])
  return left
}
