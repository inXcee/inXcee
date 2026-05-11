# Çamaşırhane Kiosk Sol-Nav + Parça Checklist — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AVS Çamaşırhane Kiosk'unu 5-buton ana ekrandan sol-nav (desktop) / bottom-nav (mobile) düzenine taşı ve premium parça-tik checklist'ini hem Ütü hem Teslim ekranlarında çalıştır.

**Architecture:** Tek dosya frontend refactor (`LaundryKioskPage.jsx`) + bir yeni reusable component (`GarmentChecklist.jsx`). Backend dokunulmaz. URL `?tab=…` ile sekme korunur. Inline style pattern korunur (mevcut dosyanın tarzı).

**Tech Stack:** React 18, Vite, React Query (mevcut kiosk pattern'i).

**Spec:** `docs/superpowers/specs/2026-05-11-laundry-kiosk-sidenav-checklist-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/modules/laundry-kiosk/GarmentChecklist.jsx` | **CREATE** | Reusable parça-tik bileşeni. Props: `garments`, `ticked`, `onToggle`, `variant`. |
| `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` | **MODIFY** | Shell (5-buton grid → sol-nav + bottom-nav), URL param sync, IroningView refactor, DeliverView'a checklist ekle. |

**Test stratejisi:** Frontend kiosk dosyası için unit/component testi yok (codebase'de yerleşik). Her task sonunda manuel dev server smoke test (`npm run dev`, browser'da AVS PIN ile giriş → ilgili akış). Backend testleri (`npx vitest run`) etkilenmez — değişiklik yok.

---

## Task 1: `GarmentChecklist` Component'ini Çıkar

**Files:**
- Create: `frontend/src/modules/laundry-kiosk/GarmentChecklist.jsx`

- [ ] **Step 1: Yeni dosyayı oluştur**

`frontend/src/modules/laundry-kiosk/GarmentChecklist.jsx` içeriği:

```jsx
const IRONING_COLORS = {
  white: '#f8fafc', black: '#0f172a', gray: '#94a3b8', navy: '#1d4ed8',
  blue: '#3b82f6', red: '#dc2626', green: '#16a34a', yellow: '#ca8a04',
  orange: '#ea580c', purple: '#7c3aed', pink: '#db2777', brown: '#92400e', charcoal: '#4b5563',
}

const VARIANT_ACCENT = {
  ironing: '#a78bfa',
  deliver: '#fbbf24',
  default: '#60a5fa',
}

export default function GarmentChecklist({ garments, ticked, onToggle, variant = 'default' }) {
  if (!garments || garments.length === 0) return null

  const tickedCount = Object.values(ticked).filter(Boolean).length
  const allTicked = tickedCount === garments.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {garments.map((g, i) => {
        const colors = g.colors ?? (g.color ? [{ key: g.color, label: g.color_label || g.color }] : [])
        return (
          <div key={i} onClick={() => onToggle(i)}
            style={{
              background: ticked[i] ? '#052e16' : '#1e293b', borderRadius: 10, padding: '12px 14px',
              cursor: 'pointer', border: `1px solid ${ticked[i] ? '#22c55e' : '#334155'}`,
              transition: 'all 0.15s',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: ticked[i] ? '#15803d' : '#0f172a',
                border: `2px solid ${ticked[i] ? '#22c55e' : '#475569'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 18, fontWeight: 700,
                transition: 'all 0.15s',
              }}>
                {ticked[i] ? '✓' : ''}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, color: ticked[i] ? '#86efac' : '#e2e8f0', fontWeight: 600 }}>
                  {g.emoji || '👔'} {g.type_name}
                  {g.count > 1 && (
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>× {g.count}</span>
                  )}
                </div>
              </div>
            </div>
            {(colors.length > 0 || (g.pattern && g.pattern !== 'solid')) && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, marginLeft: 44, flexWrap: 'wrap', alignItems: 'center' }}>
                {colors.map(c => (
                  <span key={c.key} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: '#0f172a', borderRadius: 20, padding: '3px 8px',
                    border: '1px solid #334155',
                  }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: IRONING_COLORS[c.key] || '#888',
                      display: 'inline-block', flexShrink: 0,
                      border: c.key === 'white' ? '1px solid #475569' : 'none',
                    }} />
                    <span style={{ color: '#94a3b8', fontSize: 10 }}>{c.label}</span>
                  </span>
                ))}
                {g.pattern && g.pattern !== 'solid' && g.pattern_label && (
                  <span style={{
                    fontSize: 10, color: '#64748b',
                    background: '#0f172a', borderRadius: 20, padding: '3px 8px',
                    border: '1px solid #334155',
                  }}>
                    {g.pattern_label}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
      <div style={{
        fontSize: 12,
        color: allTicked ? '#22c55e' : (VARIANT_ACCENT[variant] || VARIANT_ACCENT.default),
        fontWeight: allTicked ? 700 : 500,
      }}>
        {allTicked ? '✓ Tümü doğrulandı' : `${tickedCount}/${garments.length} doğrulandı`}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke kontrol — derleme**

Run (root'tan): `cd frontend && npx vite build`
Expected: Build başarılı, hata yok.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/GarmentChecklist.jsx
git commit -m "feat(laundry-kiosk): GarmentChecklist reusable component"
```

---

## Task 2: IroningView'i `GarmentChecklist` Kullanacak Şekilde Refactor

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` (IroningView fonksiyonu, satır 441-612)

- [ ] **Step 1: Import ekle**

Dosyanın en üstündeki import bloğuna (satır 1-5 civarı) ekle:

```jsx
import GarmentChecklist from './GarmentChecklist.jsx'
```

- [ ] **Step 2: IroningView içindeki inline checklist JSX'ini sil ve component ile değiştir**

`IroningView` fonksiyonunda, satır 525 civarı (`KIYAFETLERİ DOĞRULA` başlığından sonra) başlayan `{garments.length === 0 && ...}` ve `{garments.length > 0 && (...)}` bloklarını şu hale getir:

```jsx
          <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1 }}>KIYAFETLERİ DOĞRULA</div>

          {garments.length === 0 && (
            <div style={{ color: '#475569', fontSize: 13 }}>Kıyafet bilgisi yok — tüm torbayı doğrulayarak devam edin</div>
          )}

          <GarmentChecklist
            garments={garments}
            ticked={ticked}
            onToggle={toggleTick}
            variant="ironing"
          />

          <button onClick={complete}
            disabled={garments.length > 0 && !allTicked}
            style={{
              ...btn(garments.length > 0 && !allTicked ? '#1e293b' : '#15803d', garments.length > 0 && !allTicked ? '#475569' : '#fff'),
              padding: 14, fontSize: 14,
            }}>
            ✓ Ütü Tamamla — Hazıra Al
            {garments.length > 0 && !allTicked ? ` (${garments.length}/${garments.length} gerekli)` : ''}
          </button>
```

(Yani satır 525-597 arasındaki ~70 satır JSX, `<GarmentChecklist .../>` tek satırına iner.)

- [ ] **Step 3: Dosya başındaki dead `IRONING_COLORS` sabitini sil**

Dosyanın 302-306 satırlarındaki `IRONING_COLORS` sabiti artık `GarmentChecklist` içine taşındığı için bu dosyada kullanılmıyor. Sil:

```diff
- const IRONING_COLORS = {
-   white: '#f8fafc', black: '#0f172a', gray: '#94a3b8', navy: '#1d4ed8',
-   blue: '#3b82f6', red: '#dc2626', green: '#16a34a', yellow: '#ca8a04',
-   orange: '#ea580c', purple: '#7c3aed', pink: '#db2777', brown: '#92400e', charcoal: '#4b5563',
- }
```

- [ ] **Step 4: Manuel smoke**

Run: `npm run dev` (root'tan)
Tarayıcıda `/laundry-kiosk` aç, AVS PIN ile giriş. Mevcut 5-buton ana ekrandan **Ütü** → varsa premium torba seç → kıyafetleri tikle → "Tümü doğrulandı" görünür → Tamamla butonu enable olur → tıkla → success. Tikleme animasyonu eskiyle aynı.

Expected: Görsel olarak eskiyle bire bir aynı davranır.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx
git commit -m "refactor(laundry-kiosk): IroningView GarmentChecklist'i kullanir"
```

---

## Task 3: DeliverView'a Parça Checklist Ekle

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` (DeliverView, satır 685-844)

- [ ] **Step 1: DeliverView state'ine `parsedGarments` ve `ticked` ekle**

`DeliverView` fonksiyonunun en başındaki state tanımlarına (satır 686 civarı) ekle. Mevcut state:

```jsx
function DeliverView({ kioskApi, onDone }) {
  const sigRef = useRef(null)
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [otherBlock, setOtherBlock] = useState('')
  const [roomNo, setRoomNo] = useState('')
  const [deliveredName, setDeliveredName] = useState('')
  const [bags, setBags] = useState([])
  const [selectedBag, setSelectedBag] = useState(null)
  const [fileCount, setFileCount] = useState(1)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
```

Aşağıdaki iki satırı `[error, setError]` satırından sonra ekle:

```jsx
  const [parsedGarments, setParsedGarments] = useState([])
  const [ticked, setTicked] = useState({})
```

- [ ] **Step 2: selectedBag değiştiğinde garments parse et**

`useEffect` bloğunun hemen altına (bags fetch eden useEffect'ten sonra, satır ~707) yeni bir effect ekle:

```jsx
  useEffect(() => {
    setTicked({})
    if (!selectedBag) { setParsedGarments([]); return }
    try {
      const parsed = selectedBag.garments_json ? JSON.parse(selectedBag.garments_json) : []
      setParsedGarments(parsed)
    } catch { setParsedGarments([]) }
  }, [selectedBag])
```

- [ ] **Step 3: `toggleTick` helper ekle**

`deliver` async function'undan hemen önce (satır ~709) ekle:

```jsx
  function toggleTick(idx) {
    setTicked(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const allTicked = parsedGarments.length === 0 || parsedGarments.every((_, i) => ticked[i])
```

- [ ] **Step 4: `deliver()` fonksiyonuna allTicked kontrolü ekle**

`deliver` fonksiyonunun başına (`setError('')`'dan sonra) ekle:

```jsx
    if (parsedGarments.length > 0 && !allTicked) return setError('Tüm parçaları doğrulayın')
```

- [ ] **Step 5: Checklist'i render et**

`DeliverView`'da `{(effectiveBlock && roomNo) && (...)}` bloğunda — bags listelendiği yerin altında — yeni bir blok ekle. Mevcut satır 794'teki `{(effectiveBlock && roomNo) && (` bloğunun kapanışından (`</div>` from line ~814) sonra, "File Adedi" `<div>`'inden ÖNCE ekle:

```jsx
      {selectedBag && parsedGarments.length > 0 && (
        <div>
          <label style={lbl}>PARÇALARI DOĞRULA</label>
          <GarmentChecklist
            garments={parsedGarments}
            ticked={ticked}
            onToggle={toggleTick}
            variant="deliver"
          />
        </div>
      )}
```

- [ ] **Step 6: Teslim butonunu allTicked'a göre disable et**

`DeliverView`'ın en altındaki Teslim butonunu (satır 838) güncelle:

Mevcut:
```jsx
      <button onClick={deliver}
        style={{ ...btn('#b45309'), padding: 14, fontSize: 15 }}>
        ✓ Teslim Et
      </button>
```

Yeni hali:
```jsx
      <button onClick={deliver}
        disabled={parsedGarments.length > 0 && !allTicked}
        style={{
          ...btn(
            (parsedGarments.length > 0 && !allTicked) ? '#1e293b' : '#b45309',
            (parsedGarments.length > 0 && !allTicked) ? '#475569' : '#fff'
          ),
          padding: 14, fontSize: 15,
        }}>
        ✓ Teslim Et
        {parsedGarments.length > 0 && !allTicked ? ` (${parsedGarments.length} parça)` : ''}
      </button>
```

- [ ] **Step 7: Manuel smoke — premium teslim**

Run: `npm run dev`
Tarayıcı → kiosk → AVS giriş → **Teslim Et** sekmesi. Önce premium akış:
1. Y blok (örn `A`) seç → bir oda no gir (test verisinde `ready` statüsünde premium torba olmalı; yoksa Torba Al'dan oluştur, Ütü'den hazıra al).
2. Hazır torba listede görünür → seç.
3. **PARÇALARI DOĞRULA** başlığı + checklist görünmeli. Parça sayısına eşit kart.
4. Hepsini tikle → Teslim butonu enable olur. Tiklenmeden butona basarsan error: "Tüm parçaları doğrulayın".
5. Ad+imza gir → Teslim Et → success.

Sonra normal akış (garments yok):
1. M blok + oda no → normal torba seç.
2. Checklist görünmemeli (garments_json boş).
3. Ad+imza → Teslim Et → success (eski davranış).

Expected: Premium torbalar parça-tik istiyor, normal torbalar eski akışla çalışıyor.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx
git commit -m "feat(laundry-kiosk): teslim ekraninda parca-tik checklist"
```

---

## Task 4: Ana Shell — Sol-Nav (Desktop) + Bottom-Nav (Mobile) + URL Sync

**Files:**
- Modify: `frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx` (ana `LaundryKioskPage` component'i, satır 84-278)

**ÖNEMLİ:** Step 1 ve Step 2 birlikte yapılmalı (state + return birlikte değişir) — aralarda dosya derlenmez. Yine de Step 2'yi yapana kadar build çalıştırma.

- [ ] **Step 1: State'i `activeAction` → `activeTab` olarak değiştir**

`LaundryKioskPage` fonksiyonunun başındaki state tanımlarında (satır ~92), `activeAction` satırını sil ve yerine şunu yaz:

```jsx
  const VALID_TABS = ['bag', 'garment', 'ironing', 'deliver', 'status']
  const [activeTab, setActiveTab] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tab')
    return VALID_TABS.includes(fromUrl) ? fromUrl : 'bag'
  })
```

(Diğer state'ler aynen kalır: `avsToken`, `workerInfo`, `loginError`, `nameQuery`, `nameResults`, `selectedWorker`, `pinInput`, `searchTimer`.)

- [ ] **Step 2: Ana ekran return bloğunu shell ile değiştir**

`if (!avsToken)` login bloğunun bittiği yerden sonra başlayan `return (...)` bloğunu (mevcut satır ~206-277, açılıştan kapanışa) tamamen değiştir. Bu blok hem `activeAction` referanslarını yok eder hem yeni shell'i kurar:

```jsx
  const TABS = [
    { key: 'bag',     icon: '🧺', label: 'Torba Al' },
    { key: 'garment', icon: '👔', label: 'Kıyafet' },
    { key: 'ironing', icon: '🫧', label: 'Ütü' },
    { key: 'deliver', icon: '🚚', label: 'Teslim' },
    { key: 'status',  icon: '📋', label: 'Durum' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', flexDirection: 'column' }}>
      {/* Üst bar */}
      <div style={{
        height: 56, background: '#0f172a', borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>🧺</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>Çamaşırhane</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{workerInfo?.full_name}</div>
          {workerInfo?.role_label && <div style={{ fontSize: 11, color: '#64748b' }}>{workerInfo.role_label}</div>}
        </div>
        <button onClick={() => { setAvsToken(null); setWorkerInfo(null); setActiveTab('bag') }}
          style={{ fontSize: 12, color: '#94a3b8', padding: '6px 12px', background: '#1e293b', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Çıkış
        </button>
      </div>

      {/* Body: sol-nav (desktop) veya üst içerik (mobile) */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Sol-nav — desktop only */}
        <nav className="kiosk-sidenav" style={{
          width: 160, background: '#0b1220', borderRight: '1px solid #1e293b',
          padding: 8, display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0,
        }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                background: activeTab === t.key ? '#1d4ed8' : 'transparent',
                color: activeTab === t.key ? '#fff' : '#94a3b8',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                fontSize: 14, fontWeight: 600, textAlign: 'left',
              }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        {/* İçerik */}
        <div style={{
          flex: 1, padding: 16, overflowY: 'auto', maxWidth: 720,
          margin: '0 auto', width: '100%',
        }}>
          {activeTab === 'bag'     && <BagForm     kioskApi={kioskApi} onDone={() => {}} />}
          {activeTab === 'garment' && <GarmentForm kioskApi={kioskApi} onDone={() => {}} />}
          {activeTab === 'ironing' && <IroningView kioskApi={kioskApi} onDone={() => {}} />}
          {activeTab === 'deliver' && <DeliverView kioskApi={kioskApi} onDone={() => {}} />}
          {activeTab === 'status'  && <StatusView  kioskApi={kioskApi} onDone={() => {}} />}
        </div>
      </div>

      {/* Bottom-nav — mobile only */}
      <nav className="kiosk-bottomnav" style={{
        height: 64, background: '#0b1220', borderTop: '1px solid #1e293b',
        display: 'none',
        alignItems: 'stretch', justifyContent: 'space-around',
        flexShrink: 0,
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 2, padding: '6px 0',
              borderTop: activeTab === t.key ? '3px solid #3b82f6' : '3px solid transparent',
            }}>
            <span style={{ fontSize: 22, opacity: activeTab === t.key ? 1 : 0.55 }}>{t.icon}</span>
            <span style={{ fontSize: 10, color: activeTab === t.key ? '#93c5fd' : '#64748b', fontWeight: 600 }}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
```

**Önemli:** Bu return'da artık `onDone={() => setActiveAction(null)}` yok — sekmeler sürekli görünür olduğu için form içindeki "Ana Ekrana Dön" butonları sadece form state'ini sıfırlamalı, sekme değiştirmemeli. Mevcut alt-component'ler (`BagForm`, `DeliverView`, `GarmentForm`) `onDone`'u sadece success ekranındaki "Ana Ekrana Dön" butonunda çağırıyor. `onDone={() => {}}` boş bırakıldığında bu buton işlevsiz kalır — Step 4'te düzelteceğiz.

- [ ] **Step 3: URL sync effect ekle**

State tanımlarından sonra, mevcut handler'lardan (`handleNameSearch`) önce ekle:

```jsx
  useEffect(() => {
    if (!avsToken) return
    const url = new URL(window.location.href)
    url.searchParams.set('tab', activeTab)
    window.history.replaceState(null, '', url)
  }, [activeTab, avsToken])
```

(`useEffect` zaten dosyanın 1. satırındaki import'ta var.)

- [ ] **Step 4: Success state'lerde "Ana Ekrana Dön" → "Yenisi" mantığına çevir**

`BagForm` (satır ~354): `onDone={onDone}` butonu vardı, mevcut prop kalıyor ama biz boş function geçtik. Butonun davranışını success state'ini sıfırlayacak şekilde değiştirmek için `BagForm`'a iç state reset fonksiyonu ekle. Mevcut:

```jsx
  if (success) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 18, marginTop: 12 }}>Torba kaydedildi!</div>
      {bagNo && ( ... )}
      <button onClick={onDone} style={{ ...btn('#1e293b', '#60a5fa'), marginTop: 24 }}>Ana Ekrana Dön</button>
    </div>
  )
```

`onClick={onDone}` butonunu şöyle değiştir:

```jsx
      <button onClick={() => {
        setSuccess(false); setBagNo(null); setBlock(''); setRoomNo(''); setPersons([]);
        setSelectedPerson(null); setItemCount(1); setIsPremium(false); setGarments([]);
        setNotes(''); setUrgent(false); setError('')
      }} style={{ ...btn('#1e293b', '#60a5fa'), marginTop: 24 }}>Yeni Torba</button>
```

`DeliverView` (satır ~726): aynı dönüşüm:

```jsx
  if (success) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 18, marginTop: 12 }}>Teslim tamamlandı!</div>
      <button onClick={() => {
        setSuccess(false); setSelectedBlock(null); setOtherBlock(''); setRoomNo('');
        setDeliveredName(''); setBags([]); setSelectedBag(null); setFileCount(1);
        setParsedGarments([]); setTicked({}); setError('')
      }} style={{ ...btn('#1e293b', '#60a5fa'), marginTop: 24 }}>Yeni Teslim</button>
    </div>
  )
```

`GarmentForm` (satır ~881):

```jsx
  if (success) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <div style={{ color: '#4ade80', fontWeight: 600, fontSize: 18, marginTop: 12 }}>Kıyafetler kaydedildi!</div>
      <button onClick={() => {
        setSuccess(false); setBlock(''); setRoomNo(''); setPersons([]);
        setSelectedPerson(null); setGarments([]); setError('')
      }} style={{ ...btn('#1e293b', '#60a5fa'), marginTop: 24 }}>Yeni Kayıt</button>
    </div>
  )
```

`onDone` prop'u artık alt-component'lerde kullanılmıyor — imzaları (`function BagForm({ kioskApi, onDone })` vs) aynen kalsın (geriye uyum), kullanılmamış parametre uyarısı olmaz çünkü destructured.

- [ ] **Step 5: Responsive CSS ekle**

`frontend/src/index.css` dosyasının sonuna ekle (dosyanın mevcut sonunu Read ile gör, sonra append):

```css
/* AVS Çamaşırhane Kiosk — responsive nav */
@media (max-width: 640px) {
  .kiosk-sidenav { display: none !important; }
  .kiosk-bottomnav { display: flex !important; }
}
```

- [ ] **Step 6: Manuel smoke — desktop + mobile**

Run: `npm run dev`

**Desktop (browser tam genişlik):**
1. AVS giriş → sol-nav 5 sekme görünür, aktif olan mavi.
2. Her sekmeye tıkla → içerik değişir, hız anında.
3. URL'e `?tab=ironing` gibi param eklendiğini DevTools'ta gör.
4. Sayfayı yenile (F5) → aynı sekmede kalır.
5. Üst sağdan Çıkış → login ekranı.

**Mobile (DevTools responsive, iPhone SE 375px):**
1. Sol-nav gizli, alt-nav görünür.
2. Aktif sekmenin altında mavi bar.
3. Sekmeler arası geçiş çalışır.

**Akış doğrulama:**
1. Torba Al → premium torba kaydet → success ekranı → "Yeni Torba" → form sıfırlanır, sekmede kalır.
2. Ütü → torba seç → checklist → tamamla.
3. Teslim → checklist → teslim et → success → "Yeni Teslim".

Expected: Tüm akışlar çalışır, "Ana Ekrana Dön" yerine form-spesifik "Yeni X" butonu, sekme değişmez.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/modules/laundry-kiosk/LaundryKioskPage.jsx frontend/src/index.css
git commit -m "feat(laundry-kiosk): sol-nav + bottom-nav shell + URL tab sync"
```

---

## Task 5: Final Smoke + Push

- [ ] **Step 1: Backend testler etkilenmemiş mi doğrula**

Run: `cd backend && npx vitest run`
Expected: Tüm testler geçer (mevcutta 324/324).

- [ ] **Step 2: Build kontrolü**

Run: `cd frontend && npx vite build`
Expected: Hata yok, bundle oluşur.

- [ ] **Step 3: Push**

```bash
git push origin main
```

Expected: 4 commit push edilir (Task 1, 2, 3, 4).

---

## Spec Coverage Check

| Spec Bölüm | Kapsayan Task |
|------------|---------------|
| §2 Sayfa Düzeni — sol-nav + üst bar + bottom-nav | Task 4 |
| §2 URL sync (`?tab=…`) | Task 4 Step 3 |
| §2 "Geri" butonu kalkar | Task 4 Step 2 (yeni return'da geri butonu yok) |
| §3 `GarmentChecklist` component | Task 1 |
| §3 IroningView kullanımı | Task 2 |
| §3 DeliverView kullanımı | Task 3 |
| §3 Garments boşsa hiçbir şey render etmez | Task 1 Step 1 (`if (!garments \|\| garments.length === 0) return null`) |
| §4 Dosya etkisi (sadece 2 dosya) | Tüm tasklar |
| §6 Test planı — manuel smoke | Task 2 Step 4, Task 3 Step 7, Task 4 Step 6 |
| §7 Migrasyon notu — URL yoksa default 'bag' | Task 4 Step 1 (`VALID_TABS.includes(fromUrl) ? fromUrl : 'bag'`) |

Tüm spec gereksinimleri kapsanmış.
