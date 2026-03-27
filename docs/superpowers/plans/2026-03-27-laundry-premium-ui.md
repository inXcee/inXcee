# Çamaşırhane Ultra Premium UI

**Hedef:** Tüm laundry modülünü dark-premium, glassmorphism-inspired, animasyonlu ve profesyonel bir görünüme kavuşturmak.

---

## FAZ 1 — ItemCard + MachineStrip premium redesign

### ItemCard yenilikler
- 4 adımlı durum flow indicator (Sepet → Yıkama → Hazır → Teslim)
- SLA progress bar (renk kodlu: yeşil/amber/kırmızı, saat gösterimli)
- Urgent kartlarda kırmızı glow pulse animasyonu
- Makine chip + raf konumu pill
- Aksiyon butonları daha büyük, full-width layout

### MachineStrip yenilikler
- SVG daire progress ring (timer görselleştirme, %'ye göre dolma)
- Running durumunda pulse glow efekti
- Makine tipi W (washer) / D (dryer) badge
- Daha geniş kart tasarımı

**Dosyalar:**
- `frontend/src/modules/laundry/components/ItemCard.jsx`
- `frontend/src/modules/laundry/components/MachineStrip.jsx`

---

## FAZ 2 — LaundryPage premium layout

- Header'a gradient dekoratif çizgi
- KPI kartları: alt progress bar + ikon
- Filter chip'ler: renkli dot indicator
- Boş durum: animasyonlu premium empty state

**Dosyalar:**
- `frontend/src/modules/laundry/LaundryPage.jsx`

---

## FAZ 3 — Dashboard + SlaAlert + QueuePanel premium

- Kanban kolonları: glow border, scroll
- SlaAlert: expandable violations, pulse animasyon
- QueuePanel: priority badge'li, zengin satır

**Dosyalar:**
- `frontend/src/modules/laundry/LaundryDashboard.jsx`
- `frontend/src/modules/laundry/components/SlaAlert.jsx`
- `frontend/src/modules/laundry/components/QueuePanel.jsx`

---

## FAZ 4 — Modals premium redesign

- NewItemModal: daha iyi layout, oda arama
- DeliveryModal: büyük imza alanı, adım akışı
- DamageModal: fotoğraf önizleme

**Dosyalar:**
- `frontend/src/modules/laundry/components/NewItemModal.jsx`
- `frontend/src/modules/laundry/components/DeliveryModal.jsx`
- `frontend/src/modules/laundry/components/DamageModal.jsx`
