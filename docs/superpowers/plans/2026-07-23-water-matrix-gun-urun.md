# Su Raporu GÜN↓ × ÜRÜN→ Dökümü Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Muhasebe PDF'inde "Dağıtım Yeri × Gün" bölümünü GÜN↓ × ÜRÜN→ dökümüne çevir (genel tablo + her yer tek tek) ve "Gün gün detay" tablolarının `1 2 3` başlıklarını gerçek ürün adlarıyla değiştir.

**Architecture:** Yalnız `backend/src/modules/water/report-pdf.js` değişir (veri katmanı `report.js` aynı kalır — gerekli hücreler zaten üretiliyor). `columnFlow` akış motoruna `startAt` desteği eklenir ki genel tablo ile yer tabloları aynı sayfayı paylaşsın. Testler `doc.text` yakalama desenini (dosyada mevcut) kullanır — koordinat değil, çizilen metin içeriği assert edilir (font-bağımsız).

**Tech Stack:** Node ESM, pdfkit, vitest + supertest, better-sqlite3 (`:memory:`).

**Spec:** `docs/superpowers/specs/2026-07-23-water-matrix-gun-urun-design.md`

**Önemli mevcut kod gerçekleri:**
- `detail.rows[].products[].cells[i]` = o yerin o ürününden `detail.columns[i]` gününe düşen miktar; `detail.rows[].cells[i]` = yerin gün toplamı; `detail.product_rows[].cells[i]` = ürünün gün toplamı. `report.daily[i]` **aynı anahtar sırası** ile üretilir (ikisi de `dayKeys`/`monthKeys`) — gün etiketi (`03.06 Çar` / `Haziran 2026`) `daily[i].label`.
- Yerleşim bekçisi: `report.test.js:128` "yoğun veride bile hücreler kırpılmaz…" testi `doc.text`'i sarıp taşmaları ölçer (widthFactor 1 ve 1.15). Yeni çizim bundan geçmeli.
- Sayfa sınırı: `report.test.js:292` `sections=all` için sayfa sayısı `≤ 7` olmalı.
- Kırık link tuzağı: `sections=matrix` tek başına istenince gün detay bölümü basılmaz ama eski kod yine `day-*` bağlantısı üretir → hedefsiz link. Yeni kodda bağlantı yalnız `renderableSections(report).includes('days')` iken kurulur.
- CLAUDE.md: test geçmeden commit yok → her commit adımından önce **tam** `npx vitest run` yeşil olmalı.

---

### Task 1: Yeni matris yerleşimi testleri (önce kırmızı)

**Files:**
- Modify: `backend/src/modules/water/report.test.js` (dosya sonuna yeni describe)

- [ ] **Step 1: Test yardımcıcısı + 3 matris testini dosya sonuna ekle**

`report.test.js` sonundaki son describe bloğundan SONRA (dosyanın en altına) ekle:

```js
describe('Su muhasebe raporu — GÜN×ÜRÜN yerleşimi', () => {
  // Çizilen metinleri sayfa numarasıyla yakalar; koordinat/font asserti YOK
  // (Windows Arial ≠ sunucu DejaVu — yerleşim testleri font-bağımsız kalmalı).
  const renderDraws = async (report) => {
    const doc = new PDFDocument({ size: 'A4', margin: 28 })
    doc.on('data', () => {})
    const done = new Promise(resolve => doc.on('end', resolve))
    const draws = []
    const links = []
    const targets = []
    let page = 1
    const originalAddPage = doc.addPage.bind(doc)
    doc.addPage = (...args) => { page += 1; return originalAddPage(...args) }
    const originalText = doc.text.bind(doc)
    doc.text = (value, x, y, options) => {
      if (typeof x === 'number' && typeof y === 'number') draws.push({ value: String(value), page })
      return originalText(value, x, y, options)
    }
    const originalGoTo = doc.goTo.bind(doc)
    doc.goTo = (x, y, w, h, name) => { links.push(name); return originalGoTo(x, y, w, h, name) }
    const originalDestination = doc.addNamedDestination.bind(doc)
    doc.addNamedDestination = (name, ...args) => { targets.push(name); return originalDestination(name, ...args) }
    writeAccountingReportPDF(report, doc)
    await done
    return { draws, links, targets }
  }

  it('matris: ürün adları üstte, günler aşağı, yer tabloları tek tek', async () => {
    const report = accountingReportService({ from: '2026-06-01', to: '2026-06-30', sections: 'matrix' })
    const { draws, links, targets } = await renderDraws(report)
    const matrixDraws = draws.filter(draw => draw.page > 1) // sayfa 1 = özet
    const count = value => matrixDraws.filter(draw => draw.value === value).length
    // Ürün adı başlıklarda: genel tablo + Bölge A tablosu + Bölge B tablosu
    expect(count('Rapor Suyu')).toBe(3)
    // Gün etiketi satır olarak: genel tabloda + yalnız o gün hareketi olan yerin tablosunda
    expect(count('03.06 Çar')).toBe(2) // genel + Rapor Bölge A
    expect(count('05.06 Cum')).toBe(2) // genel + Rapor Bölge B
    // Eski gün-numarası sütun başlıkları tamamen gitti
    expect(count('01')).toBe(0)
    expect(count('02')).toBe(0)
    // Yer bantları tek tek çizildi
    expect(count('Rapor Bölge A')).toBe(1)
    expect(count('Rapor Bölge B')).toBe(1)
    // Gün detay bölümü basılmıyor → hedefsiz gün bağlantısı da olmamalı
    expect(links.filter(name => !targets.includes(name))).toEqual([])
  })

  it('matris uzun aralıkta ay satırlarına düşer', async () => {
    const report = accountingReportService({ from: '2026-05-01', to: '2026-07-31', sections: 'matrix' })
    const { draws } = await renderDraws(report)
    const matrixDraws = draws.filter(draw => draw.page > 1)
    // 'Haziran 2026' genel tabloda satır + hareketli yer tablolarında satır
    expect(matrixDraws.filter(draw => draw.value === 'Haziran 2026').length).toBeGreaterThanOrEqual(2)
  })

  it('yer tablosunda 6 üründen fazlası Diğer sütununda toplanır', async () => {
    const db = getDB()
    const zoneId = db.prepare('INSERT INTO water_zones(name) VALUES(?)').run('Çok Ürünlü Yer').lastInsertRowid
    const insertProduct = db.prepare(`INSERT INTO water_products(name, unit_label, units_per_case, cases_per_pallet)
      VALUES(?, 'koli', 1, 10)`)
    const insertMove = db.prepare(`INSERT INTO water_movements(type, product_id, zone_id, move_date, qty_base, input_qty, input_unit)
      VALUES('out', ?, ?, '2027-06-10', ?, 1, 'koli')`)
    for (let index = 1; index <= 7; index += 1) {
      const id = insertProduct.run(`Kalabalık Ürün ${index}`).lastInsertRowid
      insertMove.run(id, zoneId, 100 - index) // çoktan aza: Ürün 1 en büyük, Ürün 7 en küçük
    }
    const report = accountingReportService({ from: '2027-06-01', to: '2027-06-30', sections: 'matrix' })
    const { draws } = await renderDraws(report)
    const values = draws.filter(draw => draw.page > 1).map(draw => draw.value)
    expect(values).toContain('Diğer') // yer tablosunda 7. sütun
    expect(values.some(value => value.startsWith('Diğer: Kalabalık Ürün 7'))).toBe(true) // kapsam notu
    expect(values).toContain('Kalabalık Ürün 1') // görünen 6'nın adı başlıkta
  })
})
```

- [ ] **Step 2: Testlerin KIRMIZI olduğunu doğrula**

Çalıştır: `cd backend && npx vitest run src/modules/water/report.test.js`
Beklenen: yeni 3 test FAIL (eski çizim `Rapor Suyu`'yu matris sayfasında başlık olarak çizmez, `01` gün başlıkları hâlâ var); mevcut testler PASS.

Commit yok (kırmızı testle commit yasak — implementasyonla birlikte gelecek).

---

### Task 2: `drawMatrixSection` yeniden yazımı + `columnFlow.startAt`

**Files:**
- Modify: `backend/src/modules/water/report-pdf.js`
  - Başlıklar: `SECTION_TITLES.matrix` (satır 62), `SECTION_SHORT.matrix` (satır 76), dosya başı yorumu (satır 4)
  - Sabit: `MATRIX_ZONE_LIMIT` yanına `ZONE_PRODUCT_COLUMNS` (satır ~54)
  - `columnFlow` (satır 224-262): `startAt` desteği
  - `drawMatrixSection` (satır 464-589): komple değiştir

- [ ] **Step 1: Başlıkları ve sabiti güncelle**

Satır 62 `matrix: 'DAĞITIM YERİ × GÜN MATRİSİ',` → `matrix: 'DAĞITIM YERİ × GÜN — ÜRÜN DÖKÜMÜ',`
Satır 76 `matrix: 'Yer × Gün matrisi',` → `matrix: 'Yer · Gün · Ürün',`
Satır 4 yorumundaki `içindekiler ile matristeki gün başlıkları oraya atlar.` → `içindekiler ile matristeki gün satırları oraya atlar.`
Satır 54 `const MATRIX_ZONE_LIMIT = 60` altına:

```js
// Yer tablosunda yan yana en fazla bu kadar ürün sütunu; fazlası "Diğer"de toplanır.
const ZONE_PRODUCT_COLUMNS = 6
```

- [ ] **Step 2: `columnFlow`'a startAt ekle**

`columnFlow` fonksiyonunu (satır 224-262) şununla değiştir (davranış `startAt` verilmeyince birebir aynı):

```js
// Sütun akışı: blokları sırayla yerleştirir, sütun dolunca yana, sayfa dolunca
// yeni sayfaya geçer. "Mümkün olduğunca az sayfa" bunun sayesinde.
// startAt: {layout, y} — bölüm aynı sayfada başka bir bloğun altından sürer;
// ilk sayfada tüm kolonlar o hizadan başlar, sayfa kırılınca normal tepeye döner.
function columnFlow(doc, fonts, ctx, { title, columns = 2, gap = 14, landscape = false, destination, startAt = null }) {
  let layout = startAt ? startAt.layout : sectionPage(doc, fonts, ctx, {
    title, landscape,
    destination: destination === undefined ? `sec-${ctx.currentSection}` : destination,
  })
  let columnIndex = 0
  let top = startAt ? startAt.y : layout.top
  let y = top
  const widthOf = () => (layout.innerWidth - gap * (columns - 1)) / columns
  const advance = () => {
    columnIndex += 1
    if (columnIndex >= columns) {
      layout = sectionPage(doc, fonts, ctx, { title, landscape, continued: true })
      columnIndex = 0
      top = layout.top
    }
    y = top
  }

  return {
    get columnWidth() { return widthOf() },
    willBreak(height) { return y + height > layout.bottom },
    place(height) {
      if (y + height > layout.bottom) advance()
      const spot = { x: layout.margin + columnIndex * (widthOf() + gap), y, width: widthOf() }
      y += height
      return spot
    },
    // Blok başlığı yalnız başına kalmasın: başlık + ilk satır aynı sütuna sığmıyorsa
    // ikisini birlikte taşı.
    reserve(height) {
      if (y + height > layout.bottom) advance()
    },
  }
}
```

- [ ] **Step 3: `drawMatrixSection`'ı komple değiştir**

Satır 464-589 arasını (`// ── Bölüm 2: dağıtım yeri × gün matrisi (yatay) ──` başlığından `drawLedgerSection` üstündeki boş satıra kadar) şununla değiştir:

```js
// ── Bölüm 2: GÜN ↓ × ÜRÜN → dökümü (ay geneli + her yer tek tek) ──

function drawMatrixSection(doc, fonts, ctx) {
  const { detail, daily } = ctx.report
  const text = value => pdfText(value, fonts)
  // Gün bağlantısı yalnız gün detay bölümü gerçekten basılacaksa kurulur —
  // hedefsiz (kırık) bağlantı kalmasın (örn. sections=matrix tek başına).
  const daysRendered = renderableSections(ctx.report).includes('days')
  const dayLinks = new Set(daysRendered ? (detail.days || []).map(day => day.key) : [])
  const zones = detail.rows.slice(0, MATRIX_ZONE_LIMIT)
  const products = detail.product_rows.slice(0, PRODUCT_COLUMN_LIMIT)
  const title = SECTION_TITLES.matrix

  let layout = sectionPage(doc, fonts, ctx, { title, destination: 'sec-matrix' })
  let y = layout.top

  // — Ay geneli tablo: satırlar gün (grouped modda ay), sütunlar ürün —
  const labelWidth = 64
  const totalWidth = 44
  const cellWidth = (layout.innerWidth - labelWidth - totalWidth) / Math.max(1, products.length)
  const totalX = () => layout.margin + labelWidth + products.length * cellWidth
  const headerHeight = 24
  const rowHeight = 10.4

  const globalHeader = (top) => {
    doc.rect(layout.margin, top, layout.innerWidth, headerHeight).fill('#E2E8F0')
    doc.font(fonts.bold).fillColor('#334155')
    fitFontSize(doc, text('GÜN'), labelWidth - 6, 6.6, 4.6)
    doc.text(text('GÜN'), layout.margin + 3, top + 8, { width: labelWidth - 6, lineBreak: false })
    products.forEach((product, index) => {
      const x = layout.margin + labelWidth + index * cellWidth
      // Ürün adı ve birimi başlıkta bir kez — hücrelerde tekrar yok
      doc.font(fonts.bold).fillColor('#334155')
      fitFontSize(doc, text(product.name), cellWidth - 4, 6, 4.2)
      doc.text(text(product.name), x + 2, top + 4, { width: cellWidth - 4, align: 'center', lineBreak: false, ellipsis: true })
      doc.font(fonts.regular).fillColor(MUTED)
      const unitText = text(product.unit_label || 'adet')
      fitFontSize(doc, unitText, cellWidth - 4, 5.2, 4)
      doc.text(unitText, x + 2, top + 14, { width: cellWidth - 4, align: 'center', lineBreak: false })
    })
    doc.font(fonts.bold).fillColor('#334155')
    fitFontSize(doc, text('TOPLAM'), totalWidth - 4, 6.6, 4.6)
    doc.text(text('TOPLAM'), totalX() + 2, top + 8, { width: totalWidth - 4, align: 'right', lineBreak: false })
    return top + headerHeight
  }

  const ensureGlobal = (height) => {
    if (y + height > layout.bottom) {
      layout = sectionPage(doc, fonts, ctx, { title, continued: true })
      y = globalHeader(layout.top)
    }
  }

  y = globalHeader(y)
  detail.columns.forEach((column, index) => {
    ensureGlobal(rowHeight)
    // daily, columns ile aynı anahtar sırasından üretilir (dayKeys/monthKeys) —
    // gün etiketi ("03.06 Çar" / "Haziran 2026") oradan gelir.
    const label = daily[index]?.label || column.full
    const rowTotal = detail.column_totals[index] || 0
    const linked = dayLinks.has(column.key)
    if (index % 2 === 1) doc.rect(layout.margin, y, layout.innerWidth, rowHeight).fill(ZEBRA)
    doc.font(linked ? fonts.bold : fonts.regular).fillColor(linked ? BAND : rowTotal ? INK : FADE)
    const labelSize = fitFontSize(doc, text(label), labelWidth - 6, 6.2, 4.2)
    doc.text(text(label), layout.margin + 3, y + (rowHeight - labelSize) / 2 - 0.3, { width: labelWidth - 6, lineBreak: false })
    if (linked) linkArea(doc, `day-${column.key}`, layout.margin, y, labelWidth, rowHeight)
    products.forEach((product, productIndex) => {
      const x = layout.margin + labelWidth + productIndex * cellWidth
      const value = product.cells[index] || 0
      doc.font(fonts.regular).fillColor(value ? INK : FADE)
      const cellText = value ? compactCell(doc, value, cellWidth - 4) : '·'
      const cellSize = fitFontSize(doc, cellText, cellWidth - 4, 6.2, 4.2)
      doc.text(cellText, x + 2, y + (rowHeight - cellSize) / 2 - 0.3, { width: cellWidth - 4, align: 'center', lineBreak: false })
    })
    doc.font(fonts.bold).fillColor(rowTotal ? INK : FADE)
    const totalText = rowTotal ? compactCell(doc, rowTotal, totalWidth - 4, 4.5) : '·'
    const totalSize = fitFontSize(doc, totalText, totalWidth - 4, 6.4)
    doc.text(totalText, totalX() + 2, y + (rowHeight - totalSize) / 2 - 0.3, { width: totalWidth - 4, align: 'right', lineBreak: false })
    y += rowHeight
  })

  ensureGlobal(rowHeight * 2 + 12)
  doc.rect(layout.margin, y, layout.innerWidth, rowHeight).fill('#FEF3C7')
  doc.font(fonts.bold).fillColor(INK)
  doc.fontSize(6.4).text(text('TOPLAM'), layout.margin + 3, y + 2.4, { width: labelWidth - 6, lineBreak: false })
  products.forEach((product, index) => {
    const x = layout.margin + labelWidth + index * cellWidth
    const cellText = compactCell(doc, product.total, cellWidth - 4)
    const cellSize = fitFontSize(doc, cellText, cellWidth - 4, 6.4, 4.2)
    doc.text(cellText, x + 2, y + (rowHeight - cellSize) / 2 - 0.3, { width: cellWidth - 4, align: 'center', lineBreak: false })
  })
  const grandText = compactCell(doc, detail.grand_total, totalWidth - 4, 4.5)
  const grandSize = fitFontSize(doc, grandText, totalWidth - 4, 6.4)
  doc.text(grandText, totalX() + 2, y + (rowHeight - grandSize) / 2 - 0.3, { width: totalWidth - 4, align: 'right', lineBreak: false })
  y += rowHeight

  // PAY satırı: her ürünün dönem payı
  doc.font(fonts.regular).fillColor(MUTED)
  doc.fontSize(5.6).text(text('PAY'), layout.margin + 3, y + 2, { width: labelWidth - 6, lineBreak: false })
  products.forEach((product, index) => {
    const x = layout.margin + labelWidth + index * cellWidth
    const shareText = text(`%${String(product.share).replace('.', ',')}`)
    const shareSize = fitFontSize(doc, shareText, cellWidth - 4, 5.6, 4)
    doc.text(shareText, x + 2, y + 2 + (5.6 - shareSize) / 2, { width: cellWidth - 4, align: 'center', lineBreak: false })
  })
  doc.fontSize(5.6).text(text('%100'), totalX() + 2, y + 2, { width: totalWidth - 4, align: 'right', lineBreak: false })
  y += 10
  doc.moveTo(layout.margin, y).lineTo(layout.margin + layout.innerWidth, y).lineWidth(0.5).strokeColor(LINE).stroke()
  y += 6

  // — Her yer tek tek: GÜN ↓ × o yerin ürünleri → (2 kolonlu akış, aynı sayfadan sürer) —
  const flow = columnFlow(doc, fonts, ctx, { title, columns: 2, gap: 16, startAt: { layout, y } })

  const drawZoneTable = (zone) => {
    const zoneProducts = zone.products || []
    const visible = zoneProducts.slice(0, ZONE_PRODUCT_COLUMNS)
    const hidden = zoneProducts.slice(ZONE_PRODUCT_COLUMNS)
    const columnCount = visible.length + (hidden.length ? 1 : 0)
    const labelW = 50
    const totalW = 34
    const cellW = (flow.columnWidth - labelW - totalW) / Math.max(1, columnCount)
    const headerH = 16
    const rowH = 9

    const activeIndexes = []
    zone.cells.forEach((value, index) => { if (value) activeIndexes.push(index) })

    const header = (continued) => {
      const spot = flow.place(headerH + 1)
      doc.rect(spot.x, spot.y, spot.width, headerH).fill('#E2E8F0')
      doc.font(fonts.bold).fontSize(5.4).fillColor('#334155')
      doc.text(text(continued ? 'GÜN · devam' : 'GÜN'), spot.x + 3, spot.y + (headerH - 5.4) / 2,
        { width: labelW - 4, lineBreak: false, ellipsis: true })
      const labels = [...visible.map(product => product.name), ...(hidden.length ? ['Diğer'] : [])]
      labels.forEach((name, index) => {
        const x = spot.x + labelW + index * cellW
        doc.font(fonts.bold).fillColor('#334155')
        // Ürün adı başlıkta TAM — iki satıra kadar sarabilsin diye ~2 satır genişliğine göre punto
        fitFontSize(doc, text(name), (cellW - 3) * 1.9, 5.2, 4)
        doc.text(text(name), x + 1.5, spot.y + 2, { width: cellW - 3, height: headerH - 3, align: 'center', ellipsis: true, lineGap: 0 })
      })
      doc.font(fonts.bold).fontSize(5.4).fillColor('#334155')
      doc.text(text('TOP'), spot.x + spot.width - totalW, spot.y + (headerH - 5.4) / 2,
        { width: totalW - 2, align: 'right', lineBreak: false })
    }

    const row = (label, cells, total, { bold = false, fill = null, linkKey = null } = {}) => {
      if (flow.willBreak(rowH)) header(true)
      const spot = flow.place(rowH)
      if (fill) doc.rect(spot.x, spot.y, spot.width, rowH).fill(fill)
      const linked = linkKey != null && dayLinks.has(linkKey)
      doc.font(bold ? fonts.bold : fonts.regular).fillColor(linked ? BAND : INK)
      const labelSize = fitFontSize(doc, text(label), labelW - 4, 5.8, 4)
      doc.text(text(label), spot.x + 3, spot.y + (rowH - labelSize) / 2 - 0.2, { width: labelW - 4, lineBreak: false })
      if (linked) linkArea(doc, `day-${linkKey}`, spot.x, spot.y, labelW, rowH)
      cells.forEach((value, index) => {
        const x = spot.x + labelW + index * cellW
        doc.font(bold ? fonts.bold : fonts.regular).fillColor(value ? INK : FADE)
        const cellText = value ? compactCell(doc, value, cellW - 3) : '·'
        const cellSize = fitFontSize(doc, cellText, cellW - 3, 5.8, 4)
        doc.text(cellText, x + 1.5, spot.y + (rowH - cellSize) / 2 - 0.2, { width: cellW - 3, align: 'center', lineBreak: false })
      })
      doc.font(fonts.bold).fillColor(INK)
      const totalText = compactCell(doc, total, totalW - 2, 4)
      const totalSize = fitFontSize(doc, totalText, totalW - 2, 5.8, 4)
      doc.text(totalText, spot.x + spot.width - totalW, spot.y + (rowH - totalSize) / 2 - 0.2,
        { width: totalW - 2, align: 'right', lineBreak: false })
    }

    // Bant + başlık + ilk satır bölünmesin
    flow.reserve(14.5 + headerH + rowH + 3)
    const band = flow.place(14.5)
    doc.rect(band.x, band.y, band.width, 13).fill('#ECFEFF')
    doc.rect(band.x, band.y, 3, 13).fill(BAND)
    doc.font(fonts.bold).fontSize(7).fillColor(INK)
    const nameSize = fitFontSize(doc, text(zone.zone_name), band.width - 112, 7, 4.4)
    doc.text(text(zone.zone_name), band.x + 6, band.y + (13 - nameSize) / 2, { width: band.width - 112, lineBreak: false, ellipsis: true })
    doc.font(fonts.regular).fillColor(MUTED)
    const meta = text(`toplam ${num(zone.total)} · %${String(zone.share).replace('.', ',')}`)
    fitFontSize(doc, meta, 102, 6, 4.2)
    doc.text(meta, band.x + band.width - 106, band.y + 3.8, { width: 102, align: 'right', lineBreak: false })

    header(false)
    for (const index of activeIndexes) {
      const cells = [
        ...visible.map(product => product.cells[index] || 0),
        ...(hidden.length ? [hidden.reduce((sum, product) => sum + (product.cells[index] || 0), 0)] : []),
      ]
      row(daily[index]?.label || detail.columns[index].full, cells, zone.cells[index], { linkKey: detail.columns[index].key })
    }
    if (activeIndexes.length > 1) {
      const totals = [
        ...visible.map(product => product.total),
        ...(hidden.length ? [hidden.reduce((sum, product) => sum + product.total, 0)] : []),
      ]
      row('TOPLAM', totals, zone.total, { bold: true, fill: '#FEF3C7' })
    }
    if (hidden.length) {
      const note = flow.place(8)
      doc.font(fonts.regular).fontSize(5.4).fillColor(MUTED)
      const noteText = text(`Diğer: ${hidden.map(product => product.name).join(', ')} (toplam ${num(hidden.reduce((sum, product) => sum + product.total, 0))})`)
      fitFontSize(doc, noteText, note.width - 4, 5.4, 4)
      doc.text(noteText, note.x + 2, note.y + 1.5, { width: note.width - 4, lineBreak: false, ellipsis: true })
    }
    flow.place(4)
  }

  for (const zone of zones) drawZoneTable(zone)

  const notes = [
    detail.grouped ? 'Satırlar aydır (aralık uzun).' : 'Yer tablolarında yalnız hareket olan günler listelenir.',
    daysRendered ? 'Mavi gün etiketi o günün detayına gider.' : null,
    'Hücreler ürünün kendi baz birimindedir.',
    detail.product_rows.length > PRODUCT_COLUMN_LIMIT
      ? `Genel tabloda en çok dağıtılan ${PRODUCT_COLUMN_LIMIT} ürün var (toplam ${detail.product_rows.length}).` : null,
    detail.rows.length > MATRIX_ZONE_LIMIT
      ? `En çok dağıtılan ${MATRIX_ZONE_LIMIT} yer gösterildi (toplam ${detail.rows.length}).` : null,
  ].filter(Boolean).join('  ·  ')
  const noteSpot = flow.place(24)
  doc.font(fonts.regular).fontSize(6).fillColor(MUTED).text(text(notes), noteSpot.x, noteSpot.y + 3, { width: noteSpot.width })
}
```

Not: `PRODUCT_COLUMN_LIMIT` sabiti dosyada `drawZonesSection` üstünde (satır ~814) tanımlı — hoisted `const` olduğu için üstteki kullanım çalışır; yine de okunabilirlik için sabiti dosya başındaki diğer limitlerin yanına (satır 53 `PRODUCT_ROW_LIMIT` altına) taşı ve eski konumundan sil.

- [ ] **Step 4: Matris testlerinin YEŞİL olduğunu doğrula**

Çalıştır: `cd backend && npx vitest run src/modules/water/report.test.js`
Beklenen: Task 1'in 3 matris testi PASS; `gün gün detay` testi henüz yazılmadı; MEVCUT tüm testler PASS (özellikle "yoğun veride bile hücreler kırpılmaz" ve "≤7 sayfa" testleri).

- [ ] **Step 5: Tam suite + commit**

Çalıştır: `cd backend && npx vitest run`
Beklenen: tümü PASS.

```bash
git add backend/src/modules/water/report-pdf.js backend/src/modules/water/report.test.js
git commit -m "feat: su raporu matris bölümü GÜN x ÜRÜN dökümü — ürün adları üstte, günler yanda, yer yer tablolar"
```

---

### Task 3: Gün gün detay — ürün adlı başlık testi (önce kırmızı)

**Files:**
- Modify: `backend/src/modules/water/report.test.js` (Task 1'deki describe içine 4. test)

- [ ] **Step 1: Testi ekle**

`'Su muhasebe raporu — GÜN×ÜRÜN yerleşimi'` describe'ının içine, son testin altına:

```js
  it('gün gün detay: başlıklar ürün adlı, numaralı lejant yok', async () => {
    const report = accountingReportService({ from: '2026-06-01', to: '2026-06-30', sections: 'days' })
    const { draws } = await renderDraws(report)
    const values = draws.filter(draw => draw.page > 1).map(draw => draw.value)
    // Dağıtım olan iki günün (03.06, 05.06) tablo başlığında ürün adı; giriş günü 02.06'da tablo yok
    expect(values.filter(value => value === 'Rapor Suyu').length).toBe(2)
    // Lejant satırı ve numaralı sütun başlığı kalmadı
    expect(values.some(value => value.startsWith('SÜTUNLAR'))).toBe(false)
    expect(values.filter(value => value === '1').length).toBe(0)
  })
```

- [ ] **Step 2: KIRMIZI doğrula**

Çalıştır: `cd backend && npx vitest run src/modules/water/report.test.js -t "gün gün detay: başlıklar"`
Beklenen: FAIL — eski kod başlığa `1` çizer, `SÜTUNLAR:` lejantı vardır, `Rapor Suyu` başlıkta yoktur.

---

### Task 4: `drawDaysSection` başlıkları — ürün adları, lejant kaldır

**Files:**
- Modify: `backend/src/modules/water/report-pdf.js` (`drawDaysSection`, satır ~690-730 ve `flow.reserve(34)` satırı ~764)

- [ ] **Step 1: Lejantı kaldır, başlığı ürün adlı yap**

`drawDaysSection` içinde satır 693-711 arasını — `const title = SECTION_TITLES.days` satırından lejant bloğunun son satırına (`doc.fillColor('#0F766E')...`) kadar, ikisi dahil — şununla değiştir (`labelWidth`/`cellW` tanımları olduğu gibi kalır):

```js
  const title = SECTION_TITLES.days
  // Ürünler her gün tablosunda SÜTUN; adları numara/lejant yerine HER tablonun
  // başlığında tam yazılır (gerekirse punto küçülür, iki satıra sarar).
  const products = detail.product_rows.slice(0, PRODUCT_COLUMN_LIMIT)
  const overflow = detail.product_rows.length > products.length
  const columnIndexById = new Map(products.map((product, index) => [product.product_id, index]))
  const columnCount = products.length + (overflow ? 1 : 0)
  const flowColumns = columnCount <= 4 ? 2 : 1
  const flow = columnFlow(doc, fonts, ctx, { title, columns: flowColumns, gap: 16 })
  const dayItems = ctx.outline.children[ctx.outline.children.length - 1]

  if (overflow) {
    const note = flow.place(9)
    doc.font(fonts.regular).fontSize(5.6).fillColor(MUTED)
      .text(text(`"Diğer" sütunu: en çok dağıtılan ${products.length} ürün dışındaki ${detail.product_rows.length - products.length} ürünün toplamıdır.`),
        note.x + 2, note.y + 1, { width: note.width - 4, lineBreak: false, ellipsis: true })
  }
```

(Kaldırılanlar: `// Lejant: 1 = ürün adı…` yorumu, `legendParts`, `legendText`, `legendLines`, `legend` bloğu. `title`, `products`, `overflow`, `columnIndexById`, `columnCount`, `flowColumns`, `flow`, `dayItems` tanımları yeni blokta birebir korunur — çift tanım kalmamalı.)

- [ ] **Step 2: `tableHeader`'ı değiştir**

Mevcut `tableHeader` fonksiyonunu (satır ~719-730) şununla değiştir:

```js
  const HEADER_HEIGHT = 16
  const tableHeader = (dayLabel) => {
    const spot = flow.place(HEADER_HEIGHT + 1)
    doc.rect(spot.x, spot.y, spot.width, HEADER_HEIGHT).fill('#E2E8F0')
    doc.font(fonts.bold).fontSize(5.6).fillColor('#334155')
    doc.text(text(dayLabel || 'YER'), spot.x + 3, spot.y + (HEADER_HEIGHT - 5.6) / 2,
      { width: labelWidth() - 4, lineBreak: false, ellipsis: true })
    for (let index = 0; index < columnCount; index += 1) {
      const x = spot.x + labelWidth() + index * cellW()
      const label = index < products.length ? products[index].name : 'Diğer'
      doc.font(fonts.bold).fillColor('#334155')
      // İki satıra kadar sarabilsin diye ~2 satır genişliğine göre punto seç
      fitFontSize(doc, text(label), (cellW() - 2) * 1.9, 5.2, 4)
      doc.text(text(label), x, spot.y + 2, { width: cellW() - 2, height: HEADER_HEIGHT - 3, align: 'center', ellipsis: true, lineGap: 0 })
    }
    doc.font(fonts.bold).fontSize(5.6).fillColor('#334155')
    doc.text(text('TOP'), spot.x + spot.width - 34, spot.y + (HEADER_HEIGHT - 5.6) / 2, { width: 32, align: 'right', lineBreak: false })
  }
```

- [ ] **Step 3: Gün bloğu rezervasyonunu büyüt**

Satır ~764 `flow.reserve(34)` → `flow.reserve(42)` (bant 14.5 + başlık 17 + ilk satır 8.8 birlikte kalsın).

- [ ] **Step 4: YEŞİL doğrula**

Çalıştır: `cd backend && npx vitest run src/modules/water/report.test.js`
Beklenen: 4 yeni test dahil tümü PASS.

- [ ] **Step 5: Tam suite + commit**

Çalıştır: `cd backend && npx vitest run`
Beklenen: tümü PASS.

```bash
git add backend/src/modules/water/report-pdf.js backend/src/modules/water/report.test.js
git commit -m "feat: gün gün detay başlıklarında ürün adları — 1/2/3 lejantı kaldırıldı"
```

---

### Task 5: Uçtan uca doğrulama + örnek PDF

**Files:**
- Create: `<scratchpad>/ornek-muhasebe-pdf.mjs` (geçici, commit edilmez)

- [ ] **Step 1: Tam test suite**

Çalıştır: `cd backend && npx vitest run`
Beklenen: tümü PASS. (Sayfa sayısı `≤7` ve taşma bekçisi testleri dahil.)

- [ ] **Step 2: Yerel dev DB'den örnek PDF üret (görsel kontrol)**

Scratchpad'e `ornek-muhasebe-pdf.mjs` yaz:

```js
// Örnek muhasebe PDF'i (yerel dev DB'den). backend klasöründen çalıştırılır:
//   cd backend && node "<scratchpad>/ornek-muhasebe-pdf.mjs" "<scratchpad>/ornek-muhasebe.pdf"
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

process.env.DB_PATH = path.resolve('..', 'yys.db')
const require = createRequire(path.join(process.cwd(), 'noop.js'))
const PDFDocument = require('pdfkit')

const db = await import(pathToFileURL(path.resolve('src/shared/db/index.js')).href)
db.initDB()
const { accountingReportService } = await import(pathToFileURL(path.resolve('src/modules/water/report.js')).href)
const { writeAccountingReportPDF, attachReportPhotos } = await import(pathToFileURL(path.resolve('src/modules/water/report-pdf.js')).href)

const report = accountingReportService({ from: '2026-07-01', to: '2026-07-31', sections: 'matrix,days,zones' })
await attachReportPhotos(report)
const out = path.resolve(process.argv[2] || 'ornek-muhasebe.pdf')
const doc = new PDFDocument({ size: 'A4', margin: 28 })
const stream = fs.createWriteStream(out)
doc.pipe(stream)
writeAccountingReportPDF(report, doc)
await new Promise(resolve => stream.on('finish', resolve))
console.log('yazıldı:', out, '· yer:', report.detail?.rows?.length || 0, '· gün:', report.detail?.days?.length || 0)
```

Çalıştır ve çıktıyı kontrol et. `yer: 0` ise yerel dev DB'de Temmuz verisi yok demektir — bu adımı atla ve kullanıcıya örneğin canlıdan alınacağını söyle. Veri varsa PDF'i kullanıcıya gönder (SendUserFile).

- [ ] **Step 3: Spec durumunu güncelle + commit**

Spec dosyasındaki `**Durum:**` satırını `Uygulandı (2026-07-23)` yap.

```bash
git add docs/superpowers/specs/2026-07-23-water-matrix-gun-urun-design.md
git commit -m "docs: GÜN x ÜRÜN dökümü spec durumu güncellendi"
```

Push/deploy YOK — kullanıcı ayrıca "push et" / "deploy et" derse yapılır.
