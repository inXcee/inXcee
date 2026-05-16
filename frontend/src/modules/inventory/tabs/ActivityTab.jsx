import { useState } from 'react'
import CheckoutsTab from './CheckoutsTab.jsx'
import MovementsTab from './MovementsTab.jsx'

const SUB = [
  { key: 'checkouts', label: 'TESLİMLER' },
  { key: 'movements', label: 'HAREKETLER' },
]

export default function ActivityTab() {
  const [sub, setSub] = useState('checkouts')
  return (
    <div>
      <SubTabBar tabs={SUB} active={sub} onChange={setSub} />
      {sub === 'checkouts' && <CheckoutsTab />}
      {sub === 'movements' && <MovementsTab />}
    </div>
  )
}

export function SubTabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex', gap: 4, marginBottom: 14,
      background: 'var(--surface2)', borderRadius: 10, padding: 3, width: 'fit-content',
    }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{
          padding: '6px 14px', border: 'none', borderRadius: 7, cursor: 'pointer',
          fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
          background: active === t.key ? 'var(--surface)' : 'transparent',
          color: active === t.key ? 'var(--text)' : 'var(--text3)',
          boxShadow: active === t.key ? '0 1px 3px rgba(0,0,0,.15)' : 'none',
          transition: 'all .15s',
        }}>{t.label}</button>
      ))}
    </div>
  )
}
