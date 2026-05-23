import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { inputDialog } from '../../shared/components/InputDialog.jsx'
import { SkeletonCard } from '../../shared/components/Skeleton.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'

const toast = (m, t = 'success') => useToastStore.getState().addToast(m, t)
const toastErr = (e) => toast(e?.response?.data?.error || 'Hata', 'error')

export default function Personnel360Page() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useUrlParamState('tab', 'overview')

  const { data, isLoading, error } = useQuery({
    queryKey: ['personnel-360', id],
    queryFn: () => api.get(`/personnel/${id}/360`).then(r => r.data),
  })
  const { data: timeline = [] } = useQuery({
    queryKey: ['personnel-timeline', id],
    queryFn: () => api.get(`/personnel/${id}/timeline`).then(r => r.data),
    enabled: tab === 'timeline',
  })

  const inv = () => qc.invalidateQueries({ queryKey: ['personnel-360', id] })
  const archiveMut = useMutation({
    mutationFn: (reason) => api.post(`/personnel/${id}/archive`, { reason }),
    onSuccess: () => { toast('Arşivlendi'); inv() },
    onError: toastErr,
  })
  const restoreMut = useMutation({
    mutationFn: () => api.post(`/personnel/${id}/restore`),
    onSuccess: () => { toast('Geri alındı'); inv() },
    onError: toastErr,
  })

  if (isLoading) return <SkeletonCard lines={8} />
  if (error || !data) {
    const msg = error?.response?.data?.error || error?.message || 'Personel bulunamadı'
    const code = error?.response?.status
    return (
      <div style={{ padding: 24, maxWidth: 640 }}>
        <button onClick={() => nav(-1)} className="btn btn-ghost btn-sm" style={{ borderRadius: 10, marginBottom: 12 }}>← GERİ</button>
        <div style={{ padding: 16, borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', letterSpacing: 1.5, marginBottom: 6 }}>
            ⚠ PERSONEL YÜKLENEMEDİ {code ? `(HTTP ${code})` : ''}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>{msg}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
            ID: {id} · Endpoint: /personnel/{id}/360
          </div>
        </div>
      </div>
    )
  }
  if (!data.person) {
    return (
      <div style={{ padding: 24, maxWidth: 640 }}>
        <button onClick={() => nav(-1)} className="btn btn-ghost btn-sm" style={{ borderRadius: 10, marginBottom: 12 }}>← GERİ</button>
        <div style={{ padding: 16, borderRadius: 10, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)' }}>⚠ Personel kaydı eksik (ID {id})</div>
        </div>
      </div>
    )
  }

  const p = data.person
  const shiftCoverage = data.shift_summary?.total > 0
    ? Math.round((data.shift_summary.worked / data.shift_summary.total) * 100)
    : 0
  const noShowRate = data.transport_summary?.assignments > 0
    ? Math.round((data.transport_summary.no_show / data.transport_summary.assignments) * 100)
    : 0

  return (
    <div style={{ maxWidth: 1280, padding: '0 4px' }} className="fade-up">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => nav(-1)} className="btn btn-ghost btn-sm" style={{ borderRadius: 10 }}>← GERİ</button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 28, letterSpacing: 3, color: 'var(--text)', margin: 0 }}>{p.full_name}</h1>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            {p.dept_name && <span style={{ color: p.dept_color || 'var(--text3)' }}>{p.dept_name}</span>}
            {p.role_label && <span> · {p.role_label}</span>}
            {p.company_name && <span> · 🏢 {p.company_name}</span>}
            {p.tc_no && <span> · TC: {p.tc_no}</span>}
            {p.passport_no && <span> · PSS: {p.passport_no}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <QrButtons staffId={id} hasToken={!!p.qr_token} onUpdate={inv} />
          {p.is_active ? (
            <button onClick={async () => {
              const reason = await inputDialog({
                title: 'Personel Arşivle',
                body: `${p.full_name} arşive taşınacak. Sebep (opsiyonel).`,
                placeholder: 'Sebep…',
                confirmLabel: 'Devam',
              })
              if (reason !== null && await confirmDialog({ title: 'Arşivle', body: `${p.full_name} arşive taşınacak.`, confirmLabel: 'Arşivle' })) {
                archiveMut.mutate(reason)
              }
            }} className="btn btn-ghost btn-sm" style={{ borderRadius: 10, color: 'var(--amber)' }}>🗄 ARŞİVLE</button>
          ) : (
            <button onClick={() => restoreMut.mutate()} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>↩ GERİ AL</button>
          )}
        </div>
      </div>

      {!p.is_active && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', marginBottom: 14 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--amber)', letterSpacing: 1.5 }}>
            🗄 ARŞİVDE {p.archived_at ? `· ${new Date(p.archived_at).toLocaleDateString('tr-TR')}` : ''}
            {p.archive_reason && <span style={{ marginLeft: 8 }}>· {p.archive_reason}</span>}
          </span>
        </div>
      )}

      {p.is_blacklisted ? (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)', marginBottom: 14 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red)', letterSpacing: 1.5 }}>
            ⛔ KARA LİSTEDE {p.blacklist_reason ? `· ${p.blacklist_reason}` : ''}
          </span>
        </div>
      ) : null}

      {/* KPI sıra */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        <KPI label="VARDİYA (30g)" value={`%${shiftCoverage}`} sub={`${data.shift_summary?.worked || 0}/${data.shift_summary?.total || 0}`} color={shiftCoverage > 80 ? 'var(--green)' : shiftCoverage > 50 ? 'var(--amber)' : 'var(--red)'} />
        <KPI label="SERVİS NO-SHOW" value={`%${noShowRate}`} sub={`${data.transport_summary?.no_show || 0}/${data.transport_summary?.assignments || 0}`} color={noShowRate < 10 ? 'var(--green)' : noShowRate < 30 ? 'var(--amber)' : 'var(--red)'} />
        <KPI label="DİSİPLİN" value={`🟡${data.discipline_total?.yellow || 0} 🔴${data.discipline_total?.red || 0}`} color={(data.discipline_total?.red || 0) > 0 ? 'var(--red)' : (data.discipline_total?.yellow || 0) > 0 ? 'var(--amber)' : 'var(--green)'} />
        <KPI label="MESAİ (10 kayıt)" value={(data.overtime || []).reduce((s, o) => s + (o.hours || 0), 0).toFixed(1) + 'h'} color="var(--accent)" />
        <KPI label="İZİN (toplam)" value={(data.leaves || []).filter(l => l.status === 'approved').reduce((s, l) => s + (l.total_days || 0), 0) + 'g'} color="var(--purple)" />
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 3, overflowX: 'auto' }}>
        {[
          ['overview', '👁 GENEL'],
          ['shifts', '⏱ VARDİYA'],
          ['transport', '🚌 SERVİS'],
          ['dorm', '🏠 YATAKHANE'],
          ['discipline', '🟡 DİSİPLİN'],
          ['leaves', '🛌 İZİN/MESAİ'],
          ['notes', '📝 NOTLAR'],
          ['emergency', '🆘 ACİL'],
          ['timeline', '🕐 TİMELİNE'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: '8px 10px', border: 'none', borderRadius: 9,
            background: tab === k ? 'var(--accent)' : 'transparent',
            color: tab === k ? '#000' : 'var(--text3)',
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: 1, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{l}</button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab data={data} />}
      {tab === 'shifts' && <ShiftsTab data={data} />}
      {tab === 'transport' && <TransportTab data={data} />}
      {tab === 'dorm' && <DormTab data={data} />}
      {tab === 'discipline' && <DisciplineTab data={data} />}
      {tab === 'leaves' && <LeavesTab data={data} />}
      {tab === 'notes' && <NotesTab staffId={id} notes={data.notes} onChange={inv} />}
      {tab === 'emergency' && <EmergencyTab staffId={id} contacts={data.emergency_contacts} onChange={inv} />}
      {tab === 'timeline' && <TimelineTab events={timeline} />}
    </div>
  )
}

function QrButtons({ staffId, hasToken, onUpdate }) {
  const genMut = useMutation({
    mutationFn: (regenerate) => api.post(`/qr/staff/${staffId}/generate`, { regenerate: !!regenerate }),
    onSuccess: () => { toast(hasToken ? 'QR yenilendi' : 'QR üretildi'); onUpdate() },
    onError: toastErr,
  })
  async function downloadCard() {
    try {
      const res = await api.get(`/qr/staff/${staffId}/card/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url; a.download = `kart-${staffId}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) { toastErr(e) }
  }
  if (!hasToken) {
    return <button onClick={() => genMut.mutate(false)} disabled={genMut.isPending} className="btn btn-primary btn-sm" style={{ borderRadius: 10 }}>📱 QR ÜRET</button>
  }
  return (
    <>
      <button onClick={downloadCard} className="btn btn-ghost btn-sm" style={{ borderRadius: 10 }}>🪪 KART PDF</button>
      <button onClick={async () => {
        if (await confirmDialog({ title: 'QR yenile', body: 'Mevcut QR geçersiz olur. Devam?', confirmLabel: 'Yenile' })) genMut.mutate(true)
      }} className="btn btn-ghost btn-sm" style={{ borderRadius: 10 }} title="QR yenile">🔄</button>
    </>
  )
}

function KPI({ label, value, sub, color }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 11, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5 }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 22, color, marginTop: 4, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function Section({ title, children, right }) {
  return (
    <div style={{ marginBottom: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

function OverviewTab({ data }) {
  const p = data.person
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
      <Section title="KİMLİK">
        <Field k="TC" v={p.tc_no} />
        <Field k="Pasaport" v={p.passport_no} />
        <Field k="Doğum" v={p.birth_date} />
        <Field k="Cinsiyet" v={p.gender === 'male' ? 'Erkek' : p.gender === 'female' ? 'Kadın' : '—'} />
        <Field k="Kan Grubu" v={p.blood_type} />
        <Field k="Telefon" v={p.phone} clickable={p.phone ? `tel:${p.phone}` : null} />
        <Field k="E-posta" v={p.email} clickable={p.email ? `mailto:${p.email}` : null} />
        <Field k="Adres" v={p.address} />
      </Section>

      <Section title="İŞ BİLGİLERİ">
        <Field k="Departman" v={p.dept_name} color={p.dept_color} />
        <Field k="Pozisyon" v={p.position} />
        <Field k="Rol/Etiket" v={p.role_label} />
        <Field k="Firma" v={p.company_name} />
        <Field k="İşe Giriş" v={p.hire_date} />
        <Field k="Sözleşme Bitiş" v={p.contract_end} highlight={p.contract_end && new Date(p.contract_end) < new Date(Date.now() + 30 * 86400000) ? 'var(--amber)' : null} />
        <Field k="Maaş" v={p.salary ? `${p.salary} ₺` : null} />
      </Section>

      <Section title="ODA">
        {data.room ? (
          <>
            <Field k="Blok" v={data.room.block} />
            <Field k="Oda" v={data.room.room_no} />
            <Field k="Kat" v={data.room.floor} />
            <Field k="Yatak" v={data.room.bed_no} />
            <Field k="Giriş" v={data.room.assigned_at ? new Date(data.room.assigned_at).toLocaleDateString('tr-TR') : null} />
          </>
        ) : <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text4)' }}>Yatakhanede konaklamıyor</div>}
      </Section>

      <Section title="ULAŞIM">
        <Field k="Durak" v={p.pickup_name} />
        <Field k="İlçe" v={p.pickup_district} />
        {data.today_transport && (
          <>
            <Field k="Bugün rota" v={data.today_transport.route_name} />
            <Field k="Saat" v={data.today_transport.scheduled_time} />
            <Field k="Şoför" v={data.today_transport.driver_name} clickable={data.today_transport.driver_phone ? `tel:${data.today_transport.driver_phone}` : null} />
            <Field k="Durum" v={data.today_transport.boarded === 1 ? '✓ Bindi' : data.today_transport.boarded === 0 ? '✗ Binmedi' : data.today_transport.is_waitlist ? '⏳ Yedek' : '○ İşaretsiz'} />
          </>
        )}
      </Section>

      {p.notes && (
        <Section title="GENEL NOTLAR">
          <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{p.notes}</div>
        </Section>
      )}
    </div>
  )
}

function Field({ k, v, color, highlight, clickable }) {
  if (!v) return null
  const content = clickable
    ? <a href={clickable} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{v}</a>
    : <span style={{ color: color || 'var(--text)' }}>{v}</span>
  return (
    <div style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12, ...(highlight ? { background: `rgba(245,158,11,.1)`, padding: '4px 6px', borderRadius: 5, marginLeft: -6, marginRight: -6 } : {}) }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', minWidth: 100, letterSpacing: 1 }}>{k}</span>
      {content}
    </div>
  )
}

function ShiftsTab({ data }) {
  if (!data.shifts?.length) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text4)', fontFamily: 'var(--mono)' }}>Vardiya kaydı yok</div>
  return (
    <Section title={`SON 14G + SONRAKİ 7G (${data.shifts.length})`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
        {data.shifts.map(s => (
          <div key={s.work_date} style={{
            padding: '8px 10px', borderRadius: 8, fontSize: 11,
            background: s.status === 'worked' ? 'rgba(34,197,94,.1)' : s.status === 'absent' ? 'rgba(239,68,68,.1)' : s.status === 'on_leave' ? 'rgba(245,158,11,.1)' : 'var(--surface2)',
            borderLeft: `3px solid ${s.status === 'worked' ? 'var(--green)' : s.status === 'absent' ? 'var(--red)' : s.status === 'on_leave' ? 'var(--amber)' : 'var(--text4)'}`,
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{s.work_date}</div>
            <div style={{ fontWeight: 600 }}>{s.shift_name || '—'}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, marginTop: 2 }}>{s.status}</div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function TransportTab({ data }) {
  return (
    <>
      {data.today_transport && (
        <Section title="BUGÜN">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field k="Rota" v={data.today_transport.route_name} />
            <Field k="Plaka" v={data.today_transport.vehicle_plate} />
            <Field k="Durak" v={data.today_transport.stop_name} />
            <Field k="Saat" v={data.today_transport.scheduled_time} />
            <Field k="Şoför" v={data.today_transport.driver_name} clickable={data.today_transport.driver_phone ? `tel:${data.today_transport.driver_phone}` : null} />
            <Field k="Durum" v={data.today_transport.boarded === 1 ? '✓ Bindi' : data.today_transport.boarded === 0 ? '✗ Binmedi' : data.today_transport.is_waitlist ? '⏳ Yedek' : '○ İşaretsiz'} />
          </div>
        </Section>
      )}
      <Section title="SON 30 GÜN ÖZET">
        <Field k="Toplam atama" v={data.transport_summary?.assignments || 0} />
        <Field k="Bindi" v={data.transport_summary?.boarded || 0} color="var(--green)" />
        <Field k="Binmedi" v={data.transport_summary?.no_show || 0} color="var(--red)" />
      </Section>
    </>
  )
}

function DormTab({ data }) {
  return (
    <>
      <Section title="OKUMA ATAMASI">
        {data.room ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
            <Field k="Blok" v={data.room.block} />
            <Field k="Oda" v={data.room.room_no} />
            <Field k="Kat" v={data.room.floor} />
            <Field k="Yatak" v={data.room.bed_no} />
          </div>
        ) : <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text4)' }}>Aktif oda yok</div>}
      </Section>
      <Section title={`OKUMA GEÇMİŞİ (${data.room_history?.length || 0})`}>
        {!data.room_history?.length ? <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text4)' }}>Geçmiş yok</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.room_history.map(h => (
              <div key={h.id} style={{ display: 'flex', gap: 10, padding: '5px 8px', background: 'var(--surface2)', borderRadius: 6, fontSize: 11 }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{h.block}-{h.room_no}</span>
                <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                  {h.assigned_at?.slice(0, 10)} → {h.check_out_at?.slice(0, 10)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title={`BAKIM TALEPLERİ (${data.maintenance?.length || 0})`}>
        {!data.maintenance?.length ? <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text4)' }}>Yok</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.maintenance.map(m => (
              <div key={m.id} style={{ padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{m.location}</strong>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: m.status === 'done' ? 'var(--green)' : 'var(--amber)' }}>{m.status}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>{m.description}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', marginTop: 2 }}>{m.created_at?.slice(0, 10)} · {m.priority}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="ÇAMAŞIR (son 30g)">
        <Field k="İşlem sayısı" v={data.laundry?.recent_count || 0} />
        {data.laundry?.last_at && <Field k="Son işlem" v={data.laundry.last_at.slice(0, 10)} />}
      </Section>
    </>
  )
}

function DisciplineTab({ data }) {
  return (
    <Section title={`DİSİPLİN KARTLARI — Toplam 🟡${data.discipline_total?.yellow || 0}  🔴${data.discipline_total?.red || 0}`}>
      {!data.discipline?.length ? <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text4)' }}>Disiplin kaydı yok ✓</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.discipline.map(d => (
            <div key={d.id} style={{ padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, borderLeft: `3px solid ${d.card_type === 'red' ? 'var(--red)' : 'var(--amber)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <strong>{d.card_type === 'red' ? '🔴 KIRMIZI' : '🟡 SARI'}</strong>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>{d.created_at?.slice(0, 10)}</span>
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{d.reason}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function LeavesTab({ data }) {
  return (
    <>
      <Section title={`İZİN TALEPLERİ (${data.leaves?.length || 0})`}>
        {!data.leaves?.length ? <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text4)' }}>İzin yok</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: 6, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>TİP</th>
                <th style={{ padding: 6, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>BAŞL.</th>
                <th style={{ padding: 6, textAlign: 'left', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>BİTİŞ</th>
                <th style={{ padding: 6, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>GÜN</th>
                <th style={{ padding: 6, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>DURUM</th>
              </tr>
            </thead>
            <tbody>
              {data.leaves.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 6, fontFamily: 'var(--mono)', fontSize: 10 }}>{l.leave_type}</td>
                  <td style={{ padding: 6, fontFamily: 'var(--mono)', fontSize: 10 }}>{l.start_date}</td>
                  <td style={{ padding: 6, fontFamily: 'var(--mono)', fontSize: 10 }}>{l.end_date}</td>
                  <td style={{ padding: 6, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700 }}>{l.total_days}</td>
                  <td style={{ padding: 6, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, color: l.status === 'approved' ? 'var(--green)' : l.status === 'rejected' ? 'var(--red)' : 'var(--amber)' }}>{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title={`MESAİ KAYITLARI (${data.overtime?.length || 0})`}>
        {!data.overtime?.length ? <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text4)' }}>Mesai yok</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.overtime.map(o => (
              <div key={o.id} style={{ display: 'flex', gap: 10, padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 11 }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{o.work_date}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 700 }}>{o.hours}h</span>
                <span style={{ flex: 1, fontSize: 11 }}>{o.reason || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  )
}

function NotesTab({ staffId, notes, onChange }) {
  const [text, setText] = useState('')
  const [pinned, setPinned] = useState(false)
  const addMut = useMutation({
    mutationFn: () => api.post(`/personnel/${staffId}/notes`, { note: text, pinned }),
    onSuccess: () => { toast('Not eklendi'); setText(''); setPinned(false); onChange() },
    onError: toastErr,
  })
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/personnel/notes/${id}`),
    onSuccess: () => { toast('Silindi'); onChange() },
    onError: toastErr,
  })
  const pinMut = useMutation({
    mutationFn: (id) => api.patch(`/personnel/notes/${id}/pin`),
    onSuccess: onChange,
    onError: toastErr,
  })

  return (
    <Section title={`NOTLAR (${notes?.length || 0})`}>
      <div style={{ marginBottom: 10 }}>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Not yaz… (yöneticinin özel notu, kişiye ait gözlem, hatırlatma)"
          rows={3} className="form-input" style={{ borderRadius: 10, fontSize: 12, marginBottom: 6 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} style={{ marginRight: 4 }} />
            📌 ÜSTE SABİTLE
          </label>
          <button onClick={() => addMut.mutate()} disabled={!text.trim() || addMut.isPending} className="btn btn-primary btn-sm" style={{ borderRadius: 8, marginLeft: 'auto' }}>+ NOT EKLE</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(notes || []).map(n => (
          <div key={n.id} style={{ padding: '8px 12px', background: n.pinned ? 'rgba(245,158,11,.08)' : 'var(--surface2)', borderRadius: 8, borderLeft: n.pinned ? '3px solid var(--amber)' : '3px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
              <span>{n.pinned && '📌 '} {n.author_name || 'Yönetici'} · {new Date(n.created_at).toLocaleString('tr-TR')}</span>
              <span style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => pinMut.mutate(n.id)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 11 }} title="Sabitle/Kaldır">📌</button>
                <button onClick={async () => { if (await confirmDialog({ title: 'Notu sil', body: 'Geri alınamaz.', confirmLabel: 'Sil' })) delMut.mutate(n.id) }} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>✕</button>
              </span>
            </div>
            <div style={{ fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap' }}>{n.note}</div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function EmergencyTab({ staffId, contacts, onChange }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', relationship: '', phone: '', address: '' })
  const addMut = useMutation({
    mutationFn: () => api.post(`/personnel/${staffId}/emergency-contacts`, form),
    onSuccess: () => { toast('Eklendi'); setAdding(false); setForm({ name: '', relationship: '', phone: '', address: '' }); onChange() },
    onError: toastErr,
  })
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/personnel/emergency-contacts/${id}`),
    onSuccess: () => { toast('Silindi'); onChange() },
    onError: toastErr,
  })

  return (
    <Section title={`ACİL İLETİŞİM KİŞİLERİ (${contacts?.length || 0})`} right={
      !adding && <button onClick={() => setAdding(true)} className="btn btn-primary btn-xs" style={{ borderRadius: 6 }}>+ EKLE</button>
    }>
      {adding && (
        <div style={{ padding: 10, marginBottom: 10, background: 'var(--surface2)', borderRadius: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
            <input className="form-input" placeholder="Ad Soyad *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ fontSize: 12 }} />
            <input className="form-input" placeholder="Yakınlık (eş, anne, vb)" value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value })} style={{ fontSize: 12 }} />
            <input className="form-input" placeholder="Telefon" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={{ fontSize: 12 }} />
            <input className="form-input" placeholder="Adres" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={{ fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setAdding(false)} className="btn btn-ghost btn-xs">İPTAL</button>
            <button onClick={() => addMut.mutate()} disabled={!form.name || addMut.isPending} className="btn btn-primary btn-xs">KAYDET</button>
          </div>
        </div>
      )}
      {!contacts?.length && !adding ? (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text4)' }}>Acil iletişim kişisi yok</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(contacts || []).map(c => (
            <div key={c.id} style={{ padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>🆘</span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 13 }}>{c.name}</strong>
                {c.relationship && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginLeft: 8 }}>({c.relationship})</span>}
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                  {c.phone && <a href={`tel:${c.phone}`} style={{ color: 'var(--accent)', marginRight: 10, textDecoration: 'none' }}>📞 {c.phone}</a>}
                  {c.address}
                </div>
              </div>
              <button onClick={async () => { if (await confirmDialog({ title: 'Sil', body: 'Geri alınamaz.', confirmLabel: 'Sil' })) delMut.mutate(c.id) }} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function TimelineTab({ events }) {
  if (!events?.length) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text4)' }}>Olay yok</div>
  let lastDate = null
  return (
    <Section title={`SON 90 GÜN OLAYLAR (${events.length})`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {events.map((e, i) => {
          const showDate = e.date !== lastDate
          lastDate = e.date
          return (
            <div key={i}>
              {showDate && (
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginTop: i > 0 ? 8 : 0, marginBottom: 4 }}>
                  📅 {e.date}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, padding: '4px 8px', borderLeft: `3px solid ${e.color}`, background: 'var(--surface2)', borderRadius: '0 6px 6px 0', fontSize: 11 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', letterSpacing: 1, textTransform: 'uppercase', minWidth: 70 }}>{e.kind}</span>
                <span>{e.title}</span>
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
