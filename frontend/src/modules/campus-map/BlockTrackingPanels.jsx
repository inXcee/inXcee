import { useMemo, useState } from 'react'

const card = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface2)',
  padding: 10,
}

const inputStyle = {
  minHeight: 34,
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text)',
  padding: '7px 9px',
  fontFamily: 'var(--mono)',
  fontSize: 9,
}

const SHIFT_META = {
  all: { label: 'Tümü', color: '#38bdf8' },
  day: { label: 'Gündüz', color: '#f97316' },
  night: { label: 'Gece', color: '#8b5cf6' },
  unknown: { label: 'Belirsiz', color: '#f59e0b' },
  mixed: { label: 'Karma', color: '#3b82f6' },
}

const STATUS_META = {
  all: { label: 'Tümü', color: '#38bdf8' },
  done: { label: 'Tamamlandı', color: '#16a34a' },
  pending: { label: 'Bekliyor', color: '#f59e0b' },
  skipped: { label: 'Atlandı', color: '#ef4444' },
}

const normalize = value => String(value || '').toLocaleLowerCase('tr-TR')

function FilterButton({ active, color, children, onClick, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        border: `1px solid ${active ? color : 'var(--border)'}`,
        borderRadius: 6,
        background: active ? `${color}22` : 'var(--surface2)',
        color: active ? color : 'var(--text2)',
        padding: '6px 8px',
        cursor: 'pointer',
        fontFamily: 'var(--mono)',
        fontSize: 8,
      }}
    >
      {children}{count !== undefined ? ` · ${count}` : ''}
    </button>
  )
}

function Metric({ label, value, color, hint }) {
  return (
    <div style={card}>
      <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: .6 }}>{label}</div>
      <strong style={{ display: 'block', marginTop: 3, color, fontFamily: 'var(--display)', fontSize: 20 }}>{value}</strong>
      {hint && <span style={{ color: 'var(--text3)', fontSize: 8 }}>{hint}</span>}
    </div>
  )
}

export function TrackingDate({ value, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8 }}>
      TAKİP TARİHİ
      <input
        aria-label="Takip tarihi"
        type="date"
        value={value || ''}
        onChange={event => onChange(event.target.value)}
        style={{ ...inputStyle, marginLeft: 'auto' }}
      />
    </label>
  )
}

export function CompanyTracking({ data, date, onDateChange }) {
  const [query, setQuery] = useState('')
  const [shift, setShift] = useState('all')
  const companies = data?.companies || []
  const visible = useMemo(() => companies.filter(company => {
    const matchesQuery = normalize(company.company).includes(normalize(query))
    const matchesShift = shift === 'all'
      || (shift === 'unknown' ? company.unknown_count > 0 : company[`${shift}_count`] > 0)
    return matchesQuery && matchesShift
  }), [companies, query, shift])
  const people = companies.reduce((total, company) => total + Number(company.people_count || 0), 0)
  const day = companies.reduce((total, company) => total + Number(company.day_count || 0), 0)
  const night = companies.reduce((total, company) => total + Number(company.night_count || 0), 0)

  return (
    <div>
      {onDateChange && <div style={{ ...card, marginBottom: 8 }}><TrackingDate value={date} onChange={onDateChange} /></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(70px, 1fr))', gap: 6, marginBottom: 8 }}>
        <Metric label="ŞİRKET" value={data?.total_companies || 0} color="#38bdf8" />
        <Metric label="KİŞİ" value={people} color="var(--text)" />
        <Metric label="GÜNDÜZ" value={day} color="#f97316" />
        <Metric label="GECE" value={night} color="#8b5cf6" />
      </div>
      {Number(data?.unassigned_company_count || 0) > 0 && (
        <div style={{ ...card, borderColor: '#f59e0b', color: '#f59e0b', fontSize: 9, marginBottom: 8 }}>
          ⚠ {data.unassigned_company_count} kişinin şirket bilgisi eksik.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) auto', gap: 6, marginBottom: 7 }}>
        <input
          aria-label="Şirket ara"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Şirket ara..."
          style={inputStyle}
        />
        <span style={{ alignSelf: 'center', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8 }}>{visible.length} sonuç</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        {['all', 'day', 'night', 'unknown'].map(type => (
          <FilterButton key={type} active={shift === type} color={SHIFT_META[type].color} onClick={() => setShift(type)}>
            {SHIFT_META[type].label}
          </FilterButton>
        ))}
      </div>
      {!visible.length ? (
        <div style={{ ...card, color: 'var(--text3)' }}>Seçili filtrelerle eşleşen şirket yok.</div>
      ) : visible.map(company => {
        const dominant = SHIFT_META[company.dominant_shift] || SHIFT_META.unknown
        return (
          <article key={company.company} style={{ ...card, marginBottom: 7, borderLeft: `3px solid ${dominant.color}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 11, overflowWrap: 'anywhere' }}>{company.company}</strong>
                <span style={{ color: 'var(--text3)', fontSize: 8 }}>
                  {company.people_count} kişi · {company.room_count} oda · blok payı %{company.share_pct}
                </span>
              </div>
              <span style={{ marginLeft: 'auto', borderRadius: 10, padding: '3px 6px', background: `${dominant.color}22`, color: dominant.color, fontFamily: 'var(--mono)', fontSize: 8 }}>
                {dominant.label}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
              <span style={{ color: '#f97316', fontSize: 9 }}>☀ {company.day_count} gündüz</span>
              <span style={{ color: '#8b5cf6', fontSize: 9 }}>☾ {company.night_count} gece</span>
              {company.unknown_count > 0 && <span style={{ color: '#f59e0b', fontSize: 9 }}>? {company.unknown_count} belirsiz</span>}
            </div>
            <div style={{ marginTop: 7, color: 'var(--text2)', fontFamily: 'var(--mono)', fontSize: 8 }}>
              ODALAR · {company.rooms.map(room => `${room.room_no} (${room.floor}. kat)`).join(', ')}
            </div>
            {company.cleaning ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text3)', fontSize: 8 }}>
                  <span>İlişkili oda temizliği</span>
                  <span>{company.cleaning.done}/{company.cleaning.total} · %{company.cleaning.pct}</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'var(--surface3)', overflow: 'hidden', marginTop: 4 }}>
                  <div style={{ height: '100%', width: `${company.cleaning.pct}%`, background: company.cleaning.pending ? '#f59e0b' : '#16a34a' }} />
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 7, color: 'var(--text3)', fontSize: 8 }}>Temizlik ayrıntısı bu rol için kapalı.</div>
            )}
          </article>
        )
      })}
    </div>
  )
}

export function ShiftTracking({ data, onNavigate }) {
  const [shift, setShift] = useState('all')
  const [query, setQuery] = useState('')
  const residents = data?.residents || []
  const visible = useMemo(() => residents.filter(person => {
    const haystack = `${person.full_name} ${person.company} ${person.room_no} ${person.job_title || ''}`
    return (shift === 'all' || person.shift_type === shift) && normalize(haystack).includes(normalize(query))
  }), [query, residents, shift])

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(70px, 1fr))', gap: 6, marginBottom: 8 }}>
        <Metric label="TOPLAM" value={data?.total || 0} color="var(--text)" />
        <Metric label="GÜNDÜZ" value={data?.day || 0} color="#f97316" />
        <Metric label="GECE" value={data?.night || 0} color="#8b5cf6" />
        <Metric label="BELİRSİZ" value={data?.unknown || 0} color={data?.unknown ? '#f59e0b' : '#16a34a'} />
      </div>
      <div style={{ ...card, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text3)', fontSize: 8 }}>
          <span>Vardiya bilgisi kapsamı</span><strong style={{ color: data?.coverage_pct === 100 ? '#16a34a' : '#f59e0b' }}>%{data?.coverage_pct ?? 100}</strong>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: 'var(--surface3)', overflow: 'hidden', marginTop: 5 }}>
          <div style={{ height: '100%', width: `${data?.coverage_pct ?? 100}%`, background: data?.coverage_pct === 100 ? '#16a34a' : '#f59e0b' }} />
        </div>
      </div>
      <input
        aria-label="Vardiya kişisi ara"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Kişi, şirket veya oda ara..."
        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: 7 }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        {['all', 'day', 'night', 'unknown'].map(type => (
          <FilterButton
            key={type}
            active={shift === type}
            color={SHIFT_META[type].color}
            onClick={() => setShift(type)}
            count={type === 'all' ? data?.total : data?.[type]}
          >
            {SHIFT_META[type].label}
          </FilterButton>
        ))}
      </div>
      {!visible.length ? (
        <div style={{ ...card, color: 'var(--text3)' }}>Seçili vardiyada kişi bulunamadı.</div>
      ) : visible.map(person => {
        const meta = SHIFT_META[person.shift_type] || SHIFT_META.unknown
        const hours = person.start_hour !== null && person.start_hour !== undefined
          ? `${String(person.start_hour).padStart(2, '0')}:00–${String(person.end_hour).padStart(2, '0')}:00`
          : 'Saat tanımsız'
        return (
          <button
            type="button"
            key={person.personnel_id}
            onClick={() => onNavigate(`/personnel/${person.personnel_id}`)}
            style={{ ...card, width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, color: 'var(--text)', cursor: 'pointer', textAlign: 'left', borderLeft: `3px solid ${meta.color}` }}
          >
            <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `${meta.color}22`, color: meta.color }}>
              {person.full_name.slice(0, 1)}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <strong style={{ display: 'block', fontSize: 10 }}>{person.full_name}</strong>
              <span style={{ display: 'block', color: 'var(--text3)', fontSize: 8 }}>{person.company} · Oda {person.room_no} / Yatak {person.bed_no}</span>
            </span>
            <span style={{ color: meta.color, fontFamily: 'var(--mono)', fontSize: 8, textAlign: 'right' }}>{meta.label}<br />{hours}</span>
          </button>
        )
      })}
    </div>
  )
}

export function CleaningTracking({ data, date, onDateChange, block, onNavigate }) {
  const [status, setStatus] = useState('all')
  const [floor, setFloor] = useState('all')
  const [shift, setShift] = useState('all')
  const [query, setQuery] = useState('')
  const tasks = data?.tasks || []
  const visible = useMemo(() => tasks.filter(task => {
    const matchesStatus = status === 'all' || task.status === status
    const matchesFloor = floor === 'all' || String(task.floor) === floor
    const matchesShift = shift === 'all' || Number(task.shift_profile?.[shift] || 0) > 0
    const matchesQuery = normalize(`${task.area} ${task.room_no || ''} ${(task.companies || []).join(' ')} ${task.assignee_name || ''}`).includes(normalize(query))
    return matchesStatus && matchesFloor && matchesShift && matchesQuery
  }), [floor, query, shift, status, tasks])

  return (
    <div>
      <div style={{ ...card, marginBottom: 8 }}><TrackingDate value={date} onChange={onDateChange} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(70px, 1fr))', gap: 6, marginBottom: 8 }}>
        <Metric label="TAMAM" value={data?.done || 0} color="#16a34a" hint={`%${data?.pct || 0}`} />
        <Metric label="BEKLİYOR" value={data?.pending || 0} color={data?.pending ? '#f59e0b' : '#16a34a'} />
        <Metric label="ATLANDI" value={data?.skipped || 0} color={data?.skipped ? '#ef4444' : 'var(--text3)'} />
        <Metric label="GECE ODASI" value={data?.night_shift_room_count || 0} color="#8b5cf6" />
      </div>
      <div style={{ ...card, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text3)', fontSize: 8 }}>
          <span>Günlük tamamlanma</span><strong style={{ color: '#16a34a' }}>{data?.done || 0}/{data?.total || 0}</strong>
        </div>
        <div style={{ height: 7, borderRadius: 4, background: 'var(--surface3)', overflow: 'hidden', marginTop: 6 }}>
          <div style={{ height: '100%', width: `${data?.pct || 0}%`, background: '#16a34a' }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 7, color: 'var(--text3)', fontSize: 8 }}>
          <span>Oda {data?.room_tasks || 0}</span>
          <span>Ortak alan {data?.common_area_tasks || 0}</span>
          <span>Fotoğraflı {data?.photo_evidence_count || 0}</span>
          <span>QR doğrulamalı {data?.qr_verified_count || 0}</span>
        </div>
      </div>
      {!!data?.floors?.length && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 5, marginBottom: 8 }}>
          {data.floors.map(item => (
            <div key={item.floor} style={{ ...card, padding: 7 }}>
              <strong style={{ fontSize: 9 }}>{item.floor}. KAT</strong>
              <span style={{ float: 'right', color: item.pending ? '#f59e0b' : '#16a34a', fontFamily: 'var(--mono)', fontSize: 8 }}>%{item.pct}</span>
              <div style={{ clear: 'both', marginTop: 3, color: 'var(--text3)', fontSize: 8 }}>{item.done}/{item.total} tamam · {item.pending} bekliyor</div>
            </div>
          ))}
        </div>
      )}
      <input
        aria-label="Temizlik görevi ara"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder="Oda, alan, şirket veya görevli ara..."
        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: 6 }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(90px, 1fr))', gap: 5, marginBottom: 7 }}>
        <select aria-label="Temizlik durumu" value={status} onChange={event => setStatus(event.target.value)} style={inputStyle}>
          {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
        </select>
        <select aria-label="Temizlik katı" value={floor} onChange={event => setFloor(event.target.value)} style={inputStyle}>
          <option value="all">Tüm katlar</option>
          {(data?.floors || []).map(item => <option key={item.floor} value={item.floor}>{item.floor}. kat</option>)}
        </select>
        <select aria-label="Oda vardiyası" value={shift} onChange={event => setShift(event.target.value)} style={inputStyle}>
          <option value="all">Tüm vardiyalar</option>
          <option value="day">Gündüz odası</option>
          <option value="night">Gece odası</option>
          <option value="unknown">Belirsiz vardiya</option>
        </select>
      </div>
      <div style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, marginBottom: 6 }}>{visible.length} / {tasks.length} görev gösteriliyor</div>
      {!visible.length ? (
        <div style={{ ...card, color: 'var(--text3)' }}>Seçili tarih ve filtrelerde görev yok.</div>
      ) : visible.map(task => {
        const statusMeta = STATUS_META[task.status] || STATUS_META.pending
        return (
          <article key={task.id} style={{ ...card, marginBottom: 6, borderLeft: `3px solid ${statusMeta.color}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontSize: 10 }}>{task.area}</strong>
                <span style={{ color: 'var(--text3)', fontSize: 8 }}>{task.floor}. kat · {task.task_type === 'room' ? `Oda ${task.room_no}` : 'Ortak alan'}</span>
              </div>
              <span style={{ marginLeft: 'auto', color: statusMeta.color, fontFamily: 'var(--mono)', fontSize: 8 }}>{statusMeta.label}</span>
            </div>
            {!!task.companies?.length && <div style={{ marginTop: 6, color: 'var(--text2)', fontSize: 8 }}>Şirket · {task.companies.join(', ')}</div>}
            {task.shift_profile?.total > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 5, fontSize: 8 }}>
                <span style={{ color: '#f97316' }}>☀ {task.shift_profile.day} gündüz</span>
                <span style={{ color: '#8b5cf6' }}>☾ {task.shift_profile.night} gece</span>
                {task.shift_profile.unknown > 0 && <span style={{ color: '#f59e0b' }}>? {task.shift_profile.unknown} belirsiz</span>}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6, color: 'var(--text3)', fontSize: 8 }}>
              <span>{task.worker_name || task.assignee_name || 'Görevli atanmamış'}</span>
              <span>Fotoğraf {task.photo_count || 0}</span>
              <span>QR {task.verified_by_qr ? 'doğrulandı' : 'yok'}</span>
              {task.no_clean ? <span style={{ color: '#f59e0b' }}>NO-CLEAN</span> : null}
            </div>
            {task.skip_reason && <div style={{ marginTop: 5, color: '#ef4444', fontSize: 8 }}>Atlama nedeni: {task.skip_reason}</div>}
          </article>
        )
      })}
      <button
        type="button"
        onClick={() => onNavigate(`/housekeeping?block=${block}&date=${date}`)}
        style={{ ...inputStyle, width: '100%', marginTop: 3, cursor: 'pointer', borderLeft: '3px solid #f59e0b' }}
      >
        Ayrıntılı temizlik yönetimini aç ›
      </button>
    </div>
  )
}
