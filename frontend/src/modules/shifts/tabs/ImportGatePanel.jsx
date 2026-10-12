// Çizelge aktarımı — zorunlu kontroller (tanımsız kod, belirsiz kişi, eksik bilgili yeni
// personel) ve eksik görev yeri raporu. Çözümler üst bileşende tutulur, burada düzenlenir.
import { useProjects } from '../../../shared/hooks/useProjects.js'
import { STAFF_FIELDS, FIELD_LABEL, staffInfoComplete, missingLocationLines } from '../logic/importGate.js'

const box = (rgb) => ({
  marginBottom: '10px', padding: '9px 12px', borderRadius: '6px',
  background: `rgba(${rgb},.08)`, border: `1px solid rgba(${rgb},.3)`,
})
const inputStyle = {
  padding: '4px 6px', background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: '5px', color: 'var(--text)', fontSize: '11px', minWidth: 0,
}

export default function ImportGatePanel({ report, confirm, setConfirm, newStaff, setNewStaff, skipNames, setSkipNames, mappings }) {
  const { projects } = useProjects()
  const blockers = report?.blockers || []
  const unknown = blockers.find(b => b.kind === 'unknown_codes')
  const fuzzy = blockers.find(b => b.kind === 'ambiguous_staff')
  const incomplete = blockers.find(b => b.kind === 'new_staff_incomplete')
  const missing = missingLocationLines(report?.locations?.missing)

  const setInfo = (name, field, value) =>
    setNewStaff(prev => ({ ...prev, [name]: { ...(prev[name] || {}), [field]: value } }))
  const toggleSkip = (name) =>
    setSkipNames(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])

  return (
    <>
      {blockers.length > 0 && (
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444', marginBottom: '8px' }}>
          ⛔ Onay gerekiyor — aşağıdakiler çözülmeden aktarım yapılmaz
        </div>
      )}

      {unknown && (
        <div style={box('239,68,68')}>
          <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, marginBottom: '4px' }}>{unknown.message}</div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '6px' }}>
            {unknown.items.map(c => (
              <div key={c.code}><b style={{ fontFamily: 'var(--mono)' }}>{c.code}</b> × {c.count} — {c.examples.join(', ')}{c.count > c.examples.length ? ' …' : ''}</div>
            ))}
          </div>
          <label style={{ fontSize: '11px', display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!confirm.unrecognized}
              onChange={e => setConfirm(prev => ({ ...prev, unrecognized: e.target.checked }))} />
            Bu hücreler boş kalsın (kod anlamı tanımlanınca yeniden aktarırım)
          </label>
        </div>
      )}

      {fuzzy && (
        <div style={box('99,102,241')}>
          <div style={{ fontSize: '11px', color: '#818cf8', fontWeight: 600, marginBottom: '4px' }}>{fuzzy.message}</div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '6px' }}>
            {fuzzy.items.map(f => `${f.excelName} → ${f.matchedTo}`).join(' · ')}
          </div>
          <label style={{ fontSize: '11px', display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!confirm.fuzzy}
              onChange={e => setConfirm(prev => ({ ...prev, fuzzy: e.target.checked }))} />
            Hepsi doğru kişi (yanlış olanı aşağıdan elle eşleştirin)
          </label>
        </div>
      )}

      {incomplete && (
        <div style={box('16,185,129')}>
          <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, marginBottom: '6px' }}>{incomplete.message}</div>
          <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {incomplete.items.map(s => {
              const info = newStaff[s.name] || {}
              const skipped = skipNames.includes(s.name)
              const mapped = !!mappings[s.name]
              const done = skipped || mapped || staffInfoComplete(info)
              return (
                <div key={s.name} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px,1.4fr) 1fr 1fr 1fr auto', gap: '5px', alignItems: 'center', opacity: skipped ? 0.5 : 1 }}>
                  <span style={{ fontSize: '11px', color: done ? '#10b981' : 'var(--text)' }} title={s.deptName || ''}>
                    {done ? '✓ ' : ''}{s.name}{mapped ? ' (eşleştirildi)' : ''}
                  </span>
                  <input type="date" aria-label={`${s.name} işe giriş`} style={inputStyle} disabled={skipped || mapped}
                    value={info.hire_date || ''} onChange={e => setInfo(s.name, 'hire_date', e.target.value)} />
                  <input aria-label={`${s.name} rol`} placeholder="Rol / görev" style={inputStyle} disabled={skipped || mapped}
                    value={info.position || ''} onChange={e => setInfo(s.name, 'position', e.target.value)} />
                  <select aria-label={`${s.name} proje`} style={inputStyle} disabled={skipped || mapped}
                    value={info.project_id || ''} onChange={e => setInfo(s.name, 'project_id', e.target.value ? Number(e.target.value) : '')}>
                    <option value="">Proje…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <label style={{ fontSize: '10px', display: 'flex', gap: '3px', alignItems: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={skipped} onChange={() => toggleSkip(s.name)} /> atla
                  </label>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '6px' }}>
            Zorunlu: {STAFF_FIELDS.map(f => FIELD_LABEL[f]).join(' · ')}. Mevcut biriyse “Elle eşleştirme” kullanın.
          </div>
        </div>
      )}

      {missing.length > 0 && (
        <details style={box('245,158,11')}>
          <summary style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, cursor: 'pointer' }}>
            Görev yeri eksik: {report.locations.missingCells} çalışma hücresi · {missing.length} kişi (aktarımı engellemez, kayıtta boş kalır)
          </summary>
          <div style={{ maxHeight: '180px', overflowY: 'auto', marginTop: '6px', fontSize: '10px', color: 'var(--text2)', lineHeight: 1.6 }}>
            {missing.map(m => (
              <div key={m.name}><b>{m.name}</b>{m.deptName ? ` · ${m.deptName}` : ''}: {m.text}</div>
            ))}
          </div>
        </details>
      )}
    </>
  )
}
