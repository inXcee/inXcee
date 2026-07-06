// Seçili odaya hızlıca N adet "Anonim" placeholder kayıt ekleme modalı.
// Tüm akış durumu (room/count/loading) orkestratörden prop ile gelir.
export default function QuickFillModal({ room, count, setCount, onConfirm, onClose, loading }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div className="panel" style={{ width: '100%', maxWidth: '360px' }}>
        <div style={{ height: '2px', background: 'var(--accent)' }} />
        <div className="panel-header">
          <div>
            <div className="panel-title">HIZLI DOLULUK</div>
            <div className="panel-subtitle">{room.block} BLOK — ODA {room.room_no}</div>
          </div>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
            Mevcut: {room.current_count}/{room.active_beds} kişi
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '8px' }}>
              KAÇ KİŞİ EKLENECEK?
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Array.from({ length: Math.max(0, room.active_beds - room.current_count) }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setCount(n)}
                  style={{
                    width: '44px', height: '44px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--display)', fontSize: '18px', fontWeight: 700,
                    background: count === n ? 'var(--accent)' : 'var(--surface2)',
                    color: count === n ? '#000' : 'var(--text)',
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text4)' }}>
            {count} adet "Anonim" kayıt oluşturulur. Detaylar sonra doldurulabilir.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} className="btn btn-ghost">İptal</button>
            <button onClick={onConfirm} disabled={loading}
              className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
              {loading ? 'Ekleniyor...' : `✓ ${count} Kişi Ekle`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
