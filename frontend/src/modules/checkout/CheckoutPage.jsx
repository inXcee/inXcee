import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const STEPS = [
  { key: 'search', label: 'ARAMA' },
  { key: 'zimmet', label: 'ZIMMET INCELE' },
  { key: 'summary', label: 'OZET' },
  { key: 'complete', label: 'TAMAMLA' },
]

function StepBar({ step }) {
  return (
    <div style={{ display: 'flex', gap: '0', marginBottom: '24px' }}>
      {STEPS.map((s, i) => {
        const done = i < step, active = i === step
        return (
          <div key={s.key} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '7px',
                background: active ? 'rgba(240,165,0,.1)' : done ? 'rgba(39,201,106,.08)' : 'var(--surface2)',
                border: `1px solid ${active ? 'rgba(240,165,0,.3)' : done ? 'rgba(39,201,106,.2)' : 'var(--border)'}`,
              }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? 'var(--accent)' : done ? 'var(--green)' : 'var(--surface3)',
                  fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                  color: active || done ? '#000' : 'var(--text3)',
                }}>{done ? '\u2713' : i + 1}</div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px',
                  color: active ? 'var(--accent)' : done ? 'var(--green)' : 'var(--text3)' }}>{s.label}</span>
              </div>
            </div>
            {i < STEPS.length - 1 && <div style={{ width: '16px', height: '1px', flexShrink: 0, background: done ? 'rgba(39,201,106,.4)' : 'var(--border)' }} />}
          </div>
        )
      })}
    </div>
  )
}

export default function CheckoutPage() {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [preview, setPreview] = useState(null)
  const [zimmetActions, setZimmetActions] = useState([])
  const [completed, setCompleted] = useState(false)

  // Search personnel
  const searchMut = useMutation({
    mutationFn: (name) => api.post('/checkin/search-name', { name }).then(r => r.data),
  })

  // Get checkout preview
  const previewMut = useMutation({
    mutationFn: (id) => api.get(`/checkout/preview/${id}`).then(r => r.data),
    onSuccess: (data) => {
      setPreview(data)
      // Initialize zimmet actions for unreturned items
      setZimmetActions(data.unreturned.map(z => ({ zimmet_id: z.id, item_name: z.item_name, action: 'return', note: '' })))
      setStep(1)
    },
  })

  // Process checkout
  const checkoutMut = useMutation({
    mutationFn: ({ personnel_id, zimmet_actions }) =>
      api.post('/checkout/process', { personnel_id, zimmet_actions }).then(r => r.data),
    onSuccess: () => {
      setCompleted(true)
      setStep(3)
      queryClient.invalidateQueries({ queryKey: ['recent-checkouts'] })
    },
  })

  // Recent checkouts
  const { data: recentCheckouts = [] } = useQuery({
    queryKey: ['recent-checkouts'],
    queryFn: () => api.get('/checkout/recent?limit=20').then(r => r.data),
  })

  function handleSearch() {
    if (searchTerm.trim().length < 2) return
    searchMut.mutate(searchTerm.trim())
  }

  function handleSelectPerson(person) {
    setSelectedPerson(person)
    previewMut.mutate(person.id)
  }

  function handleZimmetAction(index, field, value) {
    setZimmetActions(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  function handleReset() {
    setStep(0)
    setSearchTerm('')
    setSelectedPerson(null)
    setPreview(null)
    setZimmetActions([])
    setCompleted(false)
    searchMut.reset()
    previewMut.reset()
    checkoutMut.reset()
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <span style={{ fontSize: '20px' }}>{'\u2199'}</span>
        <div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: '22px', letterSpacing: '3px', margin: 0, color: 'var(--text)' }}>CHECK-OUT</h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', margin: 0 }}>
            PERSONEL CIKIS ISLEMI
          </p>
        </div>
      </div>

      <StepBar step={step} />

      {/* ── STEP 0: ARAMA ──────────────────────────────────────── */}
      {step === 0 && (
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '12px' }}>
            PERSONEL ARA
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input
              className="form-input"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Ad, firma veya meslek yazin..."
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={handleSearch}
              disabled={searchMut.isPending || searchTerm.trim().length < 2}
              style={{ padding: '8px 20px', fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1px' }}>
              {searchMut.isPending ? 'ARANIYOR...' : 'ARA'}
            </button>
          </div>

          {searchMut.data && searchMut.data.length === 0 && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', textAlign: 'center', padding: '20px' }}>
              Sonuc bulunamadi
            </div>
          )}

          {searchMut.data && searchMut.data.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {searchMut.data.filter(p => !p.is_blacklisted).map(person => (
                <div key={person.id} onClick={() => handleSelectPerson(person)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                    background: selectedPerson?.id === person.id ? 'rgba(240,165,0,.1)' : 'var(--surface2)',
                    border: `1px solid ${selectedPerson?.id === person.id ? 'rgba(240,165,0,.3)' : 'var(--border)'}`,
                    borderRadius: '7px', cursor: 'pointer', transition: 'all .12s',
                  }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--sans)', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      {person.full_name}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
                      {person.company || '—'} {person.job_title ? `· ${person.job_title}` : ''}
                    </div>
                  </div>
                  {person.block && (
                    <div style={{
                      fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)',
                      background: 'rgba(240,165,0,.1)', padding: '3px 8px', borderRadius: '4px',
                      border: '1px solid rgba(240,165,0,.2)',
                    }}>
                      {person.block}-{person.room_no}
                    </div>
                  )}
                  {person.shift_type && (
                    <div style={{
                      fontFamily: 'var(--mono)', fontSize: '9px',
                      color: person.shift_type === 'night' ? 'var(--blue)' : 'var(--text3)',
                      letterSpacing: '0.5px',
                    }}>
                      {person.shift_type === 'night' ? 'GECE' : 'GUNDUZ'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {previewMut.isPending && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--accent)', textAlign: 'center', padding: '20px' }}>
              YUKLENIYOR...
            </div>
          )}
        </div>
      )}

      {/* ── STEP 1: ZIMMET INCELE ───────────────────────────────── */}
      {step === 1 && preview && (
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '16px' }}>
            ZIMMET INCELE — {preview.person.full_name}
          </div>

          {preview.unreturned.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '24px',
              background: 'rgba(39,201,106,.06)', borderRadius: '8px', border: '1px solid rgba(39,201,106,.2)',
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--green)', marginBottom: '4px' }}>
                {'\u2713'} TESLIM EDILMEMIS ZIMMET YOK
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                Tum zimmet kalemleri teslim edilmis
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {zimmetActions.map((za, idx) => (
                <div key={za.zimmet_id} style={{
                  padding: '12px', borderRadius: '7px',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--sans)', fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                        {za.item_name}
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                        Miktar: {preview.unreturned[idx]?.quantity || 1}
                      </div>
                    </div>
                    <select
                      value={za.action}
                      onChange={e => handleZimmetAction(idx, 'action', e.target.value)}
                      className="form-input"
                      style={{ width: '140px', fontFamily: 'var(--mono)', fontSize: '11px' }}
                    >
                      <option value="return">Iade</option>
                      <option value="damaged">Hasarli</option>
                      <option value="lost">Kayip</option>
                    </select>
                  </div>
                  {(za.action === 'damaged' || za.action === 'lost') && (
                    <input
                      className="form-input"
                      placeholder={za.action === 'damaged' ? 'Hasar aciklamasi...' : 'Kayip aciklamasi...'}
                      value={za.note}
                      onChange={e => handleZimmetAction(idx, 'note', e.target.value)}
                      style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Already returned items */}
          {preview.zimmet.filter(z => z.returned_at).length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1.5px', marginBottom: '6px' }}>
                DAHA ONCE TESLIM EDILENLER
              </div>
              {preview.zimmet.filter(z => z.returned_at).map(z => (
                <div key={z.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
                  fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ flex: 1 }}>{z.item_name}</span>
                  <span style={{
                    fontSize: '9px', padding: '2px 6px', borderRadius: '3px',
                    background: z.return_condition === 'normal' ? 'rgba(39,201,106,.1)' : 'rgba(231,76,60,.1)',
                    color: z.return_condition === 'normal' ? 'var(--green)' : 'var(--red)',
                  }}>
                    {z.return_condition === 'normal' ? 'IADE' : z.return_condition === 'damaged' ? 'HASARLI' : 'KAYIP'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
            <button className="btn" onClick={() => setStep(0)}
              style={{ padding: '8px 16px', fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1px',
                background: 'var(--surface3)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '6px', cursor: 'pointer' }}>
              GERI
            </button>
            <button className="btn btn-primary" onClick={() => setStep(2)}
              style={{ padding: '8px 20px', fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1px' }}>
              DEVAM
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: OZET ───────────────────────────────────────── */}
      {step === 2 && preview && (
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '16px' }}>
            CIKIS OZETI
          </div>

          {/* Person info */}
          <div style={{
            padding: '14px', borderRadius: '8px', marginBottom: '16px',
            background: 'var(--surface2)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontFamily: 'var(--sans)', fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
              {preview.person.full_name}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '6px' }}>
              <InfoRow label="FIRMA" value={preview.person.company || '—'} />
              <InfoRow label="MESLEK" value={preview.person.job_title || '—'} />
              <InfoRow label="ODA" value={preview.person.block ? `${preview.person.block}-${preview.person.room_no} / Yatak ${preview.person.bed_no}` : 'Atanmamis'} />
              <InfoRow label="VARDIYA" value={preview.person.shift_type === 'night' ? 'Gece' : 'Gunduz'} />
              {preview.person.emergency_name && (
                <InfoRow label="ACİL KİŞİ" value={preview.person.emergency_name} />
              )}
              {preview.person.emergency_phone && (
                <InfoRow label="ACİL TEL" value={preview.person.emergency_phone} />
              )}
            </div>
          </div>

          {/* Zimmet actions summary */}
          {zimmetActions.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1.5px', marginBottom: '8px' }}>
                ZIMMET ISLEMLERI
              </div>
              {zimmetActions.map(za => (
                <div key={za.zimmet_id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
                  fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text)',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ flex: 1 }}>{za.item_name}</span>
                  <span style={{
                    fontSize: '9px', padding: '2px 6px', borderRadius: '3px', letterSpacing: '0.5px',
                    background: za.action === 'return' ? 'rgba(39,201,106,.1)' : za.action === 'damaged' ? 'rgba(240,165,0,.1)' : 'rgba(231,76,60,.1)',
                    color: za.action === 'return' ? 'var(--green)' : za.action === 'damaged' ? 'var(--accent)' : 'var(--red)',
                  }}>
                    {za.action === 'return' ? 'IADE' : za.action === 'damaged' ? 'HASARLI' : 'KAYIP'}
                  </span>
                  {za.note && <span style={{ fontSize: '9px', color: 'var(--text3)' }}>({za.note})</span>}
                </div>
              ))}
            </div>
          )}

          {/* Discipline history */}
          {preview.discipline.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1.5px', marginBottom: '8px' }}>
                DISIPLIN GECMISI
              </div>
              {preview.discipline.map(d => (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
                  fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{
                    fontSize: '9px', padding: '2px 6px', borderRadius: '3px',
                    background: d.card_type === 'red' ? 'rgba(231,76,60,.1)' : 'rgba(240,165,0,.1)',
                    color: d.card_type === 'red' ? 'var(--red)' : 'var(--accent)',
                  }}>
                    {d.card_type === 'red' ? 'KIRMIZI' : 'SARI'}
                  </span>
                  <span style={{ flex: 1 }}>{d.reason}</span>
                  <span style={{ fontSize: '9px' }}>{new Date(d.created_at).toLocaleDateString('tr-TR')}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
            <button className="btn" onClick={() => setStep(1)}
              style={{ padding: '8px 16px', fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1px',
                background: 'var(--surface3)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '6px', cursor: 'pointer' }}>
              GERI
            </button>
            <button className="btn btn-primary"
              disabled={checkoutMut.isPending}
              onClick={() => checkoutMut.mutate({
                personnel_id: preview.person.id,
                zimmet_actions: zimmetActions,
              })}
              style={{ padding: '8px 20px', fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1px',
                background: 'var(--red)', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer',
                opacity: checkoutMut.isPending ? 0.6 : 1 }}>
              {checkoutMut.isPending ? 'ISLENIYOR...' : 'CIKISI TAMAMLA'}
            </button>
          </div>
          {checkoutMut.isError && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--red)', marginTop: '12px' }}>
              Hata: {checkoutMut.error?.response?.data?.error || checkoutMut.error?.message}
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: BAŞARI ─────────────────────────────────────── */}
      {step === 3 && (
        <div className="card" style={{ padding: '20px' }}>
          {!completed ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '20px' }}>
                CIKIS ISLEMINI ONAYLAYIN
              </div>
              <div style={{ fontFamily: 'var(--sans)', fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
                {preview?.person.full_name}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', marginBottom: '24px' }}>
                {preview?.person.block ? `${preview.person.block}-${preview.person.room_no}` : ''} {preview?.person.company || ''}
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button className="btn" onClick={() => setStep(2)}
                  style={{ padding: '10px 20px', fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1px',
                    background: 'var(--surface3)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '6px', cursor: 'pointer' }}>
                  GERI
                </button>
                <button className="btn btn-primary"
                  disabled={checkoutMut.isPending}
                  onClick={() => checkoutMut.mutate({
                    personnel_id: preview.person.id,
                    zimmet_actions: zimmetActions,
                  })}
                  style={{ padding: '10px 24px', fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1px',
                    background: 'var(--red)', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>
                  {checkoutMut.isPending ? 'ISLENIYOR...' : 'CIKISI TAMAMLA'}
                </button>
              </div>
              {checkoutMut.isError && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--red)', marginTop: '12px' }}>
                  Hata: {checkoutMut.error?.response?.data?.error || checkoutMut.error?.message}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%', margin: '0 auto 16px',
                background: 'rgba(39,201,106,.15)', border: '2px solid var(--green)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--mono)', fontSize: '20px', color: 'var(--green)',
              }}>{'\u2713'}</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', color: 'var(--green)', marginBottom: '8px' }}>
                CIKIS TAMAMLANDI
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', marginBottom: '24px' }}>
                {preview?.person.full_name} basariyla cikis yapti
              </div>
              <button className="btn btn-primary" onClick={handleReset}
                style={{ padding: '10px 24px', fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1px' }}>
                YENI CIKIS ISLEMI
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── RECENT CHECKOUTS ─────────────────────────────────────── */}
      <div className="card" style={{ padding: '20px', marginTop: '20px' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '12px' }}>
          SON CIKISLAR
        </div>
        {recentCheckouts.length === 0 ? (
          <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', textAlign: 'center', padding: '16px' }}>
            Henuz cikis islemi yok
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: '11px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', fontWeight: 400 }}>AD SOYAD</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', fontWeight: 400 }}>FIRMA</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', fontWeight: 400 }}>ODA</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', fontWeight: 400 }}>TARIH</th>
                </tr>
              </thead>
              <tbody>
                {recentCheckouts.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px', color: 'var(--text)' }}>{r.full_name}</td>
                    <td style={{ padding: '8px', color: 'var(--text3)' }}>{r.company || '—'}</td>
                    <td style={{ padding: '8px', color: 'var(--text3)' }}>{r.block ? `${r.block}-${r.room_no}` : '—'}</td>
                    <td style={{ padding: '8px', color: 'var(--text3)', fontSize: '10px' }}>
                      {r.check_out_date ? new Date(r.check_out_date).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '1px', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--sans)', fontSize: '12px', color: 'var(--text)' }}>{value}</div>
    </div>
  )
}
