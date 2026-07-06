import { useState } from 'react'
import { laundryApi } from '../api.js'
import { Stat, Sparkline } from './roomsAnalytics.jsx'
import { STATUS_LABEL, STATUS_COLOR, formatRelative } from './roomsShared.js'

export function RoomCard({ room, onClick, pinned, onPin }) {
  const active = (room.active_count || 0) > 0
  const urgent = (room.urgent_active || 0) > 0
  const never = (room.total_count || 0) === 0

  let borderColor = 'var(--border)'
  if (urgent) borderColor = 'var(--red)'
  else if (active) borderColor = 'var(--accent)'
  else if (never) borderColor = 'transparent'

  return (
    <div className="panel" style={{
      padding: '12px 12px 10px', textAlign: 'left', cursor: 'pointer',
      borderLeft: `3px solid ${borderColor}`, position: 'relative',
      transition: 'all 0.15s', background: never ? 'transparent' : 'var(--surface)',
      opacity: never ? 0.55 : 1,
    }}
    onClick={onClick}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
    onMouseLeave={e => { e.currentTarget.style.transform = '' }}>
      <button type="button"
        onClick={e => { e.stopPropagation(); onPin?.() }}
        title={pinned ? 'Favoriden çıkar' : 'Favorilere ekle'}
        style={{
          position: 'absolute', top: 6, right: 6,
          width: 22, height: 22, borderRadius: 4, border: 'none', cursor: 'pointer',
          background: pinned ? 'rgba(240,165,0,0.18)' : 'transparent',
          color: pinned ? 'var(--accent)' : 'var(--text3)',
          fontSize: 12, padding: 0, zIndex: 2,
        }}>
        {pinned ? '★' : '☆'}
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, paddingRight: 24 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22, color: 'var(--text)', lineHeight: 1 }}>
            {room.block}<span style={{ color: 'var(--text3)', fontSize: 14, margin: '0 4px' }}>·</span>{room.room_no}
          </div>
        </div>
        {active && (
          <span style={{
            background: urgent ? 'var(--red)' : 'var(--accent)', color: '#000',
            fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 10,
            padding: '2px 6px', borderRadius: 4, marginRight: 28,
          }}>
            {urgent && '⚡ '}{room.active_count}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Sparkline points={[
          room.today_count || 0,
          Math.max(0, (room.last_7d_count || 0) - (room.today_count || 0)),
          Math.max(0, (room.last_30d_count || 0) - (room.last_7d_count || 0)),
          Math.max(0, (room.total_count || 0) - (room.last_30d_count || 0)),
        ].reverse()} />
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
          {room.total_count || 0} toplam
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
        <Stat label="7G" value={room.last_7d_count || 0} color="var(--blue)" />
        <Stat label="TES" value={room.delivered_count || 0} color="var(--green)" />
        <Stat label="KYP" value={room.lost_count || 0} color={(room.lost_count || 0) > 0 ? 'var(--red)' : 'var(--text3)'} />
      </div>

      <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 0.5 }}>
        {room.last_intake_at ? `son: ${formatRelative(room.last_intake_at)}` : 'henüz giriş yok'}
        {room.avg_hours != null && ` · ort ${room.avg_hours}s`}
      </div>
    </div>
  )
}

// Faz 4 — Oda sakini satırı: geçmiş + WhatsApp hatırlat + uyarı
export function OccupantRow({ occupant, stats, block, room_no, onOpenHistory }) {
  const [mode, setMode] = useState('idle')         // idle | reminding | warning
  const [warnText, setWarnText] = useState(`Merhaba ${occupant.full_name?.split(' ')[0] || ''}, Oda ${block}-${room_no} için kayıp bildirilen çamaşırınız hakkında bilgi vermenizi rica ederiz.`)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)   // { ok, msg }

  const remind = async () => {
    if (busy) return
    setBusy(true); setFeedback(null)
    try {
      const res = await laundryApi.remindRoomReady(block, room_no, occupant.full_name)
      if (res.sent > 0) setFeedback({ ok: true, msg: `✓ ${res.sent} torba bildirildi` })
      else if (res.reason === 'no_ready_items') setFeedback({ ok: false, msg: 'Hazır torba yok' })
      else if (res.reason === 'phone_missing') setFeedback({ ok: false, msg: 'Telefon yok' })
      else setFeedback({ ok: false, msg: 'Gönderilemedi' })
    } catch (e) {
      const m = e?.response?.data?.error
      if (e?.response?.status === 503) setFeedback({ ok: false, msg: 'WhatsApp yapılandırılmamış' })
      else setFeedback({ ok: false, msg: m || 'Hata' })
    } finally {
      setBusy(false)
      setTimeout(() => setFeedback(null), 4000)
    }
  }

  const sendWarning = async () => {
    if (busy || !warnText.trim()) return
    setBusy(true); setFeedback(null)
    try {
      await laundryApi.notifyRoomPerson(block, room_no, occupant.full_name, warnText.trim())
      setFeedback({ ok: true, msg: '✓ Uyarı gönderildi' })
      setMode('idle')
    } catch (e) {
      if (e?.response?.status === 503) setFeedback({ ok: false, msg: 'WhatsApp yapılandırılmamış' })
      else if (e?.response?.status === 404) setFeedback({ ok: false, msg: 'Telefon yok' })
      else setFeedback({ ok: false, msg: e?.response?.data?.error || 'Hata' })
    } finally {
      setBusy(false)
      setTimeout(() => setFeedback(null), 4000)
    }
  }

  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '8px 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button onClick={onOpenHistory} className="rooms-detail-no-print"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 0, textAlign: 'left', flex: 1, minWidth: 0,
          }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>
            🛏 {occupant.bed_no} · {occupant.full_name}
          </div>
          {occupant.company && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)' }}>{occupant.company}</div>
          )}
        </button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }} className="rooms-detail-no-print">
          {stats && (
            <>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--blue)' }}>{stats.total} torba</span>
              {stats.lost > 0 && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>· {stats.lost} kayıp</span>}
            </>
          )}
          <button onClick={remind} disabled={busy}
            title="Hazır çamaşır hatırlatıcısı gönder"
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--green)', cursor: busy ? 'wait' : 'pointer',
              width: 26, height: 24, borderRadius: 4, fontSize: 11, padding: 0,
            }}>🔔</button>
          <button onClick={() => setMode(mode === 'warning' ? 'idle' : 'warning')}
            title="Kayıp uyarısı / özel mesaj"
            disabled={busy}
            style={{
              background: mode === 'warning' ? 'rgba(220,38,38,0.15)' : 'var(--surface)',
              border: `1px solid ${mode === 'warning' ? 'var(--red)' : 'var(--border)'}`,
              color: 'var(--red)', cursor: busy ? 'wait' : 'pointer',
              width: 26, height: 24, borderRadius: 4, fontSize: 11, padding: 0,
            }}>⚠</button>
        </div>
      </div>
      {feedback && (
        <div style={{
          marginTop: 6, fontFamily: 'var(--mono)', fontSize: 9,
          color: feedback.ok ? 'var(--green)' : 'var(--red)',
        }}>{feedback.msg}</div>
      )}
      {mode === 'warning' && (
        <div className="rooms-detail-no-print" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <textarea value={warnText} onChange={e => setWarnText(e.target.value)}
            placeholder="Mesaj…" rows={3}
            className="form-input"
            style={{ fontSize: 11, padding: 6, fontFamily: 'var(--mono)' }} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => setMode('idle')} className="btn btn-ghost btn-xs">İptal</button>
            <button onClick={sendWarning} disabled={busy || !warnText.trim()}
              className="btn btn-primary btn-xs"
              style={{ background: 'var(--red)', borderColor: 'var(--red)' }}>
              ⚠ Gönder
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Faz 3 — Y blok premium parça kartı
const GARMENT_STATUS_LABEL = {
  received: 'Alındı', washing: 'Yıkanıyor', ironing: 'Ütüde',
  ready: 'Hazır', delivered: 'Teslim', lost: 'Kayıp',
}
const GARMENT_STATUS_COLOR = {
  received: 'var(--accent3)', washing: 'var(--blue)', ironing: '#a78bfa',
  ready: 'var(--green)', delivered: 'var(--teal)', lost: 'var(--red)',
}

export function PremiumGarmentsCard({ items }) {
  const totalGarments = items.reduce((s, b) => s + b.garments.length, 0)
  return (
    <div className="panel" style={{ padding: 12 }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent3)',
        letterSpacing: 1.5, marginBottom: 8,
      }}>
        🟣 PREMIUM PARÇALAR · {items.length} torba · {totalGarments} parça
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(bag => (
          <div key={bag.item_id} style={{
            background: 'var(--surface2)', borderRadius: 6,
            border: '1px solid var(--border)', padding: '8px 10px',
            borderLeft: `3px solid ${STATUS_COLOR[bag.status] || 'var(--accent3)'}`,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 6,
            }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--blue)', fontWeight: 700 }}>
                {bag.bag_no || `#${bag.item_id}`}
              </span>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 8, padding: '1px 6px', borderRadius: 3,
                background: 'var(--surface)', color: STATUS_COLOR[bag.status] || 'var(--text3)',
                fontWeight: 700, letterSpacing: 1,
              }}>
                {STATUS_LABEL[bag.status] || bag.status} · {bag.garments.length} parça
              </span>
            </div>
            {bag.intake_name && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginBottom: 6 }}>
                👤 {bag.intake_name}
              </div>
            )}
            {bag.garments.length === 0 && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', fontStyle: 'italic' }}>
                Henüz parça eklenmedi
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {bag.garments.map(g => (
                <div key={g.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 8px', background: 'var(--surface)', borderRadius: 4,
                  fontFamily: 'var(--mono)', fontSize: 10,
                }}>
                  <span style={{ color: 'var(--accent3)', fontWeight: 700, minWidth: 80 }}>
                    {g.garment_code}
                  </span>
                  <span style={{ color: 'var(--text)' }}>{g.garment_type}</span>
                  {g.brand && <span style={{ color: 'var(--text3)' }}>· {g.brand}{g.model ? ` ${g.model}` : ''}</span>}
                  {g.size && <span style={{ color: 'var(--text3)' }}>· {g.size}</span>}
                  {g.color && <span style={{ color: 'var(--text3)' }}>· {g.color}</span>}
                  {g.pattern && <span style={{ color: 'var(--text3)' }}>· {g.pattern}</span>}
                  <span style={{
                    marginLeft: 'auto', fontSize: 8, padding: '1px 5px', borderRadius: 3,
                    background: 'var(--surface2)',
                    color: GARMENT_STATUS_COLOR[g.status] || 'var(--text3)',
                    fontWeight: 700, letterSpacing: 0.5,
                  }}>
                    {GARMENT_STATUS_LABEL[g.status] || g.status}
                  </span>
                  {g.condition_notes && (
                    <span title={g.condition_notes} style={{
                      fontSize: 10, color: 'var(--red)', cursor: 'help',
                    }}>⚠</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
