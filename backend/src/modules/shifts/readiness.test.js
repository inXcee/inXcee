import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { buildReadiness, readinessSummary, eksikDurumu, anlamsizVardiyaAdi } from './readiness.js'

// Hazırlık katmanının tek işi DOĞRU saymak. 2026-08-09'da kullanıcı canlı
// ekranlara bakıp "125 personelin tamamında atama eksik, vardiya tipi yok, rol
// yok" diye özetledi; gerçek tablo 196 aktif / 19 projesiz / 8 vardiya tanımı /
// 6 rol idi. Yanlış sayı, yanlış öncelik demek.

describe('eksik oranı → durum', () => {
  it('eksik yoksa ok', () => {
    expect(eksikDurumu(0, 100)).toBe('ok')
  })

  it('az eksikte uyarı, çok eksikte kritik', () => {
    expect(eksikDurumu(10, 100)).toBe('warning')     // %10
    expect(eksikDurumu(25, 100)).toBe('critical')    // %25 eşik
    expect(eksikDurumu(195, 196)).toBe('critical')   // canlıdaki rol durumu
  })

  // Ölçülemeyeni 'ok' saymak, bugünkü sessiz boşluğun ta kendisi.
  it('ölçülemeyen ok sayılmaz', () => {
    expect(eksikDurumu(null, 100)).toBe('unknown')
    expect(eksikDurumu(5, null)).toBe('unknown')
  })

  it('toplam sıfırken bölme hatası vermez', () => {
    expect(eksikDurumu(0, 0)).toBe('ok')
    expect(eksikDurumu(3, 0)).toBe('warning')
  })
})

describe('anlamsız vardiya adı', () => {
  // Canlıdaki sekiz tanımın adı: , | ,,. | ,., | . | ., | .. | .., | ...
  it('yalnız noktalama olan adları yakalar', () => {
    ;[',', ',,.', ',.,', '.', '.,', '..', '..,', '...', '', '   '].forEach(ad => {
      expect(anlamsizVardiyaAdi(ad)).toBe(true)
    })
  })

  it('okunabilir adları eler', () => {
    ;['Gündüz', '08-16', 'Gece 2', 'A'].forEach(ad => {
      expect(anlamsizVardiyaAdi(ad)).toBe(false)
    })
  })

  it('null/undefined patlatmaz', () => {
    expect(anlamsizVardiyaAdi(null)).toBe(true)
    expect(anlamsizVardiyaAdi(undefined)).toBe(true)
  })
})

describe('özet', () => {
  const madde = status => ({ status })

  it('durumları sayar', () => {
    const o = readinessSummary([madde('ok'), madde('warning'), madde('critical'), madde('unknown')])
    expect(o).toMatchObject({ ok: 1, warning: 1, critical: 1, unknown: 1, total: 4 })
  })

  it('kritik varken hazır değil', () => {
    expect(readinessSummary([madde('ok'), madde('critical')]).ready).toBe(false)
  })

  // "Bakamadım" ile "sorun yok" aynı sayılmamalı.
  it('ölçülemeyen varken hazır değil', () => {
    expect(readinessSummary([madde('ok'), madde('unknown')]).ready).toBe(false)
  })

  it('hepsi ok/uyarı ise hazır', () => {
    expect(readinessSummary([madde('ok'), madde('warning')]).ready).toBe(true)
  })
})

describe('buildReadiness — gerçek şemaya karşı', () => {
  let db

  beforeAll(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE staff (id INTEGER PRIMARY KEY, is_active INTEGER, project_id INTEGER, department_id INTEGER, role_id INTEGER);
      CREATE TABLE staff_roles (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE shift_definitions (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE work_locations (id INTEGER PRIMARY KEY);
      CREATE TABLE projects (id INTEGER PRIMARY KEY);
      CREATE TABLE holidays (id INTEGER PRIMARY KEY, date TEXT);
      CREATE TABLE shift_coverage_rules (id INTEGER PRIMARY KEY);
      CREATE TABLE documents (id INTEGER PRIMARY KEY, staff_id INTEGER, expires_on TEXT, archived_at TEXT);
    `)
    // Canlıya benzer tablo: 4 aktif personel, 1'i projesiz, 3'ü rolsüz
    db.exec(`
      INSERT INTO staff(id,is_active,project_id,department_id,role_id) VALUES
        (1,1,1,1,1),(2,1,NULL,1,NULL),(3,1,1,NULL,NULL),(4,1,1,1,NULL),(5,0,NULL,NULL,NULL);
      INSERT INTO staff_roles(id,name) VALUES (1,'Aşçı');
      INSERT INTO shift_definitions(id,name) VALUES (1,'Gündüz'),(2,'..'),(3,'.');
      INSERT INTO work_locations(id) VALUES (1);
      INSERT INTO projects(id) VALUES (1),(2);
      INSERT INTO shift_coverage_rules(id) VALUES (1);
    `)
    db.prepare("INSERT INTO holidays(id,date) VALUES (1, strftime('%Y','now') || '-01-01')").run()
    db.prepare("INSERT INTO documents(id,staff_id,expires_on,archived_at) VALUES (1, 1, date('now','-5 day'), NULL)").run()
  })

  const bul = (rapor, key) => rapor.items.find(i => i.key === key)

  it('pasif personeli saymaz', () => {
    const rapor = buildReadiness(db)
    expect(bul(rapor, 'staff_project').total).toBe(4)     // 5 kayıt, 1'i pasif
    expect(bul(rapor, 'staff_project').count).toBe(1)
  })

  it('rol atanmamışları kritik gösterir', () => {
    const rol = bul(buildReadiness(db), 'staff_role')
    expect(rol.count).toBe(3)                 // 4 aktiften 3'ü
    expect(rol.status).toBe('critical')       // %75
  })

  // Tanım "var" ama adı anlamsızsa kullanıcı tanım yok sanıyor.
  it('tanım sayısı ile anlamsız ad kontrolünü ayırır', () => {
    const rapor = buildReadiness(db)
    expect(bul(rapor, 'shift_definitions').status).toBe('ok')
    expect(bul(rapor, 'shift_definitions').count).toBe(3)
    expect(bul(rapor, 'shift_definition_names').count).toBe(2)
    expect(bul(rapor, 'shift_definition_names').status).toBe('warning')
  })

  it('süresi dolmuş belgeyi yakalar, pasif personeli katmaz', () => {
    const belge = bul(buildReadiness(db), 'expired_documents')
    expect(belge.count).toBe(1)
    expect(belge.status).toBe('warning')
  })

  it('her maddede düzeltme bağlantısı var', () => {
    buildReadiness(db).items.forEach(item => {
      expect(item.action?.route, `${item.key} için yönlendirme yok`).toBeTruthy()
      expect(item.label).toBeTruthy()
    })
  })

  // Asıl kural: tablo yoksa 'ok' değil 'unknown'.
  it('tablo yoksa unknown döner, ok demez', () => {
    const bos = new Database(':memory:')
    const rapor = buildReadiness(bos)
    expect(rapor.items.every(i => i.status === 'unknown')).toBe(true)
    expect(rapor.summary.ready).toBe(false)
    expect(rapor.summary.ok).toBe(0)
    bos.close()
  })
})
