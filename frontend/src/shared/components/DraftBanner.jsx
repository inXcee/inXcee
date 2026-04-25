export default function DraftBanner({ hasDraft, onRestore, onDiscard }) {
  if (!hasDraft) return null
  return (
    <div style={{
      background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px',
      padding: '10px 14px', marginBottom: '16px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: '13px',
    }}>
      <span style={{ color: '#92400e' }}>📋 Kaydedilmemiş taslak var</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={onDiscard}
          style={{ background: 'none', border: '1px solid #d97706', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', color: '#92400e', fontSize: '12px' }}>
          Temizle
        </button>
        <button
          onClick={onRestore}
          style={{ background: '#f59e0b', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', color: '#fff', fontSize: '12px', fontWeight: 600 }}>
          Devam Et
        </button>
      </div>
    </div>
  )
}
