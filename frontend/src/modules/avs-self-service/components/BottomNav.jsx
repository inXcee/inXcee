// Sabit alt sekme çubuğu. props: tabs [{key, icon, label, badge?}], active, onChange(key)
export default function BottomNav({ tabs, active, onChange }) {
  return (
    <nav role="tablist"
      className="fixed bottom-0 inset-x-0 max-w-lg mx-auto bg-slate-900 border-t border-slate-800 flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(tab => {
        const isActive = active === tab.key
        return (
          <button key={tab.key} type="button" role="tab" aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`relative flex-1 min-h-[56px] py-2 flex flex-col items-center justify-center gap-0.5 transition-colors ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className="text-[11px] leading-tight">{tab.label}</span>
            {tab.badge > 0 && (
              <span className="absolute top-1 right-1/4 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{tab.badge}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
