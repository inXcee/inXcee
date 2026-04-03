# Kanban DnD Fix + İmza Geçmişi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kanban kartlarının drag-and-drop grab pozisyonunu düzelt, teslim imzasını geçmişte göster.

**Architecture:** İki bağımsız düzeltme. (1) DnD: `DraggableKanbanCard` üzerindeki CSS transform kaldırılır — `DragOverlay` zaten aktif, transform uygulamak orijinal kartı kaydırıyor. (2) İmza: backend history sorgusu `laundry_deliveries` ile LEFT JOIN eklenir, frontend ExpandedSection'a imza thumbnail + modal eklenir.

**Tech Stack:** React + @dnd-kit/core, SQLite (better-sqlite3), Express

---

## Etkilenen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `frontend/src/modules/laundry/LaundryHub.jsx` | DraggableKanbanCard transform kaldır, sensor delay kaldır, KanbanCard buton stopPropagation, ExpandedSection imza görünümü |
| `backend/src/modules/laundry/queries.js` | `getItemHistoryQuery` — delivery JOIN ekle |

---

## Task 1: Kanban DnD — Transform Kaldır + Sensor İyileştir

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx:117-142` (DraggableKanbanCard)
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx:693-695` (sensor config)
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx:237-284` (KanbanCard butonları)

**Neden:** `DragOverlay` zaten sürüklenen kartın float kopyasını gösteriyor. Ama `DraggableKanbanCard` aynı zamanda `transform: CSS.Transform.toString(transform)` uyguluyor — bu orijinal kartı cursor'ın gittiği yönde kaydırıyor. Sonuç: hem orijinal kart kayıyor, hem overlay görünüyor → grab noktası yanlış hissettiriyor. Çözüm: orijinal kartta transform'u kaldır, sadece `opacity: 0` yap. Ayrıca `delay: 100` kaldırılır (100ms gecikme = sluggish hissettiriyor).

- [ ] **Step 1: DraggableKanbanCard'ı düzelt**

`LaundryHub.jsx` satır 117-142'deki `DraggableKanbanCard` fonksiyonunu şununla değiştir:

```jsx
function DraggableKanbanCard({ item, ...props }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item-${item.id}`,
    data: { item },
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0 : 1,
        cursor: 'grab',
        transition: 'opacity 0.1s',
      }}
      {...attributes}
      {...listeners}
    >
      <KanbanCard item={item} {...props} />
    </div>
  )
}
```

Not: `transform`, `scale`, `zIndex`, `boxShadow`, `position: 'relative'` satırları kaldırıldı. `CSS` import'u hâlâ kullanılmıyorsa dosyanın en başından da kaldırılabilir — ama başka yerde kullanılmıyorsa `import { CSS } from '@dnd-kit/utilities'` satırını sil.

- [ ] **Step 2: CSS import'u kontrol et, gerekirse kaldır**

Dosyada `CSS.` geçen başka yer var mı kontrol et:

```bash
grep -n "CSS\." frontend/src/modules/laundry/LaundryHub.jsx
```

Eğer sadece eski DraggableKanbanCard'daydıysa, import satırını sil:

```js
// Sil:
import { CSS } from '@dnd-kit/utilities'
```

- [ ] **Step 3: Sensor'dan delay kaldır**

Satır 693-695'i bul ve şununla değiştir:

```js
const sensors = useSensors(useSensor(PointerSensor, {
  activationConstraint: { distance: 8 },
}))
```

`delay: 100, tolerance: 5` kaldırıldı. `distance: 8` — 8px hareket etmeden drag başlamaz, buton tıklaması tetiklenmez.

- [ ] **Step 4: KanbanCard butonlarına stopPropagation ekle**

`KanbanCard` içindeki her action button'a `onPointerDown={e => e.stopPropagation()}` ekle. Bu sayede butona tıklamak drag'i tetiklemez.

Satır 241 civarındaki "⚙ Makineye At…" butonunu bul:

```jsx
<button
  onPointerDown={e => e.stopPropagation()}
  onClick={() => setAssignOpen(true)}
  style={{ flex: 1, padding: '5px 8px', borderRadius: 6,
    background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.25)',
    color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: 9,
    cursor: 'pointer', fontWeight: 700,
  }}>
  ⚙ Makineye At…
</button>
```

Aynı `onPointerDown={e => e.stopPropagation()}` şu butonlara da ekle:
- "▣ Rafa Koy →" (satır ~251)
- "✓ Teslim Et →" (satır ~261)
- "⚠" (damage button, satır ~271)
- "▾/▲" expand button (satır ~277)
- Oda adı span'ının `onClick` handler'ı (satır ~176-186) — bu span için `onPointerDown={e => e.stopPropagation()}` ekle

- [ ] **Step 5: DragOverlay'i gerçek kart gösterecek şekilde güncelle**

Satır 1037-1049 arasındaki DragOverlay'i bul ve şununla değiştir (gerçek KanbanCard klonu):

```jsx
<DragOverlay dropAnimation={null}>
  {activeItem ? (
    <div style={{ transform: 'rotate(1.5deg) scale(1.03)', pointerEvents: 'none', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.4))' }}>
      <KanbanCard
        item={activeItem}
        machines={machines}
        onDeliver={() => {}}
        onDamage={() => {}}
        onPersonClick={() => {}}
        onFound={() => {}}
      />
    </div>
  ) : null}
</DragOverlay>
```

`pointerEvents: 'none'` → overlay üzerindeki butonlar tıklanamaz (sadece görsel). `dropAnimation={null}` → bırakırken snap animasyonu yok, daha hızlı hissettiriyor.

- [ ] **Step 6: Tarayıcıda manuel test**

`http://localhost:5174` → Çamaşır modülü → Kanban görünümü:
- Bir kartı tıklayıp sürükle → grab noktası cursor'ın tam altında olmalı
- Kartı bırak → doğru kolona geçmeli
- "Makineye At" butonuna tıkla → sürükleme başlamadan modal açılmalı
- "▾" expand butonuna tıkla → sürükleme başlamadan açılmalı

- [ ] **Step 7: Backend testlerini çalıştır**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Beklenen: tüm testler PASS (bu task sadece frontend değişikliği içeriyor ama kural gereği çalıştır).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "fix: kanban DnD — transform kaldır, DragOverlay gerçek kart klonu, buton stopPropagation"
```

---

## Task 2: Backend — History Sorgusuna Delivery Bilgisi Ekle

**Files:**
- Modify: `backend/src/modules/laundry/queries.js:283-292` (getItemHistoryQuery)

**Neden:** `getItemHistoryQuery` sadece `laundry_history` tablosunu çekiyor. `laundry_deliveries` tablosunda `delivered_to`, `signature_data` var ama hiç sorgulanmıyor. `to_status = 'delivered'` olan history satırı için delivery tablosunu LEFT JOIN ile birleştireceğiz.

- [ ] **Step 1: Test yaz**

`backend/src/modules/laundry/laundry.test.js` dosyasını aç. Var olan test bloğuna yeni bir test ekle:

```js
it('history — delivered satırında signature_data ve delivered_to gelir', async () => {
  const { insertItemQuery, insertHistoryQuery, getItemHistoryQuery, insertDeliveryQuery } = await import('./queries.js')
  const itemId = insertItemQuery({ room_id: roomId, item_count: 1, created_by: userId })
  insertHistoryQuery({ item_id: itemId, from_status: null, to_status: 'dirty', action_by: userId })
  insertHistoryQuery({ item_id: itemId, from_status: 'dirty', to_status: 'delivered', action_by: userId })
  insertDeliveryQuery({ item_id: itemId, delivered_to: 'Ahmet Yılmaz', signature_data: 'data:image/png;base64,abc', delivered_by: userId })
  const history = getItemHistoryQuery(itemId)
  const deliveredRow = history.find(h => h.to_status === 'delivered')
  expect(deliveredRow).toBeDefined()
  expect(deliveredRow.delivered_to).toBe('Ahmet Yılmaz')
  expect(deliveredRow.signature_data).toBe('data:image/png;base64,abc')
})
```

- [ ] **Step 2: Testi çalıştır — fail doğrula**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Beklenen: yeni test FAIL — `deliveredRow.delivered_to` undefined çünkü sorgu henüz JOIN içermiyor.

- [ ] **Step 3: getItemHistoryQuery'yi güncelle**

`backend/src/modules/laundry/queries.js` satır 283-292'yi şununla değiştir:

```js
export function getItemHistoryQuery(itemId) {
  const db = getDB()
  return db.prepare(`
    SELECT
      lh.*,
      u.full_name AS actor_name,
      ld.delivered_to,
      ld.signature_data,
      ld.delivered_by_name
    FROM laundry_history lh
    LEFT JOIN users u ON u.id = lh.action_by
    LEFT JOIN (
      SELECT ld2.item_id, ld2.delivered_to, ld2.signature_data, u2.full_name AS delivered_by_name
      FROM laundry_deliveries ld2
      LEFT JOIN users u2 ON u2.id = ld2.delivered_by
      WHERE ld2.item_id = ?
    ) ld ON lh.to_status = 'delivered'
    WHERE lh.item_id = ?
    ORDER BY lh.created_at ASC
  `).all(itemId, itemId)
}
```

Not: subquery `?` parametresi iki kez geçiyor — `.all(itemId, itemId)`.
Ayrıca kolon adı `action_by_name` → `actor_name` olarak düzeltildi (frontend zaten `h.actor_name` bekliyor).

- [ ] **Step 4: Testi çalıştır — pass doğrula**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Beklenen: tüm testler PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/laundry/queries.js backend/src/modules/laundry/laundry.test.js
git commit -m "feat: laundry history — delivered satırında signature_data ve delivered_to"
```

---

## Task 3: Frontend — ExpandedSection'a İmza Görünümü Ekle

**Files:**
- Modify: `frontend/src/modules/laundry/LaundryHub.jsx:39-113` (ExpandedSection)

**Neden:** Backend artık history içinde `signature_data` ve `delivered_to` döndürüyor. Frontend'de timeline satırında "Teslim edildi" kaydına bu bilgileri göstereceğiz: teslim alınan kişi adı + imza thumbnail (tıklayınca tam boy modal).

- [ ] **Step 1: ExpandedSection'a imza state ve modal ekle**

`ExpandedSection` fonksiyonunun başına (satır 40-45 arasına) `sigModal` state ekle:

```jsx
function ExpandedSection({ item, onLost, onFound }) {
  const [sigModal, setSigModal] = useState(null)  // ← ekle

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['item-history', item.id],
    queryFn: () => laundryApi.getItemHistory(item.id),
    enabled: true,
  })
```

- [ ] **Step 2: Timeline satırında imza bilgisini render et**

Satır 78-94 arasındaki `history.map(...)` bloğunu şununla değiştir:

```jsx
) : history.map((h, idx) => {
  const next = history[idx + 1]
  const dur = next
    ? Math.round((new Date(next.created_at) - new Date(h.created_at)) / 60000)
    : null
  return (
    <div key={h.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: STATUS_COLORS[h.to_status] || 'var(--text3)',
        flexShrink: 0, marginTop: 3,
      }} />
      <div style={{ flex: 1 }}>
        <span style={{ color: 'var(--text2)', fontSize: 9 }}>{STATUS_LABELS[h.to_status] || h.to_status}</span>
        {h.actor_name && <span style={{ color: 'var(--text3)', fontSize: 8 }}> · {h.actor_name}</span>}
        {dur != null && <span style={{ color: 'var(--text3)', fontSize: 8 }}> · {dur < 60 ? `${dur}dk` : `${Math.round(dur/60)}s`} bekledi</span>}
        <div style={{ fontSize: 8, color: 'var(--text3)' }}>
          {new Date(h.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
        {h.to_status === 'delivered' && h.delivered_to && (
          <div style={{ marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--teal)' }}>
              ✓ {h.delivered_to}
            </span>
            {h.signature_data && (
              <button
                onClick={() => setSigModal(h.signature_data)}
                style={{
                  display: 'block', marginTop: 4, padding: 0, border: '1px solid var(--border)',
                  borderRadius: 4, background: 'var(--surface)', cursor: 'pointer', overflow: 'hidden',
                }}
              >
                <img
                  src={h.signature_data}
                  alt="imza"
                  style={{ width: 120, height: 36, objectFit: 'contain', display: 'block', filter: 'invert(0.85)' }}
                />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})}
```

- [ ] **Step 3: İmza modal'ını render et**

`ExpandedSection` return'ünün kapanışından hemen önce (satır ~112 civarı, `</div>` kapanmadan önce) imza modal'ını ekle:

```jsx
      {/* İmza modal */}
      {sigModal && (
        <div
          onClick={() => setSigModal(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 16,
            }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)', marginBottom: 8, letterSpacing: 1 }}>
              TESLİM İMZASI
            </div>
            <img
              src={sigModal}
              alt="imza"
              style={{ width: 400, height: 120, objectFit: 'contain', display: 'block', filter: 'invert(0.85)', borderRadius: 6 }}
            />
            <button
              onClick={() => setSigModal(null)}
              style={{
                marginTop: 10, width: '100%', padding: '5px 0',
                background: 'transparent', border: '1px solid var(--border)',
                color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 8, cursor: 'pointer', borderRadius: 5,
              }}
            >
              kapat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Tarayıcıda manuel test**

1. Teslim edilmiş bir çamaşır kaydı bul (status: delivered)
2. Kart üzerindeki "▾" expand butonuna tıkla
3. Timeline'da "Teslim edildi" satırında teslim alan kişi adı görünmeli
4. İmza thumbnail'i görünmeli (küçük dikdörtgen)
5. Thumbnail'e tıkla → tam boy imza modal'ı açılmalı
6. Modal dışına veya "kapat" butonuna tıkla → kapanmalı

Eğer test edecek delivered kayıt yoksa:
- Kanban'da "RAFTA HAZIR" kolonundan bir kartı "✓ Teslim Et" ile teslim et
- Teslim alınan kişi adı gir ve imza çiz
- Sonra listeyi "Tümü" olarak değiştir, teslim edilen kaydı bul ve expand et

- [ ] **Step 5: Backend testlerini çalıştır**

```bash
cd backend && npx vitest run src/modules/laundry/laundry.test.js
```

Beklenen: tüm testler PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/modules/laundry/LaundryHub.jsx
git commit -m "feat: laundry — geçmişte teslim imzası thumbnail + modal"
```
