import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

export default function KioskPinPage() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState(null)

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['personnel-search', search],
    queryFn: () => search.length >= 2
      ? api.get(`/checkin/search?q=${encodeURIComponent(search)}`).then(r => r.data)
      : [],
    enabled: search.length >= 2,
  })

  const setPinMut = useMutation({
    mutationFn: ({ id, pin }) => api.patch(`/checkin/${id}/kiosk-pin`, { pin }),
    onSuccess: () => { setMsg({ type: 'ok', text: 'PIN basariyla atandi' }); setPin(''); setSelectedId(null) },
    onError: e => setMsg({ type: 'err', text: e.response?.data?.error || 'Hata' }),
  })

  const resetPinMut = useMutation({
    mutationFn: (id) => api.delete(`/checkin/${id}/kiosk-pin`),
    onSuccess: () => setMsg({ type: 'ok', text: 'PIN sifirlandi' }),
    onError: e => setMsg({ type: 'err', text: e.response?.data?.error || 'Hata' }),
  })

  return (
    <div>
      <div className="fade-up" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '28px', letterSpacing: '4px' }}>KIOSK PIN</h2>
        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '4px' }}>
          PERSONEL KIOSK ERISIM PIN YONETIMI
        </p>
      </div>

      <div className="panel fade-up-1" style={{ marginBottom: '16px' }}>
        <div style={{ height: '2px', background: 'var(--accent)' }} />
        <div className="panel-header"><div className="panel-title">PERSONEL ARA</div></div>
        <div className="panel-body">
          <input
            className="form-input"
            placeholder="Ad, soyad veya oda no (en az 2 karakter)..."
            value={search}
            onChange={e => { setSearch(e.target.value); setMsg(null) }}
            style={{ maxWidth: '400px' }}
          />
        </div>
      </div>

      {msg && (
        <div className={`alert ${msg.type === 'ok' ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: '12px' }}>
          {msg.text}
        </div>
      )}

      {search.length >= 2 && (
        <div className="panel fade-up-2">
          <div style={{ height: '2px', background: 'linear-gradient(90deg, var(--accent), var(--accent3))' }} />
          <div className="panel-header">
            <div className="panel-title">SONUCLAR</div>
            {isFetching && <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>Aranıyor...</span>}
          </div>
          <div className="panel-body" style={{ overflowX: 'auto' }}>
            {results.length === 0 && !isFetching ? (
              <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '12px' }}>Sonuc bulunamadi</div>
            ) : (
              <table className="data-table responsive-stack">
                <thead>
                  <tr>
                    <th>Ad Soyad</th>
                    <th>TC No</th>
                    <th>Blok / Oda</th>
                    <th>PIN Durumu</th>
                    <th>Islemler</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(p => (
                    <tr key={p.id}>
                      <td data-label="Ad Soyad" style={{ fontWeight: 500 }}>{p.full_name}</td>
                      <td data-label="TC No" style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{p.tc_no || '-'}</td>
                      <td data-label="Blok / Oda" style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{p.block ? `${p.block} / ${p.room_no}` : '-'}</td>
                      <td data-label="PIN Durumu">
                        <span
                          style={{
                            fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 600,
                            padding: '2px 8px', borderRadius: '4px', letterSpacing: '1px',
                            background: p.has_kiosk_pin ? 'rgba(46,204,113,0.15)' : 'rgba(150,150,150,0.15)',
                            color: p.has_kiosk_pin ? 'var(--green)' : 'var(--text3)',
                            border: `1px solid ${p.has_kiosk_pin ? 'rgba(46,204,113,0.3)' : 'var(--border)'}`,
                          }}
                        >
                          {p.has_kiosk_pin ? 'PIN TANIMLI' : 'PIN YOK'}
                        </span>
                      </td>
                      <td data-label="Islemler">
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {selectedId === p.id ? (
                            <>
                              <input
                                className="form-input"
                                type="text"
                                inputMode="numeric"
                                maxLength={4}
                                placeholder="4 hane"
                                value={pin}
                                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                style={{ width: '80px' }}
                              />
                              <button
                                className="btn btn-primary btn-xs"
                                disabled={pin.length !== 4 || setPinMut.isPending}
                                onClick={() => setPinMut.mutate({ id: p.id, pin })}
                              >
                                Kaydet
                              </button>
                              <button className="btn btn-ghost btn-xs" onClick={() => { setSelectedId(null); setPin('') }}>Iptal</button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-ghost btn-xs" onClick={() => { setSelectedId(p.id); setPin(''); setMsg(null) }}>
                                {p.has_kiosk_pin ? 'Degistir' : 'PIN Ata'}
                              </button>
                              {p.has_kiosk_pin && (
                                <button
                                  className="btn btn-danger btn-xs"
                                  disabled={resetPinMut.isPending}
                                  onClick={() => { if (confirm(`${p.full_name} icin PIN sifirlansin mi?`)) resetPinMut.mutate(p.id) }}
                                >
                                  Sifirla
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
