import { useEffect, useRef } from 'react'

// Login ekranı modal'ları: KVKK, Kullanım Koşulları, Destek, Şifremi Unuttum.
// Focus trap + ESC + backdrop click + aria-modal. Sayfadan çıkmadan açılır.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function ModalShell({ title, onClose, children }) {
  const ref = useRef(null)
  const lastFocus = useRef(null)
  const titleId = `lp-modal-title-${title.replace(/\s+/g, '-').toLowerCase()}`

  useEffect(() => {
    lastFocus.current = document.activeElement
    const node = ref.current
    const focusables = node?.querySelectorAll(FOCUSABLE) || []
    ;(focusables[0] || node)?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'Tab') {
        const list = Array.from(node.querySelectorAll(FOCUSABLE))
        if (!list.length) { e.preventDefault(); return }
        const first = list[0], last = list[list.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      lastFocus.current?.focus?.()
    }
  }, [onClose])

  return (
    <div className="lp-modal-back" onClick={onClose}>
      <div
        ref={ref}
        className="lp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lp-modal-head">
          <h2 id={titleId} className="lp-modal-title">{title}</h2>
          <button type="button" className="lp-modal-close" onClick={onClose} aria-label="Kapat">✕</button>
        </div>
        <div className="lp-modal-body">{children}</div>
      </div>
    </div>
  )
}

function KvkkContent() {
  return (
    <>
      <p className="lp-m-lead">
        6698 sayılı <strong>Kişisel Verilerin Korunması Kanunu</strong> (KVKK) madde 10 kapsamında aydınlatma yükümlülüğümüz çerçevesinde aşağıdaki bilgiler size sunulmaktadır.
      </p>

      <h3>Veri Sorumlusu</h3>
      <p>AVS Kamp Alanı İşletmesi · Filyos / Zonguldak</p>

      <h3>İşlenen Kişisel Veri Kategorileri</h3>
      <ul>
        <li><strong>Kimlik:</strong> ad-soyad, T.C. kimlik no, doğum tarihi</li>
        <li><strong>İletişim:</strong> telefon, e-posta, acil durum kişisi</li>
        <li><strong>Konaklama:</strong> oda/yatak tahsisi, giriş-çıkış tarihleri</li>
        <li><strong>Görsel kayıt:</strong> kampüs içi güvenlik kameraları</li>
        <li><strong>İşlem logları:</strong> sistem girişleri, talepler, zimmet</li>
      </ul>

      <h3>İşleme Amaçları</h3>
      <ul>
        <li>Kamp konaklama ve operasyon yönetimi</li>
        <li>İş sağlığı ve güvenliği yükümlülükleri</li>
        <li>Yasal kayıt ve bildirim yükümlülükleri (6331, 4857, 6698 sayılı kanunlar)</li>
        <li>Kampüs güvenliği ve erişim kontrolü</li>
      </ul>

      <h3>Aktarım</h3>
      <p>Kişisel verileriniz <strong>yalnız yasal yükümlülük gereği</strong> ilgili kamu kurumlarına aktarılır. Üçüncü kişi/şirketlere pazarlama amaçlı aktarım yapılmaz.</p>

      <h3>Saklama Süresi</h3>
      <ul>
        <li>Operasyonel veriler: yasal saklama süreleri (genelde 5 yıl)</li>
        <li>Kamera kayıtları: 30 gün</li>
        <li>Erişim logları: 2 yıl</li>
      </ul>

      <h3>Haklarınız (KVKK md. 11)</h3>
      <p>Kişisel verilerinize ilişkin bilgi alma, düzeltme, silme, işlemenin sınırlandırılması ve KVKK Kurulu'na şikâyet hakkınız bulunmaktadır.</p>

      <h3>Başvuru</h3>
      <p>
        Haklarınızı kullanmak için: <a href="mailto:kvkk@avskamp.com">kvkk@avskamp.com</a><br />
        veya yazılı başvuru: AVS Kamp Alanı, Filyos / Zonguldak
      </p>

      <p className="lp-m-foot">
        <a href="/kvkk" target="_blank" rel="noreferrer">Tam metni ayrı sayfada aç →</a>
      </p>
    </>
  )
}

function TermsContent() {
  return (
    <>
      <p className="lp-m-lead">
        Bu sistem (KampüsERP / YYS) AVS Kamp Alanı İşletmesi'nin dahili kullanımına yöneliktir. Sisteme erişiminiz aşağıdaki koşullara tabidir.
      </p>

      <h3>1. Hesap Güvenliği</h3>
      <ul>
        <li>Hesabınız <strong>size özeldir</strong>, başkasıyla paylaşamazsınız.</li>
        <li>Şifrenizi düzenli olarak değiştirin, kolay tahmin edilebilir şifreler kullanmayın.</li>
        <li>Hesabınızla yapılan her işlem <strong>sizin sorumluluğunuzdadır</strong>.</li>
      </ul>

      <h3>2. Yasaklı Kullanım</h3>
      <ul>
        <li>Yetkisiz veri erişimi / dışarı sızdırma yasaktır.</li>
        <li>Sistemi tersine mühendislik / penetrasyon test denemesine sokmak yasaktır.</li>
        <li>Üçüncü kişilere ait kişisel veriyi izinsiz paylaşmak yasaktır.</li>
      </ul>

      <h3>3. Loglama</h3>
      <p>Her giriş, kayıt değişikliği ve veri sorgusu <strong>denetim kayıtlarına</strong> alınır. Bu kayıtlar yasal süre boyunca saklanır.</p>

      <h3>4. Askıya Alma</h3>
      <p>İhlal tespiti durumunda yöneticiniz hesabınızı bildirim olmaksızın askıya alabilir.</p>

      <h3>5. Sürüm</h3>
      <p>Bu koşullar zaman zaman güncellenebilir. Önemli değişikliklerde sistem girişinde bildirim gösterilir.</p>

      <p className="lp-m-foot">Son güncelleme: 2026-05-28 · v5.0</p>
    </>
  )
}

function SupportContent() {
  const subject = encodeURIComponent('[YYS Destek] Hata bildirimi')
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '—'
  const body = encodeURIComponent(`\n\n---\nSayfa: ${typeof window !== 'undefined' ? window.location.href : ''}\nTarayıcı: ${ua}\nZaman: ${new Date().toISOString()}\n`)

  return (
    <>
      <p className="lp-m-lead">Sistem desteği için ulaşabileceğiniz kanallar:</p>

      <div className="lp-sup-grid">
        <div className="lp-sup-card">
          <div className="lp-sup-ico" aria-hidden="true">📞</div>
          <div className="lp-sup-key">Telefon</div>
          <div className="lp-sup-val">0 (000) 000 00 00</div>
          <div className="lp-sup-note">Hafta içi 08:00 – 18:00</div>
        </div>
        <div className="lp-sup-card">
          <div className="lp-sup-ico" aria-hidden="true">🚨</div>
          <div className="lp-sup-key">Acil 7/24</div>
          <div className="lp-sup-val">0 (000) 000 00 00</div>
          <div className="lp-sup-note">Sadece sistem kesintisi durumunda</div>
        </div>
        <div className="lp-sup-card">
          <div className="lp-sup-ico" aria-hidden="true">📟</div>
          <div className="lp-sup-key">Dahili</div>
          <div className="lp-sup-val">0000</div>
          <div className="lp-sup-note">Kampüs içi santral</div>
        </div>
        <div className="lp-sup-card">
          <div className="lp-sup-ico" aria-hidden="true">✉️</div>
          <div className="lp-sup-key">E-posta</div>
          <div className="lp-sup-val"><a href="mailto:destek@avskamp.com">destek@avskamp.com</a></div>
          <div className="lp-sup-note">Genellikle 4 saat içinde yanıtlanır</div>
        </div>
      </div>

      <p className="lp-m-foot">
        <a href={`mailto:destek@avskamp.com?subject=${subject}&body=${body}`}>
          🐞 Hata bildir (sistem bilgisiyle birlikte mail aç) →
        </a>
      </p>
    </>
  )
}

function ForgotContent() {
  return (
    <>
      <p className="lp-m-lead">
        Güvenlik gereği <strong>self-service şifre sıfırlama yoktur</strong>. Şifreniz yöneticiniz tarafından sıfırlanır.
      </p>

      <h3>Nasıl Sıfırlatırım?</h3>
      <ol>
        <li>Yöneticinize ulaşın (telefon / e-posta / yüz yüze).</li>
        <li>Kimlik teyidi yapılır.</li>
        <li>Geçici şifre verilir — ilk girişte değiştirmek zorundasınız.</li>
      </ol>

      <h3>İletişim</h3>
      <ul>
        <li><strong>Dahili:</strong> 0000</li>
        <li><strong>Telefon:</strong> 0 (000) 000 00 00 (hafta içi 08:00 – 18:00)</li>
        <li><strong>E-posta:</strong> <a href="mailto:destek@avskamp.com">destek@avskamp.com</a></li>
      </ul>

      <p className="lp-m-foot">
        Bu kısıtlama sosyal mühendislik saldırılarına karşı koruma sağlamak içindir.
      </p>
    </>
  )
}

const MODALS = {
  kvkk:    { title: 'KVKK Aydınlatma Metni', body: <KvkkContent /> },
  terms:   { title: 'Kullanım Koşulları',    body: <TermsContent /> },
  support: { title: 'Destek',                body: <SupportContent /> },
  forgot:  { title: 'Şifremi Unuttum',       body: <ForgotContent /> },
}

export function LoginModal({ which, onClose }) {
  if (!which || !MODALS[which]) return null
  const m = MODALS[which]
  return <ModalShell title={m.title} onClose={onClose}>{m.body}</ModalShell>
}
