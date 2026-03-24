import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

const EXPECTED_FIELDS = ['full_name', 'tc_no', 'passport_no', 'company', 'job_title', 'hometown', 'phone_number', 'gender']

function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(/[,;\t]/).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = line.split(/[,;\t]/).map(v => v.trim().replace(/^["']|["']$/g, ''))
    const row = {}
    headers.forEach((h, i) => { row[h] = values[i] || '' })
    return row
  })
}

export default function CsvImport({ onClose }) {
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState(null)
  const fileRef = useRef()
  const qc = useQueryClient()

  const importMut = useMutation({
    mutationFn: (data) => api.post('/checkin/import-csv', { rows: data }).then(r => r.data),
    onSuccess: (data) => {
      setResult(data)
      qc.invalidateQueries()
    },
  })

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result)
      setRows(parsed)
    }
    reader.readAsText(file, 'UTF-8')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />
      <div style={{
        position: 'relative', width: '640px', maxHeight: '80vh',
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
              CSV TOPLU KAYIT
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '1px', marginTop: '2px' }}>
              PERSONEL TOPLU YUKLEME
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer',
          }}>x</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {/* File select */}
          <div style={{ marginBottom: '16px' }}>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
              {fileName ? `${fileName} (${rows.length} satir)` : 'CSV DOSYA SEC'}
            </button>
          </div>

          {/* Format info */}
          {rows.length === 0 && !result && (
            <div className="alert alert-info" style={{ marginBottom: '14px' }}>
              <span>i</span>
              <div>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Beklenen CSV formatı:</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', lineHeight: 1.8 }}>
                  {EXPECTED_FIELDS.join(', ')}
                </div>
                <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text3)' }}>
                  Ayirici: virgul, noktali virgul veya tab
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && !result && (
            <>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginBottom: '8px', letterSpacing: '1px' }}>
                ONIZLEME ({rows.length} KAYIT)
              </div>
              <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>AD SOYAD</th>
                      <th>TC</th>
                      <th>FIRMA</th>
                      <th>MESLEK</th>
                      <th>TELEFON</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>{i + 1}</td>
                        <td style={{ fontWeight: 500 }}>{r.full_name || '-'}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{r.tc_no || '-'}</td>
                        <td>{r.company || '-'}</td>
                        <td>{r.job_title || '-'}</td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{r.phone_number || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 20 && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', padding: '8px', textAlign: 'center' }}>
                    ... ve {rows.length - 20} satir daha
                  </div>
                )}
              </div>
            </>
          )}

          {/* Result */}
          {result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="alert alert-success">
                <span>+</span>
                <span>{result.success} personel basariyla kaydedildi</span>
              </div>
              {result.errors?.length > 0 && (
                <div className="alert alert-danger">
                  <span>!</span>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{result.errors.length} hata:</div>
                    {result.errors.slice(0, 10).map((e, i) => (
                      <div key={i} style={{ fontSize: '11px', marginBottom: '2px' }}>{e}</div>
                    ))}
                    {result.errors.length > 10 && (
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
                        ... ve {result.errors.length - 10} hata daha
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {importMut.isError && (
            <div className="alert alert-danger" style={{ marginTop: '10px' }}>
              <span>!</span>
              <span>{importMut.error?.response?.data?.error || 'Import hatasi'}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: '8px', justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} className="btn btn-ghost">KAPAT</button>
          {rows.length > 0 && !result && (
            <button
              onClick={() => importMut.mutate(rows)}
              disabled={importMut.isPending}
              className="btn btn-primary"
              style={{ opacity: importMut.isPending ? 0.6 : 1 }}
            >
              {importMut.isPending ? 'YUKLENIYOR...' : `${rows.length} KAYDI YUKLE`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
