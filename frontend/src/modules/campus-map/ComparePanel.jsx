// Çoklu seçim (≥2 blok) yan paneli: toplam özet, blok-bazında tablo ve doluluk
// bar grafiği. Tek bloğa tıklayınca onSelectSingle ile detaya geçer.
import { BLOCK_BY_NAME, blockColor } from '../../shared/blocks.js'
import { MiniStat, thStyle, tdStyle } from './shared.jsx'

export default function ComparePanel({ blocks, stats, timeseries = {}, onClose, onSelectSingle }) {
  const items = blocks.map(b => ({ block: b, s: stats[b], cfg: BLOCK_BY_NAME[b] })).filter(x => x.s && x.cfg)
  // Aggregate
  const sum = items.reduce((a, { s }) => ({
    total_beds: a.total_beds + s.total_beds,
    occupied: a.occupied + s.occupied,
    empty_rooms: a.empty_rooms + s.empty_rooms,
    quarantine: a.quarantine + s.quarantine,
    maintenance: a.maintenance + s.maintenance,
    open_faults: a.open_faults + s.open_faults,
    cleaning_done: a.cleaning_done + s.cleaning_done,
    cleaning_total: a.cleaning_total + s.cleaning_total,
    day_count: a.day_count + s.day_count,
    night_count: a.night_count + s.night_count,
  }), { total_beds: 0, occupied: 0, empty_rooms: 0, quarantine: 0, maintenance: 0,
        open_faults: 0, cleaning_done: 0, cleaning_total: 0, day_count: 0, night_count: 0 })

  const avgOcc = sum.total_beds > 0 ? Math.round((sum.occupied / sum.total_beds) * 100) : 0

  return (
    <div style={{
      width: 340, background: 'var(--surface)', border: '1px solid var(--accent)',
      borderRadius: 8, padding: 16, position: 'sticky', top: 20,
      maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--accent)', letterSpacing: 2 }}>
            KARSILASTIRMA
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, marginTop: 2 }}>
            {items.length} BLOK • TOPLAM
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--text3)', padding: '4px 10px', cursor: 'pointer', fontSize: 13,
        }}>✕</button>
      </div>

      {/* Toplam ozet */}
      <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>
            ORT. DOLULUK
          </span>
          <span style={{ fontFamily: 'var(--display)', fontSize: 18, color: 'var(--accent)' }}>
            %{avgOcc}
          </span>
        </div>
        <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${avgOcc}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 10 }}>
          <MiniStat label="YATAK" value={sum.total_beds} />
          <MiniStat label="DOLU" value={sum.occupied} color="#16a34a" />
          <MiniStat label="BOS ODA" value={sum.empty_rooms} color="var(--accent)" />
          <MiniStat label="ARIZA" value={sum.open_faults} color={sum.open_faults > 0 ? '#dc2626' : 'var(--text)'} />
          <MiniStat label="KARANTINA" value={sum.quarantine} color={sum.quarantine > 0 ? '#dc2626' : 'var(--text3)'} />
          <MiniStat label="PERSONEL" value={sum.day_count + sum.night_count} />
        </div>
      </div>

      {/* Tablo */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 6 }}>
        BLOK BAZINDA
      </div>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 10 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={thStyle}>BLOK</th>
              <th style={thStyle}>DOLU/TOP</th>
              <th style={thStyle}>%</th>
              <th style={thStyle}>⚠</th>
              <th style={thStyle}>⊘</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ block, s }) => {
              const pct = s.occupancy_pct
              const color = pct >= 85 ? '#dc2626' : pct >= 60 ? '#f59e0b' : pct > 0 ? '#16a34a' : '#6b7280'
              return (
                <tr key={block} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle}>
                    <button onClick={() => onSelectSingle(block)}
                      style={{ background: 'transparent', border: 'none', color: blockColor(block),
                        fontFamily: 'var(--display)', fontSize: 12, fontWeight: 700, letterSpacing: 1.5,
                        cursor: 'pointer', padding: 0 }}>
                      {block}
                    </button>
                  </td>
                  <td style={tdStyle}>{s.occupied}/{s.total_beds}</td>
                  <td style={{ ...tdStyle, color, fontWeight: 700 }}>{pct}</td>
                  <td style={{ ...tdStyle, color: s.open_faults > 0 ? '#dc2626' : 'var(--text3)' }}>
                    {s.open_faults}
                  </td>
                  <td style={{ ...tdStyle, color: s.quarantine > 0 ? '#dc2626' : 'var(--text3)' }}>
                    {s.quarantine}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mini bar chart — doluluk karsilastirmasi */}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1.5, marginBottom: 8 }}>
        DOLULUK GORSEL
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        {items.map(({ block, s }) => {
          const pct = s.occupancy_pct
          const color = pct >= 85 ? '#dc2626' : pct >= 60 ? '#f59e0b' : pct > 0 ? '#16a34a' : '#6b7280'
          return (
            <div key={block} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 11, color: blockColor(block), minWidth: 28, letterSpacing: 1 }}>
                {block}
              </span>
              <div style={{ flex: 1, height: 14, background: 'var(--surface2)', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
                <span style={{
                  position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                  fontFamily: 'var(--mono)', fontSize: 9, color: '#fff', fontWeight: 700,
                  textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                }}>%{pct}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1,
        padding: 8, background: 'var(--surface2)', borderRadius: 4, textAlign: 'center' }}>
        Tek bloga tikla detayli ac • Ctrl+tikla secime ekle/cikar
      </div>
    </div>
  )
}
