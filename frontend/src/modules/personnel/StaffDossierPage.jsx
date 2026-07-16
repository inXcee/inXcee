import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { SkeletonCard } from '../../shared/components/Skeleton.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'
import {
  DossierActivity,
  DossierField,
  DossierHeader,
  DossierMetric,
  DossierRisks,
  DossierSection,
  DossierUpcoming,
  DossierWorkMetrics,
  formatDossierDate,
  useStaffDossier,
} from './dossier/StaffDossierShared.jsx'
import StaffDocumentsPanel from './dossier/StaffDocumentsPanel.jsx'
import {
  StaffPerformancePanel, StaffSafetyPanel, StaffEquipmentPanel, StaffChecklistPanel,
} from './dossier/StaffOperationalPanels.jsx'
import { StaffNotesPanel, StaffTimelinePanel } from './dossier/StaffNotesTimeline.jsx'

const TABS = [
  ['overview', 'Genel Bakış'],
  ['identity', 'Kimlik ve İletişim'],
  ['work', 'Çalışma ve Devam'],
  ['documents', 'Belgeler'],
  ['performance', 'Performans ve Hedefler'],
  ['safety', 'İSG ve Sertifikalar'],
  ['equipment', 'Zimmet ve Ekipman'],
  ['hr', 'İşe Giriş/Çıkış'],
  ['operations', 'Operasyonel Bağlantılar'],
  ['notes', 'Notlar ve Görevler'],
  ['timeline', 'Zaman Çizelgesi'],
]

function ErrorState({ staffId, error, onBack }) {
  return (
    <div style={{ maxWidth: 680, padding: 8 }}>
      <button className="btn btn-ghost btn-sm" onClick={onBack}>← Geri</button>
      <div style={{
        marginTop: 14, padding: 18, borderRadius: 12,
        background: 'rgba(231,76,60,.08)', border: '1px solid rgba(231,76,60,.3)',
      }}>
        <div style={{ color: 'var(--red)', fontFamily: 'var(--display)', letterSpacing: 1 }}>PERSONEL DOSYASI YÜKLENEMEDİ</div>
        <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 8 }}>{error?.response?.data?.error || error?.message || 'Personel bulunamadı'}</div>
        <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 9, marginTop: 8 }}>Personel ID: {staffId}</div>
      </div>
    </div>
  )
}

function OverviewTab({ dossier }) {
  const counters = dossier.counters || {}
  const documents = dossier.documents || {}
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <DossierWorkMetrics dossier={dossier} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(285px, 1fr))', gap: 12 }}>
        <DossierSection title="AÇIK UYARILAR" subtitle={`${dossier.risks?.length || 0} aktif kontrol`}>
          <DossierRisks risks={dossier.risks} />
        </DossierSection>
        <DossierSection title="BELGE SAĞLIĞI" subtitle="Zorunlu belge ve süre durumu">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <DossierMetric label="TAMAMLAMA" value={`%${documents.completion_rate ?? 100}`} color={documents.missing ? 'var(--accent)' : 'var(--green)'} />
            <DossierMetric label="EKSİK" value={documents.missing || 0} color={documents.missing ? 'var(--red)' : 'var(--green)'} />
            <DossierMetric label="SÜRESİ DOLMUŞ" value={documents.expired || 0} color={documents.expired ? 'var(--red)' : 'var(--green)'} />
            <DossierMetric label="YAKLAŞAN" value={documents.expiring || 0} color={documents.expiring ? 'var(--accent)' : 'var(--text3)'} />
          </div>
        </DossierSection>
        <DossierSection title="TAKİP VE OPERASYON" subtitle="Açık görev ve bağlı kayıtlar">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <DossierMetric label="AÇIK GÖREV" value={counters.open_followups || 0} color="var(--blue)" />
            <DossierMetric label="GECİKMİŞ" value={counters.overdue_followups || 0} color={counters.overdue_followups ? 'var(--red)' : 'var(--green)'} />
            <DossierMetric label="ZİMMET / KKD" value={(counters.active_inventory || 0) + (counters.active_kkd || 0)} color="var(--accent)" />
            <DossierMetric label="DEVAM İSTİSNASI" value={counters.open_attendance_exceptions || 0} color={counters.open_attendance_exceptions ? 'var(--red)' : 'var(--green)'} />
          </div>
        </DossierSection>
        <DossierSection title="YAKLAŞAN TARİHLER" subtitle="Sözleşme, belge, sertifika ve takipler">
          <DossierUpcoming items={dossier.upcoming} />
        </DossierSection>
        <DossierSection title="SON İŞLEMLER" subtitle="Birleşik personel zaman akışı">
          <DossierActivity items={dossier.recent_activity} />
        </DossierSection>
        <DossierSection title="BUGÜNKÜ DURUM">
          <DossierField label="Vardiya" value={dossier.today?.shift?.shift_name || dossier.today?.shift?.status} />
          <DossierField label="Vardiya saati" value={dossier.today?.shift?.start_hour != null ? `${dossier.today.shift.start_hour}:00–${dossier.today.shift.end_hour}:00` : null} />
          <DossierField label="Çalışma noktası" value={dossier.today?.shift?.work_location_name} />
          <DossierField label="Giriş" value={formatDossierDate(dossier.today?.attendance?.check_in_at, true)} />
          <DossierField label="Çıkış" value={formatDossierDate(dossier.today?.attendance?.check_out_at, true)} />
          <DossierField label="Sonraki vardiya" value={dossier.next_shift ? `${dossier.next_shift.work_date} · ${dossier.next_shift.shift_name || dossier.next_shift.status}` : null} />
        </DossierSection>
      </div>
    </div>
  )
}

function IdentityTab({ dossier, detail, isLoading }) {
  const person = dossier.person
  const assignments = detail?.assignmentHistory || []
  const missing = dossier.data_quality?.missing_fields || []
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
      <DossierSection title="KİMLİK VE İLETİŞİM" subtitle={dossier.access?.can_view_sensitive_fields ? 'Tam yetkili görünüm' : 'Operasyonel ve maskeli görünüm'}>
        <DossierField label="TC Kimlik No" value={person.tc_no} sensitive />
        <DossierField label="Telefon" value={person.phone} href={person.phone ? `tel:${person.phone}` : null} />
        <DossierField label="E-posta" value={person.email} href={person.email ? `mailto:${person.email}` : null} />
        <DossierField label="Doğum tarihi" value={formatDossierDate(person.birth_date)} />
        <DossierField label="Cinsiyet" value={person.gender === 'male' ? 'Erkek' : person.gender === 'female' ? 'Kadın' : null} />
        <DossierField label="Kan grubu" value={person.blood_type} />
        <DossierField label="Adres" value={person.address} />
        <DossierField label="Acil kişi" value={person.emergency_contact} />
        <DossierField label="Acil telefon" value={person.emergency_phone} href={person.emergency_phone ? `tel:${person.emergency_phone}` : null} />
        {dossier.access?.can_view_sensitive_fields && (
          <>
            <DossierField label="Maaş" value={person.salary ? `${Number(person.salary).toLocaleString('tr-TR')} TL` : null} sensitive />
            <DossierField label="IBAN" value={person.iban} sensitive />
          </>
        )}
      </DossierSection>
      <DossierSection title="İŞ VE ARŞİV BİLGİLERİ">
        <DossierField label="Departman" value={person.dept_name} />
        <DossierField label="Görev / rol" value={person.role_name || person.position} />
        <DossierField label="Çalışma lokasyonu" value={person.primary_work_location_name} />
        <DossierField label="İşe giriş" value={formatDossierDate(person.hire_date)} />
        <DossierField label="Sözleşme bitişi" value={formatDossierDate(person.contract_end)} />
        <DossierField label="Durum" value={person.is_active ? 'Aktif' : 'Pasif / arşiv'} />
        <DossierField label="Yatakhane eşleşmesi" value={dossier.identity_link?.status} />
        <DossierField label="Yatakhane kayıt ID" value={dossier.identity_link?.personnel_id} />
      </DossierSection>
      <DossierSection title="VERİ BÜTÜNLÜĞÜ" subtitle={`${missing.length} eksik alan`}>
        {missing.length ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {missing.map(item => (
              <div key={item.field} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(240,165,0,.08)', border: '1px solid rgba(240,165,0,.25)', fontSize: 11 }}>
                {item.label}
              </div>
            ))}
          </div>
        ) : <div style={{ color: 'var(--green)', fontSize: 11 }}>Temel personel alanları eksiksiz.</div>}
      </DossierSection>
      <DossierSection title="GÖREV VE LOKASYON GEÇMİŞİ" subtitle={isLoading ? 'Yükleniyor…' : `${assignments.length} kayıt`}>
        {isLoading ? <span className="page-spinner" /> : assignments.length ? (
          <div style={{ display: 'grid', gap: 7 }}>
            {assignments.map(assignment => (
              <div key={assignment.id} style={{ padding: '9px 10px', borderRadius: 8, background: 'var(--surface2)', borderLeft: '3px solid var(--blue)' }}>
                <div style={{ fontWeight: 700, fontSize: 11 }}>{assignment.dept_name || 'Departman yok'} · {assignment.role_name || 'Rol yok'}</div>
                <div style={{ color: 'var(--text3)', fontSize: 9, marginTop: 3 }}>{assignment.work_location_name || 'Lokasyon yok'} · {assignment.effective_from} → {assignment.effective_to || 'devam ediyor'}</div>
                {assignment.note && <div style={{ color: 'var(--text2)', fontSize: 10, marginTop: 4 }}>{assignment.note}</div>}
              </div>
            ))}
          </div>
        ) : <div style={{ color: 'var(--text3)', fontSize: 11 }}>Görev geçmişi bulunmuyor.</div>}
      </DossierSection>
    </div>
  )
}

function WorkTab({ dossier, detail, isLoading }) {
  const shifts = detail?.shiftHistory || []
  const attendance = detail?.attendanceLogs || []
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <DossierWorkMetrics dossier={dossier} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, .8fr)', gap: 12 }}>
        <DossierSection title="VARDİYA GEÇMİŞİ" subtitle={isLoading ? 'Yükleniyor…' : `Son ${Math.min(shifts.length, 40)} kayıt`}>
          {isLoading ? <span className="page-spinner" /> : shifts.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 680, fontSize: 10 }}>
                <thead><tr><th>TARİH</th><th>VARDİYA</th><th>LOKASYON</th><th>DURUM</th><th>AÇIKLAMA</th></tr></thead>
                <tbody>
                  {shifts.slice(0, 40).map((shift, index) => (
                    <tr key={`${shift.work_date}-${index}`}>
                      <td>{shift.work_date}</td>
                      <td>{shift.shift_name || '—'}</td>
                      <td>{shift.work_location_name || '—'}</td>
                      <td><span className={`badge ${shift.status === 'absent' ? 'badge-red' : shift.status === 'worked' ? 'badge-green' : 'badge-gray'}`}>{shift.status}</span></td>
                      <td>{shift.detail_note || shift.absent_reason || shift.leave_type || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={{ color: 'var(--text3)', fontSize: 11 }}>Vardiya kaydı bulunmuyor.</div>}
        </DossierSection>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <DossierSection title="DEVAM KAYITLARI" subtitle={`${attendance.length} son kayıt`}>
            {attendance.slice(0, 12).map(log => (
              <div key={log.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 10 }}>
                <div>{formatDossierDate(log.check_in_at, true)}</div>
                <div style={{ color: 'var(--text3)', marginTop: 2 }}>Çıkış: {formatDossierDate(log.check_out_at, true)} · {log.actual_hours ?? '—'} saat</div>
              </div>
            ))}
            {!attendance.length && <div style={{ color: 'var(--text3)', fontSize: 11 }}>Devam kaydı bulunmuyor.</div>}
          </DossierSection>
          <DossierSection title="İZİN VE MESAİ">
            <DossierField label="İzin kaydı" value={`${detail?.leaveHistory?.length || 0} kayıt`} />
            <DossierField label="Mesai kaydı" value={`${detail?.overtimeRecords?.length || 0} kayıt`} />
            <DossierField label="Toplam mesai" value={`${detail?.stats?.totalOvertime || 0} saat`} />
            <DossierField label="Devamsız gün" value={detail?.stats?.absentCount || 0} />
          </DossierSection>
        </div>
      </div>
    </div>
  )
}

function OperationsTab({ dossier, operations, isLoading }) {
  const discipline = operations?.discipline || []
  const maintenance = operations?.maintenance || []
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(285px, 1fr))', gap: 12 }}>
      <DossierSection title="YATAKHANE" subtitle={`Eşleşme: ${dossier.identity_link?.status || 'bilinmiyor'}`}>
        <DossierField label="Blok / oda" value={dossier.room ? `${dossier.room.block}-${dossier.room.room_no}` : null} />
        <DossierField label="Kat" value={dossier.room?.floor} />
        <DossierField label="Yatak" value={dossier.room?.bed_no} />
        <DossierField label="Atama tarihi" value={formatDossierDate(dossier.room?.assigned_at)} />
        <DossierField label="Geçmiş oda sayısı" value={operations?.room_history?.length || 0} />
      </DossierSection>
      <DossierSection title="SERVİS VE ULAŞIM" subtitle={isLoading ? 'Yükleniyor…' : 'Son 30 gün'}>
        <DossierField label="Durak" value={operations?.person?.pickup_name} />
        <DossierField label="Bugünkü rota" value={operations?.today_transport?.route_name} />
        <DossierField label="Planlanan saat" value={operations?.today_transport?.scheduled_time} />
        <DossierField label="Şoför" value={operations?.today_transport?.driver_name} href={operations?.today_transport?.driver_phone ? `tel:${operations.today_transport.driver_phone}` : null} />
        <DossierField label="Atama" value={operations?.transport_summary?.assignments || 0} />
        <DossierField label="Servise binmedi" value={operations?.transport_summary?.no_show || 0} />
      </DossierSection>
      <DossierSection title="DİSİPLİN" subtitle={`${discipline.length} son kayıt`}>
        <DossierField label="Sarı kart" value={operations?.discipline_total?.yellow || 0} />
        <DossierField label="Kırmızı kart" value={operations?.discipline_total?.red || 0} />
        {discipline.slice(0, 5).map(record => (
          <div key={record.id} style={{ padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 10 }}>
            <span style={{ color: record.card_type === 'red' ? 'var(--red)' : 'var(--accent)', fontWeight: 700 }}>{record.card_type}</span>
            <span> · {record.reason}</span>
          </div>
        ))}
      </DossierSection>
      <DossierSection title="YEMEK, ÇAMAŞIR VE BAKIM">
        <DossierField label="Çamaşır son 30g" value={operations?.laundry?.recent_count || 0} />
        <DossierField label="Son çamaşır kaydı" value={formatDossierDate(operations?.laundry?.last_at)} />
        <DossierField label="Bakım talebi" value={maintenance.length} />
        {maintenance.slice(0, 4).map(request => (
          <div key={request.id} style={{ padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 10 }}>
            <div>{request.location} · {request.status}</div>
            <div style={{ color: 'var(--text3)', marginTop: 2 }}>{request.description}</div>
          </div>
        ))}
      </DossierSection>
      <DossierSection title="BAĞLI MODÜLLER">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          <Link className="btn btn-ghost btn-sm" to="/transport">Servis Yönetimi</Link>
          <Link className="btn btn-ghost btn-sm" to="/settings/discipline">Disiplin</Link>
          <Link className="btn btn-ghost btn-sm" to="/settings/meals">Yemek</Link>
          <Link className="btn btn-ghost btn-sm" to="/inventory">Envanter</Link>
          <Link className="btn btn-ghost btn-sm" to="/settings/hr">İK Süreçleri</Link>
        </div>
      </DossierSection>
    </div>
  )
}

export default function StaffDossierPage() {
  const params = useParams()
  const staffId = params.staffId || params.id
  const navigate = useNavigate()
  const [tab, setTab] = useUrlParamState('tab', 'overview')
  const { data: dossier, isLoading, error } = useStaffDossier(staffId)
  const needsDetail = tab === 'identity' || tab === 'work'
  const detailQuery = useQuery({
    queryKey: ['staff-detail', String(staffId)],
    queryFn: () => api.get(`/shifts/staff/${staffId}/detail`).then(response => response.data),
    enabled: !!staffId && needsDetail,
    staleTime: 60000,
  })
  const operationsQuery = useQuery({
    queryKey: ['personnel-360', String(staffId)],
    queryFn: () => api.get(`/personnel/${staffId}/360`).then(response => response.data),
    enabled: !!staffId && tab === 'operations',
    staleTime: 60000,
  })
  const activeTab = useMemo(() => TABS.some(([key]) => key === tab) ? tab : 'overview', [tab])

  // Erişilebilir sekme klavye navigasyonu: ←/→/Home/End ile sekmeler arası gezinme.
  const onTabKeyDown = (event) => {
    const index = TABS.findIndex(([key]) => key === activeTab)
    let nextIndex = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = TABS.length - 1
    if (nextIndex != null) {
      event.preventDefault()
      setTab(TABS[nextIndex][0])
    }
  }

  if (isLoading) return <SkeletonCard lines={10} />
  if (error || !dossier?.person) return <ErrorState staffId={staffId} error={error} onBack={() => navigate(-1)} />

  const actions = (
    <>
      <Link className="btn btn-primary btn-sm" to={`/shifts?tab=schedule&staff=${staffId}`}>+ Vardiya</Link>
      <Link className="btn btn-ghost btn-sm" to={`/shifts?tab=leave&staff=${staffId}`}>İzin</Link>
      <Link className="btn btn-ghost btn-sm" to={`/shifts?tab=overtime&staff=${staffId}`}>Mesai</Link>
      <Link className="btn btn-ghost btn-sm" to={`/personnel/${staffId}/legacy`}>Klasik 360</Link>
    </>
  )

  return (
    <div className="fade-up" style={{ maxWidth: 1440, margin: '0 auto', display: 'grid', gap: 14 }}>
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Geri</button>
      </div>
      <DossierHeader dossier={dossier} actions={actions} />
      <div role="tablist" aria-label="Personel dosyası sekmeleri" onKeyDown={onTabKeyDown} style={{
        display: 'flex', gap: 4, overflowX: 'auto', padding: 4,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11,
      }}>
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" id={`dossier-tab-${key}`}
            aria-selected={activeTab === key} tabIndex={activeTab === key ? 0 : -1}
            onClick={() => setTab(key)}
            className={`btn btn-sm ${activeTab === key ? 'btn-primary' : 'btn-ghost'}`}
            style={{ whiteSpace: 'nowrap', flex: '1 0 auto' }}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'overview' && <OverviewTab dossier={dossier} />}
      {activeTab === 'identity' && <IdentityTab dossier={dossier} detail={detailQuery.data} isLoading={detailQuery.isLoading} />}
      {activeTab === 'work' && <WorkTab dossier={dossier} detail={detailQuery.data} isLoading={detailQuery.isLoading} />}
      {activeTab === 'documents' && <StaffDocumentsPanel staffId={staffId} access={dossier.access} />}
      {activeTab === 'performance' && <StaffPerformancePanel staffId={staffId} canManage={dossier.access?.can_manage_followups} />}
      {activeTab === 'safety' && <StaffSafetyPanel staffId={staffId} />}
      {activeTab === 'equipment' && <StaffEquipmentPanel staffId={staffId} canManage={dossier.access?.can_manage_followups} />}
      {activeTab === 'hr' && <StaffChecklistPanel staffId={staffId} canManage={dossier.access?.can_manage_followups} />}
      {activeTab === 'operations' && <OperationsTab dossier={dossier} operations={operationsQuery.data} isLoading={operationsQuery.isLoading} />}
      {activeTab === 'notes' && <StaffNotesPanel staffId={staffId} access={dossier.access} />}
      {activeTab === 'timeline' && <StaffTimelinePanel staffId={staffId} />}
    </div>
  )
}
