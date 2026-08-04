import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'
import { asArray } from '../../shared/asArray.js'
import { confirmDialog } from '../../shared/components/ConfirmDialog.jsx'
import { useToastStore } from '../../shared/store/toastStore.js'
import { SkeletonGrid } from '../../shared/components/Skeleton.jsx'

const toast = (msg, type = 'success') => useToastStore.getState().addToast(msg, type)

export default function ProjectsPage() {
  const queryClient = useQueryClient()
  const [seciliProje, setSeciliProje] = useState(null)
  const [yeni, setYeni] = useState({ name: '', code: '' })
  const [yapistirilan, setYapistirilan] = useState('')
  const [onizleme, setOnizleme] = useState(null)
  const [onayliOneriler, setOnayliOneriler] = useState({})
  const [onayliYeniler, setOnayliYeniler] = useState({})

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
  })
  const projeler = asArray(projectsQuery.data)

  const staffQuery = useQuery({
    queryKey: ['project-staff', seciliProje],
    queryFn: () => api.get(`/shifts/staff?project_id=${seciliProje}`).then(r => r.data),
    enabled: seciliProje != null,
  })
  const kadrosuzQuery = useQuery({
    queryKey: ['project-staff', 'none'],
    queryFn: () => api.get('/shifts/staff?project_id=none').then(r => r.data),
  })

  function tazele() {
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    queryClient.invalidateQueries({ queryKey: ['project-staff'] })
  }

  const olustur = useMutation({
    mutationFn: () => api.post('/projects', yeni),
    onSuccess: () => { toast('Proje eklendi'); setYeni({ name: '', code: '' }); tazele() },
    onError: (e) => toast(e.response?.data?.error || 'Proje eklenemedi', 'error'),
  })

  const ata = useMutation({
    mutationFn: ({ staffIds, projectId }) => api.post('/projects/assign', { staff_ids: staffIds, project_id: projectId }),
    onSuccess: (_, vars) => { toast(vars.projectId == null ? 'Kadrodan çıkarıldı' : 'Kadroya eklendi'); tazele() },
    onError: (e) => toast(e.response?.data?.error || 'İşlem başarısız', 'error'),
  })

  const sil = useMutation({
    mutationFn: (id) => api.delete(`/projects/${id}`),
    onSuccess: () => { toast('Proje silindi'); setSeciliProje(null); tazele() },
    onError: (e) => toast(e.response?.data?.error || 'Proje silinemedi', 'error'),
  })

  const onizle = useMutation({
    mutationFn: () => api.post(`/projects/${seciliProje}/roster/preview`, {
      names: yapistirilan.split('\n').map(s => s.trim()).filter(Boolean),
    }).then(r => r.data),
    onSuccess: (data) => {
      setOnizleme(data)
      // Öneriler varsayılan olarak İŞARETSİZ gelir — yanlış eşleşme riski var.
      setOnayliOneriler({})
      setOnayliYeniler(Object.fromEntries(data.unknown.map(n => [n, true])))
    },
    onError: (e) => toast(e.response?.data?.error || 'Önizleme alınamadı', 'error'),
  })

  const uygula = useMutation({
    mutationFn: () => api.post(`/projects/${seciliProje}/roster/apply`, {
      assign_staff_ids: [
        ...onizleme.exact.map(x => x.staff_id),
        ...onizleme.near.filter(x => onayliOneriler[x.name]).map(x => x.staff_id),
      ],
      create_names: [
        ...onizleme.unknown.filter(n => onayliYeniler[n]),
        ...onizleme.near.filter(x => !onayliOneriler[x.name]).map(x => x.name),
      ],
    }).then(r => r.data),
    onSuccess: (r) => {
      toast(`${r.assigned} kişi kadroya alındı, ${r.created} yeni kayıt açıldı`)
      setOnizleme(null); setYapistirilan(''); tazele()
    },
    onError: (e) => toast(e.response?.data?.error || 'Aktarım başarısız', 'error'),
  })

  const kadro = asArray(staffQuery.data)
  const kadrosuz = asArray(kadrosuzQuery.data)
  const secili = useMemo(() => projeler.find(p => p.id === seciliProje), [projeler, seciliProje])

  async function projeSil(proje) {
    const ok = await confirmDialog({
      title: 'Projeyi sil',
      body: `"${proje.name}" silinecek. Kadrosunda personel varsa silme reddedilir.`,
      confirmLabel: 'Sil', danger: true,
    })
    if (ok) sil.mutate(proje.id)
  }

  if (projectsQuery.isLoading) return <SkeletonGrid count={3} />

  return (
    <div>
      <header style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--display)', letterSpacing: 1, color: 'var(--text)' }}>PROJELER</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text2)', fontSize: 13 }}>
          Puantaj ve vardiya iki proje halinde yürüyor. Kimin hangi kadroda olduğu buradan yönetilir.
        </p>
      </header>

      <section aria-label="Proje listesi" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 16 }}>
        {projeler.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSeciliProje(p.id)}
            style={{ ...kart, borderColor: p.id === seciliProje ? 'var(--accent)' : 'var(--border)', textAlign: 'left', cursor: 'pointer' }}
          >
            <strong style={{ color: 'var(--text)', display: 'block' }}>{p.name}</strong>
            <small style={{ color: 'var(--text2)' }}>{p.code} · {p.staff_count} kişi</small>
          </button>
        ))}
        <div style={{ ...kart, display: 'grid', gap: 6 }}>
          <input style={input} placeholder="Yeni proje adı" value={yeni.name}
            onChange={e => setYeni(f => ({ ...f, name: e.target.value }))} />
          <input style={input} placeholder="Kod (ör. SAHA3)" value={yeni.code}
            onChange={e => setYeni(f => ({ ...f, code: e.target.value }))} />
          <button type="button" style={btn} disabled={!yeni.name.trim() || olustur.isPending}
            onClick={() => olustur.mutate()}>+ Proje ekle</button>
        </div>
      </section>

      {kadrosuz.length > 0 && (
        <div style={{ ...kart, borderColor: 'var(--accent)', marginBottom: 16 }}>
          <strong style={{ color: 'var(--accent)' }}>⚠ {kadrosuz.length} kişinin kadrosu belirlenmemiş</strong>
          <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 4 }}>
            Bu kişiler hiçbir projede görünmez. Aşağıdan bir proje seçip ekleyin.
          </div>
        </div>
      )}

      {secili && (
        <section aria-label="Kadro yönetimi">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <h3 style={{ margin: 0, color: 'var(--text)' }}>{secili.name} kadrosu <span style={{ color: 'var(--text2)', fontWeight: 400 }}>({kadro.length})</span></h3>
            <button type="button" style={{ ...btn, background: 'var(--red)' }} onClick={() => projeSil(secili)}>Projeyi sil</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            <div style={kart}>
              <strong style={baslik}>KADRODA</strong>
              {kadro.length === 0 ? <div style={bos}>Bu projede henüz kimse yok.</div> : (
                <ul style={liste}>
                  {kadro.map(s => (
                    <li key={s.id} style={satir}>
                      <span style={{ color: 'var(--text)' }}>{s.full_name}</span>
                      <button type="button" style={mini} onClick={() => ata.mutate({ staffIds: [s.id], projectId: null })}>çıkar</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={kart}>
              <strong style={baslik}>KADROSUZ</strong>
              {kadrosuz.length === 0 ? <div style={bos}>Herkesin kadrosu belli.</div> : (
                <ul style={liste}>
                  {kadrosuz.map(s => (
                    <li key={s.id} style={satir}>
                      <span style={{ color: 'var(--text)' }}>{s.full_name}</span>
                      <button type="button" style={mini} onClick={() => ata.mutate({ staffIds: [s.id], projectId: secili.id })}>ekle</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div style={{ ...kart, marginTop: 12 }}>
            <strong style={baslik}>İMZA LİSTESİNDEN AKTAR</strong>
            <p style={{ color: 'var(--text2)', fontSize: 12, margin: '0 0 8px' }}>
              İsimleri alt alta yapıştırın. Önce eşleştirme gösterilir; onaylamadan hiçbir şey kaydedilmez.
            </p>
            <textarea
              value={yapistirilan}
              onChange={e => setYapistirilan(e.target.value)}
              placeholder={'ALİ RIZA ÇOLBAN\nARZU DOĞAN\n…'}
              rows={6}
              style={{ ...input, width: '100%', fontFamily: 'var(--mono)' }}
            />
            <button type="button" style={{ ...btn, marginTop: 8 }}
              disabled={!yapistirilan.trim() || onizle.isPending}
              onClick={() => onizle.mutate()}>Eşleştirmeyi göster</button>

            {onizleme && (
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                <div style={{ color: 'var(--green)' }}>
                  ✓ {onizleme.exact.length} kişi birebir eşleşti — doğrudan kadroya alınacak.
                </div>

                {onizleme.near.length > 0 && (
                  <div>
                    <strong style={{ color: 'var(--accent)', fontSize: 12 }}>
                      MUHTEMEL EŞLEŞME — işaretlemezseniz yeni kişi olarak açılır
                    </strong>
                    {onizleme.near.map(n => (
                      <label key={n.name} style={onayRow}>
                        <input type="checkbox" checked={!!onayliOneriler[n.name]}
                          onChange={e => setOnayliOneriler(o => ({ ...o, [n.name]: e.target.checked }))} />
                        <span style={{ color: 'var(--text)' }}>{n.name}</span>
                        <span style={{ color: 'var(--text2)' }}>→ {n.staff_name}</span>
                        <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>%{Math.round(n.score * 100)}</span>
                      </label>
                    ))}
                  </div>
                )}

                {onizleme.unknown.length > 0 && (
                  <div>
                    <strong style={{ color: 'var(--text2)', fontSize: 12 }}>YENİ KİŞİ OLARAK AÇILACAK</strong>
                    {onizleme.unknown.map(n => (
                      <label key={n} style={onayRow}>
                        <input type="checkbox" checked={!!onayliYeniler[n]}
                          onChange={e => setOnayliYeniler(o => ({ ...o, [n]: e.target.checked }))} />
                        <span style={{ color: 'var(--text)' }}>{n}</span>
                      </label>
                    ))}
                  </div>
                )}

                <button type="button" style={{ ...btn, background: 'var(--green)' }}
                  disabled={uygula.isPending} onClick={() => uygula.mutate()}>
                  Aktarımı uygula
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

const kart = { background: 'var(--surface2)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', borderRadius: 10, padding: 12 }
const baslik = { display: 'block', fontSize: 11, letterSpacing: 1, color: 'var(--text2)', marginBottom: 8 }
const input = { background: 'var(--surface3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)' }
const btn = { background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 14px', color: '#1a1200', fontWeight: 600, cursor: 'pointer' }
const mini = { background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', color: 'var(--text2)', cursor: 'pointer', fontSize: 11 }
const liste = { listStyle: 'none', margin: 0, padding: 0, maxHeight: 260, overflowY: 'auto' }
const satir = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }
const bos = { color: 'var(--text3)', fontSize: 12 }
const onayRow = { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }
