import { useState } from 'react'
import { laundryApi } from '../api.js'

const STAGE_LABELS = {
  washing_to_ready: 'Yıkama → Raf',
  ironing_to_ready: 'Ütü → Raf',
  delivery: 'Teslim',
}

export default function ItemVerificationModal({ item, stage, onClose, onSuccess }) {
  const clothing = (() => {
    try { return JSON.parse(item.clothing_items || '[]') } catch { return [] }
  })()

  const [checkedMap, setCheckedMap] = useState(() =>
    Object.fromEntries(clothing.map((_, i) => [i, true]))
  )
  const [missingNotes, setMissingNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const allChecked = clothing.length === 0 || Object.values(checkedMap).every(Boolean)
  const anyUnchecked = Object.values(checkedMap).some(v => !v)

  function toggle(idx) {
    setCheckedMap(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  async function handleSubmit() {
    if (anyUnchecked && !missingNotes.trim()) {
      setError('Eksik parça varsa not girilmeli')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const items = clothing.map((c, i) => ({
        name: `${c.type}${c.color ? ' (' + c.color + ')' : ''}`,
        count: c.qty || c.count || 1,
        checked: checkedMap[i] !== false,
      }))
      await laundryApi.createVerification(item.id, {
        stage,
        items,
        all_present: allChecked,
        missing_notes: missingNotes.trim() || null,
      })
      onSuccess()
    } catch (err) {
      setError(err?.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 1200,
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  }
  const box = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 14, width: '100%', maxWidth: 440,
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
    maxHeight: '85vh', display: 'flex', flexDirection: 'column',
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 3, color: 'var(--text)' }}>
              PARÇA KONTROL
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
              {item.block} · {item.room_no} — {STAGE_LABELS[stage]}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 18 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {clothing.length === 0 ? (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', padding: '12px 0' }}>
              Kıyafet listesi girilmemiş — doğrulama atlanabilir.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {clothing.map((c, i) => {
                const checked = checkedMap[i] !== false
                return (
                  <label key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                    background: checked ? 'rgba(39,201,106,0.07)' : 'rgba(231,76,60,0.07)',
                    border: `1px solid ${checked ? 'rgba(39,201,106,0.25)' : 'rgba(231,76,60,0.25)'}`,
                    transition: 'all 0.15s',
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(i)}
                      style={{ accentColor: 'var(--green)', width: 15, height: 15, flexShrink: 0 }}
                    />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', flex: 1 }}>
                      {c.type}
                      {c.color && <span style={{ color: 'var(--text3)' }}> · {c.color}</span>}
                    </span>
                    <span style={{
                      fontFamily: 'var(--display)', fontSize: 14, letterSpacing: 1,
                      color: checked ? 'var(--green)' : 'var(--red)',
                    }}>
                      ×{c.qty || c.count || 1}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {anyUnchecked && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
                EKSİK PARÇA NOTU *
              </label>
              <textarea
                className="form-input"
                rows={2}
                style={{ width: '100%', resize: 'vertical', fontSize: 11 }}
                value={missingNotes}
                onChange={e => setMissingNotes(e.target.value)}
                placeholder="Hangi parça eksik, nerede olabilir..."
              />
            </div>
          )}

          {error && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)', marginBottom: 8 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)',
            fontFamily: 'var(--mono)', fontSize: 11,
          }}>
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || (anyUnchecked && !missingNotes.trim())}
            style={{
              padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
              background: allChecked ? 'var(--green)' : 'var(--accent)',
              color: '#000', border: 'none',
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Kaydediliyor...' : allChecked ? '✓ Tüm Parçalar Tamam' : 'Eksikle Devam Et'}
          </button>
        </div>
      </div>
    </div>
  )
}
