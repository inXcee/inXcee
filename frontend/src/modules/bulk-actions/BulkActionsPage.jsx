import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { useToastStore } from '../../shared/store/toastStore.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { BLOCKS } from '../../shared/blocks.js'
import EmptyState from '../../shared/components/EmptyState.jsx'
import { useSavedFilters, SavedFiltersBar } from '../../shared/hooks/useSavedFilters.jsx'

const EMPTY_FILTERS = {
  block: '', floor: '', company: '', company_id: '', q: '',
  shift_type: '', gender: '', check_in_from: '', check_in_to: '',
  is_blacklisted: '', has_zimmet: '', unassigned: '', discipline_min: '',
}

const SORTS = [
  { key: 'block', label: 'Blok/Oda' },
  { key: 'name', label: 'Ad Soyad' },
  { key: 'company', label: 'Firma' },
  { key: 'check_in', label: 'Giriş Tarihi' },
  { key: 'zimmet', label: 'Zimmet' },
  { key: 'discipline', label: 'Disiplin' },
]

function fmtDate(s) {
  if (!s) return '-'
  try { return new Date(s).toLocaleDateString('tr-TR') } catch { return s }
}

function daysSince(s) {
  if (!s) return null
  return Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
}

export default function BulkActionsPage() {
  const qc = useQueryClient()
  const toast = useToastStore(s => s.push)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [sort, setSort] = useState({ key: 'block', dir: 'asc' })
  const [selected, setSelected] = useState(new Set())
  const [advanced, setAdvanced] = useState(false)
  const [report, setReport] = useState(null)
  const [actionPanel, setActionPanel] = useState(null) // 'transfer'|'shift'|'blacklist'|'discipline'|'company'|'whatsapp'|null
  const [actionForm, setActionForm] = useState({})
  const [detailId, setDetailId] = useState(null)
  const [viewMode, setViewMode] = useState(() => window.innerWidth < 768 ? 'cards' : 'table')

  const sf = useSavedFilters('bulk-actions', filters, setFilters)
  const hasActiveFilter = Object.values(filters).some(v => v !== '' && v != null)

  const params = useMemo(() => {
    const sp = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v != null) sp.set(k, v) })
    if (sort.key) { sp.set('sort', sort.key); sp.set('sort_dir', sort.dir) }
    return sp.toString()
  }, [filters, sort])

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ['bulk-personnel', params],
    queryFn: () => api.get(`/bulk-actions/personnel?${params}`).then(r => r.data),
  })
  const { data: stats } = useQuery({
    queryKey: ['bulk-stats', params],
    queryFn: () => api.get(`/bulk-actions/stats?${params}`).then(r => r.data),
  })
  const { data: companies = [] } = useQuery({
    queryKey: ['bulk-companies'],
    queryFn: () => api.get('/companies?active=1').then(r => r.data),
  })

  const allIds = useMemo(() => rows.map(r => r.id), [rows])
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id))
  const someSelected = !allSelected && allIds.some(id => selected.has(id))

  function toggle(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() { setSelected(allSelected ? new Set() : new Set(allIds)) }
  function invert() { setSelected(new Set(allIds.filter(id => !selected.has(id)))) }
  function clearSelection() { setSelected(new Set()) }

  function setSortKey(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ['bulk-personnel'] })
    qc.invalidateQueries({ queryKey: ['bulk-stats'] })
  }

  function makeActionMut(endpoint, buildBody, onSuccessMsg) {
    return useMutation({
      mutationFn: () => api.post(`/bulk-actions/${endpoint}`, buildBody()).then(r => r.data),
      onSuccess: (data) => {
        setReport(data)
        setSelected(new Set())
        setActionPanel(null)
        setActionForm({})
        refresh()
        toast({ kind: 'success', text: `${data.success.length} ${onSuccessMsg}, ${data.skipped.length} atlandı` })
      },
      onError: (e) => toast({ kind: 'error', text: e.response?.data?.error || 'Hata' }),
    })
  }

  const checkoutMut = makeActionMut('checkout', () => ({ ids: [...selected] }), 'kişi çıkış yaptı')
  const transferMut = makeActionMut('transfer', () => ({ ids: [...selected], target_block: actionForm.target_block }), 'kişi taşındı')
  const shiftMut = makeActionMut('set-shift', () => ({ ids: [...selected], shift_type: actionForm.shift_type }), 'kişi vardiya güncellendi')
  const blacklistAddMut = makeActionMut('blacklist', () => ({ ids: [...selected], blacklisted: true, reason: actionForm.reason }), 'kişi kara listeye alındı')
  const blacklistRemMut = makeActionMut('blacklist', () => ({ ids: [...selected], blacklisted: false }), 'kişi kara listeden çıkarıldı')
  const disciplineMut = makeActionMut('discipline', () => ({ ids: [...selected], points: +actionForm.points, reason: actionForm.reason }), 'kişiye disiplin puanı eklendi')
  const companyMut = makeActionMut('set-company', () => ({ ids: [...selected], company_id: actionForm.company_id || null }), 'kişi firma güncellendi')
  const whatsappMut = makeActionMut('whatsapp', () => ({ ids: [...selected], message: actionForm.message }), 'kişiye mesaj gönderildi')

  const { data: detail } = useQuery({
    queryKey: ['bulk-detail', detailId],
    queryFn: () => api.get(`/bulk-actions/detail/${detailId}`).then(r => r.data),
    enabled: !!detailId,
  })

  async function handleCheckout() {
    const withZ = rows.filter(r => selected.has(r.id) && r.unreturned_zimmet > 0).length
    const ok = await confirmDialog({
      title: 'Toplu Çıkış',
      body: `${selected.size} kişi için çıkış işlemi yapılacak.${withZ ? ` ${withZ} kişinin zimmeti var, atlanacak.` : ''} Devam edilsin mi?`,
      confirmLabel: 'Çıkışı Yap', danger: true,
    })
    if (ok) checkoutMut.mutate()
  }

  function openAction(name) {
    setActionPanel(name)
    setActionForm(
      name === 'transfer' ? { target_block: '' } :
      name === 'shift' ? { shift_type: 'day' } :
      name === 'blacklist' ? { mode: 'add', reason: '' } :
      name === 'discipline' ? { points: 5, reason: '' } :
      name === 'company' ? { company_id: '' } :
      name === 'whatsapp' ? { message: '' } : {}
    )
  }

  const selectedWithPhone = useMemo(() => rows.filter(r => selected.has(r.id) && r.phone_number).length, [rows, selected])

  async function exportCsv() {
    const res = await api.get(`/bulk-actions/export?${params}`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `sakinler-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 22, letterSpacing: 4 }}>TOPLU İŞLEM</h2>
          <p style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2 }}>
            FILTRELI ARAMA · COKLU SECIM · 7 TOPLU AKSIYON
          </p>
        </div>
      </div>

      {/* Mini stats üst bar */}
      {stats && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <MiniStat label="Toplam" value={stats.total} />
          <MiniStat label="Gündüz" value={stats.by_shift.day} color="#eab308" />
          <MiniStat label="Gece" value={stats.by_shift.night} color="#3b82f6" />
          <MiniStat label="Zimmetli" value={stats.with_zimmet} color={stats.with_zimmet > 0 ? 'var(--red, #ef4444)' : 'var(--text3)'} />
          <MiniStat label="Kara liste" value={stats.blacklisted} color={stats.blacklisted > 0 ? 'var(--red, #ef4444)' : 'var(--text3)'} />
          <MiniStat label="Ort. disiplin" value={stats.avg_discipline} />
          {stats.by_block.slice(0, 4).map(b => (
            <MiniStat key={b.block} label={b.block} value={b.n} small />
          ))}
        </div>
      )}

      {/* Filtre paneli */}
      <div className="panel" style={{ marginBottom: 12 }}>
        <div style={{ height: 2, background: 'var(--accent)' }} />
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="panel-title">FİLTRE</div>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={() => setAdvanced(a => !a)}>
            {advanced ? '▴ Gelişmiş gizle' : '▾ Gelişmiş filtre'}
          </button>
          {hasActiveFilter && (
            <button className="btn btn-ghost btn-sm" onClick={() => setFilters(EMPTY_FILTERS)}>✕ Temizle</button>
          )}
        </div>
        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: advanced ? 8 : 0 }}>
            <FilterField label="ARAMA (isim/TC/oda/meslek)">
              <input className="form-input" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} />
            </FilterField>
            <FilterField label="BLOK">
              <select className="form-select" value={filters.block} onChange={e => setFilters(f => ({ ...f, block: e.target.value }))}>
                <option value="">Hepsi</option>
                {BLOCKS.map(b => <option key={b.block} value={b.block}>{b.block}</option>)}
              </select>
            </FilterField>
            <FilterField label="KAT">
              <input className="form-input" type="number" min={1} max={3} value={filters.floor} onChange={e => setFilters(f => ({ ...f, floor: e.target.value }))} />
            </FilterField>
            <FilterField label="FİRMA">
              <select className="form-select" value={filters.company_id} onChange={e => setFilters(f => ({ ...f, company_id: e.target.value, company: '' }))}>
                <option value="">Hepsi</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FilterField>
            <FilterField label="VARDİYA">
              <select className="form-select" value={filters.shift_type} onChange={e => setFilters(f => ({ ...f, shift_type: e.target.value }))}>
                <option value="">Hepsi</option>
                <option value="day">Gündüz</option>
                <option value="night">Gece</option>
              </select>
            </FilterField>
          </div>

          {advanced && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
              <FilterField label="CİNSİYET">
                <select className="form-select" value={filters.gender} onChange={e => setFilters(f => ({ ...f, gender: e.target.value }))}>
                  <option value="">Hepsi</option>
                  <option value="male">Erkek</option>
                  <option value="female">Kadın</option>
                </select>
              </FilterField>
              <FilterField label="GİRİŞ (Başlangıç)">
                <input className="form-input" type="date" value={filters.check_in_from} onChange={e => setFilters(f => ({ ...f, check_in_from: e.target.value }))} />
              </FilterField>
              <FilterField label="GİRİŞ (Bitiş)">
                <input className="form-input" type="date" value={filters.check_in_to} onChange={e => setFilters(f => ({ ...f, check_in_to: e.target.value }))} />
              </FilterField>
              <FilterField label="ZİMMET">
                <select className="form-select" value={filters.has_zimmet} onChange={e => setFilters(f => ({ ...f, has_zimmet: e.target.value }))}>
                  <option value="">Hepsi</option>
                  <option value="1">Zimmeti olanlar</option>
                  <option value="0">Zimmeti olmayanlar</option>
                </select>
              </FilterField>
              <FilterField label="KARA LİSTE">
                <select className="form-select" value={filters.is_blacklisted} onChange={e => setFilters(f => ({ ...f, is_blacklisted: e.target.value }))}>
                  <option value="">Hepsi</option>
                  <option value="1">Sadece kara liste</option>
                  <option value="0">Kara liste hariç</option>
                </select>
              </FilterField>
              <FilterField label="ODA DURUMU">
                <select className="form-select" value={filters.unassigned} onChange={e => setFilters(f => ({ ...f, unassigned: e.target.value }))}>
                  <option value="">Hepsi</option>
                  <option value="1">Atanmamış</option>
                  <option value="0">Atanmış</option>
                </select>
              </FilterField>
              <FilterField label="MİN. DİSİPLİN PUANI">
                <input className="form-input" type="number" min={0} value={filters.discipline_min} onChange={e => setFilters(f => ({ ...f, discipline_min: e.target.value }))} />
              </FilterField>
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <SavedFiltersBar presets={sf.presets} onApply={sf.apply} onSave={sf.save} onRemove={sf.remove} hasActiveFilter={hasActiveFilter} />
          </div>
        </div>
      </div>

      {/* Action toolbar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8,
        padding: '8px 12px', background: selected.size > 0 ? 'rgba(240,165,0,.06)' : 'var(--surface2)',
        border: '1px solid ' + (selected.size > 0 ? 'var(--accent)' : 'var(--border)'),
        borderRadius: 6, transition: 'all 0.15s',
      }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
          {isFetching ? 'Yükleniyor...' : `${rows.length} kayıt`}
        </span>
        <span style={{ color: 'var(--text3)' }}>·</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: selected.size > 0 ? 'var(--accent)' : 'var(--text3)' }}>
          {selected.size} seçili
        </span>
        {selected.size > 0 && (
          <>
            <button onClick={invert} style={miniBtn}>Tersini al</button>
            <button onClick={clearSelection} style={miniBtn}>Seçimi temizle</button>
          </>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', gap: 0, marginRight: 4 }}>
          <button onClick={() => setViewMode('table')} style={{ ...miniBtn, borderRadius: '4px 0 0 4px',
            background: viewMode === 'table' ? 'var(--accent)' : 'transparent',
            color: viewMode === 'table' ? '#000' : 'var(--text3)',
          }} title="Tablo">≡</button>
          <button onClick={() => setViewMode('cards')} style={{ ...miniBtn, borderRadius: '0 4px 4px 0', borderLeft: 'none',
            background: viewMode === 'cards' ? 'var(--accent)' : 'transparent',
            color: viewMode === 'cards' ? '#000' : 'var(--text3)',
          }} title="Kart">▦</button>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exportCsv} title="Filtrelenmiş listeyi indir">↓ CSV</button>
        {selected.size > 0 && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => openAction('whatsapp')} style={{ color: '#25d366' }} title={selectedWithPhone ? `${selectedWithPhone} kişide telefon var` : 'Telefonu olan kimse yok'}>✉ WhatsApp</button>
            <button className="btn btn-ghost btn-sm" onClick={() => openAction('transfer')}>⇄ Transfer</button>
            <button className="btn btn-ghost btn-sm" onClick={() => openAction('shift')}>◐ Vardiya</button>
            <button className="btn btn-ghost btn-sm" onClick={() => openAction('company')}>⌂ Firma</button>
            <button className="btn btn-ghost btn-sm" onClick={() => openAction('discipline')} style={{ color: 'var(--orange, #f97316)' }}>⚠ Disiplin</button>
            <button className="btn btn-ghost btn-sm" onClick={() => openAction('blacklist')} style={{ color: 'var(--red, #ef4444)' }}>⊘ Kara liste</button>
            <button className="btn btn-primary btn-sm" disabled={checkoutMut.isPending} onClick={handleCheckout}>
              ↘ ÇIKIŞ ({selected.size})
            </button>
          </>
        )}
      </div>

      {/* Action panels */}
      {actionPanel === 'transfer' && (
        <ActionPanel title="TOPLU TRANSFER" onCancel={() => setActionPanel(null)}>
          <label className="form-label">HEDEF BLOK</label>
          <select className="form-select" value={actionForm.target_block || ''} onChange={e => setActionForm(f => ({ ...f, target_block: e.target.value }))}>
            <option value="">— seç —</option>
            {BLOCKS.map(b => <option key={b.block} value={b.block}>{b.block}</option>)}
          </select>
          <div style={hintStyle}>Blok içinde boş yataklara otomatik dağıtılır. Vardiya/kapasite uyumsuzlukları atlanır.</div>
          <button className="btn btn-primary" disabled={!actionForm.target_block || transferMut.isPending} onClick={() => transferMut.mutate()}>
            {transferMut.isPending ? 'TAŞINIYOR...' : `${selected.size} KİŞİYİ TAŞI`}
          </button>
        </ActionPanel>
      )}

      {actionPanel === 'shift' && (
        <ActionPanel title="TOPLU VARDİYA DEĞİŞTİR" onCancel={() => setActionPanel(null)}>
          <label className="form-label">YENİ VARDİYA</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['day', 'night'].map(s => (
              <label key={s} style={{
                flex: 1, padding: 10, borderRadius: 6, cursor: 'pointer',
                background: actionForm.shift_type === s ? 'rgba(240,165,0,.15)' : 'var(--surface2)',
                border: '1px solid ' + (actionForm.shift_type === s ? 'var(--accent)' : 'var(--border)'),
                textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 12,
              }}>
                <input type="radio" name="shift" value={s} checked={actionForm.shift_type === s}
                  onChange={() => setActionForm(f => ({ ...f, shift_type: s }))} style={{ display: 'none' }} />
                {s === 'day' ? '☀ Gündüz (07:00–19:00)' : '☾ Gece (19:00–07:00)'}
              </label>
            ))}
          </div>
          <div style={hintStyle}>Aynı odada farklı vardiya yapısı varsa transfer ayrıca gerekebilir.</div>
          <button className="btn btn-primary" disabled={!actionForm.shift_type || shiftMut.isPending} onClick={() => shiftMut.mutate()}>
            {shiftMut.isPending ? 'KAYDEDİLİYOR...' : `${selected.size} KİŞİYİ AKTAR`}
          </button>
        </ActionPanel>
      )}

      {actionPanel === 'company' && (
        <ActionPanel title="TOPLU FİRMA ATAMA" onCancel={() => setActionPanel(null)}>
          <label className="form-label">YENİ FİRMA</label>
          <select className="form-select" value={actionForm.company_id || ''} onChange={e => setActionForm(f => ({ ...f, company_id: e.target.value }))}>
            <option value="">— Firma kaldır —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={hintStyle}>Kayıtlı firma seçilirse personel kayıtlarında hem id hem isim güncellenir.</div>
          <button className="btn btn-primary" disabled={companyMut.isPending} onClick={() => companyMut.mutate()}>
            {companyMut.isPending ? 'KAYDEDİLİYOR...' : 'UYGULA'}
          </button>
        </ActionPanel>
      )}

      {actionPanel === 'discipline' && (
        <ActionPanel title="TOPLU DİSİPLİN PUANI" onCancel={() => setActionPanel(null)}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">PUAN</label>
              <input className="form-input" type="number" min={1} max={100} value={actionForm.points || ''} onChange={e => setActionForm(f => ({ ...f, points: e.target.value }))} />
            </div>
            <div style={{ flex: 3 }}>
              <label className="form-label">SEBEP *</label>
              <input className="form-input" value={actionForm.reason || ''} onChange={e => setActionForm(f => ({ ...f, reason: e.target.value }))} placeholder="Disiplin gerekçesi" />
            </div>
          </div>
          <div style={hintStyle}>Her seçili kişiye aynı puan eklenir. Disiplin kayıtlarına gider.</div>
          <button className="btn btn-primary" disabled={!actionForm.points || !actionForm.reason || disciplineMut.isPending} onClick={() => disciplineMut.mutate()}>
            {disciplineMut.isPending ? 'KAYDEDİLİYOR...' : `+${actionForm.points || 0} PUAN UYGULA`}
          </button>
        </ActionPanel>
      )}

      {actionPanel === 'whatsapp' && (
        <ActionPanel title="TOPLU WHATSAPP MESAJI" onCancel={() => setActionPanel(null)}>
          <label className="form-label">MESAJ (en az 3 karakter, en fazla 1000)</label>
          <textarea
            className="form-input"
            rows={4}
            value={actionForm.message || ''}
            onChange={e => setActionForm(f => ({ ...f, message: e.target.value }))}
            placeholder="Sayın sakinler, yarın 14:00'te yangın tatbikatı yapılacaktır..."
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
            <span>{selectedWithPhone}/{selected.size} kişide telefon var · {selected.size - selectedWithPhone} atlanacak</span>
            <span>{(actionForm.message || '').length}/1000</span>
          </div>
          <div style={hintStyle}>Mesaj başına otomatik [YYS] etiketi eklenir. WhatsApp Cloud API üzerinden tek tek gönderilir.</div>
          <button className="btn btn-primary"
            disabled={!actionForm.message || actionForm.message.length < 3 || whatsappMut.isPending}
            onClick={() => whatsappMut.mutate()}
            style={{ background: '#25d366', borderColor: '#25d366', color: '#fff' }}>
            {whatsappMut.isPending ? 'GÖNDERİLİYOR...' : `${selectedWithPhone} KİŞİYE GÖNDER`}
          </button>
        </ActionPanel>
      )}

      {actionPanel === 'blacklist' && (
        <ActionPanel title="TOPLU KARA LİSTE" onCancel={() => setActionPanel(null)}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              className={`btn ${actionForm.mode === 'add' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActionForm(f => ({ ...f, mode: 'add' }))}
            >+ Kara listeye al</button>
            <button
              className={`btn ${actionForm.mode === 'remove' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActionForm(f => ({ ...f, mode: 'remove' }))}
            >− Kara listeden çıkar</button>
          </div>
          {actionForm.mode === 'add' && (
            <>
              <label className="form-label">SEBEP *</label>
              <input className="form-input" value={actionForm.reason || ''} onChange={e => setActionForm(f => ({ ...f, reason: e.target.value }))} placeholder="Kara liste sebebi (en az 3 karakter)" />
              <div style={hintStyle}>Kara listedeki kişiler tekrar girişte uyarıyla kabul edilir veya engellenir.</div>
              <button className="btn btn-primary" disabled={!actionForm.reason || blacklistAddMut.isPending} onClick={() => blacklistAddMut.mutate()}
                style={{ background: 'var(--red, #ef4444)', color: '#fff', borderColor: 'var(--red, #ef4444)' }}>
                {blacklistAddMut.isPending ? 'EKLENİYOR...' : `${selected.size} KİŞİYİ KARA LİSTEYE AL`}
              </button>
            </>
          )}
          {actionForm.mode === 'remove' && (
            <>
              <div style={hintStyle}>Seçili kişiler kara listeden çıkarılacak. Geçmiş sebep kaydı temizlenir.</div>
              <button className="btn btn-primary" disabled={blacklistRemMut.isPending} onClick={() => blacklistRemMut.mutate()}>
                {blacklistRemMut.isPending ? 'ÇIKARILIYOR...' : `${selected.size} KİŞİYİ ÇIKAR`}
              </button>
            </>
          )}
        </ActionPanel>
      )}

      {/* Tablo */}
      <div className="panel">
        <div style={{ height: 2, background: 'var(--accent)' }} />
        <div className="panel-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="panel-title">SAKİNLER</div>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 1 }}>SIRALA:</span>
          {SORTS.map(s => (
            <button key={s.key} onClick={() => setSortKey(s.key)} style={{
              padding: '3px 8px', fontSize: 10, fontFamily: 'var(--mono)',
              background: sort.key === s.key ? 'var(--accent)' : 'transparent',
              color: sort.key === s.key ? '#000' : 'var(--text3)',
              border: '1px solid ' + (sort.key === s.key ? 'var(--accent)' : 'var(--border)'),
              borderRadius: 4, cursor: 'pointer',
            }}>{s.label}{sort.key === s.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button>
          ))}
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {viewMode === 'cards' ? (
            <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8, maxHeight: '60vh', overflow: 'auto' }}>
              {rows.length === 0 && !isFetching && (
                <div style={{ gridColumn: '1/-1' }}>
                  <EmptyState icon="∅" title="Eşleşen kayıt yok" hint={hasActiveFilter ? 'Filtreleri gevşetmeyi deneyin' : 'Aktif sakin yok'} />
                </div>
              )}
              {rows.map(r => {
                const isSel = selected.has(r.id)
                const days = daysSince(r.check_in_date)
                return (
                  <div key={r.id} onClick={() => toggle(r.id)}
                    style={{
                      padding: 12, borderRadius: 8, cursor: 'pointer',
                      border: '1px solid ' + (isSel ? 'var(--accent)' : 'var(--border)'),
                      background: isSel ? 'rgba(240,165,0,.08)' : r.is_blacklisted ? 'rgba(239,68,68,.04)' : 'var(--surface)',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <strong>{r.full_name}</strong>
                        {r.is_blacklisted && <span style={{ marginLeft: 6, color: 'var(--red, #ef4444)' }}>⊘</span>}
                        {r.gender && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text3)' }}>{r.gender === 'female' ? '♀' : '♂'}</span>}
                        <div style={{ fontSize: 10, color: 'var(--text3)' }}>{r.job_title || '-'}</div>
                      </div>
                      <input type="checkbox" checked={isSel} onChange={() => toggle(r.id)} onClick={e => e.stopPropagation()} />
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--mono)', display: 'grid', gridTemplateColumns: '70px 1fr', rowGap: 2, color: 'var(--text2)' }}>
                      <span style={{ color: 'var(--text3)' }}>Oda:</span>
                      <span>{r.block ? `${r.block}-${r.room_no}${r.bed_no ? '/' + r.bed_no : ''}` : <span style={{ color: 'var(--orange, #f97316)' }}>atanmamış</span>}</span>
                      <span style={{ color: 'var(--text3)' }}>Firma:</span>
                      <span>{r.company || '-'}</span>
                      <span style={{ color: 'var(--text3)' }}>Vardiya:</span>
                      <span style={{ color: r.shift_type === 'night' ? '#3b82f6' : '#eab308' }}>{r.shift_type === 'night' ? '☾ Gece' : '☀ Gündüz'}</span>
                      <span style={{ color: 'var(--text3)' }}>Giriş:</span>
                      <span>{fmtDate(r.check_in_date)}{days != null && ` (${days}g)`}</span>
                      {(r.unreturned_zimmet > 0 || r.discipline_points > 0) && (
                        <>
                          <span style={{ color: 'var(--text3)' }}>Risk:</span>
                          <span>
                            {r.unreturned_zimmet > 0 && <span style={{ color: 'var(--red, #ef4444)', marginRight: 6 }}>Zimmet: {r.unreturned_zimmet}</span>}
                            {r.discipline_points > 0 && <span style={{ color: r.discipline_points >= 50 ? 'var(--red)' : 'var(--orange, #f97316)' }}>Dis: {r.discipline_points}</span>}
                          </span>
                        </>
                      )}
                    </div>
                    <div style={{ marginTop: 6, textAlign: 'right' }}>
                      <button onClick={e => { e.stopPropagation(); setDetailId(r.id) }} style={miniBtn}>Detay →</button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 0, overflow: 'auto', maxHeight: '60vh' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface2)', zIndex: 1 }}>
                <tr>
                  <th style={{ width: 36, padding: 8 }}>
                    <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected }} onChange={toggleAll} />
                  </th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Ad Soyad</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>TC</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Firma</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Oda</th>
                  <th style={{ textAlign: 'center', padding: 8 }}>Vrd</th>
                  <th style={{ textAlign: 'left', padding: 8 }}>Giriş</th>
                  <th style={{ textAlign: 'center', padding: 8 }}>Zim.</th>
                  <th style={{ textAlign: 'center', padding: 8 }}>Dis.</th>
                  <th style={{ textAlign: 'center', padding: 8 }}>⚑</th>
                  <th style={{ width: 60, padding: 8 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !isFetching && (
                  <tr><td colSpan={10}><EmptyState icon="∅" title="Eşleşen kayıt yok" hint={hasActiveFilter ? 'Filtreleri gevşetmeyi deneyin' : 'Aktif sakin yok'} /></td></tr>
                )}
                {rows.map(r => {
                  const isSel = selected.has(r.id)
                  const days = daysSince(r.check_in_date)
                  return (
                    <tr key={r.id}
                      style={{
                        borderTop: '1px solid var(--border)',
                        background: isSel ? 'rgba(240,165,0,.08)' : r.is_blacklisted ? 'rgba(239,68,68,.04)' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => toggle(r.id)}
                    >
                      <td style={{ padding: 8 }}><input type="checkbox" checked={isSel} onChange={() => toggle(r.id)} onClick={e => e.stopPropagation()} /></td>
                      <td style={{ padding: 8 }}>
                        <strong>{r.full_name}</strong>
                        {r.is_blacklisted ? <span title="Kara liste" style={{ marginLeft: 6, color: 'var(--red, #ef4444)' }}>⊘</span> : null}
                        {r.gender ? <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text3)' }}>{r.gender === 'female' ? '♀' : '♂'}</span> : null}
                        {r.job_title && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{r.job_title}</div>}
                      </td>
                      <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>{r.tc_no || '-'}</td>
                      <td style={{ padding: 8, fontSize: 12 }}>
                        {r.company || '-'}
                        {r.company_id && <span title="Kayıtlı firma" style={{ marginLeft: 4, color: 'var(--green, #22c55e)', fontSize: 10 }}>✓</span>}
                      </td>
                      <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {r.block ? `${r.block}-${r.room_no}${r.bed_no ? '/' + r.bed_no : ''}` : <span style={{ color: 'var(--orange, #f97316)' }}>atanmamış</span>}
                      </td>
                      <td style={{ padding: 8, textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, color: r.shift_type === 'night' ? '#3b82f6' : '#eab308' }}>
                        {r.shift_type === 'night' ? '☾' : '☀'}
                      </td>
                      <td style={{ padding: 8, fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {fmtDate(r.check_in_date)}
                        {days != null && <div style={{ fontSize: 9, color: 'var(--text3)' }}>{days} gün</div>}
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        {r.unreturned_zimmet > 0 ? (
                          <span style={{ color: 'var(--red, #ef4444)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{r.unreturned_zimmet}</span>
                        ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                      </td>
                      <td style={{ padding: 8, textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 600,
                        color: r.discipline_points >= 50 ? 'var(--red, #ef4444)' : r.discipline_points >= 25 ? 'var(--orange, #f97316)' : 'var(--text3)' }}>
                        {r.discipline_points || 0}
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        {r.is_blacklisted && <span style={{ color: 'var(--red, #ef4444)', fontSize: 14 }} title={r.blacklist_reason}>⊘</span>}
                      </td>
                      <td style={{ padding: 8 }}>
                        <button onClick={e => { e.stopPropagation(); setDetailId(r.id) }} style={miniBtn}>↗</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>

      {detailId && <DetailDrawer detail={detail} onClose={() => setDetailId(null)} />}

      {/* Rapor */}
      {report && (
        <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>SON İŞLEM RAPORU</span>
            <button onClick={() => setReport(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span style={{ color: 'var(--green, #22c55e)' }}>✓ {report.success.length} başarılı</span>
            <span style={{ color: 'var(--red, #ef4444)' }}>✗ {report.skipped.length} atlandı</span>
          </div>
          {report.skipped.length > 0 && (
            <ul style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)', maxHeight: 160, overflow: 'auto' }}>
              {report.skipped.map((s, i) => (
                <li key={i}>{s.name || `#${s.id}`}: {s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function FilterField({ label, children }) {
  return (
    <div>
      <label style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1, display: 'block', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  )
}

function MiniStat({ label, value, color = 'var(--text)', small }) {
  return (
    <div style={{
      padding: small ? '4px 8px' : '6px 12px',
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
      display: 'flex', flexDirection: 'column', minWidth: 72,
    }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: 1 }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: small ? 13 : 16, fontWeight: 600, color }}>{value}</span>
    </div>
  )
}

function ActionPanel({ title, onCancel, children }) {
  return (
    <div style={{
      padding: 12, marginBottom: 12, border: '1px solid var(--accent)', borderRadius: 6,
      background: 'rgba(240,165,0,.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: 2 }}>{title}</div>
        <div style={{ flex: 1 }} />
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

const hintStyle = {
  fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', letterSpacing: 0.5,
}

const miniBtn = {
  padding: '3px 8px', fontSize: 10, fontFamily: 'var(--mono)',
  background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--text3)', borderRadius: 4, cursor: 'pointer',
}

function DetailDrawer({ detail, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9000,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, height: '100%', overflowY: 'auto',
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        padding: 20, boxShadow: '-8px 0 32px rgba(0,0,0,.4)',
      }}>
        {!detail ? (
          <div style={{ color: 'var(--text3)' }}>Yükleniyor...</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, color: 'var(--text)' }}>{detail.person.full_name}</h3>
                <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                  ID #{detail.person.id} · {detail.person.tc_no || 'TC yok'}
                </div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            <Section title="KİŞİSEL">
              <Row label="Cinsiyet" value={detail.person.gender === 'female' ? 'Kadın' : detail.person.gender === 'male' ? 'Erkek' : '-'} />
              <Row label="Telefon" value={detail.person.phone_number || '-'} mono />
              <Row label="Memleket" value={detail.person.hometown || '-'} />
              <Row label="Meslek" value={detail.person.job_title || '-'} />
              <Row label="Firma" value={detail.person.company_name || detail.person.company || '-'} />
            </Section>

            <Section title="KONAKLAMA">
              <Row label="Oda" value={detail.person.block ? `${detail.person.block}-${detail.person.room_no} / Yatak ${detail.person.bed_no}` : 'Atanmamış'} />
              <Row label="Vardiya" value={detail.person.shift_type === 'night' ? 'Gece' : 'Gündüz'} />
              <Row label="Giriş" value={detail.person.check_in_date || '-'} mono />
              <Row label="Çıkış" value={detail.person.check_out_date || 'Aktif'} mono />
            </Section>

            <Section title="ACİL DURUM">
              <Row label="Kişi" value={detail.person.emergency_name || '-'} />
              <Row label="Telefon" value={detail.person.emergency_phone || '-'} mono />
            </Section>

            <Section title={`ZİMMET (${detail.zimmet.length})`}>
              {detail.zimmet.length === 0 ? (
                <div style={{ color: 'var(--text3)', fontSize: 12, padding: '8px 0' }}>Zimmet kaydı yok</div>
              ) : detail.zimmet.map(z => (
                <div key={z.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{z.item_name}</strong>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 3, fontFamily: 'var(--mono)',
                      background: z.returned_at ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)',
                      color: z.returned_at ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)',
                    }}>
                      {z.returned_at ? 'İADE' : 'BEKLİYOR'}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {z.created_at?.slice(0, 10)} · {z.quantity} adet
                    {z.return_condition && z.return_condition !== 'normal' && ` · ${z.return_condition}`}
                  </div>
                </div>
              ))}
            </Section>

            <Section title={`DİSİPLİN (toplam ${detail.person.discipline_points || 0} puan)`}>
              {detail.discipline.length === 0 ? (
                <div style={{ color: 'var(--text3)', fontSize: 12, padding: '8px 0' }}>Disiplin kaydı yok</div>
              ) : detail.discipline.map(d => (
                <div key={d.id} style={{ padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{d.reason}</span>
                    <span style={{ fontFamily: 'var(--mono)', color: 'var(--orange, #f97316)' }}>+{d.points}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {d.created_at?.slice(0, 10)} · {d.created_by_name || ''}
                  </div>
                </div>
              ))}
            </Section>

            {detail.person.is_blacklisted && (
              <div style={{ padding: 12, marginTop: 16, background: 'rgba(239,68,68,.08)', border: '1px solid var(--red, #ef4444)', borderRadius: 6 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--red, #ef4444)', letterSpacing: 2, marginBottom: 4 }}>⊘ KARA LİSTEDE</div>
                <div style={{ fontSize: 12 }}>{detail.person.blacklist_reason || 'Sebep belirtilmemiş'}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 4 }}>
                  {detail.person.blacklisted_at?.slice(0, 10)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: 2, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, mono }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>{label}</span>
      <span style={{ fontFamily: mono ? 'var(--mono)' : 'inherit', fontSize: mono ? 11 : 12 }}>{value}</span>
    </div>
  )
}
