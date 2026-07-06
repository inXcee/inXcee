import { Router } from 'express'
import { createPDF, addTable, addSectionTitle, addKpiRow } from '../../../shared/pdf/generator.js'
import * as service from '../service.js'
import { logger } from '../../../shared/logger.js'
import { mgrAccess, toCsv } from './shared.js'

export const inventoryReportsRouter = Router()

// CSV — tüm kalemler
inventoryReportsRouter.get('/inventory.csv', ...mgrAccess, (req, res) => {
  try {
    const { items } = service.getInventoryDetailSvc()
    const headers = ['Stok Adi', 'Kategori', 'Lokasyon', 'Miktar', 'Birim', 'Esik', 'Durum',
      'Birim Fiyat', 'Tahmini Deger', 'Son Guncelleme']
    const csv = toCsv(headers, items.map(i => [
      i.item_name, i.category, i.location, i.quantity, i.unit, i.reorder_threshold,
      i.out_of_stock ? 'STOK YOK' : i.below_threshold ? 'YETERSIZ' : 'NORMAL',
      i.unit_price || 0, i.estimated_value || 0,
      i.last_updated ? i.last_updated.slice(0, 10) : '',
    ]))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="envanter-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send(csv)
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// CSV — son 30 gun hareketler
inventoryReportsRouter.get('/inventory/movements.csv', ...mgrAccess, (req, res) => {
  try {
    const { movements } = service.getInventoryDetailSvc()
    const headers = ['Tarih', 'Tip', 'Stok', 'Kategori', 'Birim', 'Miktar', 'Stok Sonrasi', 'Sebep', 'Kullanici']
    const csv = toCsv(headers, movements.map(m => [
      m.created_at ? m.created_at.slice(0, 19).replace('T', ' ') : '',
      m.type === 'in' ? 'GIRIS' : m.type === 'out' ? 'CIKIS' : m.type === 'count' ? 'SAYIM' : m.type,
      m.item_name, m.category, m.unit,
      m.delta, m.quantity_after, m.reason || '',
      m.user_name || '',
    ]))
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="envanter-hareketler-${new Date().toISOString().slice(0,10)}.csv"`)
    res.send(csv)
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

// PDF — zengin ozet
inventoryReportsRouter.get('/inventory', ...mgrAccess, (req, res) => {
  try {
    const d = service.getInventoryDetailSvc()
    const tl = (n) => n != null ? Math.round(n).toLocaleString('tr-TR') + ' TL' : '-'
    const totalValue = d.items.reduce((s, i) => s + (i.estimated_value || 0), 0)

    const doc = createPDF(res, 'Envanter Raporu')
    addKpiRow(doc, [
      { label: 'Toplam Kalem', value: d.items.length },
      { label: 'Yetersiz', value: d.lowStock.length, color: d.lowStock.length > 0 ? '#f97316' : '#22c55e' },
      { label: 'Stok Yok', value: d.outOfStock.length, color: d.outOfStock.length > 0 ? '#ef4444' : '#22c55e' },
      { label: 'Toplam Deger', value: tl(totalValue), color: '#0369a1' },
    ])
    addKpiRow(doc, [
      { label: 'Giris (30g)', value: d.movSummary.in, color: '#22c55e' },
      { label: 'Cikis (30g)', value: d.movSummary.out, color: '#f97316' },
      { label: 'Sayim Duzelt.', value: d.movSummary.count_adj },
      { label: 'Hareket (30g)', value: d.movements.length },
    ])

    addSectionTitle(doc, 'Kategori Bazli Ozet')
    addTable(doc,
      ['Kategori', 'Kalem', 'Yetersiz', 'Stok Yok', 'Tahmini Deger'],
      d.byCategory.map(c => [c.category, c.n, c.below, c.out, tl(c.value)]),
      [120, 60, 70, 70, 130]
    )

    if (d.outOfStock.length > 0) {
      addSectionTitle(doc, `⚠ STOK YOK (${d.outOfStock.length} kalem — ACIL SIPARIS)`)
      addTable(doc,
        ['Stok', 'Kategori', 'Lokasyon', 'Esik', 'Birim'],
        d.outOfStock.map(i => [i.item_name, i.category, i.location || '-', i.reorder_threshold, i.unit]),
        [140, 80, 90, 60, 80]
      )
    }

    if (d.lowStock.length > 0) {
      addSectionTitle(doc, `Yetersiz Stok (${d.lowStock.length} kalem)`)
      addTable(doc,
        ['Stok', 'Kategori', 'Mevcut', 'Esik', 'Eksik', 'Birim'],
        d.lowStock.map(i => [
          i.item_name, i.category, i.quantity, i.reorder_threshold,
          Math.max(0, (i.reorder_threshold - i.quantity)).toFixed(1), i.unit,
        ]),
        [140, 75, 60, 60, 60, 60]
      )
    }

    if (d.topValuable.length > 0) {
      addSectionTitle(doc, 'En Degerli 15 Kalem')
      addTable(doc,
        ['Stok', 'Kategori', 'Miktar', 'Birim Fiyat', 'Deger'],
        d.topValuable.map(i => [
          i.item_name, i.category, i.quantity, tl(i.unit_price), tl(i.estimated_value),
        ]),
        [130, 80, 70, 90, 90]
      )
    }

    if (d.topConsumed.length > 0) {
      addSectionTitle(doc, 'En Cok Tuketilen 15 Kalem (son 30 gun)')
      addTable(doc,
        ['Stok', 'Toplam Cikis', 'Birim'],
        d.topConsumed.map(c => [c.item, c.total_out, c.unit]),
        [250, 120, 80]
      )
    }

    if (d.byLocation.length > 0) {
      addSectionTitle(doc, 'Lokasyon Bazli Dagilim')
      addTable(doc,
        ['Lokasyon', 'Kalem', 'Tahmini Deger'],
        d.byLocation.map(l => [l.location, l.n, tl(l.value)]),
        [180, 80, 130]
      )
    }

    addSectionTitle(doc, 'Tum Kalemler')
    addTable(doc,
      ['Stok', 'Kategori', 'Miktar', 'Birim', 'Esik', 'Durum'],
      d.items.slice(0, 200).map(i => [
        i.item_name, i.category, i.quantity, i.unit, i.reorder_threshold,
        i.out_of_stock ? 'STOK YOK' : i.below_threshold ? 'YETERSIZ' : 'NORMAL',
      ]),
      [140, 80, 60, 60, 60, 80]
    )

    if (d.movements.length > 0) {
      addSectionTitle(doc, 'Son Hareketler (50 kayit)')
      addTable(doc,
        ['Tarih', 'Tip', 'Stok', 'Miktar', 'Sebep'],
        d.movements.slice(0, 50).map(m => [
          m.created_at ? m.created_at.slice(0, 16).replace('T', ' ') : '-',
          m.type === 'in' ? 'GIRIS' : m.type === 'out' ? 'CIKIS' : 'SAYIM',
          (m.item_name || '').substring(0, 25),
          m.delta,
          (m.reason || '').substring(0, 30),
        ]),
        [110, 50, 130, 50, 145]
      )
    }
    doc.end()
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})

inventoryReportsRouter.get('/inventory/data', ...mgrAccess, (req, res) => {
  try {
    const d = service.getInventoryDetailSvc()
    const totalValue = d.items.reduce((s, i) => s + (i.estimated_value || 0), 0)
    res.json({
      total: d.items.length,
      below_threshold: d.lowStock.length,
      out_of_stock: d.outOfStock.length,
      total_value: Math.round(totalValue),
      movements_30d: d.movements.length,
      categories: d.byCategory.length,
    })
  } catch (e) { logger.error("[Route]", e); res.status(500).json({ error: "Sunucu hatası" }) }
})
