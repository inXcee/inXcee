import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { parsePersonnelGrid } from './logic/excelImport.js'

// Sakin toplu içe aktarım — Excel (.xlsx) ya da CSV.
// Akış: dosya seç → ayrıştır → backend dry-run önizleme → uygula → (gerekirse) geri al.
// Backend: POST /personnel/import (dedup TC+isim, oda ataması, undo batch).

function parseCSVGrid(text) {
  return text.trim().split('\n').map(line =>
    line.split(/[,;\t]/).map(v => v.trim().replace(/^["']|["']$/g, ''))
  )
}

export default function CsvImport({ onClose }) {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState('')
  const [preview, setPreview] = useState(null) // dry-run raporu
  const [result, setResult] = useState(null)   // apply raporu
  const [undone, setUndone] = useState(false)
  const fileRef = useRef()
  const qc = useQueryClient()

  const dryRunMut = useMutation({
    mutationFn: (data) => api.post('/personnel/import?dryRun=1', { rows: data }).then(r => r.data),
    onSuccess: setPreview,
  })
  const applyMut = useMutation({
    mutationFn: (data) => api.post('/personnel/import', { rows: data }).then(r => r.data),
    onSuccess: (data) => { setResult(data); qc.invalidateQueries() },
  })
  const undoMut = useMutation({
    mutationFn: (batchId) => api.post(`/personnel/import/batches/${batchId}/undo`).then(r => r.data),
    onSuccess: () => { setUndone(true); qc.invalidateQueries() },
  })

  const reset = () => { setRows([]); setPreview(null); setResult(null); setParseError(''); setUndone(false) }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    reset()
    setFileName(file.name)
    try {
      let grid
      if (/\.(xlsx|xlsm)$/i.test(file.name)) {
        const ExcelJS = (await import('exceljs')).default
        const buf = await file.arrayBuffer()
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(buf)
        const ws = wb.worksheets[0]
        if (!ws) { setParseError('Boş dosya'); return }
        grid = []
        ws.eachRow(row => {
          grid.push(row.values.slice(1).map(v => {
            if (v == null) return ''
            if (typeof v === 'object' && v.text != null) return v.text
            if (typeof v === 'object' && v.result != null) return v.result
            return v
          }))
        })
      } else {
        const text = await file.text()
        grid = parseCSVGrid(text)
      }
      const parsed = parsePersonnelGrid(grid)
      if (parsed.error) { setParseError(parsed.error); return }
      setRows(parsed.rows)
      dryRunMut.mutate(parsed.rows)
    } catch (err) {
      setParseError(err.message || 'Dosya okunamadı')
    }
  }

  const mutError = dryRunMut.error || applyMut.error || undoMut.error

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />
      <div style={{
        position: 'relative', width: '680px', maxHeight: '85vh',
        background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: '16px', letterSpacing: '2px', color: 'var(--text)' }}>
              EXCEL / CSV TOPLU KAYIT
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '2px' }}>
              SAKİN TOPLU İÇE AKTARIM — ÖNİZLEME + GERİ ALMA
            </div>
          </div>
          <button onClick={onClose} aria-label="Kapat" style={{
            background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer',
          }}>x</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
              {fileName ? `${fileName} (${rows.length} satır)` : 'EXCEL / CSV DOSYA SEÇ'}
            </button>
          </div>

          {rows.length === 0 && !parseError && (
            <div className="alert alert-info" style={{ marginBottom: '14px' }}>
              <span>i</span>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Beklenen sütunlar (başlık satırından otomatik bulunur):</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', lineHeight: 1.8 }}>
                  AD SOYAD (zorunlu) · TC · PASAPORT · FİRMA · TELEFON · MEMLEKET · GÖREV · CİNSİYET · BLOK · ODA · GİRİŞ TARİHİ
                </div>
                <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text3)' }}>
                  BLOK+ODA verilirse kapasite kontrolüyle yatak atanır. Mevcut sakinler (TC/isim) atlanır.
                </div>
              </div>
            </div>
          )}

          {parseError && (
            <div className="alert alert-danger"><span>!</span><span>{parseError}</span></div>
          )}

          {/* Dry-run önizleme */}
          {preview && !result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', letterSpacing: '1px' }}>
                ÖNİZLEME — HENÜZ YAZILMADI
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                {[
                  ['Yeni kayıt', preview.created?.length || 0],
                  ['Mevcut (atlanır)', preview.matched || 0],
                  ['Oda ataması', preview.rooms?.assigned || 0],
                  ['Mükerrer satır', preview.duplicateRows || 0],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: 'var(--surface2)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '20px', fontWeight: 700 }}>{val}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{label}</div>
                  </div>
                ))}
              </div>
              {preview.fuzzyMatched?.length > 0 && (
                <div className="alert alert-info" style={{ fontSize: '11px' }}>
                  <span>≈</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{preview.fuzzyMatched.length} yazım-farkı eşleşmesi (atlanır):</div>
                    {preview.fuzzyMatched.slice(0, 5).map((f, i) => (
                      <div key={i}>{f.excelName} → {f.matchedTo}</div>
                    ))}
                  </div>
                </div>
              )}
              {preview.invalidTc?.length > 0 && (
                <div className="alert alert-danger" style={{ fontSize: '11px' }}>
                  <span>!</span>
                  <span>{preview.invalidTc.length} geçersiz TC (kişi TC'siz kaydedilir): {preview.invalidTc.slice(0, 5).map(t => t.name).join(', ')}</span>
                </div>
              )}
              {preview.rooms?.warnings?.length > 0 && (
                <div className="alert alert-danger" style={{ fontSize: '11px' }}>
                  <span>!</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{preview.rooms.warnings.length} oda uyarısı (kişi yine kaydedilir, atama yapılmaz):</div>
                    {preview.rooms.warnings.slice(0, 8).map((w, i) => <div key={i}>{w.name}: {w.message}</div>)}
                  </div>
                </div>
              )}
              {preview.genderUnknown?.length > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                  {preview.genderUnknown.length} kişide cinsiyet tahmin edilemedi (boş kalır)
                </div>
              )}
            </div>
          )}

          {/* Sonuç */}
          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="alert alert-success">
                <span>+</span>
                <span>{result.created?.length || 0} sakin kaydedildi, {result.rooms?.assigned || 0} oda ataması yapıldı</span>
              </div>
              {undone ? (
                <div className="alert alert-info"><span>↩</span><span>İçe aktarım geri alındı.</span></div>
              ) : result.batchId ? (
                <button onClick={() => undoMut.mutate(result.batchId)} disabled={undoMut.isPending}
                  className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>
                  {undoMut.isPending ? 'GERİ ALINIYOR...' : '↩ BU İÇE AKTARIMI GERİ AL'}
                </button>
              ) : null}
            </div>
          )}

          {mutError && (
            <div className="alert alert-danger" style={{ marginTop: '10px' }}>
              <span>!</span>
              <span>{mutError?.response?.data?.error || 'İşlem hatası'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: '8px', justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} className="btn btn-ghost">KAPAT</button>
          {preview && !result && (
            <button
              onClick={() => applyMut.mutate(rows)}
              disabled={applyMut.isPending || dryRunMut.isPending || (preview.created?.length || 0) === 0}
              className="btn btn-primary"
              style={{ opacity: applyMut.isPending ? 0.6 : 1 }}
            >
              {applyMut.isPending ? 'YÜKLENİYOR...' : `${preview.created?.length || 0} KAYDI İÇE AKTAR`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
