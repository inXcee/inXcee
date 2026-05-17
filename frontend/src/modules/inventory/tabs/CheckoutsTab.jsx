import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { fmt } from '../constants.js'
import ActiveCheckoutsPanel from '../components/ActiveCheckoutsPanel.jsx'

export default function CheckoutsTab() {
  const [view, setView] = useState('active')
  const { data: history = [] } = useQuery({
    queryKey: ['checkouts-history'],
    queryFn: () => api.get('/inventory/checkouts/history?limit=100').then(r => r.data),
    enabled: view === 'history',
  })
  return (
    <div>
      <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '3px', width: 'fit-content' }}>
        {[['active', 'AKTİF'], ['report', 'RAPOR'], ['history', 'GEÇMİŞ']].map(([key, label]) => (
          <button key={key} onClick={() => setView(key)} style={{
            padding: '7px 20px', border: 'none', borderRadius: '9px', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '1px',
            background: view === key ? 'var(--accent)' : 'transparent',
            color: view === key ? '#000' : 'var(--text3)',
          }}>{label}</button>
        ))}
      </div>
      {view === 'active' && <ActiveCheckoutsPanel fullView />}
      {view === 'report' && <CheckoutReport />}
      {view === 'history' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--purple),var(--blue))' }} />
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px' }}>AVS PERSONELİ TESLİM GEÇMİŞİ</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{history.length} KAYIT (İADE EDİLENLER DAHİL)</div>
          </div>
          {history.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Geçmiş kayıt yok</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table responsive-stack" style={{ margin: 0 }}>
                <thead><tr><th>AVS PERSONEL</th><th>GÖREV / BİRİM</th><th>MALZEME</th><th>ADET</th><th>TESLİM TARİHİ</th><th>İADE TARİHİ</th><th>VEREN</th><th>DURUM</th></tr></thead>
                <tbody>
                  {history.map(co => (
                    <tr key={co.id} style={{ opacity: co.returned_at ? 0.7 : 1 }}>
                      <td data-label="AVS Personel">
                        <div style={{ fontWeight: 500, fontSize: '12px' }}>{co.personnel_name}</div>
                      </td>
                      <td data-label="Görev / Birim" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                        {co.role_label || co.position || '—'}
                        {co.department_name && <div style={{ fontSize: 9, color: 'var(--text4)' }}>{co.department_name}</div>}
                      </td>
                      <td data-label="Malzeme" style={{ fontSize: '12px' }}>{co.item_name}</td>
                      <td data-label="Adet" style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{co.quantity} <span style={{ fontSize: '9px', fontWeight: 400, color: 'var(--text3)' }}>{co.unit}</span></td>
                      <td data-label="Teslim Tarihi" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmt(co.checked_out_at)}</td>
                      <td data-label="Iade Tarihi" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: co.returned_at ? 'var(--green)' : 'var(--text4)', whiteSpace: 'nowrap' }}>
                        {co.returned_at ? fmt(co.returned_at) : '—'}
                      </td>
                      <td data-label="Veren" style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{co.given_by}</td>
                      <td data-label="Durum">
                        {co.returned_at
                          ? <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 700, background: 'rgba(39,201,106,.08)', color: 'var(--green)', fontFamily: 'var(--mono)' }}>İADE</span>
                          : <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '8px', fontWeight: 700, background: 'rgba(52,152,219,.08)', color: 'var(--blue)', fontFamily: 'var(--mono)' }}>AKTİF</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CheckoutReport() {
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState('personnel') // personnel | block | floor | department

  const { data, isLoading } = useQuery({
    queryKey: ['checkouts-report'],
    queryFn: () => api.get('/inventory/checkouts/report').then(r => r.data),
    refetchInterval: 60000,
  })

  if (isLoading) {
    return <div style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>Yükleniyor…</div>
  }

  const t = data?.totals || {}
  const byPersonnel = data?.byPersonnel || []
  const byBlock = data?.byBlock || []
  const byFloor = data?.byFloor || []
  const byDepartment = data?.byDepartment || []

  const filteredPersonnel = search
    ? byPersonnel.filter(p =>
        `${p.name} ${p.role_label || ''} ${p.department_name || ''} ${p.block || ''} ${p.floor || ''} ${p.position || ''} ${p.items_summary || ''}`
          .toLowerCase()
          .includes(search.toLowerCase()))
    : byPersonnel

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Bilgilendirme */}
      <div style={{ padding: '10px 14px', background: 'rgba(52,152,219,.05)', border: '1px solid rgba(52,152,219,.2)', borderRadius: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--blue)', letterSpacing: 0.5 }}>
        👤 Bu rapor sadece AVS personeline yapılan teslimleri içerir — yatakhane sakinleri kapsama dahil değil
      </div>

      {/* Toplam kartlar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <SummaryCard label="AKTİF TOPLAM" value={t.active_qty || 0} sub="adet" color="var(--blue)" big />
        <SummaryCard label="AVS PERSONEL" value={t.personnel_count || 0} sub="kişi" color="var(--accent)" />
        <SummaryCard label="ÜRÜN ÇEŞİDİ" value={t.distinct_items || 0} sub="çeşit" />
        <SummaryCard label="AKTİF KAYIT" value={t.active_checkouts || 0} sub="teslim" />
        <SummaryCard label="İADE EDİLEN" value={t.returned_qty || 0} sub="adet" color="var(--green)" />
      </div>

      {/* Group selector */}
      <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, width: 'fit-content', flexWrap: 'wrap' }}>
        {[
          ['personnel', '👤 Personel'],
          ['block', '◆ Blok'],
          ['floor', '⧉ Kat'],
          ['department', '⌂ Departman'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setGroupBy(key)} style={{
            padding: '6px 14px', border: 'none', borderRadius: 7, cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, letterSpacing: 1,
            background: groupBy === key ? 'var(--accent)' : 'transparent',
            color: groupBy === key ? '#000' : 'var(--text3)',
          }}>{label}</button>
        ))}
      </div>

      {groupBy === 'personnel' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg,var(--accent),var(--blue))' }} />
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2 }}>AVS PERSONEL BAZINDA</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{filteredPersonnel.length} KİŞİ · KİM NE ALDI</div>
            </div>
            <div style={{ flex: 1 }} />
            <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="AVS personel/görev/blok/ürün ara…"
              style={{ width: 280, fontSize: 11, borderRadius: 10, padding: '6px 10px' }} />
          </div>
          {filteredPersonnel.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>
              {byPersonnel.length === 0 ? 'Şu anda kimsenin üzerinde teslim alınmış malzeme yok' : 'Aranan kayıt yok'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ margin: 0, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>AVS PERSONEL</th>
                    <th style={{ textAlign: 'left' }}>GÖREV / BİRİM</th>
                    <th style={{ textAlign: 'left' }}>BLOK / KAT</th>
                    <th style={{ textAlign: 'right' }}>TOPLAM ADET</th>
                    <th style={{ textAlign: 'center' }}>ÇEŞİT</th>
                    <th style={{ textAlign: 'left' }}>ÜRÜNLER</th>
                    <th style={{ textAlign: 'right' }}>SON</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPersonnel.map(p => (
                    <tr key={p.staff_id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                        {p.pickup_name && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>🚌 {p.pickup_name}</div>}
                      </td>
                      <td style={{ padding: 10, fontSize: 11, color: 'var(--text2)' }}>
                        {p.role_label || p.position || '—'}
                        {p.department_name && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{p.department_name}</div>}
                      </td>
                      <td style={{ padding: 10, fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {p.block ? <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{p.block}{p.floor != null ? ` / ${p.floor}.kat` : ''}</span> : <span style={{ color: 'var(--text4)' }}>—</span>}
                      </td>
                      <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                        {p.active_qty}
                      </td>
                      <td style={{ padding: 10, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11 }}>{p.distinct_items}</td>
                      <td style={{ padding: 10, fontSize: 11, color: 'var(--text2)', maxWidth: 320 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.items_summary}>
                          {p.items_summary || '—'}
                        </div>
                      </td>
                      <td style={{ padding: 10, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                        {fmt(p.last_checkout_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {groupBy === 'block' && (
        <GroupTable
          title="BLOK BAZINDA"
          subtitle="AVS PERSONELİN ATAMA BLOĞUNA GÖRE TOPLAM TESLİM"
          rows={byBlock}
          columns={[
            { key: 'block', label: 'BLOK', render: r => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>{r.block}</span> },
            { key: 'active_qty', label: 'TOPLAM ADET', align: 'right', render: r => <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{r.active_qty}</span> },
            { key: 'personnel_count', label: 'AVS KİŞİ', align: 'center', render: r => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.personnel_count}</span> },
            { key: 'distinct_items', label: 'ÇEŞİT', align: 'center', render: r => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.distinct_items}</span> },
          ]}
        />
      )}

      {groupBy === 'floor' && (
        <GroupTable
          title="KAT BAZINDA"
          subtitle="ATAMA BLOK + KAT KIRILIMI"
          rows={byFloor}
          columns={[
            { key: 'block', label: 'BLOK', render: r => <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{r.block}</span> },
            { key: 'floor', label: 'KAT', align: 'center', render: r => <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600 }}>{r.floor}. kat</span> },
            { key: 'active_qty', label: 'TOPLAM ADET', align: 'right', render: r => <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{r.active_qty}</span> },
            { key: 'personnel_count', label: 'AVS KİŞİ', align: 'center', render: r => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.personnel_count}</span> },
          ]}
        />
      )}

      {groupBy === 'department' && (
        <GroupTable
          title="DEPARTMAN BAZINDA"
          subtitle="HER DEPARTMANIN TOPLAM TESLİMİ"
          rows={byDepartment}
          columns={[
            { key: 'department', label: 'DEPARTMAN', render: r => <span style={{ fontSize: 13, fontWeight: 600 }}>{r.department}</span> },
            { key: 'active_qty', label: 'TOPLAM ADET', align: 'right', render: r => <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{r.active_qty}</span> },
            { key: 'personnel_count', label: 'AVS KİŞİ', align: 'center', render: r => <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{r.personnel_count}</span> },
          ]}
        />
      )}
    </div>
  )
}

function SummaryCard({ label, value, sub, color = 'var(--text)', big }) {
  return (
    <div style={{
      padding: big ? '14px 16px' : '12px 14px',
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: big ? 28 : 22, color, fontWeight: 700, letterSpacing: 1 }}>{value}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{sub}</span>
      </div>
    </div>
  )
}

function GroupTable({ title, subtitle, rows, columns }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ height: 2, background: 'linear-gradient(90deg,var(--accent),var(--blue))' }} />
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 2 }}>{title}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{rows.length} KAYIT · {subtitle}</div>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>Veri yok</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ margin: 0, width: '100%' }}>
            <thead>
              <tr>
                {columns.map(c => <th key={c.key} style={{ textAlign: c.align || 'left' }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  {columns.map(c => (
                    <td key={c.key} style={{ padding: 10, textAlign: c.align || 'left' }}>{c.render(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
