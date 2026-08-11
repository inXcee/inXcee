import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { toastErr, toastOk, StaffSearch } from '../shared.jsx'
import { shortDay } from '../shared.jsx'

// Faz 10 — Açık vardiya ve başvuru.
//
// Boş kalan vardiya için amir tek tek telefon ediyordu; kimin istekli olduğu
// hiçbir yerde durmuyordu. İlan açılır, başvurular toplanır, amir adaylar
// arasından seçer — her adayın uygunluğu (çakışma, izin, dinlenme, haftalık
// süre, rol, belge) aynı satırda görünür.
//
// Engelli aday sessizce atanmaz: 409 döner, gerekçe yazılır, yönetici bilerek
// zorlayabilir. Ölçülemeyen kontrol "uygun" sayılmaz.

const DURUM_RENK = { block: 'var(--red)', warn: 'var(--amber)', unknown: 'var(--text3)', ok: 'var(--green)' }

function UygunlukRozeti({ s }) {
  if (!s) return null
  if (s.error) return <span style={{ fontSize: 10, color: 'var(--text3)' }}>uygunluk çıkarılamadı</span>

  const engel = s.blockers?.length || 0
  const uyari = s.warnings?.length || 0
  const bilinmeyen = s.unknown?.length || 0
  const metin = engel ? `${engel} engel` : uyari ? `${uyari} uyarı` : bilinmeyen ? `${bilinmeyen} ölçülemedi` : 'uygun'
  const renk = engel ? DURUM_RENK.block : uyari ? DURUM_RENK.warn : bilinmeyen ? DURUM_RENK.unknown : DURUM_RENK.ok

  return (
    <span
      style={{ fontFamily: 'var(--mono)', fontSize: 10, color: renk }}
      title={(s.checks || []).filter(c => c.status !== 'ok').map(c => `${c.label}: ${c.detail}`).join('\n') || 'Tüm kontroller temiz'}
    >
      {metin}
    </span>
  )
}

function AdayListesi({ openShiftId, canDecide }) {
  const qc = useQueryClient()
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['open-shift-applicants', openShiftId],
    queryFn: () => api.get(`/shifts/open-shifts/${openShiftId}/applicants`).then(r => r.data),
  })

  const secMut = useMutation({
    mutationFn: ({ staffId, force }) => api.post(`/shifts/open-shifts/${openShiftId}/select`, { staff_id: staffId, force }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['open-shifts'] })
      qc.invalidateQueries({ queryKey: ['open-shift-applicants', openShiftId] })
      qc.invalidateQueries({ queryKey: ['schedule'] })
      toastOk('Aday seçildi ve çizelgeye yazıldı')
    },
    onError: toastErr,
  })

  if (isPending) return <div style={{ fontSize: 11, color: 'var(--text3)' }}>Adaylar yükleniyor…</div>
  if (isError) {
    return (
      <div style={{ fontSize: 11, color: 'var(--red)' }}>
        Adaylar alınamadı — {error?.response?.data?.error || error?.message}{' '}
        <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Tekrar dene</button>
      </div>
    )
  }
  if (!data.items.length) return <div style={{ fontSize: 11, color: 'var(--text3)' }}>Henüz başvuru yok.</div>

  return (
    <div style={{ display: 'grid', gap: 3 }}>
      {data.items.map(a => (
        <div key={a.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '4px 0', borderTop: '1px dashed var(--border)', fontSize: 11,
        }}>
          <strong style={{ minWidth: 130 }}>{a.full_name}</strong>
          <span style={{ color: 'var(--text3)', flex: '1 1 120px' }}>
            {[a.dept_name, a.role_name].filter(Boolean).join(' · ') || '—'}
          </span>
          <UygunlukRozeti s={a.suitability} />
          {a.status === 'selected'
            ? <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)' }}>SEÇİLDİ</span>
            : a.status === 'not_selected'
              ? <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>seçilmedi</span>
              : canDecide && (
                <button
                  className="btn btn-primary btn-xs"
                  disabled={secMut.isPending}
                  onClick={() => secMut.mutate({ staffId: a.staff_id, force: !a.suitability?.eligible })}
                  title={a.suitability?.eligible ? 'Seç ve çizelgeye yaz' : 'Engelli aday — bilerek zorla'}
                >
                  {a.suitability?.eligible ? 'Seç' : 'Yine de seç'}
                </button>
              )}
        </div>
      ))}
    </div>
  )
}

export default function OpenShiftsBoard({ weekDays = [], canManage = false, shiftDefs = [] }) {
  const qc = useQueryClient()
  const [acik, setAcik] = useState(true)
  const [seciliIlan, setSeciliIlan] = useState(null)
  const [yeniAcik, setYeniAcik] = useState(false)
  const [form, setForm] = useState({ work_date: '', shift_def_id: '', slots: 1, note: '' })
  const [basvuruStaff, setBasvuruStaff] = useState('')

  const from = weekDays[0]
  const to = weekDays[weekDays.length - 1]

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['open-shifts', from, to],
    queryFn: () => api.get('/shifts/open-shifts', { params: { from, to } }).then(r => r.data),
    enabled: acik && !!from,
  })

  const yenile = () => {
    qc.invalidateQueries({ queryKey: ['open-shifts'] })
    if (seciliIlan) qc.invalidateQueries({ queryKey: ['open-shift-applicants', seciliIlan] })
  }

  const ilanMut = useMutation({
    mutationFn: () => api.post('/shifts/open-shifts', {
      work_date: form.work_date || from,
      shift_def_id: form.shift_def_id ? Number(form.shift_def_id) : null,
      slots: Number(form.slots) || 1,
      note: form.note.trim() || null,
    }),
    onSuccess: () => {
      setYeniAcik(false)
      setForm({ work_date: '', shift_def_id: '', slots: 1, note: '' })
      yenile()
      toastOk('Açık vardiya ilan edildi')
    },
    onError: toastErr,
  })

  const basvuruMut = useMutation({
    mutationFn: ({ id, staffId }) => api.post(`/shifts/open-shifts/${id}/apply`, { staff_id: Number(staffId) }),
    onSuccess: () => { setBasvuruStaff(''); yenile(); toastOk('Başvuru alındı') },
    onError: toastErr,
  })

  const ilanlar = data?.items || []

  return (
    <div className="panel" style={{ marginBottom: 12, borderLeft: `3px solid ${ilanlar.length ? 'var(--amber)' : 'var(--green)'}` }}>
      <button
        type="button"
        onClick={() => setAcik(a => !a)}
        aria-expanded={acik}
        aria-label="Açık vardiyalar"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
          background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
        }}
      >
        <span style={{ color: 'var(--accent)', width: 12 }}>{acik ? '▾' : '▸'}</span>
        <strong style={{ fontSize: 13 }}>📣 AÇIK VARDİYALAR</strong>
        {acik && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: ilanlar.length ? 'var(--amber)' : 'var(--green)' }}>
            {ilanlar.length ? `${ilanlar.length} ilan · ${ilanlar.reduce((t, i) => t + (i.applicant_count || 0), 0)} başvuru` : 'açık ilan yok'}
          </span>
        )}
      </button>

      {acik && (
        <div style={{ padding: '0 14px 12px' }}>
          {isPending && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Yükleniyor…</div>}

          {isError && (
            <div style={{ fontSize: 11, color: 'var(--red)' }}>
              Açık vardiyalar alınamadı — {error?.response?.data?.error || error?.message}{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Tekrar dene</button>
            </div>
          )}

          {canManage && (
            <div style={{ marginBottom: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setYeniAcik(a => !a)} aria-expanded={yeniAcik}>
                {yeniAcik ? '▴' : '▾'} Yeni ilan
              </button>
              {yeniAcik && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    className="form-select" aria-label="İlan günü" style={{ width: 'auto', fontSize: 11 }}
                    value={form.work_date} onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))}
                  >
                    <option value="">Gün seç</option>
                    {weekDays.map(g => <option key={g} value={g}>{shortDay(g)} {g.slice(8, 10)}</option>)}
                  </select>
                  <select
                    className="form-select" aria-label="İlan vardiyası" style={{ width: 'auto', fontSize: 11 }}
                    value={form.shift_def_id} onChange={e => setForm(f => ({ ...f, shift_def_id: e.target.value }))}
                  >
                    <option value="">Vardiya seç</option>
                    {shiftDefs.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <input
                    className="form-input" type="number" min="1" style={{ width: 70, fontSize: 11 }}
                    aria-label="Kişi sayısı" value={form.slots}
                    onChange={e => setForm(f => ({ ...f, slots: e.target.value }))}
                  />
                  <input
                    className="form-input" style={{ flex: '1 1 140px', fontSize: 11 }}
                    aria-label="İlan notu" placeholder="Not (isteğe bağlı)"
                    value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={ilanMut.isPending || (!form.work_date && !from)}
                    onClick={() => ilanMut.mutate()}
                  >
                    {ilanMut.isPending ? '…' : 'İlan Et'}
                  </button>
                </div>
              )}
            </div>
          )}

          {!isPending && ilanlar.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Bu hafta açık vardiya ilanı yok.</div>
          )}

          {ilanlar.map(i => (
            <div key={i.id} style={{ borderTop: '1px dashed var(--border)', padding: '6px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
                <strong style={{ minWidth: 110 }}>{i.work_date} {shortDay(i.work_date)}</strong>
                <span style={{ color: 'var(--text3)', flex: '1 1 140px' }}>
                  {[i.shift_name, i.location_name, i.dept_name, i.role_name].filter(Boolean).join(' · ') || 'nokta belirtilmemiş'}
                </span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                  {i.selected_count}/{i.slots} · {i.applicant_count} başvuru
                </span>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setSeciliIlan(seciliIlan === i.id ? null : i.id)}
                  aria-expanded={seciliIlan === i.id}
                >
                  {seciliIlan === i.id ? 'Adayları gizle' : 'Adaylar'}
                </button>
              </div>
              {i.note && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{i.note}</div>}

              {seciliIlan === i.id && (
                <div style={{ marginTop: 6 }}>
                  <AdayListesi openShiftId={i.id} canDecide={canManage} />
                  {canManage && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <StaffSearch value={basvuruStaff} onChange={setBasvuruStaff} />
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={!basvuruStaff || basvuruMut.isPending}
                        onClick={() => basvuruMut.mutate({ id: i.id, staffId: basvuruStaff })}
                      >
                        Adına başvuru ekle
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
