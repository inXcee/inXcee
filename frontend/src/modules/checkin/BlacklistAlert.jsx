export default function BlacklistAlert({ person, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '2px solid rgba(231,76,60,0.6)',
        borderRadius: '12px',
        padding: '36px',
        maxWidth: '460px', width: '90%',
        boxShadow: '0 0 60px rgba(231,76,60,0.2)',
        textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Top accent */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg,var(--red),var(--red2))' }} />

        <div style={{ fontSize: '48px', marginBottom: '12px' }}>⛔</div>

        <div style={{ fontFamily: 'var(--display)', fontSize: '22px', letterSpacing: '4px', color: 'var(--red)', marginBottom: '8px' }}>
          KARA LİSTE UYARISI
        </div>

        <div style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', color: 'var(--text)', marginBottom: '16px' }}>
          {person.full_name}
        </div>

        <div style={{
          background: 'rgba(231,76,60,.08)', border: '1px solid rgba(231,76,60,.2)',
          borderRadius: '8px', padding: '14px', marginBottom: '16px', textAlign: 'left',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '2px', marginBottom: '6px' }}>SEBEP</div>
          <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: '6px' }}>
            {person.blacklist_reason || 'Belirtilmemiş'}
          </div>
          {person.blacklisted_at && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
              {new Date(person.blacklisted_at).toLocaleDateString('tr-TR')}
            </div>
          )}
        </div>

        <p style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '20px', letterSpacing: '0.5px' }}>
          Bu kişiye check-in yapılamaz. Güvenlik birimini bilgilendirin.
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={() => window.print()} className="btn btn-ghost btn-sm">
            ⎙ TUTANAK YAZDIR
          </button>
          <button onClick={onClose} className="btn btn-danger btn-sm">
            KAPAT
          </button>
        </div>
      </div>
    </div>
  )
}
