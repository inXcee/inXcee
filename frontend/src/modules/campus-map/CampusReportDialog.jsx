import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import {
  DEFAULT_CAMPUS_REPORT_OPTIONS,
  campusDetailedReportSections,
  exportCampusReportExcel,
  openCampusReportPrint,
} from './logic/campusReportExport.js'

const box = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface2)',
  padding: 10,
}

const label = {
  display: 'block',
  fontFamily: 'var(--mono)',
  fontSize: 8,
  color: 'var(--text3)',
  letterSpacing: 1,
  marginBottom: 5,
}

const input = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 6,
  background: 'var(--surface)',
  color: 'var(--text)',
  padding: '8px 9px',
  fontSize: 11,
}

const SECTION_OPTIONS = [
  ['summary', 'Blok özeti', 'Doluluk, yatak, arıza ve temizlik KPI’ları'],
  ['rooms', 'Oda oda durum', 'Kat, kapasite, aktif ve boş yatak'],
  ['people', 'Kişi yerleşim listesi', 'Kim, hangi blok/oda/yatakta'],
  ['companies', 'Firma dağılımı', 'Firma başına kişi, oda ve blok'],
  ['attention', 'Dikkat kuyruğu', 'Arıza, doluluk ve karantina uyarıları'],
]

function Toggle({ checked, onChange, title, description, disabled = false }) {
  return (
    <label style={{
      display: 'flex',
      gap: 8,
      alignItems: 'flex-start',
      padding: '7px 8px',
      borderRadius: 6,
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'not-allowed' : 'pointer',
      background: checked ? 'rgba(245,158,11,.09)' : 'transparent',
    }}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} style={{ marginTop: 2 }} />
      <span>
        <strong style={{ display: 'block', fontSize: 10, color: 'var(--text)' }}>{title}</strong>
        {description && <span style={{ display: 'block', marginTop: 2, fontSize: 9, color: 'var(--text3)' }}>{description}</span>}
      </span>
    </label>
  )
}

export default function CampusReportDialog({
  stats,
  selectedBlock,
  role,
  onClose,
  onExportExcel = exportCampusReportExcel,
  onPrint = openCampusReportPrint,
}) {
  const addToast = useToastStore(state => state.addToast)
  const [scope, setScope] = useState(selectedBlock ? 'block' : 'campus')
  const [format, setFormat] = useState('excel')
  const [options, setOptions] = useState(DEFAULT_CAMPUS_REPORT_OPTIONS)
  const [busy, setBusy] = useState(false)
  const block = scope === 'block' ? selectedBlock : null
  const canReport = role === 'campus_manager' || role === 'shift_supervisor'

  const query = useQuery({
    queryKey: ['campus-report-data', block || 'campus'],
    queryFn: () => api.get('/campus-map/report-data', {
      params: block ? { block } : undefined,
    }).then(response => response.data),
    enabled: canReport && (scope === 'campus' || Boolean(block)),
    staleTime: 20_000,
  })

  const effectiveStats = useMemo(() => (
    block && stats[block] ? { [block]: stats[block] } : stats
  ), [block, stats])
  const effectiveOptions = useMemo(() => ({
    ...options,
    includeContact: Boolean(options.includeContact && query.data?.permissions?.contact_details),
  }), [options, query.data?.permissions?.contact_details])
  const preview = useMemo(() => campusDetailedReportSections(
    effectiveStats,
    query.data?.rooms || [],
    effectiveOptions,
  ), [effectiveOptions, effectiveStats, query.data?.rooms])
  const selectedSectionCount = Object.values(options.sections).filter(Boolean).length

  const setSection = (key, checked) => setOptions(current => ({
    ...current,
    sections: { ...current.sections, [key]: checked },
  }))
  const setOption = (key, value) => setOptions(current => ({ ...current, [key]: value }))

  const generate = async () => {
    if (!selectedSectionCount) {
      addToast('En az bir rapor bölümü seçin', 'error')
      return
    }
    if (!query.data) {
      addToast('Rapor verisi henüz hazır değil', 'error')
      return
    }
    setBusy(true)
    const today = new Date().toLocaleDateString('sv-SE')
    const config = {
      block,
      rooms: query.data.rooms,
      options: effectiveOptions,
    }
    try {
      if (format === 'excel') await onExportExcel(effectiveStats, today, config)
      else onPrint(effectiveStats, today, config)
      addToast(`${format === 'excel' ? 'Excel' : 'PDF'} raporu hazırlandı`, 'success')
      onClose()
    } catch (error) {
      addToast(error?.message || 'Rapor oluşturulamadı', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kampüs raporu oluştur"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2100,
        display: 'grid',
        placeItems: 'center',
        padding: 14,
        background: 'rgba(2,6,23,.76)',
      }}
    >
      <div style={{
        width: 'min(760px, 100%)',
        maxHeight: '92vh',
        overflowY: 'auto',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 24px 70px rgba(0,0,0,.45)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 15px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <strong style={{ display: 'block', fontFamily: 'var(--display)', fontSize: 20, letterSpacing: 1 }}>
              RAPOR OLUŞTUR
            </strong>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text3)', letterSpacing: 1 }}>
              KAPSAMI, İÇERİĞİ VE ÇIKTI TÜRÜNÜ SEÇ
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Rapor penceresini kapat" style={{
            marginLeft: 'auto', border: '1px solid var(--border)', borderRadius: 6,
            background: 'transparent', color: 'var(--text3)', padding: '6px 9px', cursor: 'pointer',
          }}>✕</button>
        </div>

        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={box}>
              <span style={label}>RAPOR ADI</span>
              <input
                aria-label="Rapor adı"
                value={options.title}
                maxLength={80}
                onChange={event => setOption('title', event.target.value)}
                style={input}
              />
            </div>

            <div style={box}>
              <span style={label}>KAPSAM</span>
              <label style={{ display: 'flex', gap: 7, fontSize: 10, marginBottom: 7 }}>
                <input type="radio" name="scope" checked={scope === 'campus'} onChange={() => setScope('campus')} />
                Tüm kampüs
              </label>
              <label style={{ display: 'flex', gap: 7, fontSize: 10, opacity: selectedBlock ? 1 : 0.45 }}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'block'}
                  disabled={!selectedBlock}
                  onChange={() => setScope('block')}
                />
                Seçili blok {selectedBlock ? `(${selectedBlock})` : ''}
              </label>
            </div>

            <div style={box}>
              <span style={label}>ÇIKTI TÜRÜ</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                {[
                  ['excel', '▦ Excel', 'Çok sayfalı ve filtrelenebilir'],
                  ['pdf', '▤ PDF', 'Yazdırmaya hazır görünüm'],
                ].map(([id, title, description]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFormat(id)}
                    aria-pressed={format === id}
                    style={{
                      ...box,
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--text)',
                      borderColor: format === id ? 'var(--accent)' : 'var(--border)',
                      background: format === id ? 'rgba(245,158,11,.11)' : 'var(--surface2)',
                    }}
                  >
                    <strong style={{ display: 'block', fontSize: 11 }}>{title}</strong>
                    <span style={{ display: 'block', marginTop: 3, fontSize: 8, color: 'var(--text3)' }}>{description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={box}>
              <span style={label}>DETAY SEÇENEKLERİ</span>
              <Toggle
                checked={options.includeEmptyRooms}
                onChange={event => setOption('includeEmptyRooms', event.target.checked)}
                title="Boş odaları dahil et"
              />
              <Toggle
                checked={options.onlyActiveRooms}
                onChange={event => setOption('onlyActiveRooms', event.target.checked)}
                title="Yalnız aktif odalar"
              />
              <Toggle
                checked={options.includeNotes}
                onChange={event => setOption('includeNotes', event.target.checked)}
                title="Oda notlarını dahil et"
              />
              <Toggle
                checked={options.includeContact}
                disabled={!query.data?.permissions?.contact_details}
                onChange={event => setOption('includeContact', event.target.checked)}
                title="Telefon bilgisini dahil et"
                description={query.data?.permissions?.contact_details ? 'Yalnız bu raporda gösterilir' : 'Yalnız kampüs müdürü kullanabilir'}
              />
              <span style={{ ...label, marginTop: 8 }}>KİŞİ SIRALAMASI</span>
              <select
                aria-label="Kişi sıralaması"
                value={options.peopleSort}
                onChange={event => setOption('peopleSort', event.target.value)}
                style={input}
              >
                <option value="room">Blok, oda ve yatak</option>
                <option value="name">Ad soyad</option>
                <option value="company">Firma ve ad soyad</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={box}>
              <span style={label}>RAPOR BÖLÜMLERİ</span>
              {SECTION_OPTIONS.map(([key, title, description]) => (
                <Toggle
                  key={key}
                  checked={options.sections[key]}
                  onChange={event => setSection(key, event.target.checked)}
                  title={title}
                  description={description}
                />
              ))}
            </div>

            <div style={{ ...box, borderColor: 'rgba(56,189,248,.35)' }}>
              <span style={label}>CANLI ÖNİZLEME</span>
              {query.isLoading ? (
                <div style={{ color: 'var(--text3)', fontSize: 10 }}>Rapor verisi hazırlanıyor…</div>
              ) : query.isError ? (
                <div style={{ color: '#ef4444', fontSize: 10 }}>Rapor verisi alınamadı.</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {[
                      ['ODA', preview.counts.rooms],
                      ['KİŞİ', preview.counts.people],
                      ['FİRMA', preview.counts.companies],
                    ].map(([title, value]) => (
                      <div key={title} style={{ textAlign: 'center', padding: 8, borderRadius: 6, background: 'var(--surface)' }}>
                        <strong style={{ display: 'block', color: '#38bdf8', fontSize: 18 }}>{value}</strong>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 7 }}>{title}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text3)', lineHeight: 1.5 }}>
                    {selectedSectionCount} bölüm · {scope === 'block' ? `${selectedBlock} bloğu` : 'tüm kampüs'}
                    <br />
                    Seçtiğiniz kapsam ve bölümler çıktıya aynen uygulanır.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '11px 14px', borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={onClose} style={{
            border: '1px solid var(--border)', borderRadius: 6, background: 'transparent',
            color: 'var(--text2)', padding: '8px 12px', cursor: 'pointer',
          }}>Vazgeç</button>
          <button
            type="button"
            disabled={busy || query.isLoading || query.isError || !selectedSectionCount}
            onClick={generate}
            style={{
              border: 0, borderRadius: 6, background: 'var(--accent)', color: '#111827',
              padding: '8px 14px', cursor: 'pointer', fontWeight: 700,
              opacity: busy || query.isLoading || query.isError || !selectedSectionCount ? 0.55 : 1,
            }}
          >
            {busy ? 'Hazırlanıyor…' : `${format === 'excel' ? 'Excel' : 'PDF'} oluştur`}
          </button>
        </div>
      </div>
    </div>
  )
}
