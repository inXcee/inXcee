// Footer — yasal/destek modallarını tetikler (onModal prop).
export function LandingFooter({ onModal }) {
  return (
    <footer className="footer">
      <div className="lp-wrap">
        <div className="fgrid">
          <div className="fcol">
            <div className="brand-name">Kampüs <span>YYS</span></div>
            <p className="f-about">Şantiye yatakhane yönetim sistemi. 8 modül, 19 blok, 814 yatak — tek panelden 7/24.</p>
          </div>
          <div className="fcol"><h5>Yasal</h5>
            <button type="button" className="f-link" onClick={() => onModal('kvkk')}>KVKK &amp; Gizlilik</button>
            <button type="button" className="f-link" onClick={() => onModal('terms')}>Kullanım Koşulları</button>
          </div>
          <div className="fcol"><h5>Destek</h5>
            <button type="button" className="f-link" onClick={() => onModal('support')}>Yardım & İletişim</button>
          </div>
        </div>
        <div className="fbottom">
          <span>© 2026 AVS Kamp Alanı · Filyos · Zonguldak</span>
          <span className="ftag">Powered by KampüsERP v5.0</span>
        </div>
      </div>
    </footer>
  )
}
