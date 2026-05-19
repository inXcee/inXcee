import { useSearchParams } from 'react-router-dom'
import { parseRange, computeRange } from './dateRange.js'

export function useDateRange() {
  const [params, setParams] = useSearchParams()

  const parsed = parseRange(params.get('range'), params.get('from'), params.get('to'))
  const computed = computeRange(parsed)

  const setRange = (r) => setParams((p) => {
    p.set('range', String(r))
    p.delete('from')
    p.delete('to')
    return p
  }, { replace: true })

  const setCustom = (f, t) => setParams((p) => {
    p.set('range', 'custom')
    p.set('from', f)
    p.set('to', t)
    return p
  }, { replace: true })

  return { ...computed, setRange, setCustom }
}
