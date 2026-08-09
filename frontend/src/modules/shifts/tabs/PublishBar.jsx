import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { useAuthStore } from '../../../shared/store/authStore.js'
import { useToastStore } from '../../../shared/store/toastStore.js'

// Çizelge yayın durumu.
//
// Bugüne kadar hücreye dokunulduğu an vardiya "kesin" sayılıyordu — yayın diye
// bir an yoktu, dolayısıyla yayından sonra yapılan değişiklik de kimseye
// bildirilmiyordu. Burada haftanın durumu (taslak / yayında) ve yayından beri
// biriken değişiklik sayısı görünür.

// Uzun listede ekranı doldurmamak için her kova en fazla bu kadar satır gösterir.
const DOKUM_SINIRI = 8

const toastOk = m => useToastStore.getState().addToast(m, 'success')
const toastErr = e => useToastStore.getState().addToast(e?.response?.data?.error || e?.message || 'İşlem başarısız', 'error')

export default function PublishBar({ weekStart }) {
  const queryClient = useQueryClient()
  const user = useAuthStore(state => state.user)
  const canPublish = user?.role === 'campus_manager'
  const [note, setNote] = useState('')
  const [detayAcik, setDetayAcik] = useState(false)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['schedule-version', weekStart],
    queryFn: () => api.get('/shifts/schedule/version', { params: { week: weekStart } }).then(r => r.data),
    enabled: !!weekStart,
  })

  const yenile = () => queryClient.invalidateQueries({ queryKey: ['schedule-version', weekStart] })

  const publishMut = useMutation({
    mutationFn: () => api.post('/shifts/schedule/version/publish', { week: weekStart, note }),
    onSuccess: res => { setNote(''); yenile(); toastOk(`Çizelge yayınlandı (v${res.data.version}, ${res.data.entries} kayıt)`) },
    onError: toastErr,
  })
  const withdrawMut = useMutation({
    mutationFn: () => api.post('/shifts/schedule/version/withdraw', { week: weekStart }),
    onSuccess: () => { yenile(); toastOk('Yayın geri çekildi — hafta taslağa döndü') },
    onError: toastErr,
  })

  if (isPending || !weekStart) return null
  if (isError) {
    return (
      <div className="panel" style={{ marginBottom: 12, padding: '9px 14px', fontSize: 12, borderLeft: '3px solid var(--red)' }}>
        Yayın durumu alınamadı — {error?.response?.data?.error || error?.message}{' '}
        <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Tekrar dene</button>
      </div>
    )
  }

  const yayinda = data.status === 'published'
  const fark = data.changes
  // Yayınlandıktan sonra değişen hücreler: personelin gördüğü çizelge artık
  // ekrandakinden farklı demektir.
  const farkVar = yayinda && fark && fark.total > 0
  const kirpilan = !farkVar ? 0
    : Math.max(0, fark.added.length - DOKUM_SINIRI)
      + Math.max(0, fark.changed.length - DOKUM_SINIRI)
      + Math.max(0, fark.removed.length - DOKUM_SINIRI)

  return (
    <div className="panel" style={{
      marginBottom: 12, borderLeft: `3px solid ${farkVar ? 'var(--accent)' : yayinda ? 'var(--green)' : 'var(--text3)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>
          {yayinda ? '✓ YAYINDA' : '✎ TASLAK'}
        </strong>
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>
          {yayinda
            ? `v${data.version}${data.published_by_name ? ` · ${data.published_by_name}` : ''}${data.published_at ? ` · ${data.published_at.slice(0, 16)}` : ''}`
            : 'Bu hafta henüz yayınlanmadı — değişiklikler personele kesin vardiya olarak duyurulmadı'}
        </span>

        {farkVar && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setDetayAcik(a => !a)}
            style={{ color: 'var(--accent)' }}
          >
            ⚠ Yayından beri {fark.total} değişiklik {detayAcik ? '▴' : '▾'}
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {canPublish && (
            <>
              <input
                className="form-input"
                aria-label="Yayın notu"
                placeholder="Yayın notu (isteğe bağlı)"
                value={note}
                onChange={e => setNote(e.target.value)}
                style={{ maxWidth: 200, fontSize: 11 }}
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={publishMut.isPending}
                onClick={() => publishMut.mutate()}
              >
                {publishMut.isPending ? '…' : yayinda ? 'Yeniden yayınla' : 'Yayınla'}
              </button>
              {yayinda && (
                <button className="btn btn-ghost btn-sm" disabled={withdrawMut.isPending} onClick={() => withdrawMut.mutate()}>
                  Yayını geri çek
                </button>
              )}
            </>
          )}
          {/* Yetkisi olmayan da durumu görmeli: "yayında mı" sorusu herkesi
              ilgilendiriyor, yalnız yayınlama müdüre ait. */}
          {!canPublish && <span style={{ fontSize: 10, color: 'var(--text3)' }}>Yayınlama yetkisi müdürde</span>}
        </div>
      </div>

      {farkVar && detayAcik && (
        <div style={{ padding: '0 14px 12px', fontSize: 11, color: 'var(--text2)' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
            <span>Eklenen: <strong style={{ color: 'var(--green)' }}>{fark.added.length}</strong></span>
            <span>Değişen: <strong style={{ color: 'var(--accent)' }}>{fark.changed.length}</strong></span>
            <span>Silinen: <strong style={{ color: 'var(--red)' }}>{fark.removed.length}</strong></span>
          </div>
          {/* Sayı tek başına yetmiyor: kimin etkilendiğini bilmeyen planlayıcı
              yine bütün çizelgeyi tarıyor. */}
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {fark.added.slice(0, DOKUM_SINIRI).map(r => (
              <div key={`a-${r.staff_id}-${r.work_date}`}>
                <span style={{ color: 'var(--green)' }}>+</span> {r.full_name} · {r.work_date} · {r.shift_name || 'vardiya yok'}
              </div>
            ))}
            {fark.changed.slice(0, DOKUM_SINIRI).map(r => (
              <div key={`d-${r.after.staff_id}-${r.after.work_date}`}>
                <span style={{ color: 'var(--accent)' }}>~</span> {r.after.full_name} · {r.after.work_date} ·{' '}
                {r.before.shift_name || r.before.status || '—'} → {r.after.shift_name || r.after.status || '—'}
              </div>
            ))}
            {fark.removed.slice(0, DOKUM_SINIRI).map(r => (
              <div key={`s-${r.staff_id}-${r.work_date}`}>
                <span style={{ color: 'var(--red)' }}>−</span> {r.full_name} · {r.work_date} · {r.shift_name || 'vardiya yok'}
              </div>
            ))}
            {/* Kırpma sessiz kalırsa liste tam sanılır. */}
            {kirpilan > 0 && <div style={{ color: 'var(--text3)' }}>… +{kirpilan} değişiklik daha</div>}
          </div>

          <div style={{ marginTop: 8, color: 'var(--text3)' }}>
            Personelin gördüğü çizelge v{data.version}. Bu değişikliklerin geçerli olması için yeniden yayınlayın.
          </div>
        </div>
      )}
    </div>
  )
}
