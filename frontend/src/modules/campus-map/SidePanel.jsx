// Tek blok seçimi yan paneli: doluluk, 14-gün trend (Sparkline), 6'lı mini-grid,
// vardiya/temizlik/şirket dağılımları, kat-kat oda grid'i ve hızlı navigasyon
// butonları. Navigasyon onNavigate(path) ile orkestratöre delege edilir.
import { blockColor } from '../../shared/blocks.js'
import { MiniStat, btnPrimary, btnSecondary } from './shared.jsx'
import Sparkline from './Sparkline.jsx'

export default function SidePanel({ block, cfg, stats: s, rooms, mode, timeseries, onClose, onNavigate, onQuickFault }) {
  if (!cfg || !s) return null
  const pct = s.occupancy_pct
  const color = pct >= 85 ? '#dc2626' : pct >= 60 ? '#f59e0b' : pct > 0 ? '#16a34a' : '#6b7280'

  return (
    <div style={{
      width: 340, background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 16, position: 'sticky', top: 20,
      maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: 3, color: blockColor(block), lineHeight: 1 }}>
            {block}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginTop: 4 }}>
            TIP {cfg.type} • {cfg.floors} KAT • {cfg.hasPrivateBath ? 'OZEL BANYO' : 'ORTAK BANYO'}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--text3)', padding: '4px 10px', cursor: 'pointer', fontSize: 13,
        }}>✕</button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4,
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
          <span>DOLULUK</span>
          <span style={{ color }}>%{pct}</span>
        </div>
        <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', marginTop: 4, textAlign: 'center' }}>
          {s.occupied} / {s.total_beds} yatak
        </div>
      </div>

      {/* Sparkline — son 14 gun trend */}
      {timeseries?.points?.length >= 2 && (
        <div style={{ marginBottom: 14, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
              SON {timeseries.points.length} GUN TREND
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
              {(() => {
                const pts = timeseries.points
                const last = pts[pts.length - 1].occupancy_pct
                const prev = pts[Math.max(0, pts.length - 8)].occupancy_pct
                const diff = last - prev
                if (diff === 0) return '— sabit'
                return diff > 0 ? `↑ +${diff}%` : `↓ ${diff}%`
              })()}
            </span>
          </div>
          <Sparkline points={timeseries.points} color={color} />
        </div>
      )}

      {/* 6'lı mini grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 14 }}>
        <MiniStat label="ODA" value={s.total_rooms} />
        <MiniStat label="BOS" value={s.empty_rooms} color="var(--accent)" />
        <MiniStat label="DOLU ODA" value={s.full_rooms} color={s.full_rooms > 0 ? '#dc2626' : 'var(--text)'} />
        <MiniStat label="ARIZA" value={s.open_faults} color={s.open_faults > 0 ? '#dc2626' : 'var(--text)'} />
        <MiniStat label="KARANTINA" value={s.quarantine} color={s.quarantine > 0 ? '#dc2626' : 'var(--text3)'} />
        <MiniStat label="BAKIM" value={s.maintenance} color={s.maintenance > 0 ? '#f59e0b' : 'var(--text3)'} />
      </div>

      {/* Vardiya dağılımı */}
      {(s.day_count + s.night_count) > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>
            VARDIYA DAGILIMI
          </div>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${(s.day_count / (s.day_count + s.night_count)) * 100}%`, background: '#f97316' }} />
            <div style={{ width: `${(s.night_count / (s.day_count + s.night_count)) * 100}%`, background: '#8b5cf6' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4,
            fontFamily: 'var(--mono)', fontSize: 9 }}>
            <span style={{ color: '#f97316' }}>☀ GUNDUZ {s.day_count}</span>
            <span style={{ color: '#8b5cf6' }}>☾ GECE {s.night_count}</span>
          </div>
        </div>
      )}

      {/* Temizlik durumu */}
      {s.cleaning_total > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>
            <span>BUGUN TEMIZLIK</span>
            <span>%{s.cleaning_pct}</span>
          </div>
          <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${s.cleaning_pct}%`, height: '100%', background: '#16a34a' }} />
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text2)', marginTop: 3 }}>
            {s.cleaning_done}/{s.cleaning_total} tamamlandı{s.cleaning_skipped > 0 ? ` • ${s.cleaning_skipped} atlandi` : ''}
          </div>
        </div>
      )}

      {/* Top şirketler */}
      {s.top_companies?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginBottom: 4 }}>
            ANA SIRKETLER
          </div>
          {s.top_companies.map(c => (
            <div key={c.company} style={{ display: 'flex', justifyContent: 'space-between',
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', padding: '2px 0' }}>
              <span>{c.company}</span>
              <span style={{ color: 'var(--accent)' }}>{c.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Kat-kat oda grid */}
      {Array.from({ length: cfg.floors }, (_, i) => i + 1).map(floor => {
        const floorRooms = rooms.filter(r => r.floor === floor)
        if (floorRooms.length === 0) return null
        const occ = floorRooms.reduce((a, r) => a + (r.occupied || 0), 0)
        const cap = floorRooms.reduce((a, r) => a + (r.active_beds || 0), 0)
        return (
          <div key={floor} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>
                KAT {floor}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
                {occ}/{cap}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', gap: 3 }}>
              {floorRooms.map(r => {
                const rpct = r.active_beds > 0 ? Math.round(((r.occupied || 0) / r.active_beds) * 100) : 0
                let bg = '#6b7280'
                if (r.status === 'quarantine') bg = '#dc2626'
                else if (r.status === 'maintenance') bg = '#f59e0b'
                else if (r.active_beds > 0) {
                  if (rpct >= 100) bg = '#dc2626'
                  else if (rpct >= 60) bg = '#f59e0b'
                  else if (rpct > 0) bg = '#16a34a'
                }
                return (
                  <div key={r.id}
                    title={`Oda ${r.room_no} • ${r.occupied || 0}/${r.active_beds || 0}${r.status !== 'active' ? ' • ' + r.status : ''}${r.open_fault_count ? ' • ' + r.open_fault_count + ' ariza' : ''}`}
                    onClick={() => onNavigate(`/capacity?block=${block}&room=${r.id}`)}
                    style={{
                      background: bg, color: '#fff', borderRadius: 3,
                      padding: '5px 2px', textAlign: 'center', cursor: 'pointer',
                      fontFamily: 'var(--mono)', fontSize: 9, fontWeight: 600,
                      position: 'relative', transition: 'transform .1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >
                    {r.room_no}
                    {r.open_fault_count > 0 && (
                      <div style={{ position: 'absolute', top: -3, right: -3,
                        width: 10, height: 10, borderRadius: '50%',
                        background: '#dc2626', border: '1.5px solid var(--surface)' }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <button onClick={() => onNavigate(`/capacity?block=${block}`)} style={btnPrimary}>
          KAPASITE SAYFASINDA AC →
        </button>
        <button onClick={onQuickFault} style={{
          background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 12px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10,
          letterSpacing: 1, fontWeight: 700, textAlign: 'left',
        }}>
          ⚠ HIZLI ARIZA BILDIR
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button onClick={() => onNavigate(`/housekeeping?block=${block}`)} style={btnSecondary}>◈ TEMIZLIK</button>
          <button onClick={() => onNavigate(`/maintenance?block=${block}`)} style={btnSecondary}>⚙ ARIZA LISTE</button>
          <button onClick={() => onNavigate(`/room-history?block=${block}`)} style={btnSecondary}>⊙ GECMIS</button>
          <button onClick={() => onNavigate(`/checkin?block=${block}`)} style={btnSecondary}>↗ CHECK-IN</button>
        </div>
      </div>
    </div>
  )
}
