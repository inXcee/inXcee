import { useMemo, useState } from 'react'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { ModalOverlay } from '../shared.jsx'
import {
  DEFAULT_SCHEDULE_SHARE_OPTIONS,
  buildScheduleShareHtml,
  downloadScheduleShareImage,
  openSchedulePrintWindow,
} from '../logic/scheduleShareExport.js'

export default function ScheduleShareModal({
  onClose,
  weekStart,
  weekEnd,
  weekDays,
  staffGrid,
  visibleGrid,
  gridSearch,
  statusFilter,
  deptFilter,
  shiftDefs,
}) {
  const [options, setOptions] = useState({
    ...DEFAULT_SCHEDULE_SHARE_OPTIONS,
    title: 'Haftalık Vardiya Çizelgesi',
  })
  const [busy, setBusy] = useState('')
  const toast = useToastStore(s => s.addToast)

  const payload = useMemo(() => ({
    weekStart,
    weekEnd,
    weekDays,
    staffGrid,
    visibleGrid,
    gridSearch,
    statusFilter,
    deptFilter,
    shiftDefs,
    options,
  }), [weekStart, weekEnd, weekDays, staffGrid, visibleGrid, gridSearch, statusFilter, deptFilter, shiftDefs, options])

  const previewHtml = useMemo(() => buildScheduleShareHtml(payload), [payload])

  const patch = (key, value) => setOptions(prev => ({ ...prev, [key]: value }))
  const toggle = key => patch(key, !options[key])

  const runPrint = () => {
    try {
      openSchedulePrintWindow(payload)
      toast('PDF / yazdırma görünümü açıldı', 'success')
    } catch (err) {
      toast(err?.message || 'PDF görünümü açılamadı', 'error')
    }
  }

  const runImage = async () => {
    try {
      setBusy('png')
      await downloadScheduleShareImage(payload)
      toast('PNG vardiya görseli indirildi', 'success')
    } catch (err) {
      toast(err?.message || 'PNG görsel indirilemedi', 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <ModalOverlay onClose={onClose} wide>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, margin: 0 }}>PDF / GÖRSEL ÇIKTI</h3>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
            {visibleGrid.length}/{staffGrid.length} personel · renkli paylaşım şablonu
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-sm" onClick={runPrint}>PDF / Yazdır</button>
          <button className="btn btn-ghost btn-sm" onClick={runImage} disabled={busy === 'png'}>{busy === 'png' ? 'Hazırlanıyor...' : 'PNG Görsel İndir'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '310px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)', padding: 12 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <label className="form-label">
              Başlık
              <input className="form-input" value={options.title} onChange={e => patch('title', e.target.value)} />
            </label>

            <label className="form-label">
              Renk modu
              <select className="form-select" value={options.colorMode} onChange={e => patch('colorMode', e.target.value)}>
                <option value="shift">Vardiya renkleri</option>
                <option value="department">Departman renkleri</option>
                <option value="status">Durum renkleri</option>
                <option value="mono">Sade açık</option>
              </select>
            </label>

            <label className="form-label">
              Yoğunluk
              <select className="form-select" value={options.density} onChange={e => patch('density', e.target.value)}>
                <option value="compact">Kompakt</option>
                <option value="normal">Normal</option>
                <option value="wide">Geniş</option>
              </select>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label className="form-label">
                Başlık rengi
                <input type="color" className="form-input" value={options.accentColor} onChange={e => patch('accentColor', e.target.value)} style={{ padding: 3, height: 36 }} />
              </label>
              <label className="form-label">
                Hafta sonu
                <input type="color" className="form-input" value={options.weekendColor} onChange={e => patch('weekendColor', e.target.value)} style={{ padding: 3, height: 36 }} />
              </label>
            </div>

            {[
              ['onlyVisible', 'Sadece görünen filtreli liste'],
              ['includeSummary', 'Üst özet kartları'],
              ['includeRole', 'Personel rolü'],
              ['includeLocation', 'Çalışma noktası'],
              ['includeLegend', 'Renk açıklaması'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: 12 }}>
                <input type="checkbox" checked={!!options[key]} onChange={() => toggle(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fff', minHeight: 520 }}>
          <iframe
            title="Vardiya çıktı önizleme"
            srcDoc={previewHtml}
            style={{ width: '100%', height: 520, border: 0, background: '#fff' }}
          />
        </div>
      </div>
    </ModalOverlay>
  )
}
