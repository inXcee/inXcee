// Check-in orkestratörü: ara → kaydet → oda ata → zimmet sihirbazı (4 adım) +
// sağ panel istatistik panosu. Akış durumu burada tutulur; sunum/iş parçaları:
// ./shared (StepBar/AutoInput), ./RoomPicker, ./StatsDashboard, ./QuickFillModal
// ve mevcut ./BlacklistAlert, ./ZimmetForm, ./CsvImport.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import HelpHint from '../../shared/components/HelpHint.jsx'
import BlacklistAlert from './BlacklistAlert.jsx'
import { useDraft } from '../../shared/hooks/useDraft.js'
import DraftBanner from '../../shared/components/DraftBanner.jsx'
import ZimmetForm from './ZimmetForm.jsx'
import CsvImport from './CsvImport.jsx'
import { useToastStore } from '../../shared/store/toastStore.js'
import { StepBar, AutoInput, INIT_FORM_DATA } from './shared.jsx'
import RoomPicker from './RoomPicker.jsx'
import StatsDashboard from './StatsDashboard.jsx'
import QuickFillModal from './QuickFillModal.jsx'

// ── Main Page ───────────────────────────────────────────────────────────────
export default function CheckinPage() {
  const addToast = useToastStore(s => s.addToast)
  const [step, setStep] = useState(0)
  const [searchMode, setSearchMode] = useState('name')
  const [tcNo, setTcNo] = useState('')
  const [passportNo, setPassportNo] = useState('')
  const [nameSearch, setNameSearch] = useState('')
  const [nameResults, setNameResults] = useState([])
  const [nameSearching, setNameSearching] = useState(false)
  const [foundPerson, setFoundPerson] = useState(null)
  const [blacklistPerson, setBlacklistPerson] = useState(null)
  const [formData, setFormData] = useState(INIT_FORM_DATA)
  const { hasDraft, restoreDraft, discardDraft, onSubmitSuccess } = useDraft('draft:checkin', formData, setFormData, INIT_FORM_DATA)
  const [shiftType, setShiftType] = useState('day')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [personnelId, setPersonnelId] = useState(null)
  const [suggestedRoom, setSuggestedRoom] = useState(null)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [assignedBed, setAssignedBed] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [quickFillRoom, setQuickFillRoom] = useState(null)
  const [quickFillCount, setQuickFillCount] = useState(1)
  const [quickFillLoading, setQuickFillLoading] = useState(false)

  const qc = useQueryClient()

  // Autocomplete suggestions
  const { data: companySugg = [] } = useQuery({
    queryKey: ['company-suggestions'],
    queryFn: () => api.get('/checkin/company-suggestions').then(r => r.data),
  })
  const { data: jobSugg = [] } = useQuery({
    queryKey: ['job-suggestions'],
    queryFn: () => api.get('/checkin/job-suggestions').then(r => r.data),
  })
  const { data: registeredCompanies = [] } = useQuery({
    queryKey: ['registered-companies'],
    queryFn: () => api.get('/companies?active=1').then(r => r.data),
  })

  // Kayitli firmalar + hicbiri eslesmeyen serbest stringler birlestirilir.
  const companyNames = [
    ...registeredCompanies.map(c => c.name),
    ...companySugg.map(c => c.company).filter(n => !registeredCompanies.some(rc => rc.name === n)),
  ]
  const jobNames = jobSugg.map(j => j.job_title)

  // Form'da company string seciliyse, kayitli firmalarda esleserse company_id'yi otomatik set et.
  const formCompanyId = (() => {
    if (!formData.company) return null
    const match = registeredCompanies.find(c => c.name === formData.company)
    return match ? match.id : null
  })()

  const handleNameSearch = async (q) => {
    setNameSearch(q)
    if (q.trim().length < 2) { setNameResults([]); return }
    setNameSearching(true)
    try {
      const res = await api.post('/checkin/search-name', { name: q.trim() })
      setNameResults(res.data)
    } catch { setNameResults([]) }
    finally { setNameSearching(false) }
  }

  const handleSelectPerson = async (person) => {
    if (person.is_blacklisted) { setBlacklistPerson(person); return }
    setFoundPerson(person)
    setPersonnelId(person.id)
    setFormData({ full_name: person.full_name, company: person.company || '', job_title: person.job_title || '', preferred_block: person.preferred_block || '', emergency_name: '', emergency_phone: '' })
    setShiftType(person.shift_type || 'day')
    setNameResults([])
    setError('')
    setLoading(true)
    try {
      const roomRes = await api.post('/checkin/suggest-room', { company: person.company || '', hometown: '' })
      setSuggestedRoom(roomRes.data)
      setSelectedRoom(roomRes.data)
    } catch { setSuggestedRoom(null); setSelectedRoom(null) }
    setLoading(false)
    setStep(2)
  }

  const handleLookup = async () => {
    if (!tcNo && !passportNo) return
    setLoading(true); setError('')
    try {
      const res = await api.post('/checkin/lookup', { tc_no: tcNo || undefined, passport_no: passportNo || undefined })
      if (res.data.found) {
        await handleSelectPerson(res.data)
      } else {
        setStep(1)
      }
    } catch (e) { setError(e.response?.data?.error || 'Arama hatası') }
    finally { setLoading(false) }
  }

  const handleRegister = async () => {
    setLoading(true); setError('')
    try {
      const res = await api.post('/checkin/register', { tc_no: tcNo || undefined, passport_no: passportNo || undefined, ...formData, company_id: formCompanyId || undefined })
      setPersonnelId(res.data.id)
      try { await api.post('/checkin/set-shift', { personnel_id: res.data.id, shift_type: shiftType }) } catch {}
      if (photoFile) {
        try {
          const fd = new FormData()
          fd.append('photo', photoFile)
          await api.post(`/checkin/photo/${res.data.id}`, fd)
        } catch {}
      }
      qc.invalidateQueries(['company-suggestions'])
      qc.invalidateQueries(['job-suggestions'])
      try {
        const roomRes = await api.post('/checkin/suggest-room', { company: formData.company, hometown: '' })
        setSuggestedRoom(roomRes.data)
        setSelectedRoom(roomRes.data)
      } catch { setSuggestedRoom(null); setSelectedRoom(null) }
      onSubmitSuccess()
      setStep(2)
    } catch (e) { setError(e.response?.data?.error || 'Kayıt hatası') }
    finally { setLoading(false) }
  }

  const handleAssignRoom = async () => {
    if (!selectedRoom) return
    setLoading(true); setError('')
    try {
      const res = await api.post('/checkin/assign-room', { personnel_id: personnelId, room_id: selectedRoom.room_id || selectedRoom.id })
      setAssignedBed(res.data.bed_no)
      try { await api.post('/checkin/set-shift', { personnel_id: personnelId, shift_type: shiftType }) } catch {}
      qc.invalidateQueries(['company-stats'])
      qc.invalidateQueries(['checkin-stats'])
      qc.invalidateQueries(['job-stats'])
      setStep(3)
    } catch (e) { setError(e.response?.data?.error || 'Oda atama hatası') }
    finally { setLoading(false) }
  }

  async function handleQuickFill() {
    if (!quickFillRoom || quickFillCount < 1) return
    setQuickFillLoading(true)
    try {
      await api.post('/checkin/placeholder-batch', { room_id: quickFillRoom.room_id, count: quickFillCount })
      setQuickFillRoom(null)
      qc.invalidateQueries({ queryKey: ['available-rooms'] })
      qc.invalidateQueries({ queryKey: ['checkin-stats'] })
    } catch (e) {
      addToast(e.response?.data?.error || 'Hata oluştu', 'error')
    } finally {
      setQuickFillLoading(false)
    }
  }

  const resetFlow = () => {
    setStep(0); setTcNo(''); setPassportNo(''); setNameSearch(''); setNameResults([])
    setFoundPerson(null); setFormData({ full_name: '', company: '', job_title: '', preferred_block: '', phone_number: '', emergency_name: '', emergency_phone: '' })
    setShiftType('day'); setPersonnelId(null); setSuggestedRoom(null); setSelectedRoom(null)
    setAssignedBed(null); setError('')
  }

  return (
    <div style={{ position: 'relative', zIndex: 1 }} className="fade-up">
      {blacklistPerson && <BlacklistAlert person={blacklistPerson} onClose={() => setBlacklistPerson(null)} />}

      <div className="page-header" style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h1 style={{ fontSize: '28px', letterSpacing: '4px', color: 'var(--text)' }}>
            CHECK-IN<HelpHint topic="checkin" title="CHECK-IN" />
          </h1>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '1px' }}>
            GİRİŞ KAYDI · ODA ATAMASI · VARDİYA YÖNETİMİ
          </p>
        </div>
        <button onClick={() => setShowImport(true)} className="btn btn-ghost btn-sm">
          CSV TOPLU KAYIT
        </button>
      </div>

      {showImport && <CsvImport onClose={() => setShowImport(false)} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
        {/* LEFT: Check-in flow */}
        <div>
          <StepBar step={step} onStepClick={(i) => setStep(i)} />

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: '14px' }}>
              <span>!</span><span>{error}</span>
            </div>
          )}

          {/* Step 0: Arama */}
          {step === 0 && (
            <div className="panel fade-up-1">
              <div className="panel-header">
                <div><div className="panel-title">PERSONEL ARA</div><div className="panel-subtitle">AD, TC VEYA PASAPORT İLE ARAMA</div></div>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border)' }}>
                  {[{ id: 'name', label: '👤 AD SOYAD' }, { id: 'tc', label: '⊕ TC' }, { id: 'passport', label: '⊕ PASAPORT' }].map(m => (
                    <button key={m.id} onClick={() => { setSearchMode(m.id); setError(''); setNameResults([]) }}
                      style={{
                        flex: 1, padding: '7px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 700,
                        background: searchMode === m.id ? 'var(--accent)' : 'transparent',
                        color: searchMode === m.id ? '#000' : 'var(--text3)',
                      }}>{m.label}</button>
                  ))}
                </div>

                {searchMode === 'name' && (
                  <>
                    <div>
                      <label className="form-label">Ad Soyad, Firma veya Meslek</label>
                      <input value={nameSearch} onChange={e => handleNameSearch(e.target.value)}
                        className="form-input" placeholder="En az 2 harf yazın..." autoFocus />
                    </div>
                    {nameSearching && <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>Aranıyor...</div>}
                    {nameResults.length > 0 && (
                      <div style={{ border: '1px solid var(--border)', borderRadius: '7px', overflow: 'hidden', background: 'var(--surface2)', maxHeight: '320px', overflowY: 'auto' }}>
                        {nameResults.map(p => (
                          <div key={p.id} onClick={() => handleSelectPerson(p)}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid rgba(35,45,63,.4)', cursor: 'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <div style={{
                              width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                              background: p.is_blacklisted ? 'var(--red)' : 'linear-gradient(135deg,var(--accent),var(--purple))',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: 'var(--display)', fontSize: '12px', color: '#fff',
                            }}>{p.is_blacklisted ? '!' : p.full_name.charAt(0).toUpperCase()}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: p.is_blacklisted ? 'var(--red)' : 'var(--text)' }}>
                                {p.full_name}
                                {p.is_blacklisted && <span style={{ marginLeft: '6px', fontSize: '8px', color: 'var(--red)' }}>KARA LİSTE</span>}
                              </div>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', marginTop: '1px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <span>{p.company || '—'}</span>
                                {p.job_title && <span style={{ color: 'var(--teal)' }}>{p.job_title}</span>}
                                {p.block && <span style={{ color: 'var(--blue)' }}>{p.block} {p.room_no}</span>}
                                {p.shift_type && <span style={{ color: p.shift_type === 'night' ? 'var(--purple)' : 'var(--accent)' }}>{p.shift_type === 'night' ? '☾ GECE' : '☀ GÜNDÜZ'}</span>}
                              </div>
                            </div>
                            <button className="btn btn-primary btn-xs">SEÇ</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {nameSearch.trim().length >= 2 && !nameSearching && nameResults.length === 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', padding: '12px 0' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>Sonuç bulunamadı</div>
                        <button className="btn btn-primary btn-sm" onClick={() => { setFormData(p => ({ ...p, full_name: nameSearch.trim() })); setStep(1) }}>
                          + YENİ PERSONEL KAYDET
                        </button>
                      </div>
                    )}
                  </>
                )}

                {searchMode === 'tc' && (
                  <>
                    <div><label className="form-label">TC Kimlik No</label>
                      <input value={tcNo} onChange={e => setTcNo(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLookup()}
                        className="form-input" maxLength={11} placeholder="11 haneli TC kimlik no" autoFocus /></div>
                    <button onClick={handleLookup} disabled={loading || !tcNo} className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center', opacity: (loading || !tcNo) ? 0.6 : 1 }}>
                      {loading ? 'SORGULANIYOR...' : '⊕ SORGULA'}</button>
                  </>
                )}

                {searchMode === 'passport' && (
                  <>
                    <div><label className="form-label">Pasaport No</label>
                      <input value={passportNo} onChange={e => setPassportNo(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLookup()}
                        className="form-input" placeholder="Pasaport numarası" autoFocus /></div>
                    <button onClick={handleLookup} disabled={loading || !passportNo} className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center', opacity: (loading || !passportNo) ? 0.6 : 1 }}>
                      {loading ? 'SORGULANIYOR...' : '⊕ SORGULA'}</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 1: Kayıt */}
          {step === 1 && (
            <div className="panel fade-up-1">
              <div className="panel-header">
                <div><div className="panel-title">YENİ PERSONEL KAYDI</div><div className="panel-subtitle">BİLGİLERİ GİRİN</div></div>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <DraftBanner hasDraft={hasDraft} onRestore={restoreDraft} onDiscard={discardDraft} />
                <div>
                  <label className="form-label">Ad Soyad *</label>
                  <input value={formData.full_name} onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))}
                    className="form-input" placeholder="Ad Soyad" />
                </div>
                <div>
                  <AutoInput label="Firma" value={formData.company} onChange={v => setFormData(p => ({ ...p, company: v }))}
                    suggestions={companyNames} placeholder="Firma adı yazın..." />
                  {formCompanyId ? (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green, #22c55e)', marginTop: 2, letterSpacing: 1 }}>
                      ✓ Kayıtlı firma (id #{formCompanyId})
                    </div>
                  ) : formData.company ? (
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginTop: 2, letterSpacing: 1 }}>
                      ⓘ Kayıtsız — /companies sayfasından ekleyebilirsiniz
                    </div>
                  ) : null}
                </div>
                <AutoInput label="Meslek / Ne İşçisi" value={formData.job_title} onChange={v => setFormData(p => ({ ...p, job_title: v }))}
                  suggestions={jobNames} placeholder="Kalıpçı, Elektrikçi, Boyacı..." />
                <div>
                  <label className="form-label">Telefon Numarası</label>
                  <input value={formData.phone_number} onChange={e => setFormData(p => ({ ...p, phone_number: e.target.value }))}
                    className="form-input" placeholder="05XX XXX XX XX" type="tel" />
                </div>

                {/* Acil İletişim — isteğe bağlı */}
                <div style={{
                  marginTop: '16px', padding: '12px', borderRadius: '8px',
                  border: '1px solid var(--border)', background: 'var(--surface2)',
                }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text4)', letterSpacing: '2px', marginBottom: '10px' }}>
                    ACİL İLETİŞİM — ZORUNLU (İSG)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="form-label">Acil Kişi Adı *</label>
                      <input
                        className="form-input"
                        required
                        value={formData.emergency_name || ''}
                        onChange={e => setFormData(p => ({ ...p, emergency_name: e.target.value }))}
                        placeholder="Eş, anne/baba..."
                      />
                    </div>
                    <div>
                      <label className="form-label">Acil Kişi Telefonu *</label>
                      <input
                        className="form-input"
                        required
                        type="tel"
                        value={formData.emergency_phone || ''}
                        onChange={e => setFormData(p => ({ ...p, emergency_phone: e.target.value }))}
                        placeholder="05xx xxx xx xx"
                      />
                    </div>
                  </div>
                </div>

                {/* Photo */}
                <div>
                  <label className="form-label">Profil Fotoğrafı</label>
                  {photoPreview ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img loading="lazy" src={photoPreview} alt="" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
                      <button onClick={() => { setPhotoFile(null); setPhotoPreview(null) }} style={{
                        position: 'absolute', top: '-4px', right: '-4px', width: '20px', height: '20px', borderRadius: '50%',
                        background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <label style={{
                        flex: 1, padding: '12px', borderRadius: '8px', cursor: 'pointer',
                        border: '2px dashed var(--border)', background: 'rgba(15,23,42,.3)',
                        color: 'var(--text2)', textAlign: 'center',
                        fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '1px',
                      }}>
                        📷 FOTOGRAF YUKLE
                        <input type="file" accept="image/*" capture="user" style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) {
                              setPhotoFile(file)
                              const reader = new FileReader()
                              reader.onload = ev => setPhotoPreview(ev.target.result)
                              reader.readAsDataURL(file)
                            }
                          }} />
                      </label>
                    </div>
                  )}
                </div>

                {/* Shift */}
                <div>
                  <label className="form-label">VARDİYA</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      { id: 'day', label: '☀ GÜNDÜZ', sub: '08:00–17:00', bg: 'rgba(240,165,0,.15)', border: 'rgba(240,165,0,.4)', color: 'var(--accent)' },
                      { id: 'night', label: '☾ GECE', sub: '20:00–08:00', bg: 'rgba(99,102,241,.15)', border: 'rgba(99,102,241,.4)', color: 'var(--purple)' },
                    ].map(s => (
                      <button key={s.id} onClick={() => setShiftType(s.id)}
                        style={{
                          flex: 1, padding: '10px', borderRadius: '7px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                          fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700,
                          background: shiftType === s.id ? s.bg : 'var(--surface2)',
                          color: shiftType === s.id ? s.color : 'var(--text3)',
                          border: `1px solid ${shiftType === s.id ? s.border : 'var(--border)'}`,
                        }}>
                        {s.label}
                        <span style={{ fontSize: '8px', opacity: 0.7 }}>{s.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
                  <button onClick={() => setStep(0)} className="btn btn-ghost">&larr; GERİ</button>
                  <button onClick={handleRegister} disabled={loading || !formData.full_name} className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center', opacity: (loading || !formData.full_name) ? 0.6 : 1 }}>
                    {loading ? 'KAYDEDİLİYOR...' : 'KAYDET VE DEVAM →'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Oda Ataması - tam seçim */}
          {step === 2 && (
            <div className="panel fade-up-1">
              <div className="panel-header">
                <div><div className="panel-title">ODA ATAMASI</div>
                  <div className="panel-subtitle">ODA SEÇİN VEYA ÖNERİYİ KABUL EDİN</div></div>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Person summary */}
                <div style={{ background: 'var(--surface2)', borderRadius: '7px', padding: '10px 14px', border: '1px solid var(--border)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg,var(--accent),var(--purple))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--display)', fontSize: '14px', color: '#fff',
                  }}>{(formData.full_name || 'P').charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '14px' }}>{formData.full_name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                      <span>{formData.company || '—'}</span>
                      {formData.job_title && <span style={{ color: 'var(--teal)' }}>{formData.job_title}</span>}
                      <span style={{ color: shiftType === 'night' ? 'var(--purple)' : 'var(--accent)' }}>
                        {shiftType === 'night' ? '☾ GECE' : '☀ GÜNDÜZ'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Room picker */}
                <RoomPicker
                  suggestedRoom={suggestedRoom}
                  selectedRoom={selectedRoom}
                  onSelect={setSelectedRoom}
                  onQuickFill={r => { setQuickFillRoom(r); setQuickFillCount(1) }}
                />

                {/* Selected room info */}
                {selectedRoom && (
                  <div style={{
                    background: 'rgba(240,165,0,.08)', borderRadius: '7px', padding: '10px 14px',
                    border: '1px solid rgba(240,165,0,.3)', display: 'flex', alignItems: 'center', gap: '12px',
                  }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color: 'var(--accent)', letterSpacing: '1px' }}>
                      {selectedRoom.block} — {selectedRoom.room_no}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text2)' }}>
                      KAT {selectedRoom.floor} · {selectedRoom.current_count}/{selectedRoom.active_beds} KİŞİ
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setStep(0)} className="btn btn-ghost">&larr; GERİ</button>
                  <button onClick={handleAssignRoom} disabled={loading || !selectedRoom} className="btn btn-primary"
                    style={{ flex: 1, justifyContent: 'center', opacity: (loading || !selectedRoom) ? 0.6 : 1 }}>
                    {loading ? 'ATANIYOR...' : '✓ ODAYI ONAYLA'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Zimmet */}
          {step === 3 && (
            <div className="fade-up-1">
              <div className="alert alert-success" style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '16px' }}>✓</span>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>Oda ataması tamamlandı</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>
                    {selectedRoom?.block} {selectedRoom?.room_no} · YATAK {assignedBed}
                    {' · '}
                    <span style={{ color: shiftType === 'night' ? 'var(--purple)' : 'var(--accent)' }}>
                      {shiftType === 'night' ? '☾ GECE' : '☀ GÜNDÜZ'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <div><div className="panel-title">ZİMMET VE İMZA</div><div className="panel-subtitle">EKİPMAN TESLİM ALINDI ONAYI</div></div>
                </div>
                <div className="panel-body">
                  <ZimmetForm personnelId={personnelId} onDone={() => {}} />
                </div>
              </div>
              <button onClick={resetFlow} className="btn btn-primary" style={{ width: '100%', marginTop: '16px', justifyContent: 'center' }}>
                + YENİ CHECK-IN
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Stats Dashboard */}
        <StatsDashboard />
      </div>

      {quickFillRoom && (
        <QuickFillModal
          room={quickFillRoom}
          count={quickFillCount}
          setCount={setQuickFillCount}
          onConfirm={handleQuickFill}
          onClose={() => setQuickFillRoom(null)}
          loading={quickFillLoading}
        />
      )}
    </div>
  )
}
