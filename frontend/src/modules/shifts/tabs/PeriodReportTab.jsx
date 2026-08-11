import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../../shared/api/client.js'
import { toastErr, toastOk } from '../shared.jsx'
import { periodReportFileName } from '../logic/periodReportExport.js'

// Faz 13 — Dönem raporu.
//
// Ay sonunda "ne oldu" sorusunun cevabı parça parça farklı ekranlardaydı;
// hiçbiri planlananla gerçekleşeni yan yana koymuyordu.
//
// Ölçülemeyen bölüm SIFIR göstermez: neden ölçülemediği yazılır. "0 devamsız"
// ile "kayıt hiç yok" farklı şeylerdir ve ikincisi bir eylem gerektirir.

function Bolum({ baslik, bolum, children }) {
  if (!bolum) return null
  return (
    <section className="panel" style={{ padding: '10px 14px', marginBottom: 10 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 1, color: 'var(--text3)', marginBottom: 6 }}>
        {baslik}
      </div>
      {bolum.measurable
        ? children
        : (
          <div style={{ fontSize: 11, color: 'var(--amber)' }}>
            Bu bölüm ölçülemedi — {bolum.reason}
          </div>
        )}
    </section>
  )
}

const Satir = ({ sol, sag, renk }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11, padding: '2px 0' }}>
    <span>{sol}</span>
    <span style={{ fontFamily: 'var(--mono)', color: renk || 'var(--text2)' }}>{sag}</span>
  </div>
)

export default function PeriodReportTab({ departments = [] }) {
  const bugun = new Date()
  const [period, setPeriod] = useState(`${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, '0')}`)
  const [departman, setDepartman] = useState('')
  const [indiriliyor, setIndiriliyor] = useState(false)

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['period-report', period, departman],
    queryFn: () => api.get('/shifts/period-report', {
      params: { period, ...(departman ? { dept_id: departman } : {}) },
    }).then(r => r.data),
    enabled: !!period,
  })

  const excelIndir = async () => {
    setIndiriliyor(true)
    try {
      const [{ default: ExcelJS }, { buildPeriodReportWorkbook }, { saveWorkbook }] = await Promise.all([
        import('exceljs'),
        import('../logic/periodReportExport.js'),
        import('../../../shared/logic/excelKit.js'),
      ])
      // saveWorkbook buffer bekler, workbook değil.
      const buffer = await buildPeriodReportWorkbook(ExcelJS, { report: data }).xlsx.writeBuffer()
      saveWorkbook(buffer, periodReportFileName(period))
      toastOk('Rapor indirildi')
    } catch (e) {
      toastErr(e)
    } finally {
      setIndiriliyor(false)
    }
  }

  const b = data?.sections || {}

  return (
    <div className="fade-up">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input
          type="month" className="form-input" aria-label="Rapor dönemi"
          value={period} onChange={e => setPeriod(e.target.value)}
          style={{ width: 'auto', padding: '5px 11px', fontSize: 12 }}
        />
        <select
          className="form-select" aria-label="Rapor departmanı"
          value={departman} onChange={e => setDepartman(e.target.value)}
          style={{ width: 'auto', minWidth: 140, padding: '5px 11px', fontSize: 11 }}
        >
          <option value="">Tüm departmanlar</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" disabled={!data || indiriliyor} onClick={excelIndir}>
          {indiriliyor ? '…' : '⬇ Excel'}
        </button>
        <button className="btn btn-ghost btn-sm" disabled={!data} onClick={() => window.print()}>🖨 Yazdır</button>
      </div>

      {isPending && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Rapor hazırlanıyor…</div>}

      {isError && (
        <div style={{ fontSize: 12, color: 'var(--red)' }}>
          Rapor alınamadı — {error?.response?.data?.error || error?.message}{' '}
          <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>Tekrar dene</button>
        </div>
      )}

      {data && (
        <>
          {/* Ölçülemeyen bölüm gizlenirse rapor olduğundan eksiksiz görünür. */}
          {data.unmeasurable?.length > 0 && (
            <div style={{
              fontSize: 11, color: 'var(--text2)', background: 'rgba(245,158,11,.10)',
              border: '1px solid rgba(245,158,11,.35)', borderRadius: 8, padding: '6px 9px', marginBottom: 10,
            }}>
              ⚠ {data.unmeasurable.length} bölüm ölçülemedi: {data.unmeasurable.map(u => u.section).join(', ')}
            </div>
          )}

          <Bolum baslik="PLANLANAN / GERÇEKLEŞEN" bolum={b.planned_vs_actual}>
            <Satir sol="Planlanan gün" sag={b.planned_vs_actual?.total_planned} />
            <Satir sol="Gerçekleşen gün" sag={b.planned_vs_actual?.total_actual} />
            <Satir
              sol="Gerçekleşme oranı"
              sag={b.planned_vs_actual?.realization == null
                ? b.planned_vs_actual?.realization_note
                : `%${Math.round(b.planned_vs_actual.realization * 100)}`}
              renk={b.planned_vs_actual?.realization == null ? 'var(--text3)' : 'var(--text)'}
            />
          </Bolum>

          <Bolum baslik="KAPSAMA BAŞARISI" bolum={b.coverage_success}>
            <Satir
              sol="Genel"
              sag={b.coverage_success?.overall_ratio == null
                ? 'ölçülemedi'
                : `%${Math.round(b.coverage_success.overall_ratio * 100)} (${b.coverage_success.met_days}/${b.coverage_success.rule_days} kural-gün)`}
            />
            {(b.coverage_success?.chronically_short || []).map(k => (
              <Satir key={k.rule_id} sol={k.rule_name} sag={`${k.short_days} gün eksik · %${Math.round(k.ratio * 100)}`} renk="var(--red)" />
            ))}
          </Bolum>

          <Bolum baslik="DEVAMSIZLIK" bolum={b.absence}>
            <Satir sol="Toplam devamsız gün" sag={b.absence?.total_days} />
            <Satir sol="Nedeni yazılmamış" sag={b.absence?.without_reason} renk={b.absence?.without_reason ? 'var(--red)' : 'var(--text2)'} />
            {(b.absence?.people || []).map(k => (
              <Satir key={k.staff_id} sol={k.full_name} sag={`${k.days} gün (${k.without_reason} nedensiz)`} />
            ))}
          </Bolum>

          <Bolum baslik="İZİN SIRALAMASI" bolum={b.leave_ranking}>
            {(b.leave_ranking?.people || []).map(k => (
              <Satir key={k.staff_id} sol={k.full_name} sag={`${k.days} gün · ${k.requests} talep`} />
            ))}
          </Bolum>

          <Bolum baslik="MESAİ SIRALAMASI" bolum={b.overtime_ranking}>
            <Satir sol="Toplam" sag={`${b.overtime_ranking?.total_hours} saat`} />
            {(b.overtime_ranking?.people || []).map(k => (
              <Satir key={k.staff_id} sol={k.full_name} sag={`${k.hours} saat · ${k.days} gün`} />
            ))}
          </Bolum>

          <Bolum baslik="PROJE YÜKÜ" bolum={b.project_load}>
            {(b.project_load?.projects || []).map(p => (
              <Satir key={p.project} sol={p.project} sag={`${p.person_days} kişi-gün · ${p.people} kişi`} />
            ))}
            {/* Para cinsinden maliyet uydurulmadığı ekranda da yazar. */}
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>{b.project_load?.cost_note}</div>
          </Bolum>

          <Bolum baslik="ONAY SÜRELERİ" bolum={b.approval_times}>
            <Satir
              sol="Ortalama onay süresi"
              sag={b.approval_times?.average_days == null ? 'ölçülemedi' : `${b.approval_times.average_days} gün`}
              renk={b.approval_times?.average_days == null ? 'var(--text3)' : 'var(--text)'}
            />
            {b.approval_times?.unmeasured > 0 && (
              <Satir sol="Damgası olmayan dönem" sag={b.approval_times.unmeasured} renk="var(--amber)" />
            )}
            {(b.approval_times?.periods || []).map(p => (
              <Satir key={p.period} sol={`${p.period} · ${p.status}`} sag={p.days == null ? 'ölçülemedi' : `${p.days} gün`} />
            ))}
          </Bolum>

          <Bolum baslik="AYRILMA ÖNCESİ EĞİLİM" bolum={b.pre_exit_trends}>
            {b.pre_exit_trends?.count === 0
              ? <div style={{ fontSize: 11, color: 'var(--text3)' }}>Bu dönemde işten ayrılan yok.</div>
              : (b.pre_exit_trends?.people || []).map(k => (
                <Satir key={k.staff_id} sol={`${k.full_name} · ${k.exit_date}`} sag={`60 günde ${k.absences_60d} devamsız · ${k.leaves_60d} izin`} />
              ))}
          </Bolum>
        </>
      )}
    </div>
  )
}
