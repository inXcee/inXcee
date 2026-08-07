import { useEffect, useMemo, useState } from 'react'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { ModalOverlay, shortDay } from '../shared.jsx'
import {
  DEFAULT_SCHEDULE_SHARE_OPTIONS,
  buildOutputCenterHtml,
  downloadScheduleShareImage,
  openOutputCenterPrintWindow,
} from '../logic/scheduleShareExport.js'
import {
  buildSignatureModels, buildWeeklySignatureModel,
  renderSignaturePagesHtml,
  renderWeeklySignaturePagesHtml,
  signaturePagesCss,
} from '../logic/scheduleSignatureExport.js'
import { downloadWeeklySignatureImages } from '../logic/weeklySignatureImageExport.js'

const SHARE_OPTIONS_KEY = 'shift_schedule_share_options_v3'
const SHARE_PRESETS = [
  { label: 'Personel', options: { colorMode: 'shift', density: 'compact', includeSummary: false, includeRole: true, includeLocation: true, includeLegend: true, includeSignatures: false, pageBreakByDept: false } },
  { label: 'Yönetici', options: { colorMode: 'status', density: 'normal', includeSummary: true, includeRole: true, includeLocation: true, includeStaffTotals: true, includeLegend: true, includeSignatures: true, pageBreakByDept: false } },
  { label: 'Departman', options: { colorMode: 'department', density: 'normal', includeSummary: true, includeRole: true, includeLocation: true, includeStaffTotals: true, includeLegend: true, includeSignatures: true, pageBreakByDept: true } },
]

function loadSavedOptions() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(window.localStorage.getItem(SHARE_OPTIONS_KEY) || '{}') || {} } catch { return {} }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function ScheduleShareModal({
  onClose, weekStart, weekEnd, weekDays, staffGrid, visibleGrid,
  gridSearch, statusFilter, deptFilter, shiftDefs,
}) {
  const [options, setOptions] = useState(() => ({
    ...DEFAULT_SCHEDULE_SHARE_OPTIONS,
    title: 'Haftalık Vardiya Çizelgesi',
    // İmza sayfası varsayılanları
    sig_showLocationAndRole: true,
    sig_showSummary: true,
    sig_doubleSignature: false,
    sig_pageBreakByDept: false,
    sig_layout: 'weekly',
    sig_groupMode: 'combined',
    sig_showDepartmentBands: true,
    sig_rowsPerPage: 25,
    sig_blankRows: 2,
    sig_imageScale: 2,
    ...loadSavedOptions(),
  }))
  const [content, setContent] = useState('both')       // schedule | signatures | both
  const [dayScope, setDayScope] = useState('all')      // all | selected | today
  const [selectedDays, setSelectedDays] = useState(() => new Set(weekDays))
  const [busy, setBusy] = useState('')
  const toast = useToastStore(s => s.addToast)

  const payload = useMemo(() => ({
    weekStart, weekEnd, weekDays, staffGrid, visibleGrid,
    gridSearch, statusFilter, deptFilter, shiftDefs, options,
  }), [weekStart, weekEnd, weekDays, staffGrid, visibleGrid, gridSearch, statusFilter, deptFilter, shiftDefs, options])

  const signatureDates = useMemo(() => {
    if (content === 'schedule') return []
    if (dayScope === 'today') { const t = todayIso(); return weekDays.includes(t) ? [t] : [] }
    if (dayScope === 'selected') return weekDays.filter(d => selectedDays.has(d))
    return weekDays
  }, [content, dayScope, selectedDays, weekDays])

  const sigOpts = useMemo(() => ({
    showLocationAndRole: options.sig_showLocationAndRole !== false,
    showSummary: options.sig_showSummary !== false,
    doubleSignature: !!options.sig_doubleSignature,
    pageBreakByDept: !!options.sig_pageBreakByDept,
    groupMode: options.sig_groupMode || 'combined',
    showDepartmentBands: options.sig_showDepartmentBands !== false,
    rowsPerPage: Number(options.sig_rowsPerPage) || 25,
    blankRows: Number(options.sig_blankRows ?? 2),
    onlyWorking: true,
  }), [options])

  const people = options.onlyVisible ? visibleGrid : staffGrid
  const signatureModels = useMemo(
    () => buildSignatureModels({ people, dates: signatureDates, options: sigOpts }),
    [people, signatureDates, sigOpts])
  const weeklySignatureModel = useMemo(
    () => buildWeeklySignatureModel({ people, dates: signatureDates, options: sigOpts }),
    [people, signatureDates, sigOpts])

  const outputPayload = useMemo(() => ({
    includeSchedule: content !== 'signatures',
    schedulePayload: payload,
    signatureCss: signaturePagesCss(),
    signaturePagesHtml: signatureDates.length
      ? (options.sig_layout === 'daily'
        ? renderSignaturePagesHtml(signatureModels, {
          revision: options.revision, generated: new Date().toLocaleString('tr-TR'),
          weekLabel: `${weekStart} - ${weekEnd}`,
        })
        : renderWeeklySignaturePagesHtml(weeklySignatureModel, {
          revision: options.revision, generated: new Date().toLocaleString('tr-TR'),
          weekLabel: `${weekStart} - ${weekEnd}`,
        }))
      : '',
    title: options.title,
  }), [content, payload, signatureDates, signatureModels, weeklySignatureModel, options.sig_layout, options.revision, options.title, weekStart, weekEnd])

  const previewHtml = useMemo(() => buildOutputCenterHtml(outputPayload), [outputPayload])

  useEffect(() => {
    try { window.localStorage.setItem(SHARE_OPTIONS_KEY, JSON.stringify(options)) } catch { /* localStorage kapalı */ }
  }, [options])

  const patch = (key, value) => setOptions(prev => ({ ...prev, [key]: value }))
  const patchShiftColor = (id, hex) => setOptions(prev => ({ ...prev, shiftColors: { ...(prev.shiftColors || {}), [id]: hex } }))
  const applyPreset = preset => setOptions(prev => ({ ...prev, ...preset.options }))
  const resetOptions = () => setOptions({ ...DEFAULT_SCHEDULE_SHARE_OPTIONS, title: 'Haftalık Vardiya Çizelgesi', sig_showLocationAndRole: true, sig_showSummary: true, sig_doubleSignature: false, sig_pageBreakByDept: false, sig_layout: 'weekly', sig_groupMode: 'combined', sig_showDepartmentBands: true, sig_rowsPerPage: 25, sig_blankRows: 2, sig_imageScale: 2 })
  const applySignatureProfile = (rowsPerPage, blankRows) => setOptions(prev => ({
    ...prev,
    sig_layout: 'weekly',
    sig_groupMode: 'combined',
    sig_showDepartmentBands: true,
    sig_rowsPerPage: rowsPerPage,
    sig_blankRows: blankRows,
  }))
  const toggle = key => patch(key, !options[key])
  const toggleDay = date => setSelectedDays(prev => { const next = new Set(prev); next.has(date) ? next.delete(date) : next.add(date); return next })

  const runPrint = () => {
    if (content !== 'schedule' && signatureDates.length === 0) {
      toast('İmza listesi için en az bir gün seçin', 'warning'); return
    }
    try {
      openOutputCenterPrintWindow(outputPayload)
      toast('PDF / yazdırma görünümü açıldı', 'success')
    } catch (err) { toast(err?.message || 'PDF görünümü açılamadı', 'error') }
  }

  // İmza föyünü GERÇEK PDF olarak indirir: tarayıcının baskı diyaloğu yok,
  // font ve sayfa ölçüsü sunucuda sabit — belge her makinede aynı çıkar.
  const runSignaturePdf = async () => {
    if (signatureDates.length === 0) {
      toast('İmza föyü için en az bir gün seçin', 'warning'); return
    }
    if ((options.sig_layout || 'weekly') !== 'weekly') {
      toast('PDF indirme haftalık föy düzeninde çalışır', 'warning'); return
    }
    try {
      setBusy('sigpdf')
      const res = await api.post('/shifts/schedule/signature-pdf', {
        model: weeklySignatureModel,
        meta: {
          revision: options.revision,
          generated: new Date().toLocaleString('tr-TR'),
          weekLabel: `${weekStart} - ${weekEnd}`,
          weekStart,
        },
      }, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `imza-foyu-${weekStart}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast('İmza föyü PDF indirildi', 'success')
    } catch (err) {
      toast(err?.response?.data?.error || 'İmza föyü PDF indirilemedi', 'error')
    } finally { setBusy(null) }
  }

  const runImage = async () => {
    const fmt = (options.imageFormat || 'png').toUpperCase()
    try {
      setBusy('img')
      await downloadScheduleShareImage(payload)
      toast(`${fmt} vardiya görseli indirildi`, 'success')
    } catch (err) { toast(err?.message || `${fmt} görsel indirilemedi`, 'error') } finally { setBusy('') }
  }

  const runSignatureImage = async () => {
    if (!signatureDates.length) {
      toast('İmza görseli için en az bir gün seçin', 'warning'); return
    }
    try {
      setBusy('sigimg')
      const result = await downloadWeeklySignatureImages(weeklySignatureModel, {
        revision: options.revision,
        generated: new Date().toLocaleString('tr-TR'),
        weekLabel: `${weekStart} - ${weekEnd}`,
      }, {
        scale: Number(options.sig_imageScale) || 2,
        weekStart,
      })
      toast(result.pageCount > 1 ? `${result.pageCount} imza görseli ZIP olarak indirildi` : 'İmza föyü PNG olarak indirildi', 'success')
    } catch (err) { toast(err?.message || 'İmza görseli indirilemedi', 'error') } finally { setBusy('') }
  }

  const runExcel = async () => {
    try {
      setBusy('xls')
      const { exportScheduleExcel } = await import('../logic/scheduleExcelExport.js')
      await exportScheduleExcel({
        weekStart, weekEnd, weekDays, staffGrid, visibleGrid,
        gridSearch, statusFilter, deptFilter, shiftDefs, coverageMin: 1,
        signatureDates: content === 'schedule' ? [] : signatureDates,
        signatureOptions: { ...sigOpts, layout: options.sig_layout || 'weekly', revision: options.revision },
      })
      toast('Excel indirildi', 'success')
    } catch (err) { toast(err?.message || 'Excel indirilemedi', 'error') } finally { setBusy('') }
  }

  const SegBtn = ({ active, onClick, children }) => (
    <button className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`} onClick={onClick} style={{ flex: 1 }}>{children}</button>
  )

  return (
    <ModalOverlay onClose={onClose} extraWide>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 18, letterSpacing: 2, margin: 0 }}>ÇIKTI MERKEZİ</h3>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
            {visibleGrid.length}/{staffGrid.length} personel · çizelge + pratik imza föyleri
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {content !== 'schedule' && (options.sig_layout || 'weekly') === 'weekly' && (
            <button className="btn btn-primary btn-sm" onClick={runSignaturePdf} disabled={busy === 'sigpdf'}
              title="İmza föyünü doğrudan PDF dosyası olarak indirir (yazdırma diyaloğu açılmaz)">
              {busy === 'sigpdf' ? 'Hazırlanıyor…' : '⬇ İmza PDF indir'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={runPrint}
            title="Tarayıcının yazdırma önizlemesini açar">Yazdır</button>
          <button className="btn btn-ghost btn-sm" onClick={runExcel} disabled={busy === 'xls'}>{busy === 'xls' ? 'Hazırlanıyor...' : 'Excel'}</button>
          {content !== 'signatures' && <button className="btn btn-ghost btn-sm" onClick={runImage} disabled={busy === 'img'}>{busy === 'img' ? 'Hazırlanıyor...' : `Çizelge ${(options.imageFormat || 'png').toUpperCase()}`}</button>}
          {content !== 'schedule' && (options.sig_layout || 'weekly') === 'weekly' && <button className="btn btn-ghost btn-sm" onClick={runSignatureImage} disabled={busy === 'sigimg'}>{busy === 'sigimg' ? 'Hazırlanıyor...' : 'İmza PNG'}</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '330px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)', padding: 12, maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gap: 12 }}>
            {/* ── Çıktı Merkezi kontrolleri ── */}
            <div style={{ border: '1px solid var(--blue)', borderRadius: 8, padding: '10px', background: 'rgba(59,140,240,.05)' }}>
              <div className="form-label" style={{ marginBottom: 6 }}>İçerik</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <SegBtn active={content === 'schedule'} onClick={() => setContent('schedule')}>Çizelge</SegBtn>
                <SegBtn active={content === 'signatures'} onClick={() => setContent('signatures')}>İmza</SegBtn>
                <SegBtn active={content === 'both'} onClick={() => setContent('both')}>İkisi</SegBtn>
              </div>

              {content !== 'schedule' && (
                <>
                  <div className="form-label" style={{ marginBottom: 6 }}>Föy tipi</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <SegBtn active={(options.sig_layout || 'weekly') === 'weekly'} onClick={() => patch('sig_layout', 'weekly')}>Haftalık Föy</SegBtn>
                    <SegBtn active={options.sig_layout === 'daily'} onClick={() => patch('sig_layout', 'daily')}>Günlük Liste</SegBtn>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text3)', lineHeight: 1.4, marginBottom: 9 }}>
                    {(options.sig_layout || 'weekly') === 'weekly'
                      ? ((options.sig_groupMode || 'combined') === 'combined'
                        ? 'Az sayfa modu: personeller birleşik listelenir, bölüm adı grubun üstünde tek şerit olarak gösterilir.'
                        : 'Bölüm bazlı mod: her bölüm kendi imza föyünde gösterilir.')
                      : 'Seçilen her gün için ayrı imza listesi hazırlanır.'}
                  </div>
                  <div className="form-label" style={{ marginBottom: 6 }}>Gün seçimi</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <SegBtn active={dayScope === 'all'} onClick={() => setDayScope('all')}>Tüm hafta</SegBtn>
                    <SegBtn active={dayScope === 'selected'} onClick={() => setDayScope('selected')}>Seçili</SegBtn>
                    <SegBtn active={dayScope === 'today'} onClick={() => setDayScope('today')}>Bugün</SegBtn>
                  </div>
                  {dayScope === 'selected' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                      {weekDays.map(date => (
                        <button key={date} className={`btn btn-xs ${selectedDays.has(date) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleDay(date)} style={{ fontSize: 9 }}>
                          {shortDay(date)}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--blue)', fontWeight: 800, marginBottom: 8, padding: '6px 8px', border: '1px solid rgba(59,140,240,.35)', borderRadius: 6, background: 'rgba(59,140,240,.07)' }}>
                    {(options.sig_layout || 'weekly') === 'weekly'
                      ? `${signatureDates.length} gün · ${weeklySignatureModel.pages.length} tahmini sayfa · ${people.length} personel`
                      : `${signatureDates.length} günlük imza sayfası üretilecek`}
                  </div>
                  <div className="form-label" style={{ marginBottom: 6 }}>İmza biçimi</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <SegBtn active={!options.sig_doubleSignature} onClick={() => patch('sig_doubleSignature', false)}>Tek imza</SegBtn>
                    <SegBtn active={!!options.sig_doubleSignature} onClick={() => patch('sig_doubleSignature', true)}>Giriş+Çıkış</SegBtn>
                  </div>
                  {(options.sig_layout || 'weekly') === 'weekly' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 8 }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div className="form-label" style={{ fontSize: 10, marginBottom: 5 }}>Hızlı düzen</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                          <button className={`btn btn-xs ${Number(options.sig_rowsPerPage) === 30 && (options.sig_groupMode || 'combined') === 'combined' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => applySignatureProfile(30, 3)}>Sıkı 30</button>
                          <button className={`btn btn-xs ${Number(options.sig_rowsPerPage) === 25 && (options.sig_groupMode || 'combined') === 'combined' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => applySignatureProfile(25, 2)}>Ekonomik 25</button>
                          <button className={`btn btn-xs ${Number(options.sig_rowsPerPage) === 18 && (options.sig_groupMode || 'combined') === 'combined' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => applySignatureProfile(18, 3)}>Dengeli 18</button>
                          <button className={`btn btn-xs ${Number(options.sig_rowsPerPage) === 12 && (options.sig_groupMode || 'combined') === 'combined' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => applySignatureProfile(12, 3)}>Rahat 12</button>
                        </div>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div className="form-label" style={{ fontSize: 10, marginBottom: 5 }}>Sayfa gruplaması</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <SegBtn active={(options.sig_groupMode || 'combined') === 'combined'} onClick={() => patch('sig_groupMode', 'combined')}>Az Sayfa</SegBtn>
                          <SegBtn active={options.sig_groupMode === 'department'} onClick={() => patch('sig_groupMode', 'department')}>Bölüm Bazlı</SegBtn>
                        </div>
                      </div>
                      <label className="form-label" style={{ fontSize: 10 }}>
                        Sayfadaki personel
                        <select className="form-select" value={options.sig_rowsPerPage || 25} onChange={e => patch('sig_rowsPerPage', Number(e.target.value))}>
                          <option value={12}>12 - rahat imza</option>
                          <option value={18}>18 - dengeli</option>
                          <option value={25}>25 - ekonomik / az sayfa</option>
                        </select>
                      </label>
                      <label className="form-label" style={{ fontSize: 10 }}>
                        Boş değişiklik satırı
                        <select className="form-select" value={options.sig_blankRows ?? 3} onChange={e => patch('sig_blankRows', Number(e.target.value))}>
                          {[0, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </label>
                      <label className="form-label" style={{ fontSize: 10, gridColumn: '1 / -1' }}>
                        İmza PNG kalitesi
                        <select className="form-select" value={options.sig_imageScale || 2} onChange={e => patch('sig_imageScale', Number(e.target.value))}>
                          <option value={1}>1x - hızlı</option>
                          <option value={2}>2x - önerilen</option>
                          <option value={3}>3x - yüksek çözünürlük</option>
                        </select>
                        <span style={{ display: 'block', marginTop: 4, color: 'var(--text3)', lineHeight: 1.35 }}>Tek sayfa PNG, birden fazla bölüm veya sayfa tek ZIP paketi olur.</span>
                      </label>
                    </div>
                  )}
                  {[
                    ['sig_showLocationAndRole', 'Çalışma noktası ve görev bilgisi'],
                    ...((options.sig_layout || 'weekly') === 'weekly' ? [
                      ['sig_showDepartmentBands', 'Bölüm adını personel grubunun üstünde şerit olarak göster'],
                    ] : []),
                    ...((options.sig_layout || 'weekly') === 'daily' ? [
                      ['sig_showSummary', 'İzin / OFF / raporlu özetini göster'],
                      ['sig_pageBreakByDept', 'Bölümlere göre ayrı sayfa'],
                    ] : []),
                  ].map(([key, label]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: 12, marginBottom: 4 }}>
                      <input type="checkbox" checked={options[key] !== false} onChange={() => patch(key, !(options[key] !== false))} />
                      {label}
                    </label>
                  ))}
                </>
              )}
            </div>

            <label className="form-label">
              Başlık
              <input className="form-input" value={options.title} onChange={e => patch('title', e.target.value)} />
            </label>

            {content !== 'signatures' && (
              <>
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
                    <option value="economy">Ekonomik (en çok kişi)</option>
                    <option value="compact">Kompakt</option>
                    <option value="normal">Normal</option>
                    <option value="wide">Geniş</option>
                  </select>
                </label>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={options.includeDeptDigest !== false}
                    onChange={e => patch('includeDeptDigest', e.target.checked)} />
                  Bölüm özeti (vardiya + nokta sayımı)
                </label>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={options.includeDayRoster !== false}
                    onChange={e => patch('includeDayRoster', e.target.checked)} />
                  Gün gün döküm (kim, hangi vardiyada)
                </label>
                <label className="form-label">
                  Kağıt
                  <select className="form-select" value={options.pageSize} onChange={e => patch('pageSize', e.target.value)}>
                    <option value="A4">A4 yatay</option>
                    <option value="A3">A3 yatay geniş</option>
                  </select>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label className="form-label">Başlık rengi
                    <input type="color" className="form-input" value={options.accentColor} onChange={e => patch('accentColor', e.target.value)} style={{ padding: 3, height: 36 }} />
                  </label>
                  <label className="form-label">Hafta sonu
                    <input type="color" className="form-input" value={options.weekendColor} onChange={e => patch('weekendColor', e.target.value)} style={{ padding: 3, height: 36 }} />
                  </label>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                  <div className="form-label" style={{ marginBottom: 6 }}>Durum renkleri</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[['offColor', 'OFF'], ['leaveColor', 'İZİN'], ['absentColor', 'YOK'], ['emptyColor', 'Boş hücre']].map(([key, label]) => (
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
                            <input type="color" value={options.shiftColors?.[sd.id] || options.workColor || '#22C55E'} onChange={e => patchShiftColor(sd.id, e.target.value)} style={{ width: 30, height: 26, padding: 1, border: '1px solid var(--border)', borderRadius: 5, background: 'none' }} />
                            {sd.name} <span style={{ color: 'var(--text3)', fontSize: 9 }}>{sd.start_hour}:00-{sd.end_hour}:00</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <label className="form-label">
                  Çıktı notu
                  <textarea className="form-input" value={options.note || ''} onChange={e => patch('note', e.target.value)} placeholder="Personele gönderilecek açıklama..." style={{ minHeight: 60, resize: 'vertical' }} />
                </label>
              </>
            )}

            {content !== 'signatures' && <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
              <div className="form-label" style={{ marginBottom: 6 }}>Görsel (PNG/JPG) çıktı — çizelge</div>
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
            </div>}

            <div>
              <div className="form-label">Hazır şablon (çizelge)</div>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .65fr 1fr', gap: 8 }}>
              <label className="form-label">
                Yayın tarihi
                <input type="date" className="form-input" value={options.publicationDate || ''} onChange={e => patch('publicationDate', e.target.value)} />
              </label>
              <label className="form-label">
                Revizyon
                <input className="form-input" value={options.revision || ''} onChange={e => patch('revision', e.target.value.slice(0, 12))} placeholder="1" />
              </label>
              <label className="form-label">
                Belge no
                <input className="form-input" value={options.documentNo || ''} onChange={e => patch('documentNo', e.target.value.slice(0, 30))} placeholder="VRD-2026-07" />
              </label>
            </div>

            {content !== 'signatures' && [
              ['onlyVisible', 'Sadece görünen filtreli liste'],
              ['pageBreakByDept', 'Çizelgede her departman ayrı sayfa'],
              ['includeSummary', 'Üst özet kartları'],
              ['includeRole', 'Personel rolü'],
              ['includeLocation', 'Çalışma noktası'],
              ['includeStaffTotals', 'Personel haftalık toplamları'],
              ['includeLegend', 'Renk açıklaması'],
              ['includeSignatures', 'Çizelgede Hazırlayan/Kontrol/Onay alanı'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: 12 }}>
                <input type="checkbox" checked={!!options[key]} onChange={() => toggle(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fff', minHeight: 520 }}>
          <iframe title="Çıktı önizleme" srcDoc={previewHtml} style={{ width: '100%', height: 560, border: 0, background: '#fff' }} />
        </div>
      </div>
    </ModalOverlay>
  )
}
