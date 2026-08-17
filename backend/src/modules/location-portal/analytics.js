import { getDB } from '../../shared/db/index.js'
import { getPortalSettings } from './service.js'
import { effectiveDeploymentState } from './deployment.js'

// Faz 6 — QR portalı analitiği.
//
// Bu dosyanın tek derdi şu: BİR SIFIR ÜÇ FARKLI ŞEY DEMEK OLABİLİR.
//
//   1. Hizmet kapalıydı        → sakin isteseydi de yapamazdı
//   2. Etiket kapıda değildi   → sakin okutamazdı
//   3. Gerçekten kullanılmadı  → asıl bilgi bu
//
// Üçünü tek "0" altında toplamak, "sakinler portalı kullanmıyor" diye yanlış
// bir sonuca ve arkasından gereksiz bir kampanyaya yol açar. Rapor bu üçünü
// ayırır; ayıramadığı yerde ayıramadığını söyler.

export const HIZMETLER = Object.freeze([
  { key: 'fault', label: 'Arıza bildirimi', setting: 'location_portal_fault_enabled', events: ['fault'] },
  { key: 'laundry', label: 'Çamaşır talebi', setting: 'location_portal_laundry_enabled', events: ['laundry_request'] },
  { key: 'cleaning', label: 'Temizlik', setting: 'location_portal_cleaning_enabled', events: ['cleaning_complete', 'cleaning_status', 'cleaning_review'] },
  { key: 'survey', label: 'Anket', setting: 'location_portal_survey_enabled', events: ['survey'] },
])

// Etiketin fiziksel olarak kapıda olduğuna dair KANIT var mı? Yalnız "asıldı"
// ve "yerinde doğrulandı" kanıttır. Basılmış olmak kâğıdın kapıya gittiğini
// göstermez; kayıt yokluğu ise hiçbir şey göstermez.
export function labelProvesReachable(state) {
  return state === 'installed' || state === 'verified'
}

/**
 * Sessizliği yorumlar.
 *
 * Hiç okutulmamış konumların kaçının etiketi zaten kapıda değildi? O kadarının
 * sessizliği ZATEN BEKLENİR; "kullanılmıyor" kanıtı sayılamaz.
 */
export function explainSilence(locations = []) {
  const sessiz = locations.filter(l => (l.scans || 0) === 0)
  const etiketsiz = sessiz.filter(l => !labelProvesReachable(l.deployment_state))
  const gercek = sessiz.length - etiketsiz.length
  return {
    zero_scan_locations: sessiz.length,
    explained_by_label: etiketsiz.length,
    genuinely_unused: gercek,
    // Ölçülebilirlik: etiketi kanıtlanmış tek konum yoksa "kullanılmıyor"
    // diyecek zeminimiz de yok.
    measurable: locations.some(l => labelProvesReachable(l.deployment_state)),
    note: sessiz.length === 0
      ? null
      : etiketsiz.length === sessiz.length
        ? `Hiç okutulmayan ${sessiz.length} konumun tamamında etiketin kapıda olduğu kayıtlı değil — bu sayı "kullanılmıyor" kanıtı değildir.`
        : `Hiç okutulmayan ${sessiz.length} konumdan ${etiketsiz.length} tanesinde etiket kapıda değil; gerçekten kullanılmayan ${gercek} konum.`,
  }
}

/**
 * Sakinlerin temizlik değerlendirmeleri.
 *
 * Bu veri toplanıyordu ama HİÇBİR yönetim ekranı okumuyordu: şikayet
 * (`issue`) takip görevi açtığı için aksiyon yolu vardı, ama puanlar ve
 * onaylar hiçbir yerde görünmüyordu — "hangi blokta temizlik puanı düşük"
 * sorusu cevapsızdı.
 *
 * Ortalama, DEĞERLENDİRME VARSA hesaplanır. Sıfır değerlendirmeden "0,0 puan"
 * üretmek, temizliğin kötü olduğunu söylemek olurdu; oysa bilinen tek şey
 * kimsenin oy vermediğidir.
 */
export function getCleaningReviewStats(filters = {}, db = getDB()) {
  const params = []
  const kosul = []
  if (filters.from) { kosul.push('date(cr.created_at) >= ?'); params.push(filters.from) }
  if (filters.to) { kosul.push('date(cr.created_at) <= ?'); params.push(filters.to) }
  if (filters.block) { kosul.push('sl.block = ?'); params.push(filters.block) }
  const where = kosul.length ? `WHERE ${kosul.join(' AND ')}` : ''

  const toplam = db.prepare(`
    SELECT COUNT(*) AS adet,
           SUM(CASE WHEN cr.outcome='issue' THEN 1 ELSE 0 END) AS sikayet,
           SUM(CASE WHEN cr.followup_task_id IS NOT NULL THEN 1 ELSE 0 END) AS takip_gorevi,
           AVG(cr.rating) AS ortalama,
           SUM(CASE WHEN cr.rating IS NOT NULL THEN 1 ELSE 0 END) AS puanli
    FROM cleaning_task_reviews cr
    JOIN service_locations sl ON sl.id = cr.location_id
    ${where}
  `).get(...params)

  const bloklar = db.prepare(`
    SELECT sl.block,
           COUNT(*) AS adet,
           SUM(CASE WHEN cr.outcome='issue' THEN 1 ELSE 0 END) AS sikayet,
           AVG(cr.rating) AS ortalama,
           SUM(CASE WHEN cr.rating IS NOT NULL THEN 1 ELSE 0 END) AS puanli
    FROM cleaning_task_reviews cr
    JOIN service_locations sl ON sl.id = cr.location_id
    ${where}
    GROUP BY sl.block
    ORDER BY sl.block
  `).all(...params)

  const puanli = toplam?.puanli || 0
  return {
    total: toplam?.adet || 0,
    issues: toplam?.sikayet || 0,
    followup_tasks: toplam?.takip_gorevi || 0,
    rated_count: puanli,
    // Puan verilmemişse ortalama YOK — sıfır değil.
    rating_measurable: puanli > 0,
    average_rating: puanli > 0 ? Math.round(toplam.ortalama * 10) / 10 : null,
    rating_note: puanli > 0 ? null : 'Henüz puanlı değerlendirme yok — ortalama hesaplanamaz',
    by_block: bloklar.map(b => ({
      block: b.block,
      total: b.adet,
      issues: b.sikayet,
      rated_count: b.puanli,
      average_rating: b.puanli > 0 ? Math.round(b.ortalama * 10) / 10 : null,
    })),
  }
}

function windowWhere(filters, params, alias = 'e') {
  const kosul = []
  if (filters.from) { kosul.push(`date(${alias}.created_at) >= ?`); params.push(filters.from) }
  if (filters.to) { kosul.push(`date(${alias}.created_at) <= ?`); params.push(filters.to) }
  return kosul
}

export function getPortalAnalytics(filters = {}, db = getDB()) {
  try {
    const ayarlar = getPortalSettings()
    const blok = filters.block || null

    // --- Pencere: istenen aralık değil, VERİNİN GERÇEKTEN kapsadığı aralık ---
    const sinir = db.prepare(`
      SELECT MIN(created_at) AS ilk, MAX(created_at) AS son, COUNT(*) AS adet
      FROM location_portal_events
    `).get()

    const pParams = []
    const pKosul = windowWhere(filters, pParams)
    const pencereIci = db.prepare(`
      SELECT MIN(date(created_at)) AS ilk, MAX(date(created_at)) AS son, COUNT(*) AS adet
      FROM location_portal_events e
      ${pKosul.length ? `WHERE ${pKosul.join(' AND ')}` : ''}
    `).get(...pParams)

    const window = {
      requested_from: filters.from || null,
      requested_to: filters.to || null,
      first_event_at: sinir.ilk || null,
      last_event_at: sinir.son || null,
      events_in_window: pencereIci.adet || 0,
      data_from: pencereIci.ilk || null,
      data_to: pencereIci.son || null,
      // Hiç olay yoksa "günlük ortalama" gibi her türetilmiş sayı anlamsızdır.
      measurable: (pencereIci.adet || 0) > 0,
      note: (sinir.adet || 0) === 0
        ? 'Hiç portal olayı kaydedilmemiş — portal hiç kullanılmamış ya da yeni açılmış olabilir.'
        : (pencereIci.adet || 0) === 0
          ? `Seçilen aralıkta olay yok. Kayıtlı ilk olay ${sinir.ilk}.`
          : null,
    }

    // --- Portal ayarlarının en son ne zaman değiştiği ---
    // Ayar geçmişi tutulmuyor; sıfırı "o dönemde kapalıydı" diye açıklayabilmek
    // için elimizdeki tek iz denetim kaydı.
    const ayarDegisim = db.prepare(`
      SELECT MAX(created_at) AS son FROM audit_log WHERE action='location_portal_settings_update'
    `).get()

    // --- Olay sayıları ---
    const eParams = []
    const eKosul = windowWhere(filters, eParams)
    if (blok) { eKosul.push('sl.block = ?'); eParams.push(blok) }
    const olaylar = db.prepare(`
      SELECT e.event_type, e.result, e.actor_mode, COUNT(*) AS adet
      FROM location_portal_events e
      JOIN service_locations sl ON sl.id = e.location_id
      ${eKosul.length ? `WHERE ${eKosul.join(' AND ')}` : ''}
      GROUP BY e.event_type, e.result, e.actor_mode
    `).all(...eParams)

    const tipToplam = {}
    const kimlik = { anonymous: 0, resident_pin: 0, worker: 0 }
    const sonuc = {}
    for (const o of olaylar) {
      tipToplam[o.event_type] = (tipToplam[o.event_type] || 0) + o.adet
      kimlik[o.actor_mode] = (kimlik[o.actor_mode] || 0) + o.adet
      sonuc[o.result] = (sonuc[o.result] || 0) + o.adet
    }

    const services = HIZMETLER.map(h => {
      const adet = h.events.reduce((t, tip) => t + (tipToplam[tip] || 0), 0)
      const acik = ayarlar[h.setting] === true
      return {
        key: h.key,
        label: h.label,
        enabled: acik,
        events: adet,
        // Kapalı hizmetin sıfırı "kullanılmıyor" değil "kullanılamıyor" demek.
        note: !acik && adet === 0
          ? 'Hizmet KAPALI — sıfır, kullanılmadığı anlamına gelmez'
          : !acik && adet > 0
            ? 'Hizmet şu an kapalı; sayı hizmet açıkken oluşan kayıtlardan geliyor'
            : null,
      }
    })

    // --- Konum bazında okutma + etiket durumu ---
    const kParams = []
    const kKosul = ['sl.is_active = 1']
    if (blok) { kKosul.push('sl.block = ?'); kParams.push(blok) }
    const tarihKosul = windowWhere(filters, kParams, 'e2')

    const konumlar = db.prepare(`
      SELECT sl.id AS location_id, sl.display_name, sl.block, sl.floor, sl.location_type,
             aktif.id AS active_qr_id,
             d.qr_code_id AS deployed_qr_id,
             d.status AS raw_status,
             (SELECT COUNT(*) FROM location_portal_events e2
               WHERE e2.location_id = sl.id AND e2.event_type = 'scan'
               ${tarihKosul.length ? `AND ${tarihKosul.join(' AND ')}` : ''}) AS scans
      FROM service_locations sl
      LEFT JOIN location_qr_codes aktif ON aktif.location_id = sl.id AND aktif.status='active'
      LEFT JOIN location_qr_deployments d ON d.location_id = sl.id
      WHERE ${kKosul.join(' AND ')}
      ORDER BY sl.block, sl.floor, sl.display_name
    `).all(...kParams)

    const konumDurum = konumlar.map(k => ({
      ...k,
      deployment_state: effectiveDeploymentState(k).state,
    }))

    // --- Blok kırılımı ---
    const bloklar = new Map()
    for (const k of konumDurum) {
      if (!bloklar.has(k.block)) {
        bloklar.set(k.block, {
          block: k.block, locations: 0, scans: 0,
          labels_proven: 0, labels_unknown: 0,
        })
      }
      const b = bloklar.get(k.block)
      b.locations += 1
      b.scans += k.scans || 0
      if (labelProvesReachable(k.deployment_state)) b.labels_proven += 1
      if (k.deployment_state === 'unknown') b.labels_unknown += 1
    }
    const by_block = [...bloklar.values()].map(b => ({
      ...b,
      // Blok kapsama oranı yalnız etiketi kanıtlanmış konumlar üzerinden
      // anlamlıdır; paydayı yazmadan yüzde vermek yanıltır.
      coverage_note: b.labels_unknown > 0
        ? `${b.labels_unknown} konumun etiket durumu kayıtsız`
        : null,
    })).sort((a, b) => a.block.localeCompare(b.block, 'tr'))

    // --- Etiket durumu özeti ---
    const labels = { unknown: 0, qr_missing: 0, printed: 0, installed: 0, verified: 0, damaged: 0, stale: 0, removed: 0 }
    for (const k of konumDurum) labels[k.deployment_state] = (labels[k.deployment_state] || 0) + 1

    return {
      available: true,
      window,
      portal_enabled: ayarlar.location_portal_enabled === true,
      settings_last_changed_at: ayarDegisim?.son || null,
      settings_history_tracked: false,
      portal_note: ayarlar.location_portal_enabled
        ? null
        : 'Portal ana anahtarı KAPALI — QR okutan sakin hiçbir şey yapamaz; buradaki sayılar geçmişe aittir.',
      services,
      totals: {
        scans: tipToplam.scan || 0,
        auth: tipToplam.auth || 0,
        fault: tipToplam.fault || 0,
        laundry_request: tipToplam.laundry_request || 0,
        cleaning_complete: tipToplam.cleaning_complete || 0,
        cleaning_review: tipToplam.cleaning_review || 0,
        survey: tipToplam.survey || 0,
      },
      results: sonuc,
      identity: kimlik,
      by_block,
      labels,
      silence: explainSilence(konumDurum),
      // Sakin memnuniyeti: toplanıyordu ama hiçbir ekran okumuyordu.
      cleaning_reviews: getCleaningReviewStats(filters, db),
      // En çok okutulan konumlar: gerçek talebin nerede olduğunu gösterir.
      busiest: konumDurum
        .filter(k => (k.scans || 0) > 0)
        .sort((a, b) => b.scans - a.scans)
        .slice(0, 15)
        .map(k => ({ location_id: k.location_id, display_name: k.display_name, block: k.block, scans: k.scans })),
    }
  } catch (err) {
    // Boş analitik "hiç kullanılmamış" diye okunur; okunamadığını söylemek gerekir.
    return { available: false, reason: `Portal analitiği okunamadı: ${err.message}` }
  }
}
