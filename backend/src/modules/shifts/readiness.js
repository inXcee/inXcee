// Vardiya Hazırlık (Sistem Sağlığı) katmanı.
//
// Neden: modülde özellik eksik değil, ama ana veriler eksikken çizelge, puantaj
// ve bordro sessizce yanlış çalışıyor. 2026-08-09 canlı tablosu: 196 aktif
// personelin 195'inde rol atanmamış, 19'unda proje yok, 8 vardiya tanımının
// adları `.` `..` `...` gibi noktalama. Ekranlar bunu "0 sonuç" ya da boş liste
// olarak gösterip sorunu gizliyordu.
//
// Kural: SESSİZ SIFIR YOK. Bir kontrol ölçülemiyorsa (tablo yok, sorgu patladı)
// 'ok' değil 'unknown' döner ve sebebini söyler — "sorun yok" ile "bakamadım"
// aynı şey değil.

const YUZDE_KRITIK = 25   // aktif kadronun dörtte biri eksikse kritik

// Sorgu patlarsa null döner; çağıran 'unknown' üretir.
function sayimDene(db, sql, params = []) {
  try {
    const row = db.prepare(sql).get(...params)
    const value = row ? Object.values(row)[0] : null
    return typeof value === 'number' ? value : Number(value ?? 0)
  } catch {
    return null
  }
}

// Eksik sayısını duruma çevirir: hiç yoksa ok, azsa uyarı, çoksa kritik.
export function eksikDurumu(eksik, toplam) {
  if (eksik === null || toplam === null) return 'unknown'
  if (eksik === 0) return 'ok'
  if (toplam > 0 && (eksik / toplam) * 100 >= YUZDE_KRITIK) return 'critical'
  return 'warning'
}

// Vardiya adı anlamlı mı? `.` `..` `,.,` gibi adlar tanım varmış gibi görünüp
// ekranda hiçbir şey ifade etmiyor — kullanıcı "tanımlı vardiya yok" sanıyor.
export function anlamsizVardiyaAdi(name) {
  const ad = String(name ?? '').trim()
  if (ad.length === 0) return true
  // Harf ya da rakam içermiyorsa (yalnız noktalama/boşluk) anlamsızdır.
  return !/[\p{L}\p{N}]/u.test(ad)
}

function kontrol(key, label, { status, count = null, total = null, detail, action }) {
  return { key, label, status, count, total, detail, action }
}

export function buildReadiness(db) {
  const aktif = sayimDene(db, 'SELECT COUNT(*) c FROM staff WHERE is_active=1')

  const items = []

  // ── Personel ana verisi ────────────────────────────────────────────────────
  const projesiz = sayimDene(db, 'SELECT COUNT(*) c FROM staff WHERE is_active=1 AND project_id IS NULL')
  items.push(kontrol('staff_project', 'Personel proje ataması', {
    status: eksikDurumu(projesiz, aktif),
    count: projesiz, total: aktif,
    detail: projesiz === null ? 'Ölçülemedi' : `${projesiz} aktif personelin projesi yok`,
    action: { label: 'Personel listesinde ata', route: '/shifts?tab=staff&filter=no_project' },
  }))

  const departmansiz = sayimDene(db, 'SELECT COUNT(*) c FROM staff WHERE is_active=1 AND department_id IS NULL')
  items.push(kontrol('staff_department', 'Personel departmanı', {
    status: eksikDurumu(departmansiz, aktif),
    count: departmansiz, total: aktif,
    detail: departmansiz === null ? 'Ölçülemedi' : `${departmansiz} aktif personelin departmanı yok`,
    action: { label: 'Personel listesinde ata', route: '/shifts?tab=staff&filter=no_department' },
  }))

  const rolsuz = sayimDene(db, 'SELECT COUNT(*) c FROM staff WHERE is_active=1 AND role_id IS NULL')
  items.push(kontrol('staff_role', 'Personel rolü', {
    status: eksikDurumu(rolsuz, aktif),
    count: rolsuz, total: aktif,
    detail: rolsuz === null ? 'Ölçülemedi'
      : `${rolsuz} aktif personele rol atanmamış — rol olmadan kapsama ve yetkinlik kontrolü çalışmaz`,
    action: { label: 'Personel listesinde ata', route: '/shifts?tab=staff&filter=no_role' },
  }))

  // ── Tanımlar ───────────────────────────────────────────────────────────────
  const rolTanim = sayimDene(db, 'SELECT COUNT(*) c FROM staff_roles')
  items.push(kontrol('role_definitions', 'Rol tanımları', {
    status: rolTanim === null ? 'unknown' : rolTanim === 0 ? 'critical' : 'ok',
    count: rolTanim,
    detail: rolTanim === null ? 'Ölçülemedi' : `${rolTanim} rol tanımlı`,
    action: { label: 'Ayarlar → Roller', route: '/shifts?tab=settings&section=roles' },
  }))

  const vardiyaTanim = sayimDene(db, 'SELECT COUNT(*) c FROM shift_definitions')
  items.push(kontrol('shift_definitions', 'Vardiya tanımları', {
    status: vardiyaTanim === null ? 'unknown' : vardiyaTanim === 0 ? 'critical' : 'ok',
    count: vardiyaTanim,
    detail: vardiyaTanim === null ? 'Ölçülemedi' : `${vardiyaTanim} vardiya tanımlı`,
    action: { label: 'Ayarlar → Vardiyalar', route: '/shifts?tab=settings&section=shifts' },
  }))

  // Adı anlamsız olan tanımlar ayrı kontrol: tanım "var" görünüp ekranda hiçbir
  // şey ifade etmediğinde kullanıcı tanım yok sanıyor.
  let anlamsiz = null
  try {
    anlamsiz = db.prepare('SELECT name FROM shift_definitions').all()
      .filter(row => anlamsizVardiyaAdi(row.name)).length
  } catch { anlamsiz = null }
  items.push(kontrol('shift_definition_names', 'Vardiya adları', {
    status: anlamsiz === null ? 'unknown' : anlamsiz === 0 ? 'ok' : 'warning',
    count: anlamsiz, total: vardiyaTanim,
    detail: anlamsiz === null ? 'Ölçülemedi'
      : anlamsiz === 0 ? 'Tüm vardiya adları okunabilir'
      : `${anlamsiz} vardiyanın adı anlamsız (nokta/virgül) — çizelgede ve föyde böyle basılır`,
    action: { label: 'Ayarlar → Vardiyalar', route: '/shifts?tab=settings&section=shifts' },
  }))

  const nokta = sayimDene(db, 'SELECT COUNT(*) c FROM work_locations')
  items.push(kontrol('work_locations', 'Çalışma noktaları', {
    status: nokta === null ? 'unknown' : nokta === 0 ? 'critical' : 'ok',
    count: nokta,
    detail: nokta === null ? 'Ölçülemedi' : `${nokta} çalışma noktası tanımlı`,
    action: { label: 'Ayarlar → Çalışma noktaları', route: '/shifts?tab=settings&section=locations' },
  }))

  const proje = sayimDene(db, 'SELECT COUNT(*) c FROM projects')
  items.push(kontrol('projects', 'Projeler', {
    status: proje === null ? 'unknown' : proje === 0 ? 'critical' : 'ok',
    count: proje,
    detail: proje === null ? 'Ölçülemedi' : `${proje} proje tanımlı`,
    action: { label: 'Ayarlar → Projeler', route: '/shifts?tab=settings&section=projects' },
  }))

  // ── Kurallar ve takvim ─────────────────────────────────────────────────────
  const tatil = sayimDene(db, "SELECT COUNT(*) c FROM holidays WHERE strftime('%Y', date) = strftime('%Y','now')")
  items.push(kontrol('holidays', 'Resmî tatiller (bu yıl)', {
    status: tatil === null ? 'unknown' : tatil === 0 ? 'warning' : 'ok',
    count: tatil,
    detail: tatil === null ? 'Ölçülemedi'
      : tatil === 0 ? 'Bu yıl için tatil girilmemiş — tatil çarpanı puantaja yansımaz'
      : `${tatil} tatil girilmiş`,
    action: { label: 'Ayarlar → Tatiller', route: '/shifts?tab=settings&section=holidays' },
  }))

  const kapsama = sayimDene(db, 'SELECT COUNT(*) c FROM shift_coverage_rules')
  items.push(kontrol('coverage_rules', 'Kapsama kuralları', {
    status: kapsama === null ? 'unknown' : kapsama === 0 ? 'warning' : 'ok',
    count: kapsama,
    detail: kapsama === null ? 'Ölçülemedi'
      : kapsama === 0 ? 'Kural yok — eksik kadro uyarısı üretilemez'
      : `${kapsama} kapsama kuralı tanımlı`,
    action: { label: 'Kapsama panelinde tanımla', route: '/shifts?tab=schedule&panel=coverage' },
  }))

  // ── Belgeler ───────────────────────────────────────────────────────────────
  const suresiDolan = sayimDene(db, `
    SELECT COUNT(DISTINCT d.staff_id) c
    FROM documents d JOIN staff s ON s.id = d.staff_id
    WHERE s.is_active = 1 AND d.archived_at IS NULL
      AND d.expires_on IS NOT NULL AND d.expires_on < date('now')`)
  items.push(kontrol('expired_documents', 'Süresi dolmuş belge', {
    status: suresiDolan === null ? 'unknown' : suresiDolan === 0 ? 'ok' : 'warning',
    count: suresiDolan, total: aktif,
    detail: suresiDolan === null ? 'Ölçülemedi'
      : suresiDolan === 0 ? 'Süresi dolmuş belge yok'
      : `${suresiDolan} personelin süresi dolmuş belgesi var`,
    action: { label: 'Personel belgelerini aç', route: '/personnel?filter=expired_documents' },
  }))

  return { items, summary: readinessSummary(items) }
}

// Özet: kaç kontrol hangi durumda. 'unknown' ayrı sayılır ki "her şey yolunda"
// ile "bakamadım" karışmasın.
export function readinessSummary(items = []) {
  const say = durum => items.filter(i => i.status === durum).length
  const critical = say('critical')
  const warning = say('warning')
  const unknown = say('unknown')
  return {
    ok: say('ok'),
    warning,
    critical,
    unknown,
    total: items.length,
    // Hazır sayılmak için kritik olmamalı VE ölçülemeyen kalmamalı.
    ready: critical === 0 && unknown === 0,
  }
}
