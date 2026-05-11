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
        {[['active', 'AKTİF'], ['history', 'GEÇMİŞ']].map(([key, label]) => (
          <button key={key} onClick={() => setView(key)} style={{
            padding: '7px 20px', border: 'none', borderRadius: '9px', cursor: 'pointer',
            fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, letterSpacing: '1px',
            background: view === key ? 'var(--accent)' : 'transparent',
            color: view === key ? '#000' : 'var(--text3)',
          }}>{label}</button>
        ))}
      </div>
      {view === 'active' && <ActiveCheckoutsPanel fullView />}
      {view === 'history' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ height: '2px', background: 'linear-gradient(90deg,var(--purple),var(--blue))' }} />
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: '14px', letterSpacing: '2px' }}>TESLİM GEÇMİŞİ</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{history.length} KAYIT (İADE EDİLENLER DAHİL)</div>
          </div>
          {history.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>Geçmiş kayıt yok</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table responsive-stack" style={{ margin: 0 }}>
                <thead><tr><th>PERSONEL</th><th>MALZEME</th><th>ADET</th><th>TESLİM TARİHİ</th><th>İADE TARİHİ</th><th>VEREN</th><th>DURUM</th></tr></thead>
                <tbody>
                  {history.map(co => (
                    <tr key={co.id} style={{ opacity: co.returned_at ? 0.7 : 1 }}>
                      <td data-label="Personel">
                        <div style={{ fontWeight: 500, fontSize: '12px' }}>{co.personnel_name}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>{co.company || '-'}</div>
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
