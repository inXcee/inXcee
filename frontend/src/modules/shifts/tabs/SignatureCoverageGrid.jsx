import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { formatDate } from '../shared.jsx'

// Föy dönüş takibi: bölüm × gün. Hangi günün hangi bölüm föyü kontrol edildi
// (temiz / uyarılı), hangisi hiç gelmedi. "Gelmedi" hücresine tıklamak o gün ve
// bölümü kontrol formuna taşır.

export const COVERAGE_KEY = 'signature-coverage'

const CELL = {
  clean: { icon: '✓', color: 'var(--green)', label: 'kontrol edildi, fark yok' },
  warn: { icon: '⚠', color: 'var(--red)', label: 'kontrol edildi, uyarı var' },
  missing: { icon: '✗', color: 'var(--red)', label: 'föy kontrol edilmedi' },
  pending: { icon: '…', color: 'var(--text3)', label: 'bugün — föy bekleniyor' },
  not_needed: { icon: '', color: 'var(--text3)', label: 'çalışan planlı değil' },
}

const KIND = { warn: '⚠', unmatched: '❓', not_on_sheet: '📋' }

export function cellTitle(dept, date, c) {
  const head = `${dept} · ${formatDate(date)} — ${CELL[c.status].label}`
  const lines = [head]
  if (c.planned) lines.push(`Planlı çalışan: ${c.planned}`)
  if (c.run_id) {
    lines.push(`Kontrol: ${String(c.checked_at || '').slice(0, 16)} (${c.source === 'telegram' ? 'Telegram' : 'web'})`)
    for (const f of (c.findings || []).slice(0, 12)) lines.push(`${KIND[f.kind] || '•'} ${f.name}: ${f.text}`)
    if ((c.findings || []).length > 12) lines.push(`… +${c.findings.length - 12}`)
  }
  return lines.join('\n')
}

export default function SignatureCoverageGrid({ weekDays = [], onPick }) {
  const from = weekDays[0]
  const to = weekDays.at(-1)
  const { data, isLoading, isError } = useQuery({
    queryKey: [COVERAGE_KEY, from, to],
    queryFn: () => api.get('/shifts/schedule/signature-check/coverage', { params: { from, to } }).then(r => r.data),
    enabled: !!from && !!to,
  })

  if (!from) return null
  if (isLoading) return <p style={{ fontSize: 11, color: 'var(--text3)' }}>Föy takibi yükleniyor…</p>
  if (isError || !data) return <p style={{ fontSize: 11, color: 'var(--red)' }}>Föy takibi okunamadı</p>
  if (!data.departments.length) return <p style={{ fontSize: 11, color: 'var(--text3)' }}>Bu hafta çizelgede bölüm yok.</p>

  const s = data.summary
  return (
    <div style={{ marginBottom: 10 }} aria-label="Föy dönüş takibi">
      <div style={{ fontSize: 12, marginBottom: 4 }}>
        <b>Föy dönüş takibi</b> · kontrol {s.checked}/{s.expected}
        {s.missing > 0 && <> · <span style={{ color: 'var(--red)' }}>gelmedi {s.missing}</span></>}
        {s.warn > 0 && <> · <span style={{ color: 'var(--red)' }}>uyarılı {s.warn}</span></>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '2px 8px 2px 0' }}>Bölüm</th>
              {data.days.map(d => (
                <th key={d} style={{ padding: '2px 6px', fontFamily: 'var(--mono)', fontWeight: d === data.today ? 700 : 400 }}>
                  {formatDate(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.departments.map(dep => (
              <tr key={dep.id}>
                <td style={{ padding: '2px 8px 2px 0', whiteSpace: 'nowrap' }}>{dep.name}</td>
                {data.days.map(d => {
                  const c = dep.cells[d]
                  const meta = CELL[c.status]
                  const tiklanir = c.status !== 'not_needed'
                  return (
                    <td key={d} style={{ textAlign: 'center', padding: 1 }}>
                      <button
                        type="button"
                        disabled={!tiklanir}
                        onClick={() => onPick?.({ date: d, department_id: dep.id })}
                        title={cellTitle(dep.name, d, c)}
                        aria-label={`${dep.name} ${d} ${meta.label}`}
                        style={{
                          width: 30, height: 22, border: '1px solid var(--border)', borderRadius: 3,
                          background: c.status === 'missing' ? 'color-mix(in srgb, var(--red) 12%, transparent)' : 'transparent',
                          color: meta.color, cursor: tiklanir ? 'pointer' : 'default', fontSize: 12,
                        }}
                      >
                        {meta.icon}{c.status === 'warn' && c.warnings ? <sup style={{ fontSize: 8 }}>{c.warnings}</sup> : null}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
