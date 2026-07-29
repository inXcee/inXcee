import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { laundryApi } from '../api.js'
import { ColorPatternDisplay } from './ColorPatternPicker.jsx'

const STATUS_LABELS = {
  received: 'Teslim Alındı', ironing: 'Ütüde',
  ready: 'Hazır', delivered: 'Teslim Edildi', lost: 'Kayıp', damaged: 'Hasarlı',
}
const STATUS_COLORS = {
  received: 'var(--accent)', ironing: '#6366f1',
  ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)', damaged: '#f97316',
}

function FilterRow({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: 1 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const INPUT_STYLE = {
  width: '100%', padding: '7px 10px', borderRadius: 6, boxSizing: 'border-box',
  background: 'var(--surface2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 11, outline: 'none',
}

const SELECT_STYLE = { ...INPUT_STYLE, cursor: 'pointer' }

export default function PremiumSearchPanel() {
  const [filters, setFilters] = useState({
    block: '', room_no: '', type: '', brand: '', size: '', color: '', pattern: '', intake_name: '', status: '', from: '', to: '',
  })
  const [lostOnly, setLostOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [activeFilters, setActiveFilters] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const isFirstRender = useRef(true)
  const debounceRef = useRef(null)

  const { data, isLoading } = useQuery({
    queryKey: ['premium-search', activeFilters, page],
    queryFn: () => laundryApi.searchPremiumGarments({ ...activeFilters, page }),
    enabled: true,
  })
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['garment-detail', selectedId],
    queryFn: () => laundryApi.getGarmentDetail(selectedId),
    enabled: !!selectedId,
  })

  const search = () => {
    setPage(1)
    setActiveFilters(lostOnly ? { ...filters, status: 'lost' } : filters)
  }

  const reset = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    isFirstRender.current = true
    setFilters({ block: '', room_no: '', type: '', brand: '', size: '', color: '', pattern: '', intake_name: '', status: '', from: '', to: '' })
    setLostOnly(false)
    setActiveFilters({})
    setPage(1)
  }

  const set = useCallback((k, v) => setFilters(prev => ({ ...prev, [k]: v })), [])
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPage(1)
      setActiveFilters(lostOnly ? { ...filters, status: 'lost' } : filters)
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [filters, lostOnly])

  const exportCsv = () => {
    if (!data?.rows?.length) return
    const header = 'Kod,Blok,Oda,Tip,Marka,Model,Beden,Renk,Durum,Giriş,Teslim'
    const rows = data.rows.map(g => [
      g.garment_code, g.block, g.room_no, g.garment_type, g.brand || '', g.model || '',
      g.size || '', g.color || '', g.status, g.intake_date?.slice(0, 10) || '', g.delivered_at?.slice(0, 10) || '',
    ].join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `kiyafet-listesi-${new Date().toISOString().slice(0,10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2 }}>Kıyafet Listesi</h2>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            Tüm tekil kıyafetler · kod, oda, ütü, istisna ve operatör geçmişi
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={lostOnly} onChange={e => {
              setLostOnly(e.target.checked)
              if (!e.target.checked) set('status', '')
            }}
            style={{ accentColor: 'var(--red)', width: 14, height: 14 }} />
          <span style={{ fontSize: 10, color: 'var(--red)', fontFamily: 'var(--mono)', fontWeight: 700 }}>
            Kayıp Araştırması
          </span>
        </label>
      </div>

      {/* Filter grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10,
        padding: 14, background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 14,
      }}>
        <FilterRow label="BLOK">
          <input style={INPUT_STYLE} value={filters.block} onChange={e => set('block', e.target.value)} placeholder="A1, M, S…" />
        </FilterRow>
        <FilterRow label="ODA NO">
          <input style={INPUT_STYLE} value={filters.room_no} onChange={e => set('room_no', e.target.value)} placeholder="101" />
        </FilterRow>
        <FilterRow label="TİP">
          <input style={INPUT_STYLE} value={filters.type} onChange={e => set('type', e.target.value)} placeholder="Gömlek, Pantolon…" />
        </FilterRow>
        <FilterRow label="MARKA">
          <input style={INPUT_STYLE} value={filters.brand} onChange={e => set('brand', e.target.value)} placeholder="Polo, Levi's…" />
        </FilterRow>
        <FilterRow label="BEDEN">
          <input style={INPUT_STYLE} value={filters.size} onChange={e => set('size', e.target.value)} placeholder="M, L, 32…" />
        </FilterRow>
        <FilterRow label="RENK">
          <input style={INPUT_STYLE} value={filters.color} onChange={e => set('color', e.target.value)} placeholder="Beyaz, Mavi…" />
        </FilterRow>
        <FilterRow label="DESEN">
          <select style={SELECT_STYLE} value={filters.pattern} onChange={e => set('pattern', e.target.value)}>
            <option value="">Tümü</option>
            <option value="Çizgili">Çizgili</option>
            <option value="Kareli">Kareli</option>
            <option value="Desenli">Desenli</option>
            <option value="Renkli">Renkli</option>
          </select>
        </FilterRow>
        <FilterRow label="KİŞİ ADI">
          <input style={INPUT_STYLE} value={filters.intake_name} onChange={e => set('intake_name', e.target.value)} placeholder="Teslim eden..." />
        </FilterRow>
        <FilterRow label="DURUM">
          <select style={SELECT_STYLE} value={lostOnly ? 'lost' : filters.status} onChange={e => set('status', e.target.value)} disabled={lostOnly}>
            <option value="">Tümü</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </FilterRow>
        <FilterRow label="GİRİŞ BAŞL.">
          <input type="date" style={INPUT_STYLE} value={filters.from} onChange={e => set('from', e.target.value)} />
        </FilterRow>
        <FilterRow label="GİRİŞ BİTİŞ">
          <input type="date" style={INPUT_STYLE} value={filters.to} onChange={e => set('to', e.target.value)} />
        </FilterRow>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button onClick={search} style={{
          padding: '8px 20px', borderRadius: 7, border: 'none', cursor: 'pointer',
          background: 'var(--accent)', color: '#000', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
        }}>
          Ara
        </button>
        <button onClick={reset} style={{
          padding: '8px 14px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer',
          background: 'transparent', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11,
        }}>
          Temizle
        </button>
        {data?.rows?.length > 0 && (
          <button onClick={exportCsv} style={{
            padding: '8px 14px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer',
            background: 'transparent', color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 11,
            marginLeft: 'auto',
          }}>
            CSV İndir
          </button>
        )}
      </div>

      {/* Results */}
      {isLoading && (
        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Aranıyor...</div>
      )}

      {data && !isLoading && (
        <>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginBottom: 8 }}>
            {data.total} sonuç · Sayfa {data.page}
          </div>

          {data.rows.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Sonuç bulunamadı.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {data.rows.map(g => {
                const color = STATUS_COLORS[g.status] || 'var(--text3)'
                return (
                  <button key={g.id} type="button" onClick={() => setSelectedId(g.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderLeft: `3px solid ${color}`, borderRadius: 8, color: 'inherit',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                  }}>
                    {/* Code */}
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: 9, flexShrink: 0,
                      padding: '1px 6px', borderRadius: 4,
                      background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.25)',
                      color: 'var(--accent)',
                    }}>{g.garment_code}</span>

                    {/* Room */}
                    <span style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 1.5, flexShrink: 0 }}>
                      {g.block} · {g.room_no}
                    </span>

                    {/* Type + brand + renk + desen */}
                    <span style={{ flex: 1, fontSize: 10, color: 'var(--text)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ flexShrink: 0 }}>
                        {g.garment_type}
                        {g.brand ? ` · ${g.brand}` : ''}
                        {g.model ? ` ${g.model}` : ''}
                        {g.size ? ` · ${g.size}` : ''}
                      </span>
                      {(g.color || g.pattern) && (
                        <ColorPatternDisplay color={g.color} pattern={g.pattern} />
                      )}
                    </span>

                    {/* intake_name */}
                    {g.intake_name && (
                      <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.intake_name}
                      </span>
                    )}

                    {/* Status */}
                    <span style={{
                      fontSize: 9, fontFamily: 'var(--mono)', flexShrink: 0,
                      padding: '2px 8px', borderRadius: 4,
                      background: `${color}14`, border: `1px solid ${color}35`, color,
                    }}>
                      {STATUS_LABELS[g.status] || g.status}
                    </span>

                    {/* Date */}
                    <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                      {g.intake_date?.slice(0, 10)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {data.total > data.limit && (
            <div style={{ display: 'flex', gap: 6, marginTop: 12, justifyContent: 'center' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10 }}>
                ← Önceki
              </button>
              <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', alignSelf: 'center' }}>
                {page} / {Math.ceil(data.total / data.limit)}
              </span>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(data.total / data.limit)}
                style={{ padding: '5px 12px', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10 }}>
                Sonraki →
              </button>
            </div>
          )}
        </>
      )}

      {selectedId && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.58)',
          display: 'flex', justifyContent: 'flex-end',
        }} onClick={() => setSelectedId(null)}>
          <aside style={{
            width: 'min(520px, 100vw)', height: '100%', overflowY: 'auto',
            background: 'var(--bg)', borderLeft: '1px solid var(--border)', padding: 20,
          }} onClick={event => event.stopPropagation()}>
            <button type="button" onClick={() => setSelectedId(null)}
              style={{ float: 'right', minWidth: 40, minHeight: 40, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }}>
              ✕
            </button>
            {detailLoading || !detail ? (
              <div style={{ color: 'var(--text3)' }}>Detay yükleniyor…</div>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)' }}>
                  {detail.garment.garment_code}
                </div>
                <h2 style={{ margin: '4px 0 2px' }}>
                  {detail.garment.emoji || '👕'} {detail.garment.garment_type}
                </h2>
                <div style={{ color: 'var(--text3)', marginBottom: 16 }}>
                  {detail.garment.block} · {detail.garment.room_no} · {detail.garment.bag_no}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                  {[
                    ['Durum', STATUS_LABELS[detail.garment.status] || detail.garment.status],
                    ['Ütü', detail.garment.requires_ironing ? 'Gerekli' : 'Gerekmiyor'],
                    ['Ütüleyen', detail.garment.ironed_by_name || '—'],
                    ['Tik zamanı', detail.garment.ironed_at || '—'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>{label.toUpperCase()}</div>
                      <div style={{ fontSize: 11, marginTop: 3 }}>{value}</div>
                    </div>
                  ))}
                </div>

                <h3 style={{ fontSize: 12, letterSpacing: 1 }}>İSTİSNALAR</h3>
                {detail.exceptions.length === 0 ? (
                  <div style={{ color: 'var(--text3)', fontSize: 11 }}>İstisna yok</div>
                ) : detail.exceptions.map(row => (
                  <div key={row.id} style={{ background: 'var(--surface2)', borderLeft: '3px solid #f97316', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <strong>{row.reason}</strong> · {row.operator_name}
                    <div style={{ color: 'var(--text3)', fontSize: 10 }}>{row.created_at} {row.note ? `· ${row.note}` : ''}</div>
                    {row.photo_url && (
                      <a href={row.photo_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 11 }}>
                        Fotoğrafı aç
                      </a>
                    )}
                  </div>
                ))}

                <h3 style={{ fontSize: 12, letterSpacing: 1, marginTop: 20 }}>PARÇA GEÇMİŞİ</h3>
                {detail.history.map(row => (
                  <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, borderBottom: '1px solid var(--border)', padding: '9px 0', fontSize: 10 }}>
                    <span style={{ color: 'var(--text3)' }}>{row.created_at}</span>
                    <span>
                      <strong>{row.from_status || 'başlangıç'} → {row.to_status}</strong>
                      <br />{row.operator_name} · {row.operator_type}
                      {row.notes ? <><br /><span style={{ color: 'var(--text3)' }}>{row.notes}</span></> : null}
                    </span>
                  </div>
                ))}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
