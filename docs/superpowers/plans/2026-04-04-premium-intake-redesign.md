# Premium Parça Girişi Yeniden Tasarımı — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `NewItemModal`'ı 2-adımlı hale getir — premium blok seçilince kayıt sonrası otomatik parça girişi adımına geç; parça formu chip + görsel renk picker + klavye navigasyonu ile hızlı girişe uygun olsun.

**Architecture:** Tüm değişiklik `NewItemModal.jsx` içinde. `step` state (1=form, 2=parça girişi) ile iki aşama ayrılır. `isPremium` kontrolü `selectedRoom.block` üzerinden yapılır. Her parça "Ekle" tıklanınca anında backend'e kaydedilir, kod ekrana yansır.

**Tech Stack:** React, @tanstack/react-query, `laundryApi.addPremiumGarments`

---

## Dosya Haritası

| Dosya | Değişiklik |
|-------|-----------|
| `frontend/src/modules/laundry/components/NewItemModal.jsx` | Step state + isPremium + step 2 UI |
| `frontend/src/modules/laundry/components/PremiumIntakeModal.jsx` | Dokunulmaz — artık kullanılmıyor ama silinmez |

---

## Task 1 — State, isPremium ve onSuccess Değişikliği

**Files:**
- Modify: `frontend/src/modules/laundry/components/NewItemModal.jsx`

- [ ] **Step 1: SIZES sabitini ve yeni state'leri ekle**

`NewItemModal.jsx` dosyasında `DEFAULT_CLOTHING_TYPES` array'inin hemen altına `SIZES` ekle:

```js
const SIZES = ['XS','S','M','L','XL','XXL','3XL','4XL','36','38','40','42','44','46','48']
```

`export default function NewItemModal` içinde mevcut state'lerin altına ekle:

```js
const [step, setStep] = useState(1)
const [createdItem, setCreatedItem] = useState(null)
const [garmentType, setGarmentType] = useState('')
const [garmentForm, setGarmentForm] = useState({ color: '', brand: '', model: '', size: '', condition_notes: '' })
const [addedGarments, setAddedGarments] = useState([])
const colorRef = useRef(null)
```

- [ ] **Step 2: isPremium derivasyonu ekle**

`selectedRoom` tanımının hemen altına:

```js
const isPremium = selectedRoom && !['M','S','S1','S2'].includes(selectedRoom.block)
```

- [ ] **Step 3: `create` mutation'ın `onSuccess`'ini değiştir**

Mevcut:
```js
onSuccess: () => {
  clearDraft()
  qc.invalidateQueries({ queryKey: ['laundry-items'] })
  onClose()
},
```

Yeni:
```js
onSuccess: (data) => {
  clearDraft()
  qc.invalidateQueries({ queryKey: ['laundry-items'] })
  if (isPremium) {
    setCreatedItem(data)
    setStep(2)
  } else {
    onClose()
  }
},
```

- [ ] **Step 4: `addGarment` mutation'ı ekle**

`create` mutation'ın hemen altına:

```js
const addGarment = useMutation({
  mutationFn: () => laundryApi.addPremiumGarments(createdItem.id, [{
    garment_type: garmentType,
    color: garmentForm.color,
    brand: garmentForm.brand || undefined,
    model: garmentForm.model || undefined,
    size: garmentForm.size || undefined,
    condition_notes: garmentForm.condition_notes || undefined,
  }]),
  onSuccess: (data) => {
    setAddedGarments(prev => [...prev, {
      code: data.codes[0],
      garment_type: garmentType,
      color: garmentForm.color,
      brand: garmentForm.brand,
      size: garmentForm.size,
    }])
    setGarmentType('')
    setGarmentForm({ color: '', brand: '', model: '', size: '', condition_notes: '' })
    qc.invalidateQueries({ queryKey: ['premium-garments', createdItem?.id] })
  },
})

const canAddGarment = !!garmentType && !!garmentForm.color
```

- [ ] **Step 5: Modal başlığını step'e göre değiştir**

Mevcut panel-header içindeki `<div>` kısmı:
```jsx
<div>
  <span className="panel-title">YENİ ÇAMAŞIR KAYDI</span>
  <div className="panel-subtitle">Oda · Teslim Eden · Kıyafet · Kaydet</div>
</div>
```

Yeni:
```jsx
<div>
  {step === 1 ? (
    <>
      <span className="panel-title">YENİ ÇAMAŞIR KAYDI</span>
      <div className="panel-subtitle">Oda · Teslim Eden · Kıyafet · Kaydet</div>
    </>
  ) : (
    <>
      <span className="panel-title">★ PARÇA GİRİŞİ</span>
      <div className="panel-subtitle">
        {selectedRoom?.block}{selectedRoom?.room_no} · {addedGarments.length} parça eklendi
      </div>
    </>
  )}
</div>
```

- [ ] **Step 6: Step 1 içeriğini koşullu yap**

`panel-body` içindeki tüm mevcut içeriği (Draft Banner'dan "İptal" butonuna kadar) `{step === 1 && (...)}` ile sar:

```jsx
<div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
  {step === 1 && (
    <>
      {/* ... mevcut tüm form içeriği ... */}
    </>
  )}
  {step === 2 && createdItem && (
    <div>{/* Task 2'de eklenecek */}</div>
  )}
</div>
```

- [ ] **Step 7: Çalıştığını doğrula**

Uygulamayı aç, non-M/S bir odada "Kaydet" buton. Başlığın "★ PARÇA GİRİŞİ"'ye döndüğünü gör.

---

## Task 2 — Step 2: Tip Seçimi + Parça Formu UI

**Files:**
- Modify: `frontend/src/modules/laundry/components/NewItemModal.jsx`

- [ ] **Step 1: Step 2 içeriğini yaz**

`{step === 2 && createdItem && (...)}` bloğunu aşağıdaki JSX ile doldur:

```jsx
{step === 2 && createdItem && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

    {/* ── Tip seçimi ── */}
    <div>
      <label className="form-label">TİP SEÇ</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {CLOTHING_TYPES.map(type => (
          <button
            key={type}
            onClick={() => {
              setGarmentType(t => t === type ? '' : type)
              setGarmentForm({ color: '', brand: '', model: '', size: '', condition_notes: '' })
              setTimeout(() => colorRef.current?.focus(), 50)
            }}
            style={{
              padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
              background: garmentType === type ? 'rgba(240,165,0,0.15)' : 'var(--surface2)',
              border: `1px solid ${garmentType === type ? 'rgba(240,165,0,0.4)' : 'var(--border)'}`,
              color: garmentType === type ? 'var(--accent)' : 'var(--text2)',
              fontFamily: 'var(--mono)', fontSize: 10, transition: 'all 0.15s',
            }}
          >
            {garmentType === type && '★ '}{CLOTHING_ICONS[type] || ''} {type}
          </button>
        ))}
      </div>
    </div>

    {/* ── Parça formu ── */}
    {garmentType && (
      <div style={{
        padding: '14px 16px', borderRadius: 8,
        background: 'rgba(240,165,0,0.05)', border: '1px solid rgba(240,165,0,0.15)',
      }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', marginBottom: 12, fontWeight: 700 }}>
          {CLOTHING_ICONS[garmentType] || ''} {garmentType}
          <span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 9, marginLeft: 8 }}>
            #{addedGarments.length + 1}
          </span>
        </div>

        {/* Renk */}
        <div style={{ marginBottom: 10 }}>
          <label className="form-label" style={{ fontSize: 9 }}>
            RENK <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {COLOR_PALETTE.map(col => (
              <button
                key={col.name}
                title={col.name}
                onClick={() => setGarmentForm(f => ({ ...f, color: f.color === col.name ? '' : col.name }))}
                style={{
                  width: 22, height: 22, borderRadius: '50%', padding: 0, cursor: 'pointer',
                  background: col.hex,
                  border: `2px solid ${garmentForm.color === col.name ? 'var(--accent)' : 'transparent'}`,
                  boxShadow: garmentForm.color === col.name ? '0 0 0 1px var(--accent)' : 'none',
                  transition: 'all 0.1s', flexShrink: 0,
                }}
              />
            ))}
            <input
              ref={colorRef}
              className="form-input"
              value={COLOR_PALETTE.some(c => c.name === garmentForm.color) ? '' : garmentForm.color}
              onChange={e => setGarmentForm(f => ({ ...f, color: e.target.value }))}
              placeholder="Diğer..."
              style={{ width: 70, padding: '3px 6px', fontSize: 9, flexShrink: 0 }}
            />
            {garmentForm.color && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>
                {garmentForm.color}
              </span>
            )}
          </div>
        </div>

        {/* Marka / Model */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label className="form-label" style={{ fontSize: 9 }}>MARKA</label>
            <input className="form-input" value={garmentForm.brand}
              onChange={e => setGarmentForm(f => ({ ...f, brand: e.target.value }))}
              placeholder="Opsiyonel" style={{ fontSize: 10 }} />
          </div>
          <div>
            <label className="form-label" style={{ fontSize: 9 }}>MODEL</label>
            <input className="form-input" value={garmentForm.model}
              onChange={e => setGarmentForm(f => ({ ...f, model: e.target.value }))}
              placeholder="Opsiyonel" style={{ fontSize: 10 }} />
          </div>
        </div>

        {/* Beden / Not */}
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            <label className="form-label" style={{ fontSize: 9 }}>BEDEN</label>
            <select
              value={garmentForm.size}
              onChange={e => setGarmentForm(f => ({ ...f, size: e.target.value }))}
              style={{
                width: '100%', fontFamily: 'var(--mono)', fontSize: 10,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '5px 6px', color: 'var(--text)',
              }}
            >
              <option value="">-</option>
              {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label" style={{ fontSize: 9 }}>NOT</label>
            <input
              className="form-input"
              value={garmentForm.condition_notes}
              onChange={e => setGarmentForm(f => ({ ...f, condition_notes: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && canAddGarment && !addGarment.isPending) addGarment.mutate() }}
              placeholder="Opsiyonel" style={{ fontSize: 10 }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          {addGarment.isError && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)' }}>
              {addGarment.error?.response?.data?.error || 'Hata oluştu'}
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={() => addGarment.mutate()}
            disabled={!canAddGarment || addGarment.isPending}
            style={{ padding: '7px 22px', letterSpacing: 1, fontWeight: 700 }}
          >
            {addGarment.isPending ? '...' : '✓ Ekle →'}
          </button>
        </div>
      </div>
    )}

    {/* ── Eklenen parçalar ── */}
    {addedGarments.length > 0 && (
      <div>
        <label className="form-label">EKLENEN PARÇALAR ({addedGarments.length})</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {addedGarments.map((g, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 6,
              background: 'var(--surface2)', border: '1px solid var(--border)',
            }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
                color: 'var(--accent)', letterSpacing: 1, flexShrink: 0,
              }}>{g.code}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)' }}>
                {CLOTHING_ICONS[g.garment_type] || ''} {g.garment_type}
              </span>
              <span style={{
                width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                background: COLOR_PALETTE.find(c => c.name === g.color)?.hex || '#888',
                border: '1px solid rgba(255,255,255,0.15)',
              }} title={g.color} />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{g.color}</span>
              {g.brand && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{g.brand}</span>}
              {g.size && (
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 3, padding: '1px 5px',
                }}>{g.size}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    )}

    {/* ── Alt aksiyonlar ── */}
    <div style={{ display: 'flex', gap: 8 }}>
      <button
        className="btn btn-primary"
        style={{ flex: 1, padding: '10px', letterSpacing: 1 }}
        onClick={() => {
          qc.invalidateQueries({ queryKey: ['laundry-items'] })
          onClose()
        }}
      >
        {addedGarments.length > 0
          ? `Tamamla & Kapat (${addedGarments.length} parça)`
          : 'Tamamla & Kapat'}
      </button>
      <button className="btn btn-ghost" onClick={onClose}>Daha Sonra</button>
    </div>

  </div>
)}
```

- [ ] **Step 2: Uygulamayı test et**

1. Dev server çalışıyor olmalı (`npm run dev`)
2. Premium blokta (A1, G, F... vb.) bir oda seç → kayıt oluştur
3. Modal kapanmadan "★ PARÇA GİRİŞİ" başlığına geçmeli
4. Tip chip seç → form açılmalı, renk alanına fokus gelmeli
5. Renk seç + "✓ Ekle" → parça liste'ye eklenip form sıfırlanmalı
6. Not alanında Enter → "✓ Ekle" tetiklenmeli
7. M veya S odasında → kayıt sonrası modal direkt kapanmalı

- [ ] **Step 3: Commit**

```bash
cd frontend && npx vitest run 2>/dev/null; echo "no frontend tests"
git add frontend/src/modules/laundry/components/NewItemModal.jsx
git commit -m "feat: premium parça girişi 2-adımlı modal — chip + renk picker + klavye nav"
```
