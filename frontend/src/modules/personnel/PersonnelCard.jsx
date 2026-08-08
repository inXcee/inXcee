import ProjectBadge from '../../shared/components/ProjectBadge.jsx'
import { classHex } from '../shifts/logic/shiftColors.js'
import './PersonnelListPage.css'

function Icon({ name }) {
  const paths = {
    phone: <path d="M6.6 2.5H4.2c-.7 0-1.2.6-1.1 1.3.7 6.7 6 12 12.7 12.7.7.1 1.3-.4 1.3-1.1V13l-3.4-.7-.8 2a11 11 0 0 1-6.2-6.2l2-.8-.7-3.4c-.1-.8-.7-1.4-1.4-1.4Z" />,
    id: <><rect x="2.5" y="4" width="15" height="12" rx="2" /><circle cx="7" cy="9" r="2" /><path d="M4.8 13c.7-1 1.4-1.5 2.2-1.5S8.5 12 9.2 13M11.5 8h3.5M11.5 11h3.5" /></>,
    pin: <><path d="M10 18s5-4.7 5-10a5 5 0 1 0-10 0c0 5.3 5 10 5 10Z" /><circle cx="10" cy="8" r="1.7" /></>,
    calendar: <><rect x="2.5" y="4.5" width="15" height="13" rx="2" /><path d="M6 2.5v4M14 2.5v4M2.5 8.5h15" /></>,
    arrow: <path d="M4 10h11M11 6l4 4-4 4" />,
  }

  return (
    <svg className="personnel-card__icon" viewBox="0 0 20 20" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return `${parts[0][0]}${parts.length > 1 ? parts.at(-1)[0] : ''}`.toLocaleUpperCase('tr-TR')
}

function formatDate(value) {
  if (!value) return ''
  const [year, month, day] = String(value).slice(0, 10).split('-')
  if (!year || !month || !day) return value
  return `${day}.${month}.${year}`
}

export default function PersonnelCard({ person, selectMode, selected, onActivate }) {
  const accent = `#${classHex(person.dept_color)}`
  const role = person.position || person.role_label || person.role_name || 'Görev bilgisi yok'
  const secondaryRole = person.position && (person.role_label || person.role_name)
  const workLocation = person.primary_work_location_name
  const hireDate = formatDate(person.hire_date)

  return (
    <article
      className={`personnel-card${selected ? ' personnel-card--selected' : ''}${!person.is_active ? ' personnel-card--archived' : ''}`}
      style={{ '--personnel-accent': accent }}
      onClick={onActivate}
      aria-label={`${person.full_name} personel kartı`}
    >
      <div className="personnel-card__accent" aria-hidden="true" />

      <header className="personnel-card__header">
        {selectMode && (
          <input
            className="personnel-card__checkbox"
            type="checkbox"
            checked={selected}
            readOnly
            aria-label={`${person.full_name} seç`}
          />
        )}

        <div className="personnel-card__avatar" aria-hidden="true">
          {getInitials(person.full_name)}
          <span className={`personnel-card__status-dot${person.is_active ? '' : ' personnel-card__status-dot--archived'}`} />
        </div>

        <div className="personnel-card__identity">
          <div className="personnel-card__name-row">
            <h2 className="personnel-card__name" title={person.full_name}>{person.full_name || 'İsimsiz personel'}</h2>
            {!person.is_active && <span className="personnel-card__archive-badge">Arşiv</span>}
          </div>
          <p className="personnel-card__role" title={role}>{role}</p>
          {secondaryRole && <p className="personnel-card__role-detail">{secondaryRole}</p>}
        </div>

        <div className="personnel-card__project"><ProjectBadge project={person} /></div>
      </header>

      <div className="personnel-card__context">
        {person.dept_name && <span className="personnel-card__context-item">{person.dept_name}</span>}
        {workLocation && (
          <span className="personnel-card__context-item personnel-card__context-item--location" title={workLocation}>
            <Icon name="pin" /> {workLocation}
          </span>
        )}
        {!person.dept_name && !workLocation && <span className="personnel-card__context-empty">Birim bilgisi yok</span>}
      </div>

      <footer className="personnel-card__footer">
        <div className="personnel-card__details">
          {person.phone && (
            <a
              className="personnel-card__detail personnel-card__detail--link"
              href={`tel:${person.phone}`}
              onClick={event => event.stopPropagation()}
              onKeyDown={event => event.stopPropagation()}
              title={`${person.phone} numarasını ara`}
            >
              <Icon name="phone" /><span>{person.phone}</span>
            </a>
          )}
          {person.tc_no && (
            <span className="personnel-card__detail" title="T.C. kimlik numarası">
              <Icon name="id" /><span>{person.tc_no}</span>
            </span>
          )}
          {!person.phone && !person.tc_no && hireDate && (
            <span className="personnel-card__detail" title="İşe giriş tarihi">
              <Icon name="calendar" /><span>{hireDate}</span>
            </span>
          )}
          {!person.phone && !person.tc_no && !hireDate && (
            <span className="personnel-card__detail personnel-card__detail--muted">İletişim bilgisi yok</span>
          )}
        </div>

        {!selectMode && (
          <button
            className="personnel-card__open"
            type="button"
            onClick={(event) => { event.stopPropagation(); onActivate() }}
            aria-label={`${person.full_name} profilini aç`}
          >
            <span>Profili aç</span><Icon name="arrow" />
          </button>
        )}
      </footer>
    </article>
  )
}

export { formatDate, getInitials }
