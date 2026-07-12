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
  const patchShiftColor = (id, hex) => setOptions(prev => ({ ...prev, shiftColors: { ...(prev.shiftColors || {}), [id]: hex } }))
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
    const fmt = (options.imageFormat || 'png').toUpperCase()
    try {
      setBusy('img')
      await downloadScheduleShareImage(payload)
      toast(`${fmt} vardiya görseli indirildi`, 'success')
    } catch (err) {
      toast(err?.message || `${fmt} görsel indirilemedi`, 'error')
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
          <button className="btn btn-ghost btn-sm" onClick={runImage} disabled={busy === 'img'}>{busy === 'img' ? 'Hazırlanıyor...' : `${(options.imageFormat || 'png').toUpperCase()} Görsel İndir`}</button>
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
                <option value="custom">Özel (kendi seçtiğim)</option>
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

            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
              <div className="form-label" style={{ marginBottom: 6 }}>Durum renkleri (tüm modlarda geçerli)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['offColor', 'OFF'],
                  ['leaveColor', 'İZİN'],
                  ['absentColor', 'YOK'],
                  ['emptyColor', 'Boş hücre'],
                ].map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)' }}>
                    <input type="color" value={options[key] || '#000000'} onChange={e => patch(key, e.target.value)} style={{ width: 30, height: 26, padding: 1, border: '1px solid var(--border)', borderRadius: 5, background: 'none' }} />
                    {label}
                  </label>
                ))}
              </div>
              {options.colorMode === 'custom' && (
                <div style={{ marginTop: 10 }}>
                  <div className="form-label" style={{ marginBottom: 6 }}>Vardiya renkleri</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)' }}>
                      <input type="color" value={options.workColor || '#22C55E'} onChange={e => patch('workColor', e.target.value)} style={{ width: 30, height: 26, padding: 1, border: '1px solid var(--border)', borderRadius: 5, background: 'none' }} />
                      Varsayılan çalışma
                    </label>
                    {(shiftDefs || []).map(sd => (
                      <label key={sd.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)' }}>
                        <input
                          type="color"
                          value={options.shiftColors?.[sd.id] || options.workColor || '#22C55E'}
                          onChange={e => patchShiftColor(sd.id, e.target.value)}
                          style={{ width: 30, height: 26, padding: 1, border: '1px solid var(--border)', borderRadius: 5, background: 'none' }}
                        />
                        {sd.name} <span style={{ color: 'var(--text3)', fontSize: 9 }}>{sd.start_hour}:00-{sd.end_hour}:00</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
              <div className="form-label" style={{ marginBottom: 6 }}>Görsel (PNG/JPG) çıktı</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label className="form-label" style={{ fontSize: 11 }}>
                  Format
                  <select className="form-select" value={options.imageFormat || 'png'} onChange={e => patch('imageFormat', e.target.value)}>
                    <option value="png">PNG (keskin)</option>
                    <option value="jpg">JPG (küçük dosya)</option>
                  </select>
                </label>
                <label className="form-label" style={{ fontSize: 11 }}>
                  Kalite
                  <select className="form-select" value={options.imageScale || 2} onChange={e => patch('imageScale', Number(e.target.value))}>
                    <option value={1}>1x</option>
                    <option value={2}>2x (önerilen)</option>
                    <option value={3}>3x (yüksek)</option>
                  </select>
                </label>
              </div>
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
