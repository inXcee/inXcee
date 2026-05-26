import { useState, useEffect } from 'react'
import { splitNavTabs } from './navTabs.js'

// Sabit alt sekme çubuğu.
// props: tabs [{key, icon, label, badge?}], active, onChange(key), moreLabel, maxSlots=5
// 5'ten fazla sekme varsa ilk 4'ü gösterir, kalanı "Daha fazla" alt menüsüne taşır.
export default function BottomNav({ tabs, active, onChange, moreLabel = '⋯', maxSlots = 5 }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const { primary, overflow } = splitNavTabs(tabs, maxSlots)

  const overflowActive = overflow.some(tb => tb.key === active)
  const overflowBadge = overflow.reduce((sum, tb) => sum + (tb.badge || 0), 0)

  // Escape ile sheet'i kapat; sheet kapanınca listener temizlenir
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = e => { if (e.key === 'Escape') setSheetOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  const pick = key => { onChange(key); setSheetOpen(false) }

  return (
    <>
      {/* Açılır menü (taşan sekmeler) */}
      {sheetOpen && overflow.length > 0 && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setSheetOpen(false)} aria-hidden="true" />
          <div role="menu" aria-label={moreLabel}
            className="fixed inset-x-0 max-w-lg mx-auto z-50 bg-slate-900 border-t border-slate-800 rounded-t-2xl p-4 shadow-2xl"
            style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" />
            <div className="grid grid-cols-3 gap-2">
              {overflow.map(tab => {
                const isActive = active === tab.key
                return (
                  <button key={tab.key} type="button" role="menuitem"
                    onClick={() => pick(tab.key)}
                    className={`relative min-h-[72px] rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${isActive ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'}`}>
                    <span className="text-2xl leading-none">{tab.icon}</span>
                    <span className="text-xs leading-tight text-center px-1">{tab.label}</span>
                    {tab.badge > 0 && (
                      <span className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{tab.badge}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      <nav role="tablist"
        className="fixed bottom-0 inset-x-0 max-w-lg mx-auto bg-slate-900 border-t border-slate-800 flex z-50"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {primary.map(tab => {
          const isActive = active === tab.key
          return (
            <button key={tab.key} type="button" role="tab" aria-selected={isActive}
              onClick={() => pick(tab.key)}
              className={`relative flex-1 min-h-[56px] py-2 flex flex-col items-center justify-center gap-0.5 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className="text-[11px] leading-tight">{tab.label}</span>
              {tab.badge > 0 && (
                <span className="absolute top-1 right-1/4 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{tab.badge}</span>
              )}
            </button>
          )
        })}

        {overflow.length > 0 && (
          <button type="button" aria-haspopup="true" aria-expanded={sheetOpen}
            onClick={() => setSheetOpen(o => !o)}
            className={`relative flex-1 min-h-[56px] py-2 flex flex-col items-center justify-center gap-0.5 transition-colors ${overflowActive || sheetOpen ? 'text-blue-400' : 'text-slate-500'}`}>
            <span className="text-xl leading-none">⋯</span>
            <span className="text-[11px] leading-tight">{moreLabel}</span>
            {overflowBadge > 0 && (
              <span className="absolute top-1 right-1/4 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{overflowBadge}</span>
            )}
          </button>
        )}
      </nav>
    </>
  )
}
