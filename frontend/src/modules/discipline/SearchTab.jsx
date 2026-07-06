// Personel arama sekmesi: debounce'lu arama, seçili personel kartı, kart verme
// (sarı/kırmızı + taslak), kara liste al/çıkar ve disiplin geçmişi. Sekmeye özel
// tüm state ve mutation'ları içerir — sekme değişince unmount olup sıfırlanır.
import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { useDraft } from '../../shared/hooks/useDraft.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import DraftBanner from '../../shared/components/DraftBanner.jsx'
import { exportRowsToCsv } from '../../shared/utils/exportData.js'
import { fmt, fmtFull, INIT_CARD, AutoReason } from './shared.jsx'

export default function SearchTab() {
  const qc = useQueryClient()
  const addToast = useToastStore(s => s.addToast)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [cardForm, setCardForm] = useState(INIT_CARD)
  const { hasDraft: hasDraftCard, restoreDraft: restoreDraftCard, discardDraft: discardDraftCard, onSubmitSuccess: onCardSubmitSuccess } = useDraft('draft:discipline', cardForm, setCardForm, INIT_CARD)
  const [blacklistReason, setBlacklistReason] = useState('')
  const [showBlacklist, setShowBlacklist] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)

  // Reason suggestions
  const { data: reasonSuggestions = [] } = useQuery({
    queryKey: ['discipline-reason-suggestions'],
    queryFn: () => api.get('/discipline/reason-suggestions').then(r => r.data),
  })

  // Records for selected person
  const { data: records = [] } = useQuery({
    queryKey: ['discipline-records', selectedPerson?.id],
    queryFn: () => api.get(`/discipline/records/${selectedPerson.id}`).then(r => r.data),
    enabled: !!selectedPerson,
  })

  // Debounced search
  const doSearch = useCallback(async (term) => {
    if (!term || term.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await api.get('/discipline/search', { params: { q: term } })
      setSearchResults(res.data)
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }, [])

  const handleSearchChange = val => {
    setSearchTerm(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  const selectPerson = async (p) => {
    // Re-fetch fresh data
    try {
      const res = await api.get(`/discipline/personnel/${p.id}`)
      setSelectedPerson(res.data)
    } catch {
      setSelectedPerson(p)
    }
    setSearchResults([])
    setSearchTerm('')
    setShowBlacklist(false)
    setCardForm({ card_type: 'yellow', reason: '' })
  }

  const addCard = useMutation({
    mutationFn: () => api.post('/discipline/records', { personnel_id: selectedPerson.id, ...cardForm }),
    onSuccess: async () => {
      onCardSubmitSuccess()
      setCardForm(INIT_CARD)
      qc.invalidateQueries({ queryKey: ['discipline-records'] })
      qc.invalidateQueries({ queryKey: ['discipline-stats'] })
      qc.invalidateQueries({ queryKey: ['discipline-reason-suggestions'] })
      try {
        const p = await api.get(`/discipline/personnel/${selectedPerson.id}`)
        setSelectedPerson(p.data)
      } catch {}
    },
    onError: (e) => addToast(e?.response?.data?.error || 'Kart eklenemedi', 'error'),
  })

  const deleteCard = useMutation({
    mutationFn: (id) => api.delete(`/discipline/records/${id}`),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['discipline-records'] })
      qc.invalidateQueries({ queryKey: ['discipline-stats'] })
      try {
        const p = await api.get(`/discipline/personnel/${selectedPerson.id}`)
        setSelectedPerson(p.data)
      } catch {}
    },
    onError: (e) => addToast(e?.response?.data?.error || 'Kart silinemedi', 'error'),
  })

  const addBlacklist = useMutation({
    mutationFn: () => api.post('/discipline/blacklist', { personnel_id: selectedPerson.id, reason: blacklistReason }),
    onSuccess: async () => {
      setShowBlacklist(false); setBlacklistReason('')
      qc.invalidateQueries({ queryKey: ['discipline-stats'] })
      qc.invalidateQueries({ queryKey: ['discipline-blacklisted'] })
      try {
        const p = await api.get(`/discipline/personnel/${selectedPerson.id}`)
        setSelectedPerson(p.data)
      } catch {}
    },
    onError: (e) => addToast(e?.response?.data?.error || 'Kara listeye eklenemedi', 'error'),
  })

  const removeBlacklist = useMutation({
    mutationFn: () => api.post('/discipline/blacklist/remove', { personnel_id: selectedPerson.id }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['discipline-stats'] })
      qc.invalidateQueries({ queryKey: ['discipline-blacklisted'] })
      try {
        const p = await api.get(`/discipline/personnel/${selectedPerson.id}`)
        setSelectedPerson(p.data)
      } catch {}
    },
    onError: (e) => addToast(e?.response?.data?.error || 'Kara listeden çıkarılamadı', 'error'),
  })

  const disciplineColor = !selectedPerson ? 'var(--text2)'
    : selectedPerson.discipline_points >= 3 ? 'var(--red)'
    : selectedPerson.discipline_points >= 1 ? 'var(--accent)'
    : 'var(--green)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Search panel */}
      <div className="panel fade-up-1">
        <div className="panel-header">
          <div className="panel-title">PERSONEL ARA</div>
        </div>
        <div className="panel-body" style={{ position: 'relative' }}>
          <input
            value={searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="İsim, şirket, TC veya meslek ile arayın..."
            className="form-input"
            style={{ width: '100%' }}
          />
          {searching && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '6px' }}>Aranıyor...</div>
          )}

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <div style={{
              marginTop: '8px',
              border: '1px solid var(--border)', borderRadius: '8px',
              background: 'var(--bg2)', maxHeight: '300px', overflowY: 'auto',
            }}>
              {searchResults.map(p => (
                <div key={p.id}
                  onClick={() => selectPerson(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', cursor: 'pointer',
                    borderBottom: '1px solid rgba(35,45,63,.3)',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '6px',
                    background: p.is_blacklisted ? 'rgba(231,76,60,.15)' : p.discipline_points >= 3 ? 'rgba(231,76,60,.1)' : p.discipline_points >= 1 ? 'rgba(240,165,0,.1)' : 'rgba(46,204,113,.1)',
                    border: `1px solid ${p.is_blacklisted ? 'rgba(231,76,60,.3)' : p.discipline_points >= 3 ? 'rgba(231,76,60,.2)' : p.discipline_points >= 1 ? 'rgba(240,165,0,.2)' : 'rgba(46,204,113,.2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--display)', fontSize: '12px',
                    color: p.is_blacklisted ? 'var(--red)' : p.discipline_points >= 3 ? 'var(--red)' : p.discipline_points >= 1 ? 'var(--accent)' : 'var(--green)',
                    flexShrink: 0,
                  }}>
                    {p.discipline_points ?? 0}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{p.full_name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                      {p.company || '—'} · {p.job_title || '—'}{p.block ? ` · ${p.block}-${p.floor}/${p.room_no}` : ''}{p.shift_type ? ` · ${p.shift_type === 'day' ? 'Gündüz' : 'Gece'}` : ''}
                    </div>
                  </div>
                  {p.is_blacklisted && <span className="badge badge-red" style={{ fontSize: '8px' }}>KARA LİSTE</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Selected Person ──────────────────────────────────────────────── */}
      {selectedPerson && (
        <>
          {/* Person card */}
          <div className="panel fade-up-1">
            <div style={{ height: '2px', background: `linear-gradient(90deg, ${disciplineColor}, transparent)` }} />
            <div className="panel-body" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: '20px', letterSpacing: '2px', color: 'var(--text)', marginBottom: '4px' }}>
                  {selectedPerson.full_name}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  {selectedPerson.company || '—'} · {selectedPerson.job_title || '—'}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginBottom: '10px' }}>
                  TC: {selectedPerson.tc_no || '—'}
                  {selectedPerson.block && ` · Oda: ${selectedPerson.block}-${selectedPerson.floor}/${selectedPerson.room_no}`}
                  {selectedPerson.shift_type && ` · ${selectedPerson.shift_type === 'day' ? 'Gündüz' : 'Gece'} Vardiyası`}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>DİSİPLİN PUANI</span>
                    <span style={{ fontFamily: 'var(--display)', fontSize: '26px', color: disciplineColor }}>
                      {selectedPerson.discipline_points ?? 0}
                    </span>
                  </div>
                  {selectedPerson.is_blacklisted && selectedPerson.blacklist_reason?.includes('Otomatik') ? (
                    <span className="badge badge-red">OTOMATİK KARA LİSTE</span>
                  ) : selectedPerson.is_blacklisted ? (
                    <span className="badge badge-red">KARA LİSTE</span>
                  ) : null}
                  {selectedPerson.discipline_points >= 3 && !selectedPerson.is_blacklisted && (
                    <span className="badge badge-red">KRİTİK — FESİH GEREKLİ</span>
                  )}
                  {selectedPerson.discipline_points >= 1 && selectedPerson.discipline_points < 3 && (
                    <span className="badge badge-amber">UYARI</span>
                  )}
                  {(selectedPerson.discipline_points ?? 0) === 0 && !selectedPerson.is_blacklisted && (
                    <span className="badge badge-green">TEMİZ</span>
                  )}
                </div>
                {selectedPerson.discipline_points === 4 && !selectedPerson.is_blacklisted && (
                  <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(240,165,0,.08)', borderRadius: '6px', border: '1px solid rgba(240,165,0,.25)' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.5px' }}>
                      UYARI: 1 puan daha kara listeye otomatik eklenecek
                    </div>
                  </div>
                )}
                {selectedPerson.is_blacklisted && (
                  <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(231,76,60,.06)', borderRadius: '6px', border: '1px solid rgba(231,76,60,.15)' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--red)', letterSpacing: '1px', marginBottom: '2px' }}>KARA LİSTE SEBEBİ</div>
                    <div style={{ fontSize: '12px', color: 'var(--text)' }}>{selectedPerson.blacklist_reason}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>{fmt(selectedPerson.blacklisted_at)}</div>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                {selectedPerson.is_blacklisted ? (
                  <button
                    onClick={async () => { if (await confirmDialog({ title: 'Kara Listeden Çıkar', body: 'Kara listeden çıkarılsın mı?' })) removeBlacklist.mutate() }}
                    className="btn btn-sm"
                    style={{ background: 'var(--green)', color: '#fff', border: 'none', fontSize: '10px' }}
                  >
                    KARA LİSTEDEN ÇIKAR
                  </button>
                ) : (
                  <button
                    onClick={() => setShowBlacklist(s => !s)}
                    className="btn btn-danger btn-sm"
                  >
                    KARA LİSTEYE AL
                  </button>
                )}
                <button
                  onClick={() => { setSelectedPerson(null); setSearchTerm('') }}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '9px' }}
                >
                  KAPAT
                </button>
              </div>
            </div>

            {/* Blacklist form */}
            {showBlacklist && (
              <div style={{
                margin: '0 20px 16px',
                padding: '14px',
                background: 'rgba(231,76,60,.06)',
                border: '1px solid rgba(231,76,60,.2)',
                borderRadius: '7px',
              }}>
                <label className="form-label">Kara Listeye Alma Sebebi</label>
                <input
                  value={blacklistReason}
                  onChange={e => setBlacklistReason(e.target.value)}
                  className="form-input"
                  placeholder="Sebep yazın..."
                  style={{ marginBottom: '10px' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setShowBlacklist(false)} className="btn btn-ghost btn-sm">İPTAL</button>
                  <button
                    onClick={() => addBlacklist.mutate()}
                    disabled={!blacklistReason || addBlacklist.isPending}
                    className="btn btn-danger btn-sm"
                    style={{ opacity: (!blacklistReason || addBlacklist.isPending) ? 0.5 : 1 }}
                  >
                    ONAYLA
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Add card ─────────────────────────────────────────────────── */}
          {!selectedPerson.is_blacklisted && (
            <div className="panel fade-up-2">
              <div className="panel-header">
                <div className="panel-title">KART VER</div>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Point preview */}
                <div style={{
                  padding: '8px 12px', borderRadius: '6px',
                  background: 'rgba(15,23,42,.3)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px' }}>KART SONRASI PUAN</span>
                  <span style={{
                    fontFamily: 'var(--display)', fontSize: '18px',
                    color: ((selectedPerson.discipline_points ?? 0) + (cardForm.card_type === 'red' ? 2 : 1)) >= 3 ? 'var(--red)' : 'var(--accent)',
                  }}>
                    {(selectedPerson.discipline_points ?? 0)} + {cardForm.card_type === 'red' ? 2 : 1} = {(selectedPerson.discipline_points ?? 0) + (cardForm.card_type === 'red' ? 2 : 1)}
                  </span>
                </div>

                <DraftBanner hasDraft={hasDraftCard} onRestore={restoreDraftCard} onDiscard={discardDraftCard} />
                {/* Card type buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setCardForm(p => ({ ...p, card_type: 'yellow' }))}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '7px', cursor: 'pointer',
                      border: `2px solid ${cardForm.card_type === 'yellow' ? 'rgba(240,165,0,0.6)' : 'var(--border)'}`,
                      background: cardForm.card_type === 'yellow' ? 'rgba(240,165,0,.1)' : 'transparent',
                      color: cardForm.card_type === 'yellow' ? 'var(--accent)' : 'var(--text2)',
                      fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600, letterSpacing: '1px',
                      transition: 'all 0.15s',
                    }}
                  >
                    SARI KART (+1)
                  </button>
                  <button
                    onClick={() => setCardForm(p => ({ ...p, card_type: 'red' }))}
                    style={{
                      flex: 1, padding: '12px', borderRadius: '7px', cursor: 'pointer',
                      border: `2px solid ${cardForm.card_type === 'red' ? 'rgba(231,76,60,0.6)' : 'var(--border)'}`,
                      background: cardForm.card_type === 'red' ? 'rgba(231,76,60,.1)' : 'transparent',
                      color: cardForm.card_type === 'red' ? 'var(--red)' : 'var(--text2)',
                      fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600, letterSpacing: '1px',
                      transition: 'all 0.15s',
                    }}
                  >
                    KIRMIZI KART (+2)
                  </button>
                </div>

                {/* Reason with autocomplete */}
                <div>
                  <label className="form-label">İhlal Sebebi</label>
                  <AutoReason
                    value={cardForm.reason}
                    onChange={v => setCardForm(p => ({ ...p, reason: v }))}
                    suggestions={reasonSuggestions}
                  />
                </div>

                <button
                  onClick={() => addCard.mutate()}
                  disabled={addCard.isPending || !cardForm.reason}
                  className="btn btn-danger"
                  style={{ alignSelf: 'flex-start', opacity: (addCard.isPending || !cardForm.reason) ? 0.5 : 1 }}
                >
                  {addCard.isPending ? 'KAYDEDİLİYOR...' : 'KART VER'}
                </button>
                {addCard.isSuccess && (
                  <div className="alert alert-success" style={{ margin: 0 }}>
                    <span>✓</span><span>Kart başarıyla eklendi</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── History ──────────────────────────────────────────────────── */}
          <div className="panel fade-up-3">
            <div className="panel-header">
              <div className="panel-title">DİSİPLİN GEÇMİŞİ</div>
              <span className="badge badge-gray">{records.length}</span>
              {records.length > 0 && (
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => exportRowsToCsv([
                  { key: 'card_type', label: 'KART' },
                  { key: 'reason', label: 'SEBEP' },
                  { key: 'created_by_name', label: 'VEREN' },
                  { key: 'created_at', label: 'TARİH' },
                ], records, `disiplin_${selectedPerson?.full_name?.replace(/\s+/g, '_') || 'kayit'}.csv`)}>↓ CSV</button>
              )}
            </div>
            {records.length === 0 ? (
              <div className="panel-body" style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px', padding: '24px' }}>
                Henüz disiplin kaydı yok
              </div>
            ) : (
              <div style={{ padding: '6px 16px' }}>
                {records.map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '12px',
                    padding: '12px 4px', borderBottom: '1px solid rgba(35,45,63,.4)',
                  }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '4px', flexShrink: 0,
                      background: r.card_type === 'yellow' ? 'rgba(240,165,0,.2)' : 'rgba(231,76,60,.2)',
                      border: `1px solid ${r.card_type === 'yellow' ? 'rgba(240,165,0,.4)' : 'rgba(231,76,60,.4)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--mono)', fontSize: '8px', fontWeight: 700,
                      color: r.card_type === 'yellow' ? 'var(--accent)' : 'var(--red)',
                      letterSpacing: '0.5px',
                    }}>
                      {r.card_type === 'yellow' ? 'S' : 'K'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '3px' }}>{r.reason}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '0.5px' }}>
                        {r.created_by_name} · {fmtFull(r.created_at)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`badge ${r.card_type === 'yellow' ? 'badge-amber' : 'badge-red'}`}>
                        {r.card_type === 'yellow' ? 'SARI' : 'KIRMIZI'}
                      </span>
                      <button
                        onClick={async () => { if (await confirmDialog({ title: 'Kart Sil', body: 'Bu kart silinsin mi? Puan düşecektir.', danger: true })) deleteCard.mutate(r.id) }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text3)', fontSize: '12px', padding: '4px',
                          opacity: 0.5, transition: 'opacity .15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        onMouseLeave={e => e.currentTarget.style.opacity = 0.5}
                        title="Kartı sil"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
