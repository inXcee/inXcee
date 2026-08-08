import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { SkeletonCard } from '../../shared/components/Skeleton.jsx'
import { useUrlParamState } from '../../shared/hooks/useUrlParamState.js'
import {
  DossierActivity,
  DossierField,
  DossierHeader,
  DossierMetric,
  DossierReadiness,
  DossierRisks,
  DossierSection,
  DossierUpcoming,
  DossierWorkMetrics,
  DossierAnnualLeave,
  formatDossierDate,
  useStaffDossier,
} from './dossier/StaffDossierShared.jsx'
import StaffDocumentsPanel from './dossier/StaffDocumentsPanel.jsx'
import {
  StaffSafetyPanel, StaffEquipmentPanel, StaffChecklistPanel,
} from './dossier/StaffOperationalPanels.jsx'
import StaffPerformancePanel from './dossier/StaffPerformancePanel.jsx'
import { StaffNotesPanel, StaffTimelinePanel } from './dossier/StaffNotesTimeline.jsx'
import StaffUniformPanel from './dossier/StaffUniformPanel.jsx'
import StaffWorkTrackingPanel, { StaffMovementTimeline } from './dossier/StaffWorkTrackingPanel.jsx'
import StaffOffboardingPanel from './dossier/StaffOffboardingPanel.jsx'
import { StaffFormSheet } from '../shifts/tabs/StaffTab.jsx'
import { useToastStore } from '../../shared/store/toastStore.js'
import { exportRowsToXlsx } from '../../shared/utils/exportData.js'
import './StaffDossierPage.css'

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

const SHIFT_STATUS_LABELS = {
  worked: 'Çalışma',
  off: 'Hafta tatili',
  on_leave: 'İzinli',
  absent: 'Devamsız',
  sick: 'Raporlu',
}

function localIsoDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function asList(value) {
  return Array.isArray(value) ? value : []
}

const DOSSIER_EXPORT_COLUMNS = [
  ['full_name', 'Ad Soyad'], ['tc_no', 'TC Kimlik No'], ['status', 'Durum'],
  ['position', 'Pozisyon'], ['project', 'Proje'], ['department', 'Departman'], ['role', 'Rol'],
  ['site', 'Saha'], ['work_location', 'Ana Çalışma Noktası'], ['phone', 'Telefon'], ['email', 'E-posta'],
  ['emergency_contact', 'Acil Kişi'], ['emergency_phone', 'Acil Telefon'], ['hire_date', 'İşe Giriş'],
  ['contract_end', 'Sözleşme Bitişi'], ['birth_date', 'Doğum Tarihi'], ['blood_type', 'Kan Grubu'],
  ['room', 'Konaklama'], ['document_completion', 'Belge Tamamlama'], ['open_followups', 'Açık Görev'],
  ['risk_score', 'Risk Puanı'], ['dossier_path', 'Personel Dosyası'],
].map(([key, label]) => ({ key, label }))

function dossierExportRow(dossier, staffId) {
  const person = dossier.person || {}
  return {
    full_name: person.full_name,
    tc_no: person.tc_no,
    status: Number(person.is_active) === 1 ? 'Aktif' : 'Pasif',
    position: person.position,
    project: person.project_name,
    department: person.dept_name,
    role: person.role_name,
    site: person.primary_work_location_site,
    work_location: person.primary_work_location_name,
    phone: person.phone,
    email: person.email,
    emergency_contact: person.emergency_contact,
    emergency_phone: person.emergency_phone,
    hire_date: person.hire_date,
    contract_end: person.contract_end,
    birth_date: person.birth_date,
    blood_type: person.blood_type,
    room: dossier.room ? `${dossier.room.block}-${dossier.room.room_no} / ${dossier.room.bed_no || '—'}` : '',
    document_completion: `%${dossier.documents?.completion_rate ?? 100}`,
    open_followups: dossier.counters?.open_followups || 0,
    risk_score: dossier.risk_score || 0,
    dossier_path: `/shifts/personnel/${staffId}`,
  }
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

function staffEditForm(person) {
  return {
    full_name: person.full_name || '',
    tc_no: person.tc_no || '',
    phone: person.phone || '',
    email: person.email || '',
    position: person.position || '',
    project_id: person.project_id?.toString() || '',
    department_id: person.department_id?.toString() || '',
    role_id: person.role_id?.toString() || '',
    primary_work_location_id: person.primary_work_location_id?.toString() || '',
    assignment_effective_from: localIsoDate(),
    assignment_note: '',
    hire_date: person.hire_date || '',
    contract_end: person.contract_end || '',
    birth_date: person.birth_date || '',
    address: person.address || '',
    emergency_contact: person.emergency_contact || '',
    emergency_phone: person.emergency_phone || '',
    blood_type: person.blood_type || '',
    gender: person.gender || 'male',
    salary: person.salary?.toString() || '',
    iban: person.iban || '',
    notes: person.notes || '',
    is_active: Number(person.is_active) === 1 ? 1 : 0,
  }
}

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

function TrackingItem({ eyebrow, title, detail, tone = 'var(--blue)', warning = false, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${eyebrow}: ${title}`} style={{
      minWidth: 0, display: 'grid', gridTemplateColumns: '9px minmax(0, 1fr)', gap: 9,
      padding: '10px 11px', borderRadius: 10, textAlign: 'left', cursor: 'pointer', color: 'inherit',
      background: warning ? 'rgba(240,165,0,.07)' : 'var(--surface2)',
      border: `1px solid ${warning ? 'rgba(240,165,0,.28)' : 'var(--border)'}`,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: warning ? 'var(--accent)' : tone, marginTop: 3 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 8, letterSpacing: .8 }}>{eyebrow}</span>
        <strong style={{ display: 'block', marginTop: 3, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || '—'}</strong>
        <span style={{ display: 'block', marginTop: 3, color: warning ? 'var(--accent)' : 'var(--text3)', fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail || 'Ayrıntıyı aç'}</span>
      </span>
    </button>
  )
}

function StaffTrackingCenter({ dossier, staffId, onNavigate, onEdit }) {
  const person = dossier.person || {}
  const todayShift = dossier.today?.shift
  const nextShift = dossier.next_shift
  const room = dossier.room
  const riskCount = dossier.risks?.length || 0
  const documentIssues = Number(dossier.documents?.missing || 0) + Number(dossier.documents?.expired || 0)
  const todayStatus = todayShift?.shift_name || SHIFT_STATUS_LABELS[todayShift?.status] || todayShift?.status
  const nextStatus = nextShift?.shift_name || SHIFT_STATUS_LABELS[nextShift?.status] || nextShift?.status
  const todayHours = todayShift?.start_hour != null ? `${String(todayShift.start_hour).padStart(2, '0')}:00–${String(todayShift.end_hour).padStart(2, '0')}:00` : null
  const assignmentMissing = !person.project_id || !person.department_id || !person.role_name || !person.primary_work_location_name

  return (
    <section aria-label="Personel takip merkezi" style={{
      padding: 12, borderRadius: 13, border: '1px solid var(--border)',
      background: 'linear-gradient(135deg, var(--surface), rgba(59,140,240,.035))',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 9 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 1 }}>PERSONEL TAKİP MERKEZİ</div>
          <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, marginTop: 2 }}>Güncel görev, yer, vardiya ve açık kontroller</div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {onEdit && <button type="button" className="btn btn-ghost btn-xs" onClick={onEdit}>Bilgileri güncelle</button>}
          <Link className="btn btn-primary btn-xs" to={`/shifts?tab=schedule&staff=${staffId}`}>Vardiyaya git</Link>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 7 }}>
        <TrackingItem eyebrow="PROJE, GÖREV VE ANA NOKTA" title={`${person.project_name || 'Proje yok'} · ${person.dept_name || 'Departman yok'}`}
          detail={`${person.role_name || person.position || 'Rol yok'} · ${person.primary_work_location_name || 'Ana çalışma noktası eksik'}`} warning={assignmentMissing} onClick={() => onNavigate('identity')} />
        <TrackingItem eyebrow="BUGÜNKÜ PLAN" title={todayStatus || 'Vardiya planı yok'}
          detail={[todayHours, todayShift?.work_location_name || person.primary_work_location_name].filter(Boolean).join(' · ') || 'Plan oluşturmak için açın'}
          tone={todayShift ? 'var(--green)' : 'var(--text3)'} warning={!!todayShift && !todayShift.work_location_name && !person.primary_work_location_name} onClick={() => onNavigate('work')} />
        <TrackingItem eyebrow="SONRAKİ VARDİYA" title={nextShift ? `${nextShift.work_date} · ${nextStatus || 'Planlı'}` : 'Planlanmış vardiya yok'}
          detail={nextShift?.work_location_name || 'Vardiya planını görüntüle'} tone="var(--purple)" onClick={() => onNavigate('work')} />
        <TrackingItem eyebrow="KONAKLAMA" title={room ? `${room.block}-${room.room_no} · Yatak ${room.bed_no || '—'}` : 'Oda ataması yok'}
          detail={room?.floor != null ? `${room.floor}. kat` : 'Operasyon bağlantılarını aç'} warning={!room} tone="var(--teal)" onClick={() => onNavigate('operations')} />
        <TrackingItem eyebrow="İLETİŞİM" title={person.phone || 'Telefon eksik'} detail={person.email || 'E-posta eksik'}
          warning={!person.phone || !person.email} onClick={() => onNavigate('identity')} />
        <TrackingItem eyebrow="AÇIK KONTROLLER" title={riskCount ? `${riskCount} uyarı · Risk ${dossier.risk_score || 0}` : 'Açık kritik uyarı yok'}
          detail={documentIssues ? `${documentIssues} belge konusu var` : `Belge tamamlama %${dossier.documents?.completion_rate ?? 100}`}
          warning={riskCount > 0 || documentIssues > 0} tone="var(--green)" onClick={() => onNavigate(documentIssues ? 'documents' : 'overview')} />
      </div>
    </section>
  )
}

function dossierTabCount(tab, dossier) {
  const counters = dossier.counters || {}
  if (tab === 'overview') return dossier.risks?.length || 0
  if (tab === 'documents') return Number(dossier.documents?.missing || 0) + Number(dossier.documents?.expired || 0)
  if (tab === 'equipment') return Number(counters.active_inventory || 0) + Number(counters.active_kkd || 0)
  if (tab === 'notes') return Number(counters.open_followups || 0)
  if (tab === 'work') return Number(counters.open_attendance_exceptions || 0)
  return 0
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
        <DossierField label="Kadro / proje" value={person.project_name || 'Kadrosu belirsiz'} />
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

function WorkTab({ staffId, dossier, detail, isLoading }) {
  return <StaffWorkTrackingPanel staffId={staffId} dossier={dossier} legacyDetail={detail} isLegacyLoading={isLoading} />
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
  const queryClient = useQueryClient()
  const [tab, setTab] = useUrlParamState('tab', 'overview')
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({})
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
  const departmentsQuery = useQuery({
    queryKey: ['shift-departments'],
    queryFn: () => api.get('/shifts/departments').then(response => response.data),
    enabled: showEdit,
    staleTime: 60000,
  })
  const rolesQuery = useQuery({
    queryKey: ['shift-roles'],
    queryFn: () => api.get('/shifts/roles').then(response => response.data),
    enabled: showEdit,
    staleTime: 60000,
  })
  const locationsQuery = useQuery({
    queryKey: ['shift-work-locations'],
    queryFn: () => api.get('/shifts/work-locations').then(response => response.data),
    enabled: showEdit,
    staleTime: 60000,
  })
  const updateStaff = useMutation({
    mutationFn: payload => api.put(`/shifts/staff/${staffId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-dossier', String(staffId)] })
      queryClient.invalidateQueries({ queryKey: ['staff-detail', String(staffId)] })
      queryClient.invalidateQueries({ queryKey: ['staff-list'] })
      queryClient.invalidateQueries({ queryKey: ['staff-directory-overview'] })
      setShowEdit(false)
      useToastStore.getState().addToast('Personel dosyası güncellendi', 'success')
    },
    onError: error => useToastStore.getState().addToast(error.response?.data?.error || 'Personel güncellenemedi', 'error'),
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

  const openEdit = () => {
    setEditForm(staffEditForm(dossier.person))
    setShowEdit(true)
  }
  const submitEdit = () => {
    const payload = {
      ...editForm,
      project_id: editForm.project_id ? Number(editForm.project_id) : null,
      department_id: editForm.department_id ? Number(editForm.department_id) : null,
      role_id: editForm.role_id ? Number(editForm.role_id) : null,
      primary_work_location_id: editForm.primary_work_location_id ? Number(editForm.primary_work_location_id) : null,
      is_active: editForm.is_active ? 1 : 0,
    }
    if (dossier.access?.can_view_sensitive_fields) payload.salary = editForm.salary ? Number(editForm.salary) : null
    else {
      delete payload.tc_no
      delete payload.salary
      delete payload.iban
    }
    updateStaff.mutate(payload)
  }

  const refreshDossier = async () => {
    await queryClient.invalidateQueries({
      predicate: query => query.queryKey.some(part => String(part) === String(staffId)),
    })
    useToastStore.getState().addToast('Personel dosyası yenilendi', 'success')
  }
  const copySummary = async () => {
    const person = dossier.person
    const lines = [
      person.full_name,
      [person.project_name, person.dept_name, person.role_name || person.position].filter(Boolean).join(' / '),
      person.primary_work_location_name ? `Lokasyon: ${person.primary_work_location_name}` : null,
      person.phone ? `Telefon: ${person.phone}` : null,
      person.email ? `E-posta: ${person.email}` : null,
      `Dosya: /shifts/personnel/${staffId}`,
    ].filter(Boolean)
    try {
      await copyText(lines.join('\n'))
      useToastStore.getState().addToast('Personel özeti panoya kopyalandı', 'success')
    } catch {
      useToastStore.getState().addToast('Personel özeti kopyalanamadı', 'error')
    }
  }
  const exportDossier = async () => {
    try {
      await exportRowsToXlsx(DOSSIER_EXPORT_COLUMNS, [dossierExportRow(dossier, staffId)], `personel-dosyasi-${staffId}-${localIsoDate()}.xlsx`, 'Personel Dosyası')
      useToastStore.getState().addToast('Personel dosyası Excel olarak hazırlandı', 'success')
    } catch {
      useToastStore.getState().addToast('Excel dosyası oluşturulamadı', 'error')
    }
  }

  const actions = (
    <>
      {dossier.access?.can_manage_followups && <button type="button" className="btn btn-primary btn-sm" onClick={openEdit}>✎ Dosyayı Düzenle</button>}
      <Link className="btn btn-primary btn-sm" to={`/shifts?tab=schedule&staff=${staffId}`}>+ Vardiya</Link>
      <Link className="btn btn-ghost btn-sm" to={`/shifts?tab=leave&staff=${staffId}`}>İzin</Link>
      <Link className="btn btn-ghost btn-sm" to={`/shifts?tab=overtime&staff=${staffId}`}>Mesai</Link>
      <Link className="btn btn-ghost btn-sm" to={`/personnel/${staffId}/legacy`}>Klasik 360</Link>
    </>
  )

  return (
    <div className="fade-up staff-dossier-page">
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Geri</button>
      </div>
      <DossierHeader dossier={dossier} actions={actions} />
      <div className="dossier-commandbar" aria-label="Personel dosyası hızlı işlemleri">
        <div className="dossier-commandbar__meta">
          <span className="dossier-commandbar__id">DOSYA #{staffId}</span>
          <span>{dossier.person.project_name || 'Proje atanmamış'}</span>
          <span>·</span>
          <span>{dossier.person.primary_work_location_name || 'Lokasyon atanmamış'}</span>
        </div>
        <div className="dossier-commandbar__actions">
          {dossier.person.phone && <a className="btn btn-ghost btn-xs" href={`tel:${dossier.person.phone}`}>Ara</a>}
          {dossier.person.email && <a className="btn btn-ghost btn-xs" href={`mailto:${dossier.person.email}`}>E-posta</a>}
          <button type="button" className="btn btn-ghost btn-xs" onClick={copySummary}>Özeti Kopyala</button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={exportDossier}>Excel</button>
          <button type="button" className="btn btn-ghost btn-xs" onClick={refreshDossier}>Yenile</button>
        </div>
      </div>
      <DossierReadiness dossier={dossier} onNavigate={setTab}
        onEdit={dossier.access?.can_manage_followups ? openEdit : null} />
      <StaffTrackingCenter dossier={dossier} staffId={staffId} onNavigate={setTab}
        onEdit={dossier.access?.can_manage_followups ? openEdit : null} />
      <div role="tablist" aria-label="Personel dosyası sekmeleri" onKeyDown={onTabKeyDown} className="dossier-tabs">
        {TABS.map(([key, label]) => {
          const count = dossierTabCount(key, dossier)
          return (
            <button key={key} type="button" role="tab" id={`dossier-tab-${key}`}
              aria-selected={activeTab === key} tabIndex={activeTab === key ? 0 : -1}
              onClick={() => setTab(key)}
              className={`btn btn-sm ${activeTab === key ? 'btn-primary' : 'btn-ghost'}`}
              style={{ whiteSpace: 'nowrap', flex: '1 0 auto', gap: 5 }}>
              <span>{label}</span>
              {count > 0 && <span aria-hidden="true" title={`${count} açık kayıt`} style={{
                minWidth: 17, height: 17, padding: '0 4px', borderRadius: 9, display: 'inline-grid', placeItems: 'center',
                background: activeTab === key ? 'rgba(255,255,255,.22)' : 'rgba(240,165,0,.14)',
                color: activeTab === key ? 'inherit' : 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 8,
              }}>{count}</span>}
            </button>
          )
        })}
      </div>
      {activeTab === 'overview' && <OverviewTab dossier={dossier} />}
      {activeTab === 'identity' && <IdentityTab dossier={dossier} detail={detailQuery.data} isLoading={detailQuery.isLoading} />}
      {activeTab === 'work' && <WorkTab staffId={staffId} dossier={dossier} detail={detailQuery.data} isLoading={detailQuery.isLoading} />}
      {activeTab === 'documents' && <StaffDocumentsPanel staffId={staffId} access={dossier.access} />}
      {activeTab === 'performance' && <StaffPerformancePanel staffId={staffId} canManage={dossier.access?.can_manage_followups} />}
      {activeTab === 'safety' && <StaffSafetyPanel staffId={staffId} />}
      {activeTab === 'equipment' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <StaffEquipmentPanel staffId={staffId} canManage={dossier.access?.can_manage_followups} />
          <StaffUniformPanel staffId={staffId} access={dossier.access} />
        </div>
      )}
      {activeTab === 'hr' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <StaffOffboardingPanel staffId={staffId} person={dossier.person} canManage={dossier.access?.can_manage_followups} />
          <StaffChecklistPanel staffId={staffId} canManage={dossier.access?.can_manage_followups} />
        </div>
      )}
      {activeTab === 'operations' && <OperationsTab dossier={dossier} operations={operationsQuery.data} isLoading={operationsQuery.isLoading} />}
      {activeTab === 'notes' && <StaffNotesPanel staffId={staffId} access={dossier.access} />}
      {activeTab === 'timeline' && <div style={{ display: 'grid', gap: 12 }}><StaffMovementTimeline staffId={staffId} /><StaffTimelinePanel staffId={staffId} /></div>}
      {showEdit && (
        <StaffFormSheet
          editStaff={dossier.person}
          form={editForm}
          setForm={setEditForm}
          handleSubmit={submitEdit}
          createMut={{ isPending: false }}
          updateMut={updateStaff}
          departments={asList(departmentsQuery.data)}
          staffRoles={asList(rolesQuery.data)}
          workLocations={asList(locationsQuery.data)}
          canViewSensitive={dossier.access?.can_view_sensitive_fields}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  )
}
