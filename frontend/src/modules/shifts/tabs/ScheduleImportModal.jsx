// Excel çizelge içe aktarım modalı — ScheduleTab orkestratöründen birebir taşındı.
// İki format: akıllı "KAMP ALANI ÇİZELGE" (dosya kendi tarih/departmanını taşır,
// backend dryRun önizleme + departman seçimi + elle eşleştirme + geri alma) ve
// basit şablon (isim + gün kodları, seçili haftaya yazılır). Davranış aynı.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useToastStore } from '../../../shared/store/toastStore.js'
import { confirmDialog } from '../../../shared/components/ConfirmDialog.jsx'
import { shiftColor, ModalOverlay, StaffSearch } from '../shared.jsx'
import { parseScheduleSheet } from '../logic/schedule.js'
import { parseCampScheduleGrid } from '../logic/excelImport.js'

export default function ScheduleImportModal({ onClose, allStaff, shiftDefs, weekDays }) {
  const qc = useQueryClient()
  const [excelPreview, setExcelPreview] = useState(null) // { matched, unmatched, entries } — basit şablon
  const [excelError, setExcelError] = useState('')
  // Akıllı import (KAMP ÇİZELGE formatı): dosya kendi tarihlerini/departmanlarını taşır
  const [campPayload, setCampPayload] = useState(null)   // parser çıktısı (kanonik)
  const [campReport, setCampReport] = useState(null)     // backend dryRun raporu
  const [campFileName, setCampFileName] = useState('')
  const [campExclude, setCampExclude] = useState([])     // içe aktarılmayacak departman adları
  const [campMappings, setCampMappings] = useState({})   // excelAdı → mevcut staffId (elle eşleştirme)
  const [mapPickName, setMapPickName] = useState('')      // elle eşleştirme: seçili excel adı

  // Excel import submit (basit şablon — seçili haftaya yazar)
  const excelImport = useMutation({
    mutationFn: (entries) => api.post('/shifts/schedule', { entries }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule'] }); onClose(); setExcelPreview(null) }
  })

  const withOptions = (payload) => ({ ...payload, excludeDepts: campExclude, mappings: campMappings })

  // Akıllı import — önizleme (dryRun): eksik personel/departman/vardiya raporu
  const campDryRun = useMutation({
    mutationFn: (payload) => api.post('/shifts/import?dryRun=1', withOptions(payload)).then(r => r.data),
    onSuccess: (report) => setCampReport(report),
    onError: (err) => setExcelError(err?.response?.data?.error || 'Önizleme alınamadı'),
  })

  // Akıllı import — uygula: eksikleri oluştur + çizelgeye işle
  const campCommit = useMutation({
    mutationFn: (payload) => api.post('/shifts/import', withOptions(payload)).then(r => r.data),
    onSuccess: (report) => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['staff-list-active'] })
      qc.invalidateQueries({ queryKey: ['import-batches'] })
      useToastStore.getState().addToast(
        `İçe aktarıldı: ${report.scheduleEntries} kayıt · ${report.staff.created.length} yeni personel · ${report.depts.created.length} yeni departman`, 'success')
      onClose(); setCampPayload(null); setCampReport(null); setCampFileName(''); setCampExclude([]); setCampMappings({})
    },
    onError: (err) => useToastStore.getState().addToast(err?.response?.data?.error || 'İçe aktarma başarısız', 'error'),
  })

  // İçe aktarım oturumları (geri-alma)
  const { data: importBatches = [] } = useQuery({
    queryKey: ['import-batches'],
    queryFn: () => api.get('/shifts/import/batches?limit=10').then(r => r.data),
  })
  const undoBatch = useMutation({
    mutationFn: (id) => api.post(`/shifts/import/batches/${id}/undo`).then(r => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['schedule'] })
      qc.invalidateQueries({ queryKey: ['staff-list-active'] })
      qc.invalidateQueries({ queryKey: ['import-batches'] })
      useToastStore.getState().addToast(`Geri alındı: ${res.scheduleDeleted} kayıt silindi, ${res.scheduleRestored} geri yüklendi, ${res.staffDeleted} personel silindi`, 'success')
    },
    onError: (err) => useToastStore.getState().addToast(err?.response?.data?.error || 'Geri alınamadı', 'error'),
  })

  // Departman seçimi / eşleştirme değişince önizlemeyi tazele
  const rePreview = () => { if (campPayload) campDryRun.mutate(campPayload) }
  const toggleDept = (name) => {
    setCampExclude(prev => prev.includes(name) ? prev.filter(d => d !== name) : [...prev, name])
  }
  const addMapping = (excelName, staffId) => {
    if (!excelName || !staffId) return
    setCampMappings(prev => ({ ...prev, [excelName]: parseInt(staffId) }))
    setMapPickName('')
  }
  const removeMapping = (excelName) => {
    setCampMappings(prev => { const n = { ...prev }; delete n[excelName]; return n })
  }

  // Excel file parse — önce akıllı (KAMP) formatı dene, olmazsa basit şablona düş.
  const handleExcelFile = async (file) => {
    setExcelError('')
    setExcelPreview(null)
    setCampPayload(null)
    setCampReport(null)
    setCampExclude([])
    setCampMappings({})
    setCampFileName(file.name || '')
    try {
      const ExcelJS = (await import('exceljs')).default
      const buf = await file.arrayBuffer()
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buf)
      const ws = wb.worksheets[0]
      if (!ws) { setExcelError('Boş dosya'); return }
      const rows = []
      ws.eachRow(row => {
        rows.push(row.values.slice(1).map(v => {
          if (v == null) return ''
          if (typeof v === 'object' && v.text != null) return v.text
          if (typeof v === 'object' && v.result != null) return v.result
          return v
        }))
      })

      // 1) Akıllı format (dosya kendi tarihlerini + departman bantlarını taşır)
      const camp = parseCampScheduleGrid(rows)
      if (!camp.error) {
        setCampPayload(camp)
        campDryRun.mutate(camp)
        return
      }

      // 2) Basit şablon (isim + gün kodları, seçili haftaya yazılır)
      const result = parseScheduleSheet(rows, { allStaff, shiftDefs, weekDays })
      if (result.error) { setExcelError(`Dosya tanınamadı. ${camp.error}`); return }
      setExcelPreview({ matched: result.matched, unmatched: result.unmatched, entries: result.entries })
    } catch (err) {
      setExcelError('Dosya okunamadi: ' + err.message)
    }
  }

  return (
        <ModalOverlay onClose={() => { onClose(); setExcelPreview(null); setExcelError(''); setCampPayload(null); setCampReport(null); setCampFileName(''); setCampExclude([]); setCampMappings({}) }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '2px', marginBottom: '16px' }}>
            EXCEL AKTAR
          </h3>
          {campReport ? (
            // ── Akıllı import önizlemesi (KAMP ÇİZELGE formatı) ──
            (() => {
              const cr = campReport
              const wk = cr.weekDates?.length ? `${cr.weekDates[0]} → ${cr.weekDates[cr.weekDates.length - 1]}` : ''
              // Tam departman listesi (orijinal dosyadan) — dışlanınca bile seçenekte kalsın
              const allDeptStats = (() => {
                const m = new Map()
                for (const r of campPayload?.rows || []) {
                  const k = r.deptName || '— (departmansız)'
                  if (!m.has(k)) m.set(k, { name: k, staffCount: 0, cellCount: 0 })
                  const a = m.get(k); a.staffCount++; a.cellCount += r.cells?.length || 0
                }
                return [...m.values()]
              })()
              const Card = ({ n, label, color, bg }) => (
                <div style={{ flex: 1, minWidth: '90px', padding: '10px', background: bg, border: `1px solid ${color}33`, borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color }}>{n}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{label}</div>
                </div>
              )
              return (
                <>
                  <p style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' }}>
                    <strong style={{ color: 'var(--text)' }}>{campFileName}</strong> {wk && `· ${wk}`}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>
                    Eksik personel, departman ve vardiya tanımları otomatik oluşturulacak, çizelge dosyadaki tarihlere işlenecek.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <Card n={cr.scheduleEntries} label="Çizelge kaydı" color="#6366f1" bg="rgba(99,102,241,.1)" />
                    <Card n={cr.staff.created.length} label="Yeni personel" color="#10b981" bg="rgba(16,185,129,.1)" />
                    <Card n={cr.staff.matched} label="Eşleşen personel" color="var(--text2)" bg="var(--surface2)" />
                    <Card n={cr.depts.created.length} label="Yeni departman" color="#f59e0b" bg="rgba(245,158,11,.1)" />
                    <Card n={cr.shiftDefs.created.length} label="Yeni vardiya" color="#06b6d4" bg="rgba(6,182,212,.1)" />
                    {cr.unrecognized.length > 0 && <Card n={cr.unrecognized.length} label="Anlaşılmayan" color="#ef4444" bg="rgba(239,68,68,.1)" />}
                  </div>

                  {/* Yeni vs üzerine-yazılacak kayıt dağılımı */}
                  {(cr.scheduleUpdated > 0 || cr.scheduleNew > 0) && (
                    <div style={{ marginBottom: '8px', fontSize: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#10b981' }}>● {cr.scheduleNew} yeni kayıt</span>
                      {cr.scheduleUpdated > 0 && (
                        <span style={{ color: '#f59e0b' }}>⚠ {cr.scheduleUpdated} mevcut kayıt güncellenecek (üzerine yazılır)</span>
                      )}
                    </div>
                  )}

                  {/* İzin entegrasyonu özeti */}
                  {cr.leaves?.created > 0 && (
                    <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--text2)' }}>
                      📋 <span style={{ color: '#a78bfa' }}>{cr.leaves.created} izin talebi</span> oluşturulacak (onaylı):
                      {cr.leaves.annualDays > 0 && ` ${cr.leaves.annualDays} gün yıllık (bakiyeden düşülür)`}
                      {cr.leaves.annualDays > 0 && cr.leaves.sickDays > 0 && ' ·'}
                      {cr.leaves.sickDays > 0 && ` ${cr.leaves.sickDays} gün rapor`}
                    </div>
                  )}

                  {/* Yazım/aksan farkıyla eşleşenler — kullanıcı doğrulasın */}
                  {cr.staff.fuzzyMatched?.length > 0 && (
                    <div style={{ marginBottom: '10px', padding: '8px 12px', background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.25)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: '#818cf8', fontWeight: 600, marginBottom: '4px' }}>
                        Yazım/aksan farkıyla eşleşen ({cr.staff.fuzzyMatched.length}) — doğru kişiyse sorun yok:
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
                        {cr.staff.fuzzyMatched.slice(0, 10).map(f => `${f.excelName} → ${f.matchedTo}`).join(' · ')}
                        {cr.staff.fuzzyMatched.length > 10 && ` … +${cr.staff.fuzzyMatched.length - 10}`}
                      </div>
                    </div>
                  )}

                  {/* Anomali / iş-kanunu uyarıları */}
                  {cr.anomalies?.warnings?.length > 0 && (() => {
                    const KIND_LABEL = {
                      no_weekly_off: 'Haftalık tatil yok', consecutive_work: '6+ ardışık çalışma',
                      consecutive_night: 'Ardışık gece', on_approved_leave: 'İzinliyken vardiya',
                      duplicate: 'Çift kayıt',
                    }
                    return (
                      <div style={{ marginBottom: '12px', padding: '10px 12px', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)', borderRadius: '6px' }}>
                        <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, marginBottom: '6px' }}>
                          ⚠ {cr.anomalies.warnings.length} uyarı (içe aktarmayı engellemez):
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                          {Object.entries(cr.anomalies.counts || {}).map(([k, n]) => (
                            <span key={k} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: 'rgba(245,158,11,.15)', color: '#f59e0b' }}>
                              {KIND_LABEL[k] || k}: {n}
                            </span>
                          ))}
                        </div>
                        <div style={{ maxHeight: '90px', overflowY: 'auto', fontSize: '10px', color: 'var(--text2)', lineHeight: 1.6 }}>
                          {cr.anomalies.warnings.slice(0, 25).map((w, i) => <div key={i}>• {w.message}</div>)}
                          {cr.anomalies.warnings.length > 25 && <div style={{ color: 'var(--text3)' }}>… +{cr.anomalies.warnings.length - 25} daha</div>}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Departman seçimi (işaretsiz = içe aktarılmaz) */}
                  {allDeptStats.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' }}>Departman seçimi (işareti kaldırılan içe aktarılmaz):</div>
                      <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                          <tbody>
                            {allDeptStats.map(d => {
                              const excluded = campExclude.includes(d.name)
                              return (
                                <tr key={d.name} style={{ borderTop: '1px solid var(--border)', opacity: excluded ? 0.4 : 1 }}>
                                  <td style={{ padding: '5px 10px', width: '28px' }}>
                                    <input type="checkbox" checked={!excluded} onChange={() => toggleDept(d.name)} />
                                  </td>
                                  <td style={{ padding: '5px 10px', color: 'var(--text)', textDecoration: excluded ? 'line-through' : 'none' }}>{d.name}</td>
                                  <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text2)' }}>{d.staffCount} kişi</td>
                                  <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text2)' }}>{d.cellCount} kayıt</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Elle eşleştirme — bir excel adını mevcut personele bağla */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' }}>
                      Elle eşleştirme {Object.keys(campMappings).length > 0 && `(${Object.keys(campMappings).length})`}: bir excel adını mevcut personele bağla (yeni oluşturulmaz)
                    </div>
                    {Object.entries(campMappings).map(([name, sid]) => (
                      <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginBottom: '3px' }}>
                        <span style={{ color: '#818cf8' }}>{name} → #{sid}</span>
                        <button className="btn btn-ghost" style={{ fontSize: '10px', padding: '1px 6px' }} onClick={() => removeMapping(name)}>kaldır</button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                      <select value={mapPickName} onChange={e => setMapPickName(e.target.value)}
                        style={{ flex: 1, padding: '5px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '11px' }}>
                        <option value="">Excel adı seç (oluşturulacaklardan)…</option>
                        {cr.staff.created.filter(s => !campMappings[s.name]).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                      </select>
                      <div style={{ flex: 1 }}>
                        <StaffSearch value="" onChange={sid => addMapping(mapPickName, sid)} placeholder={mapPickName ? 'Mevcut personel ara…' : 'Önce excel adı seç'} />
                      </div>
                    </div>
                  </div>

                  {/* Seçim/eşleştirme değişikliklerini uygula */}
                  {(campExclude.length > 0 || Object.keys(campMappings).length > 0) && (
                    <button className="btn btn-ghost" style={{ width: '100%', marginBottom: '12px', fontSize: '12px' }}
                      disabled={campDryRun.isPending}
                      onClick={rePreview}>
                      {campDryRun.isPending ? 'Güncelleniyor…' : '↻ Önizlemeyi güncelle (seçim/eşleştirmeyi uygula)'}
                    </button>
                  )}

                  {cr.depts.created.length > 0 && (
                    <div style={{ marginBottom: '10px', fontSize: '11px' }}>
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>Yeni departmanlar: </span>
                      <span style={{ color: 'var(--text2)' }}>{cr.depts.created.join(', ')}</span>
                    </div>
                  )}
                  {cr.shiftDefs.created.length > 0 && (
                    <div style={{ marginBottom: '10px', fontSize: '11px' }}>
                      <span style={{ color: '#06b6d4', fontWeight: 600 }}>Yeni vardiyalar: </span>
                      <span style={{ color: 'var(--text2)' }}>{cr.shiftDefs.created.map(s => s.name).join(', ')}</span>
                    </div>
                  )}
                  {cr.staff.created.length > 0 && (
                    <div style={{ maxHeight: '120px', overflowY: 'auto', marginBottom: '6px', padding: '8px 12px', background: 'rgba(16,185,129,.06)', border: '1px solid rgba(16,185,129,.2)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, marginBottom: '4px' }}>Oluşturulacak personel ({cr.staff.created.length}):</div>
                      <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{cr.staff.created.map(s => s.name).join(', ')}</div>
                    </div>
                  )}
                  {cr.staff.created.length > 0 && (cr.staff.genderGuessed > 0 || cr.staff.genderUnknown?.length > 0) && (
                    <div style={{ marginBottom: '10px', fontSize: '11px', color: 'var(--text2)' }}>
                      Cinsiyet: <span style={{ color: '#10b981' }}>{cr.staff.genderGuessed} otomatik tahmin</span>
                      {cr.staff.genderUnknown?.length > 0 && (
                        <> · <span style={{ color: '#f59e0b' }}>{cr.staff.genderUnknown.length} belirsiz</span> (personel kartından elle ayarlanır)</>
                      )}
                    </div>
                  )}
                  {cr.unrecognized.length > 0 && (
                    <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: '6px' }}>
                      <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, marginBottom: '4px' }}>Anlaşılmayan hücreler (atlanacak):</div>
                      <div style={{ fontSize: '10px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                        {cr.unrecognized.slice(0, 12).map(u => `${u.name} ${u.date}: "${u.raw}"`).join(' · ')}
                        {cr.unrecognized.length > 12 && ` … +${cr.unrecognized.length - 12}`}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" style={{ flex: 1 }}
                      disabled={campCommit.isPending}
                      onClick={() => campCommit.mutate(campPayload)}>
                      {campCommit.isPending ? 'Aktarılıyor…' : `İçe Aktar (${cr.scheduleEntries} kayıt)`}
                    </button>
                    <button className="btn btn-ghost" disabled={campCommit.isPending}
                      onClick={() => { setCampReport(null); setCampPayload(null); setCampFileName('') }}>Geri</button>
                  </div>
                </>
              )
            })()
          ) : campDryRun.isPending ? (
            <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text2)', fontSize: '13px' }}>Dosya analiz ediliyor…</div>
          ) : !excelPreview ? (
            <>
              <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
                Excel dosyasını seçin. <strong style={{ color: 'var(--text)' }}>KAMP ALANI ÇİZELGE</strong> dosyaları otomatik tanınır
                (departman, isim, tarih ve vardiya saatleri kendiliğinden alınır). Basit şablonlarda ilk sütun isim,
                sonraki sütunlar günler; <strong>1/G</strong>=1.Vardiya, <strong>2/A</strong>=2.Vardiya, <strong>3/Ge</strong>=3.Vardiya, <strong>İ/izin</strong>=İzin.
              </p>
              {excelError && (
                <div style={{ padding: '10px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: '6px', color: '#ef4444', fontSize: '12px', marginBottom: '12px' }}>
                  {excelError}
                </div>
              )}
              <input type="file" accept=".xlsx,.xls,.csv"
                style={{ display: 'block', width: '100%', padding: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px', cursor: 'pointer', marginBottom: '16px' }}
                onChange={e => { if (e.target.files[0]) handleExcelFile(e.target.files[0]) }}
              />

              {/* Son içe aktarmalar — geri alma */}
              {importBatches.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px', marginBottom: '6px' }}>SON İÇE AKTARMALAR</div>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                    {importBatches.map(b => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {b.label} {b.undone_at && <span style={{ color: 'var(--text3)' }}>(geri alındı)</span>}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                            {b.created_at?.slice(0, 16).replace('T', ' ')} · {b.summary?.scheduleEntries ?? 0} kayıt · {b.summary?.staffCreated ?? 0} personel
                          </div>
                        </div>
                        {!b.undone_at && (
                          <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 10px', flexShrink: 0 }}
                            disabled={undoBatch.isPending}
                            onClick={async () => {
                              if (await confirmDialog({ title: 'Geri Al', body: `"${b.label}" içe aktarımı geri alınsın mı? Oluşturulan personel/departman silinir, üzerine yazılan kayıtlar eski haline döner.`, confirmLabel: 'Geri Al', danger: true })) {
                                undoBatch.mutate(b.id)
                              }
                            }}>↩ Geri Al</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => { onClose(); setExcelError('') }}>Iptal</button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1, padding: '10px', background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#10b981' }}>{excelPreview.matched}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>Eşleşen</div>
                </div>
                <div style={{ flex: 1, padding: '10px', background: excelPreview.unmatched.length ? 'rgba(239,68,68,.1)' : 'var(--surface2)', border: `1px solid ${excelPreview.unmatched.length ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: excelPreview.unmatched.length ? '#ef4444' : 'var(--text2)' }}>{excelPreview.unmatched.length}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>Eşleşmeyen</div>
                </div>
                <div style={{ flex: 1, padding: '10px', background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.3)', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: '#6366f1' }}>{excelPreview.entries.length}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>Kayıt</div>
                </div>
              </div>
              {excelPreview.unmatched.length > 0 && (
                <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#ef4444', marginBottom: '4px', fontWeight: 600 }}>Eşleşmeyen isimler:</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>{excelPreview.unmatched.join(', ')}</div>
                </div>
              )}
              <div style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface2)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text2)' }}>İsim</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Pt</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Sa</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Ca</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Pe</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Cu</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Ct</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text2)' }}>Pz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(
                      excelPreview.entries.reduce((acc, e) => {
                        const s = allStaff.find(x => x.id === e.staff_id)
                        const name = s?.full_name || `#${e.staff_id}`
                        if (!acc[name]) acc[name] = {}
                        const dayIdx = weekDays.indexOf(e.work_date)
                        if (dayIdx >= 0) acc[name][dayIdx] = e
                        return acc
                      }, {})
                    ).map(([name, days]) => (
                      <tr key={name} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 10px', color: 'var(--text)', fontWeight: 500 }}>{name}</td>
                        {[0,1,2,3,4,5,6].map(i => {
                          const e = days[i]
                          if (!e) return <td key={i} style={{ padding: '5px 10px', textAlign: 'center', color: 'var(--text3)' }}>—</td>
                          if (e.status === 'on_leave') return <td key={i} style={{ padding: '5px 10px', textAlign: 'center', color: '#f59e0b', fontWeight: 600 }}>İ</td>
                          const def = shiftDefs.find(d => d.id === e.shift_def_id)
                          const sc = shiftColor(def?.color_class)
                          return <td key={i} style={{ padding: '5px 10px', textAlign: 'center', color: sc.text, fontWeight: 600 }}>{def?.name || e.shift_def_id}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary" style={{ flex: 1 }}
                  disabled={excelImport.isPending || excelPreview.entries.length === 0}
                  onClick={() => excelImport.mutate(excelPreview.entries)}>
                  {excelImport.isPending ? 'Aktarılıyor...' : `İce Aktar (${excelPreview.entries.length} kayıt)`}
                </button>
                <button className="btn btn-ghost" onClick={() => { setExcelPreview(null); setExcelError('') }}>Geri</button>
                <button className="btn btn-ghost" onClick={() => { onClose(); setExcelPreview(null); setExcelError('') }}>Kapat</button>
              </div>
            </>
          )}
        </ModalOverlay>
  )
}
