import { useTranslation } from '../../../../shared/i18n/index.js'

// Footer — yasal/destek modallarını tetikler (onModal prop).
export function LandingFooter({ onModal }) {
  const { t } = useTranslation()
  return (
    <footer className="footer">
      <div className="lp-wrap">
        <div className="fgrid">
          <div className="fcol">
            <div className="brand-name">Kampüs <span>YYS</span></div>
            <p className="f-about">{t('login.footer.about', 'Şantiye yatakhane yönetim sistemi. 8 modül, 19 blok, 814 yatak — tek panelden 7/24.')}</p>
          </div>
          <div className="fcol"><h5>{t('login.footer.legal', 'Yasal')}</h5>
            <button type="button" className="f-link" onClick={() => onModal('kvkk')}>{t('login.footer.kvkk', 'KVKK & Gizlilik')}</button>
            <button type="button" className="f-link" onClick={() => onModal('terms')}>{t('login.footer.terms', 'Kullanım Koşulları')}</button>
          </div>
          <div className="fcol"><h5>{t('login.footer.support', 'Destek')}</h5>
            <button type="button" className="f-link" onClick={() => onModal('support')}>{t('login.footer.help', 'Yardım & İletişim')}</button>
          </div>
        </div>
        <div className="fbottom">
          <span>{t('login.footer.copyright', '© 2026 AVS Kamp Alanı · Filyos · Zonguldak')}</span>
          <span className="ftag">{t('login.footer.powered', 'Powered by KampüsERP v5.0')}</span>
        </div>
      </div>
    </footer>
  )
}
