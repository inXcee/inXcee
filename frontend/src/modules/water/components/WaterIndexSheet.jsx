import { useMemo, useState } from 'react'
import { nf } from '../logic/waterUi.js'
import {
  buildIndexMatrix,
  buildIntakeMatrix,
  buildPaletteLegend,
  buildReturnGroups,
} from '../logic/waterIndexSheet.js'
import { dayLines } from '../logic/distributionBreakdown.js'

// Excel "INDEX" sayfasının ekran karşılığı. Marka bantları için yumuşak dolgular
// (PDF'teki BRAND_TINTS ile aynı sıra — üç çıktı aynı görünsün).
const BRAND_TINTS = ['#D9EAD3', '#CFE2F3', '#FCE5CD', '#EAD1DC', '#E0E7FF']
const TOTAL_BG = '#FEF3C7'

const cellText = value => (value ? nf(value) : '0')
const th = (extra = {}) => ({
  padding: '4px 6px', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap',
  border: '1px solid var(--border)', background: 'var(--surface)', ...extra,
})
const td = (extra = {}) => ({
  padding: '3px 6px', fontSize: '11px', border: '1px solid var(--border)', ...extra,
})

function BrandHeader({ brandGroups, leadCols, trailLabel = 'TOPLAM' }) {
  return (
    <tr>
      <th style={th({ background: 'transparent', border: 'none' })} colSpan={leadCols} />
      {brandGroups.map((group, index) => (
        <th
          key={`${group.brand}-${index}`}
          colSpan={group.span}
          style={th({ background: BRAND_TINTS[index % BRAND_TINTS.length], textAlign: 'center', color: '#1E293B' })}
        >
          {group.brand}
        </th>
      ))}
      <th style={th({ background: TOTAL_BG, textAlign: 'center' })}>{trailLabel}</th>
    </tr>
  )
}

// ── Blok 1: INDEX matrisi (yer adları tıklanabilir) ──
function IndexBlock({ matrix, report }) {
  const [openZone, setOpenZone] = useState(null)
  const [openDay, setOpenDay] = useState(null)

  if (!matrix.rows.length) {
    return <div style={{ color: 'var(--text3)', fontSize: '12px' }}>Bu aralıkta dağıtım kaydı yok.</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <BrandHeader brandGroups={matrix.brandGroups} leadCols={2} />
          <tr>
            <th style={th({ width: '38px', textAlign: 'center' })}>SIRA</th>
            <th style={th({ textAlign: 'left', minWidth: '170px' })}>FİRMA ADI</th>
            {matrix.columns.map((column, index) => (
              <th key={`${column.product_id}-${index}`} style={th({ textAlign: 'center', minWidth: '62px' })}>
                <div>{column.name}</div>
                <div style={{ fontWeight: 400, fontSize: '9px', color: 'var(--text3)' }}>{column.unit_label}</div>
              </th>
            ))}
            <th style={th({ textAlign: 'right', background: TOTAL_BG, minWidth: '68px' })}>TOPLAM</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map(row => {
            const isOpen = openZone === row.zone_id
            return [
              <tr key={row.zone_id} style={{ background: isOpen ? 'var(--surface)' : undefined }}>
                <td style={td({ textAlign: 'center', color: 'var(--text3)' })}>{row.seq}</td>
                <td style={td({ padding: 0 })}>
                  {/* Excel'deki mavi firma adı — tıklanınca gün dökümü açılır */}
                  <button
                    type="button"
                    onClick={() => { setOpenZone(isOpen ? null : row.zone_id); setOpenDay(null) }}
                    aria-expanded={isOpen}
                    style={{
                      width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                      padding: '3px 6px', fontSize: '11px', fontWeight: 600,
                      color: 'var(--accent)', textDecoration: 'underline',
                    }}
                  >
                    {isOpen ? '▾ ' : '▸ '}{row.zone_name}
                  </button>
                </td>
                {row.cells.map((value, index) => (
                  <td key={index} style={td({ textAlign: 'center', color: value ? 'var(--text)' : 'var(--text3)' })}>
                    {cellText(value)}
                  </td>
                ))}
                <td style={td({ textAlign: 'right', fontWeight: 700, background: TOTAL_BG })}>{nf(row.total)}</td>
              </tr>,

              isOpen && (
                <tr key={`${row.zone_id}-days`}>
                  <td colSpan={matrix.columns.length + 3} style={td({ background: 'var(--surface)', padding: '6px 10px 10px' })}>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '4px' }}>
                      {row.zone_name} · gün gün dağıtım ({row.days.length} gün) — güne tıkla, o günün ürün kırılımı açılsın
                    </div>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={th({ textAlign: 'left', width: '110px' })}>GÜN</th>
                          {matrix.columns.map((column, index) => (
                            <th key={index} style={th({ textAlign: 'center' })}>{column.name}</th>
                          ))}
                          <th style={th({ textAlign: 'right', background: TOTAL_BG })}>TOPLAM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.days.map(day => {
                          const dayOpen = openDay === `${row.zone_id}:${day.key}`
                          const lines = dayOpen ? dayLines(report, row.zone_id, day.key) : []
                          return [
                            <tr
                              key={day.key}
                              onClick={() => setOpenDay(dayOpen ? null : `${row.zone_id}:${day.key}`)}
                              style={{ cursor: 'pointer', background: dayOpen ? 'var(--bg)' : undefined }}
                            >
                              <td style={td({ whiteSpace: 'nowrap', color: 'var(--accent)' })}>
                                {dayOpen ? '▾ ' : '▸ '}{day.label}
                              </td>
                              {day.cells.map((value, index) => (
                                <td key={index} style={td({ textAlign: 'center', color: value ? 'var(--text)' : 'var(--text3)' })}>
                                  {cellText(value)}
                                </td>
                              ))}
                              <td style={td({ textAlign: 'right', fontWeight: 600 })}>{nf(day.total)}</td>
                            </tr>,
                            dayOpen && (
                              <tr key={`${day.key}-lines`}>
                                <td colSpan={matrix.columns.length + 2} style={td({ background: 'var(--bg)', padding: '6px 10px' })}>
                                  {lines.length ? lines.map((line, index) => (
                                    <div key={index} style={{ fontSize: '10px', padding: '2px 0' }}>
                                      <span style={{ color: 'var(--text2)' }}>└ {line.label}</span>
                                      <strong style={{ marginLeft: '8px', fontFamily: 'var(--mono)' }}>{nf(line.qty_base)}</strong>
                                      {line.qty_human && <span style={{ color: 'var(--text3)', marginLeft: '6px' }}>({line.qty_human})</span>}
                                      {(line.note || line.created_by_name) && (
                                        <span style={{ color: 'var(--text3)', marginLeft: '8px' }}>
                                          {line.note && `not: ${line.note}`}
                                          {line.note && line.created_by_name && ' · '}
                                          {line.created_by_name && `giren: ${line.created_by_name}`}
                                        </span>
                                      )}
                                    </div>
                                  )) : (
                                    <span style={{ fontSize: '10px', color: 'var(--text3)' }}>
                                      Bu aralık için gün detayı üretilmedi.
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ),
                          ]
                        })}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ),
            ]
          })}

          <tr style={{ background: TOTAL_BG, fontWeight: 700 }}>
            <td style={td({ textAlign: 'center' })} colSpan={2}>TOPLAM</td>
            {matrix.columnTotals.map((value, index) => (
              <td key={index} style={td({ textAlign: 'center' })}>{cellText(value)}</td>
            ))}
            <td style={td({ textAlign: 'right' })}>{nf(matrix.grandTotal)}</td>
          </tr>
          <tr style={{ background: '#FDE68A', fontWeight: 800 }}>
            <td style={td({ textAlign: 'right' })} colSpan={matrix.columns.length + 2}>GENEL TOPLAM</td>
            <td style={td({ textAlign: 'right' })}>{nf(matrix.grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Blok 2: aylık gelen tır ──
function IntakeBlock({ matrix }) {
  if (!matrix.grandTotal) {
    return <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Bu aralıkta giriş (tır) kaydı yok.</div>
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <BrandHeader brandGroups={matrix.brandGroups} leadCols={1} />
          <tr>
            <th style={th({ width: '38px', textAlign: 'center' })}>GÜN</th>
            {matrix.columns.map((column, index) => (
              <th key={index} style={th({ textAlign: 'center', minWidth: '62px' })}>{column.name}</th>
            ))}
            <th style={th({ textAlign: 'right', background: TOTAL_BG })}>TOPLAM</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map(row => (
            <tr key={row.key} style={{ opacity: row.total ? 1 : 0.45 }}>
              <td style={td({ textAlign: 'center', color: 'var(--text3)' })}>{row.dayNo}</td>
              {row.cells.map((value, index) => (
                <td key={index} style={td({ textAlign: 'center', color: value ? 'var(--text)' : 'var(--text3)' })}>
                  {cellText(value)}
                </td>
              ))}
              <td style={td({ textAlign: 'right', fontWeight: 600 })}>{cellText(row.total)}</td>
            </tr>
          ))}
          <tr style={{ background: TOTAL_BG, fontWeight: 700 }}>
            <td style={td({ textAlign: 'center' })}>TOP</td>
            {matrix.columnTotals.map((value, index) => (
              <td key={index} style={td({ textAlign: 'center' })}>{cellText(value)}</td>
            ))}
            <td style={td({ textAlign: 'right' })}>{nf(matrix.grandTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ── Blok 3 + 4: palet çevrimleri ve boş kap iadeleri ──
function LegendBlock({ legend }) {
  if (!legend.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {legend.map(item => (
        <div
          key={item.product_id}
          style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '5px 9px', background: 'var(--surface)', fontSize: '10px' }}
        >
          <strong>{item.label}</strong>
          {item.brand && <span style={{ color: 'var(--text3)' }}> · {item.brand}</span>}
          <div style={{ color: 'var(--text2)' }}>{item.text}</div>
        </div>
      ))}
    </div>
  )
}

function ReturnsBlock({ groups }) {
  if (!groups.length) {
    return <div style={{ color: 'var(--text3)', fontSize: '11px' }}>Bu aralıkta boş kap iadesi yok.</div>
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
      {groups.map(group => (
        <div key={group.brand}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text2)', marginBottom: '4px' }}>
            TESLİM EDİLEN {group.brand} BOŞ KAP
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={th({ textAlign: 'left' })}>TARİH</th>
                <th style={th({ textAlign: 'left' })}>ÜRÜN</th>
                <th style={th({ textAlign: 'center' })}>PALET</th>
                <th style={th({ textAlign: 'right' })}>ADET</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map(row => (
                <tr key={row.id}>
                  <td style={td({ whiteSpace: 'nowrap' })}>{row.move_date}</td>
                  <td style={td()}>{row.product_name}</td>
                  <td style={td({ textAlign: 'center', color: 'var(--text3)' })}>{row.pallets ?? '—'}</td>
                  <td style={td({ textAlign: 'right', fontWeight: 600 })}>{nf(row.qty_base)}</td>
                </tr>
              ))}
              <tr style={{ background: TOTAL_BG, fontWeight: 700 }}>
                <td style={td()} colSpan={3}>TOPLAM</td>
                <td style={td({ textAlign: 'right' })}>{nf(group.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

const SectionTitle = ({ children }) => (
  <div style={{
    fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px', color: 'var(--text3)',
    margin: '16px 0 6px', paddingTop: '10px', borderTop: '1px solid var(--border)',
  }}
  >
    {children}
  </div>
)

export default function WaterIndexSheet({ report, products, returns }) {
  const indexMatrix = useMemo(() => buildIndexMatrix({ report, products }), [report, products])
  const intakeMatrix = useMemo(() => buildIntakeMatrix({ report, products }), [report, products])
  const legend = useMemo(() => buildPaletteLegend(products), [products])
  const returnGroups = useMemo(() => buildReturnGroups(returns), [returns])

  return (
    <div>
      <SectionTitle>INDEX — DAĞITIM YERİ × ÜRÜN (firma adına tıkla, gün dökümü açılsın)</SectionTitle>
      <IndexBlock matrix={indexMatrix} report={report} />

      <SectionTitle>AYLIK GELEN TIR — GÜN × ÜRÜN</SectionTitle>
      <IntakeBlock matrix={intakeMatrix} />

      <SectionTitle>PALET ÇEVRİMLERİ</SectionTitle>
      <LegendBlock legend={legend} />

      <SectionTitle>TESLİM EDİLEN BOŞ KAPLAR</SectionTitle>
      <ReturnsBlock groups={returnGroups} />
    </div>
  )
}
