// Dokunmatik numerik PIN girişi. Kontrollü: değeri parent tutar.
// props: value (string), onChange(next), onComplete()?, length=4, error?
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']

export default function PinPad({ value = '', onChange, onComplete, length = 4, error }) {
  const press = (k) => {
    if (k === 'back') return onChange(value.slice(0, -1))
    if (k === '' || value.length >= length) return
    const next = (value + k).slice(0, length)
    onChange(next)
    if (next.length === length && onComplete) onComplete()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-3" aria-hidden="true">
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={`w-4 h-4 rounded-full ${i < value.length ? 'bg-amber-400' : 'bg-slate-700'}`} />
        ))}
      </div>
      {error && <div className="text-red-400 text-sm text-center">{error}</div>}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k, i) => k === '' ? <div key={i} /> : (
          <button key={i} type="button" onClick={() => press(k)}
            aria-label={k === 'back' ? 'Sil' : k}
            className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-100 text-2xl font-medium transition-colors flex items-center justify-center">
            {k === 'back' ? '⌫' : k}
          </button>
        ))}
      </div>
    </div>
  )
}
