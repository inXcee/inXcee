import { useTranslation } from '../../../../shared/i18n/index.js'

// Misyon bandı — hero ile landing arasında köprü. Statik, sadeliği için reveal'sız.
export function MissionBand() {
  const { t } = useTranslation()
  return (
    <div className="mission">
      <div className="fire">{t('login.mission.tag', '🔥 Misyon')}</div>
      <h2>
        {t('login.mission.title1', 'Kampüsün')} <span>{t('login.mission.title2', 'kesintisiz nefesi')}</span> {t('login.mission.title3', 'biziz.')}
      </h2>
    </div>
  )
}
