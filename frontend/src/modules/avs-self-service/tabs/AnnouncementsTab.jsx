import { useTranslation } from '../../../shared/i18n/index.js'
import TabState from '../components/TabState.jsx'

export default function AnnouncementsTab({ query, announcements }) {
  const { t } = useTranslation()
  return (
    <TabState query={query}
      isEmpty={announcements.length === 0} emptyText={t('avs_kiosk.announcements.none')}>
      <div className="space-y-3">
      {announcements.map(a => (
        <div key={a.id} className="bg-slate-900 rounded-2xl p-5">
          <div className="font-medium text-slate-200 mb-2">{a.title}</div>
          <div className="text-sm text-slate-400 whitespace-pre-line">{a.body}</div>
          <div className="text-xs text-slate-600 mt-3">{new Date(a.created_at).toLocaleDateString('tr-TR')}</div>
        </div>
      ))}
      </div>
    </TabState>
  )
}
