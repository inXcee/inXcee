import { useMemo, useState } from 'react'
import { buildOverviewRows, sortOverviewRows } from './logic/campusOverview.js'
import CampusReportDialog from './CampusReportDialog.jsx'

const COLUMNS = [
  { key: 'block', label: 'BLOK', align: 'left' },
  { key: 'occupancy_pct', label: 'DOLULUK', suffix: '%' },
  { key: 'occupied', label: 'DOLU YATAK' },
  { key: 'empty_rooms', label: 'BOŞ ODA', accent: 'var(--accent)' },
  { key: 'full_rooms', label: 'DOLU ODA' },
  { key: 'open_faults', label: 'ARIZA', danger: true },
  { key: 'cleaning_pct', label: 'TEMİZLİK', suffix: '%' },
  { key: 'quarantine', label: 'KARANTİNA', danger: true },
  { key: 'maintenance', label: 'BAKIM', warn: true },
]

const cellColor = (column, value) => {
  if (value == null || value === 0) return 'var(--text3)'
  if (column.danger) return '#dc2626'
  if (column.warn) return '#f59e0b'
  if (column.accent) return column.accent
  return 'var(--text)'
}

export default function CampusOverviewTable({
  stats,
  selectedBlock,
  onSelect,
  role,
  reportOpen = false,
  onReportOpen,
  onReportClose,
}) {
  const [open, setOpen] = useState(true)
  const [sort, setSort] = useState({ key: 'occupancy_pct', dir: 'desc' })
  const [localReportOpen, setLocalReportOpen] = useState(false)
  const canReport = role === 'campus_manager' || role === 'shift_supervisor'
  const showReport = reportOpen || localReportOpen
  const openReport = () => (onReportOpen ? onReportOpen() : setLocalReportOpen(true))
  const closeReport = () => (onReportClose ? onReportClose() : setLocalReportOpen(false))

  const { rows, totals } = useMemo(() => buildOverviewRows(stats), [stats])
  const sorted = useMemo(() => sortOverviewRows(rows, sort.key, sort.dir), [rows, sort])

  const toggleSort = key => setSort(current => (
    current.key === key
      ? { key, dir: current.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: key === 'block' ? 'asc' : 'desc' }
  ))

  const th = {
    padding: '5px 7px',
    fontSize: 9,
    fontFamily: 'var(--mono)',
    letterSpacing: 0.5,
    color: 'var(--text3)',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
  }
  const td = {
    padding: '4px 7px',
    fontSize: 11,
    fontFamily: 'var(--mono)',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ marginTop: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, fontWeight: 700, color: 'var(--text2)' }}>
          ▦ KAMPÜS DURUM TABLOSU
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
          {rows.length} blok · doluluk %{totals.occupancy_pct} · {totals.open_faults} arıza
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {rows.length > 0 && canReport && (
            <button
              type="button"
              onClick={openReport}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text2)', cursor: 'pointer', fontSize: 10, padding: '3px 9px' }}
            >
              ↧ Rapor oluştur
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(value => !value)}
            aria-expanded={open}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text2)', cursor: 'pointer', fontSize: 10, padding: '3px 9px' }}
          >
            {open ? '▲ Gizle' : '▼ Aç'}
          </button>
        </div>
      </div>

      {open && (
        rows.length === 0 ? (
          <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text3)' }}>Blok verisi yok.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                  {COLUMNS.map(column => (
                    <th
                      key={column.key}
                      onClick={() => toggleSort(column.key)}
                      title={`${column.label} sütununa göre sırala`}
                      style={{ ...th, textAlign: column.align || 'center' }}
                    >
                      {column.label}
                      {sort.key === column.key && <span style={{ color: 'var(--accent)' }}>{sort.dir === 'desc' ? ' ▼' : ' ▲'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(row => (
                  <tr
                    key={row.block}
                    onClick={() => onSelect?.(row.block)}
                    title={`${row.block} — haritada göster`}
                    style={{
                      cursor: 'pointer',
                      background: row.block === selectedBlock ? 'rgba(245,158,11,.12)' : undefined,
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {COLUMNS.map(column => {
                      const value = row[column.key]
                      if (column.key === 'block') {
                        return <td key={column.key} style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{value}</td>
                      }
                      return (
                        <td key={column.key} style={{ ...td, textAlign: 'center', color: cellColor(column, value) }}>
                          {value == null ? '—' : `${value}${column.suffix || ''}`}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr style={{ background: 'rgba(245,158,11,.10)', fontWeight: 700 }}>
                  <td style={{ ...td, textAlign: 'left' }}>TOPLAM</td>
                  <td style={{ ...td, textAlign: 'center' }}>{totals.occupancy_pct}%</td>
                  <td style={{ ...td, textAlign: 'center' }}>{totals.occupied}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{totals.empty_rooms}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{totals.full_rooms}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{totals.open_faults}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{totals.cleaning_pct}%</td>
                  <td style={{ ...td, textAlign: 'center' }}>{totals.quarantine}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{totals.maintenance}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      )}

      {showReport && (
        <CampusReportDialog
          stats={stats}
          selectedBlock={selectedBlock}
          role={role}
          onClose={closeReport}
        />
      )}
    </div>
  )
}
