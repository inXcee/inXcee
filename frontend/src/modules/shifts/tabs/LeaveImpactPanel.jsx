import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'

// Faz 8 — İzin etki analizi.
//
// Onay ekranında şimdiye kadar yalnız "kim, hangi tarih" yazıyordu. Onaydan
// SONRA çıkanlar burada, onay butonunun hemen üstünde gösterilir: bakiye,
// ezilecek vardiya, kadro açığı, aynı gün izinliler, yıl sonu tahmini.
//
// Panel açık gelir — amacı zaten karar anında görünmek.

const Satir = ({ etiket, deger, renk }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, padding: '3px 0' }}>
    <span style={{ color: 'var(--text3)' }}>{etiket}</span>
    <span style={{ fontFamily: 'var(--mono)', color: renk || 'var(--text)', textAlign: 'right' }}>{deger}</span>
  </div>
)

function Bolum({ baslik, liste, bos, satir }) {
  const kirpik = liste?.truncated || 0
  const kayitlar = liste?.items || []
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)' }}>{baslik}</div>
      {kayitlar.length === 0
        ? <div style={{ fontSize: 11, color: 'var(--text3)' }}>{bos}</div>
        : kayitlar.map((k, i) => (
          <div key={i} style={{ fontSize: 11, padding: '3px 0', borderTop: i ? '1px dashed var(--border)' : 'none' }}>
            {satir(k)}
          </div>
        ))}
      {/* Kırpılan kayıt sessizce yutulursa liste tam sanılır. */}
      {kirpik > 0 && <div style={{ fontSize: 10, color: 'var(--text3)' }}>+{kirpik} kayıt daha</div>}
    </div>
  )
}

export default function LeaveImpactPanel({ staffId, start, end, leaveType = 'annual' }) {
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['leave-impact', staffId, start, end, leaveType],
    queryFn: () => api.get('/shifts/leave-impact', {
      params: { staff_id: staffId, start, end, leave_type: leaveType },
    }).then(r => r.data),
    enabled: !!staffId && !!start && !!end,
  })

  if (isPending) return <div style={{ fontSize: 11, color: 'var(--text3)', padding: '6px 0' }}>Etki hesaplanıyor…</div>

  if (isError) {
    return (
      <div style={{ fontSize: 11, color: 'var(--red)', padding: '6px 0' }}>
        Etki analizi alınamadı — {error?.response?.data?.error || error?.message}{' '}
        <button className="btn btn-ghost btn-sm" onClick={() => refetch()} disabled={isFetching}>Tekrar dene</button>
      </div>
    )
  }

  const b = data.balance || {}
  const tahmin = data.year_end_forecast || {}

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', marginTop: 12,
      borderLeft: `3px solid ${data.warnings?.length ? 'var(--red)' : 'var(--green)'}`,
      maxHeight: 260, overflowY: 'auto',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
        ONAY ÖNCESİ ETKİ · {data.range?.days} gün
      </div>

      {data.warnings?.length > 0 && (
        <ul style={{ margin: '0 0 6px', paddingLeft: 16, color: 'var(--red)', fontSize: 11 }}>
          {data.warnings.map(u => <li key={u}>{u}</li>)}
        </ul>
      )}

      {/* Ölçülemeyen kaynak gizlenirse boş sonuç "etki yok" sanılır. */}
      {data.unavailable?.length > 0 && (
        <div style={{
          fontSize: 10, color: 'var(--text2)', background: 'rgba(245,158,11,.10)',
          border: '1px solid rgba(245,158,11,.35)', borderRadius: 8, padding: '5px 7px', marginBottom: 6,
        }}>
          ⚠ {data.unavailable.length} kaynak okunamadı, bu analiz eksik olabilir:{' '}
          {data.unavailable.map(u => u.source).join(', ')}
        </div>
      )}

      {b.applicable
        ? (b.known === false
          ? <Satir etiket="Bakiye" deger={b.reason} renk="var(--text3)" />
          : <>
            <Satir etiket="Kalan yıllık izin" deger={`${b.remaining} gün`} />
            <Satir etiket="Bu talepten sonra" deger={`${b.after} gün`} renk={b.sufficient ? 'var(--green)' : 'var(--red)'} />
          </>)
        : <Satir etiket="Bakiye" deger={b.reason} renk="var(--text3)" />}

      {tahmin.known && (
        <Satir
          etiket="Yıl sonu tahmini"
          deger={`${tahmin.projected} gün (onaylı gelecek: ${tahmin.other_approved_future})`}
          renk={tahmin.projected < 0 ? 'var(--red)' : 'var(--text)'}
        />
      )}

      <Bolum
        baslik="EZİLECEK VARDİYALAR" liste={data.conflicting_shifts}
        bos="Bu günlerde girilmiş vardiya yok."
        satir={k => `${k.work_date} · ${[k.shift_name, k.location_name].filter(Boolean).join(' · ') || k.status}`}
      />

      <Bolum
        baslik="KADRO AÇIĞI" liste={data.coverage_loss}
        bos="Hiçbir noktada asgari kadro bozulmuyor."
        satir={k => `${k.date} · ${k.rule_name} → ${k.after}/${k.required} (−${k.missing})`}
      />

      <Bolum
        baslik="AYNI GÜN İZİNLİLER" liste={data.same_day_leaves}
        bos="Aynı bölümden başka izinli yok."
        satir={k => `${k.date} · ${k.names.join(', ')}`}
      />

      <Bolum
        baslik="FAZLA MESAİ KAYDI" liste={data.overtime_effect}
        bos="Bu günlerde mesai kaydı yok."
        satir={k => `${k.work_date} · ${k.hours} saat`}
      />

      {data.replacements?.available
        ? (data.replacements.items.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text3)' }}>
              YERİNE ÇAĞRILABİLİR ({data.replacements.date})
            </div>
            <div style={{ fontSize: 11 }}>{data.replacements.items.map(a => a.full_name).join(', ')}</div>
          </div>
        ))
        : <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>Aday listesi hesaplanamadı — {data.replacements?.reason}</div>}

      {data.recurring_pattern?.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text2)' }}>
          Örüntü: geçmiş izinlerin {data.recurring_pattern.map(p => `${p.count}'i ${p.weekday_name}`).join(', ')} gününde başlamış.
        </div>
      )}
    </div>
  )
}
