# Notlar Sync + Mesajlaşma + File Düzeltme — 3 Fazlı Plan

> **Tarih:** 2026-04-02
> **Öncelik:** Yüksek — çok cihaz kullanımında veri kaybı yaşanıyor

---

## Mevcut Sorunlar

### 1. Clothing Items (Fileler) Kaydolmuyor
- `NewItemModal.jsx`: Kıyafet tipi listesi `DEFAULT_CLOTHING_TYPES` hardcoded + `LaundrySettings`'deki özel tipler **localStorage**'da saklanıyor
- Farklı cihazda `NewItemModal` açılınca özel tipler görünmüyor → kullanıcı listeye tip eklemiyor → file boş gönderiliyor
- Ek sorun: Modal yanlışlıkla kapatılırsa girilen kıyafetler siliniyor (draft yok)

### 2. Notlar Sadece O Cihazda Görünüyor
- `QuickNotes` komponenti `localStorage.getItem('laundry-notes')` ile çalışıyor (LaundryHub.jsx:582)
- `custom-clothing-types` ve `laundry-daily-goal` da localStorage → cihaz bağımlı
- Çözüm: `laundry_global_settings` tablosu **zaten var** → oraya taşı

### 3. Notların Yeri
- Şu an: `position: fixed, bottom: 24, right: 24` — küçük köşe sticker
- İstenen: Göze çarpsın ama sayfanın üstünde olmasın → KPI strip'in altına sabitlenmiş **inline panel** olarak taşı, collapsible (açılıp kapanabilir)

---

## FAZ 1 — Notlar Backend Sync + Kıyafet Tipleri Sync [✅]

### Amaç
`localStorage`'daki üç değeri backend'e taşı: notlar, kıyafet tipleri, günlük hedef.
`laundry_global_settings` tablosu (zaten var) kullanılacak.

### Backend

**`service.js`** — Mevcut `getSettingsService` / `updateSettingService` zaten var (FAZ 5'te eklendi).

**`routes.js`** — Mevcut `GET /laundry/settings` ve `PUT /laundry/settings/:key` zaten var.

Yani backend değişikliği **sıfır**. Sadece frontend değişecek.

### Frontend

**`LaundryHub.jsx`** — `QuickNotes` komponenti değişir:

```js
// ÖNCE (localStorage):
const [notes, setNotes] = useState(() => localStorage.getItem('laundry-notes') || '')
const save = (val) => { setNotes(val); localStorage.setItem('laundry-notes', val) }

// SONRA (backend sync):
const { data: settings = {} } = useQuery({
  queryKey: ['laundry-settings'],
  queryFn: laundryApi.getLaundrySettings,
  staleTime: 30_000,
})
const [notes, setNotes] = useState('')
useEffect(() => { if (settings.shared_notes !== undefined) setNotes(settings.shared_notes) }, [settings.shared_notes])

const updateSetting = useMutation({
  mutationFn: ({ key, value }) => laundryApi.updateLaundrySetting(key, value),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['laundry-settings'] }),
})

// Debounced autosave (500ms):
const saveNotes = useCallback(
  debounce((val) => updateSetting.mutate({ key: 'shared_notes', value: val }), 500),
  []
)
const handleNotesChange = (val) => { setNotes(val); saveNotes(val) }
```

**`QuickNotes` konumu değişimi:**
- `position: fixed` kaldırılır
- `section === 'hub'` iken KPI strip'in hemen altına `inline` olarak render edilir
- Varsayılan: collapsed (sadece başlık + satır sayısı görünür)
- Tıklayınca expand olur, textarea açılır
- Sticker tasarımı korunur (sarı arka plan)
- Notlar varsa başlık yanında `● N satır` badge'i görünür (dikkat çeker)

**`LaundrySettings.jsx`** — `ClothingSettings` ve `GoalsSettings` bileşenlerinde localStorage yerine backend:

```js
// ClothingSettings:
const { data: settings = {} } = useQuery({ queryKey: ['laundry-settings'], queryFn: laundryApi.getLaundrySettings })
const types = settings.clothing_types ? JSON.parse(settings.clothing_types) : DEFAULT_TYPES
const save = (list) => laundryApi.updateLaundrySetting('clothing_types', JSON.stringify(list))

// GoalsSettings:
const goal = parseInt(settings.daily_goal || '50')
const save = () => laundryApi.updateLaundrySetting('daily_goal', String(goal))
```

**`NewItemModal.jsx`** — Kıyafet tipleri backend'den çekilir:

```js
const { data: settings = {} } = useQuery({ queryKey: ['laundry-settings'], queryFn: laundryApi.getLaundrySettings, staleTime: 60_000 })
const clothingTypes = useMemo(() => {
  if (settings.clothing_types) {
    try { return JSON.parse(settings.clothing_types) } catch {}
  }
  return DEFAULT_CLOTHING_TYPES
}, [settings.clothing_types])
```

**Draft kayıt (file kaybolma sorunu):**
- `NewItemModal` içindeki `selected` (seçili kıyafetler) state'i localStorage'a `laundry-draft-items` key'iyle debounced kaydedilir
- Modal açılırken draft varsa "Taslak kaldı, devam edilsin mi?" sorusu sorulur
- Submit veya iptal'de draft temizlenir

### Testler (2 test)
1. `updateLaundrySetting('shared_notes', 'test')` → `getLaundrySettings` → `shared_notes === 'test'`
2. `updateLaundrySetting('clothing_types', '[...]')` → settings'te güncellenir

---

## FAZ 2 — Çamaşırhane İçi Mesajlaşma [✅]

### Amaç
Çamaşırhane personeli arasında basit, gerçek zamanlı (SSE/polling) mesajlaşma.
Shift notu, acil uyarı, kayıp bildirimi gibi senaryolar için.

### DB

```sql
-- backend/src/shared/db/index.js'e ekle
CREATE TABLE IF NOT EXISTS laundry_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'normal'
    CHECK(message_type IN ('normal','urgent','system')),
  is_pinned INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lm_created ON laundry_messages(created_at DESC);
```

### Backend

**`queries.js`** — Yeni fonksiyonlar:
```js
getMessagesQuery({ limit = 50, before_id })
  // SELECT lm.*, u.full_name as sender_name
  // FROM laundry_messages lm JOIN users u ON u.id = lm.sender_id
  // ORDER BY lm.created_at DESC LIMIT 50

insertMessageQuery({ sender_id, sender_name, message, message_type })
deleteMessageQuery(id, sender_id) // sadece kendi mesajı veya campus_manager
pinMessageQuery(id, is_pinned)    // campus_manager/laundry
```

**`service.js`** — Yeni servisler:
```js
getMessagesService()
sendMessageService({ message, message_type }, userId)
deleteMessageService(id, userId)
pinMessageService(id, is_pinned, userId)
```

**`routes.js`** — Yeni route'lar:
```
GET    /laundry/messages          → son 50 mesaj (en yeni en altta)
POST   /laundry/messages          → { message, message_type? }
DELETE /laundry/messages/:id      → kendi mesajını veya manager siler
PATCH  /laundry/messages/:id/pin  → { is_pinned } (manager/laundry)
```

### Frontend

**Yeni:** `frontend/src/modules/laundry/components/LaundryChat.jsx`

Tasarım:
- Panel yüksekliği: 320px, genişlik: sayfanın tamamı (kanban'ın altında inline)
- Üstte: "💬 ÇAMAŞIRHANE" başlığı + online kullanıcı sayısı + collapse butonu
- Sabitlenmiş mesajlar varsa: turuncu banner ile en üstte gösterilir
- Mesaj listesi: her mesaj → avatar (initials) + isim + zaman + mesaj metni
- Urgent mesajlar kırmızı sol border + arka plan ile vurgulanır
- Altta: input + gönder butonu + "Acil" toggle
- Polling: her 10 saniyede refetch (SSE fazla mühendislik, polling yeterli bu kullanımda)
- 50 mesaj limiti, "Daha fazla yükle" butonu

**`LaundryHub.jsx`** — Değişiklik:
- Kanban/Liste view'ın altına `<LaundryChat />` eklenir (hub section'da görünür)
- Üst toolbar'da mesaj badge'i: okunmamış mesaj varsa sayı gösterir
  - `lastSeenMessageId` localStorage'da saklanır (cihaz bazlı okundu takibi — sync gereksiz)

**`api.js`**:
```js
getMessages: () => api.get('/laundry/messages').then(r => r.data),
sendMessage: (data) => api.post('/laundry/messages', data).then(r => r.data),
deleteMessage: (id) => api.delete(`/laundry/messages/${id}`).then(r => r.data),
pinMessage: (id, is_pinned) => api.patch(`/laundry/messages/${id}/pin`, { is_pinned }).then(r => r.data),
```

### Testler (3 test)
1. `sendMessageService` mesajı kaydeder, `getMessagesService` döner
2. `message_type: 'urgent'` gönderilince kayıt doğru tipi taşır
3. Kendi olmayan mesajı laundry rolü silmeye çalışırsa 403

---

## FAZ 3 — UX Cilaları ve File Taslak Bildirimi [✅]

### Amaç
Notların yeni konumu için animasyon, mesajlaşmada bildirim badge'i, file taslak UX.

### Frontend

**`QuickNotes` yeni konumu detayı:**
```
[KPI Strip                                         ]
[📋 NOTLAR  ● 3 satır  ▼]  ← tıklanabilir başlık
[  Kayıp: A101 gömlek...                          ]  ← expand
[  Shift notu: Makine 3 bakımda                   ]
```
- Arkaplan: sarı gradient (mevcut renk korunur), sol border accent
- Genişlik: tam sayfa, height: collapsed=40px / expanded=max 180px + scroll
- Transition: smooth expand/collapse
- Kaydetme sırasında sağ üstte "✓ Kaydedildi" flash gösterilir (500ms)

**`NewItemModal` draft UX:**
- Modal açılırken localStorage'da `laundry-draft-items` varsa:
  ```
  ┌─────────────────────────────────────────┐
  │ 📋 Kaydedilmemiş taslak bulundu (3 parça)│
  │ [Taslağı Yükle]  [Yeni Başla]            │
  └─────────────────────────────────────────┘
  ```
- Taslak yüklenince kıyafet listesi otomatik dolar
- Her kıyafet değişikliğinde debounce(300ms) ile draft güncellenir

**Mesaj badge'i:**
- LaundryHub üst toolbar'daki bölüm seçici butonları yanına eklenir
- Yeni mesaj varsa: `💬 Mesajlar ●2` şeklinde kırmızı nokta

### Testler (E2E manuel)
- [ ] Not yazılır, farklı cihazda sayfa açılır → not görünür
- [ ] Kıyafet tipi eklenir, farklı cihazda modal açılır → tip listede
- [ ] Taslak bırakılır, modal tekrar açılır → taslak teklif edilir
- [ ] Mesaj gönderilir, 10 saniye içinde diğer cihazda görünür
- [ ] Acil mesaj kırmızı vurgulu görünür

---

## Bağımlılık Sırası

```
FAZ 1 (backend sync — zaten var, sadece frontend değişiyor)
  ↓
FAZ 2 (mesajlaşma — yeni DB + backend + frontend)
  ↓
FAZ 3 (UX iyileştirme — FAZ 1+2 üzerine)
```

## Etkilenen Dosyalar

| Dosya | FAZ | Değişiklik |
|-------|-----|-----------|
| `backend/src/shared/db/index.js` | 2 | laundry_messages tablosu |
| `backend/src/modules/laundry/queries.js` | 2 | messages CRUD |
| `backend/src/modules/laundry/service.js` | 2 | messages servisler |
| `backend/src/modules/laundry/routes.js` | 2 | messages endpoint'ler |
| `backend/src/modules/laundry/laundry.test.js` | 1,2 | yeni testler |
| `frontend/src/modules/laundry/api.js` | 2 | messages API |
| `frontend/src/modules/laundry/LaundryHub.jsx` | 1,3 | QuickNotes backend sync + yeni konum |
| `frontend/src/modules/laundry/LaundrySettings.jsx` | 1 | clothing types + goal backend sync |
| `frontend/src/modules/laundry/components/NewItemModal.jsx` | 1,3 | clothing types backend + draft |
| **YENİ** `LaundryChat.jsx` | 2 | mesajlaşma paneli |
