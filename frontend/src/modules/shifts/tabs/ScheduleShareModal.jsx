import { useEffect, useMemo, useState } from 'react'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { ModalOverlay } from '../shared.jsx'
import {
  DEFAULT_SCHEDULE_SHARE_OPTIONS,
  buildScheduleShareHtml,
  downloadScheduleShareImage,
  openSchedulePrintWindow,
} from '../logic/scheduleShareExport.js'

const SHARE_OPTIONS_KEY = 'shift_schedule_share_options_v2'
const SHARE_PRESETS = [
  {
    label: 'Personel',
    options: { colorMode: 'shift', density: 'compact', includeSummary: false, includeRole: true, includeLocation: true, includeLegend: true, includeSignatures: false, pageBreakByDept: false },
  },
  {
    label: 'Yönetici',
    options: { colorMode: 'status', density: 'normal', includeSummary: true, includeRole: true, includeLocation: true, includeStaffTotals: true, includeLegend: true, includeSignatures: true, pageBreakByDept: false },
  },
  {
    label: 'Departman',
    options: { colorMode: 'department', density: 'normal', includeSummary: true, includeRole: true, includeLocation: true, includeStaffTotals: true, includeLegend: true, includeSignatures: true, pageBreakByDept: true },
  },
]

function loadSavedOptions() {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(SHARE_OPTIONS_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

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
  const [options, setOptions] = useState(() => ({
    ...DEFAULT_SCHEDULE_SHARE_OPTIONS,
    title: 'Haftalık Vardiya Çizelgesi',
    ...loadSavedOptions(),
  }))
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

  useEffect(() => {
    try {
      window.localStorage.setItem(SHARE_OPTIONS_KEY, JSON.stringify(options))
    } catch {
      // localStorage kapalıysa çıktı yine çalışır; sadece ayarlar hatırlanmaz.
    }
  }, [options])

  const patch = (key, value) => setOptions(prev => ({ ...prev, [key]: value }))
  const applyPreset = preset => setOptions(prev => ({ ...prev, ...preset.options }))
  const resetOptions = () => setOptions({ ...DEFAULT_SCHEDULE_SHARE_OPTIONS, title: 'Haftalık Vardiya Çizelgesi' })
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

            <label className="form-label">
              Kağıt
              <select className="form-select" value={options.pageSize} onChange={e => patch('pageSize', e.target.value)}>
                <option value="A4">A4 yatay</option>
                <option value="A3">A3 yatay geniş</option>
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

            <div>
              <div className="form-label">Hazır şablon</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {SHARE_PRESETS.map(preset => (
                  <button key={preset.label} className="btn btn-ghost btn-sm" onClick={() => applyPreset(preset)}>{preset.label}</button>
                ))}
              </div>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 6 }} onClick={resetOptions}>Ayarları Sıfırla</button>
            </div>

            <label className="form-label">
              Hazırlayan
              <input className="form-input" value={options.preparedBy || ''} onChange={e => patch('preparedBy', e.target.value)} placeholder="Örn. Vardiya Amirliği" />
            </label>

            <label className="form-label">
              Çıktı notu
              <textarea className="form-input" value={options.note || ''} onChange={e => patch('note', e.target.value)} placeholder="Personele gönderilecek açıklama..." style={{ minHeight: 70, resize: 'vertical' }} />
            </label>

            {[
              ['onlyVisible', 'Sadece görünen filtreli liste'],
              ['pageBreakByDept', 'Her departman ayrı sayfadan başlasın'],
              ['includeSummary', 'Üst özet kartları'],
              ['includeRole', 'Personel rolü'],
              ['includeLocation', 'Çalışma noktası'],
              ['includeStaffTotals', 'Personel haftalık toplamları'],
              ['includeLegend', 'Renk açıklaması'],
              ['includeSignatures', 'İmza / kontrol alanı'],
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
