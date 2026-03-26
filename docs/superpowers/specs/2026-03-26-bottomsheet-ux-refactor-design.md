# BottomSheet UX Refactor — Design Spec

**Date:** 2026-03-26
**Goal:** Convert 4 SidePanel/ModalOverlay usages to BottomSheet so all detail/action panels in the app are consistent — sliding up from the bottom, matching the Puantaj BordroDetailSheet and StaffDetailPanel patterns.

---

## Context

The app currently has two competing panel patterns:
- **BottomSheet** — slides up from bottom (used by StaffDetailPanel, BordroDetailSheet) ✅ preferred
- **SidePanel** — slides in from the right (used by VARDIYA ATA, HAFTA DOLDUR)
- **ModalOverlay** — centered floating modal (used by Personel edit/new form)

User expectation: every action that opens a panel should use BottomSheet, like the Puantaj tab does.

---

## Scope

### What changes

| Location | Trigger | Current UI | New UI |
|---|---|---|---|
| ScheduleTab | Hücreye tıkla | SidePanel "VARDIYA ATA" | BottomSheet |
| ScheduleTab | ↓ (hafta doldur) butonu | SidePanel "HAFTA DOLDUR" | BottomSheet |
| StaffTab | ✏️ Düzenle butonu | ModalOverlay form | BottomSheet (2 sekme) |
| StaffTab | + Yeni Personel butonu | ModalOverlay form | BottomSheet (2 sekme) |

### What does NOT change

- **StaffDetailPanel** — already BottomSheet ✅
- **BordroDetailSheet** — already BottomSheet ✅
- **Araçlar dropdown** — stays as dropdown menu ✅
- `SidePanel` component definition — not deleted (may be used elsewhere)
- `ModalOverlay` component definition — not deleted (may be used elsewhere)

---

## Design

### 1. VARDIYA ATA BottomSheet

**Trigger:** Click any shift cell in the weekly/daily grid
**State:** `cellPopover` (existing) — object `{ staffId, deptId, date, personName, existing }`. The `rect` field is no longer needed since BottomSheet doesn't need anchor positioning.

**Content (unchanged from current SidePanel):**
- Header: person name + date
- Shift selector: list of shift definitions for the department, radio-style chips
- "İzin Olarak İşaretle" toggle/button
- "Vardiyayı Sil" delete button (only shown if existing shift)
- Uygula / İptal buttons

**Behavior:**
- Opens when `cellPopover !== null`
- Closes on Esc, backdrop click, or after successful mutation
- After mutation (assign/delete), invalidates query and closes

### 2. HAFTA DOLDUR BottomSheet

**Trigger:** Click ↓ button at the end of a staff row
**State:** `weekFillPopover` (existing) — object `{ person }`. The `rect` field is no longer needed.

**Content (unchanged from current SidePanel):**
- Header: person name
- Vardiya seçici: dropdown or chips for shift definition
- Hafta sonu günü seçici: which day of week is the off-day
- Uygula / İptal buttons

**Behavior:**
- Opens when `weekFillPopover !== null`
- Closes on Esc, backdrop click, or after successful mutation

### 3. Personel Düzenle / Yeni Personel BottomSheet

**Trigger:** ✏️ Düzenle button (edit) or + Yeni Personel button (new)
**State:** `showForm` + `editStaff` (existing) — same logic, different wrapper component

**Content — 2 tabs:**

**Sekme 1: Temel Bilgiler**
- Ad Soyad (text, required)
- TC Kimlik No (text)
- Telefon (tel)
- E-posta (email)
- Pozisyon (text)
- Departman (select)
- İşe Giriş Tarihi (date)
- Aktif / Pasif toggle (checkbox)

**Sekme 2: Detaylar**
- Doğum Tarihi (date)
- Adres (textarea)
- Acil Durum Kişisi (text)
- Acil Durum Telefonu (tel)
- Kan Grubu (select: A+, A-, B+, B-, AB+, AB-, 0+, 0-)
- Cinsiyet (select: Erkek, Kadın)
- Maaş (number)
- Notlar (textarea)

**Footer (sabit, her iki sekmede de görünür):**
- Kaydet butonu (primary)
- İptal butonu (ghost)

**Behavior:**
- Opens when `showForm === true`
- Tab state: local `useState('temel')` inside the sheet component
- On save: submit mutation, close on success
- On close: reset `showForm = false`, `editStaff = null`
- Esc closes the sheet

---

## Architecture

**File:** `frontend/src/modules/shifts/ShiftsPage.jsx` (single file, existing pattern)

**New components added (function components inside ShiftsPage.jsx):**
- `CellAssignSheet` — wraps existing cell-assign logic in BottomSheet
- `WeekFillSheet` — wraps existing week-fill logic in BottomSheet
- `StaffFormSheet` — new staff create/edit form in BottomSheet with 2 tabs

**Removed usages (not the component definitions):**
- `SidePanel` usage in `cellPopover` render
- `SidePanel` usage in `weekFillPopover` render
- `ModalOverlay` usage in staff form render

**State changes:**
- `cellPopover`: remove `rect` field (no longer needed for positioning)
- `weekFillPopover`: remove `rect` field (no longer needed for positioning)
- All other state variables unchanged

**No backend changes.** All mutations stay the same.

---

## Testing

No automated tests for frontend components in this project. Manual verification:

- [ ] Çizelge: hücreye tıklayınca BottomSheet alttan gelir
- [ ] Çizelge: BottomSheet'ten vardiya atanınca hücre güncellenir ve panel kapanır
- [ ] Çizelge: ↓ butonuna tıklayınca HAFTA DOLDUR BottomSheet gelir
- [ ] Çizelge: hafta doldur uygulanınca panel kapanır ve haftanın hücreleri güncellenir
- [ ] Personel: Düzenle butonuna tıklayınca BottomSheet 2 sekmeyle gelir
- [ ] Personel: Temel/Detaylar sekmeleri arasında geçiş çalışır
- [ ] Personel: Kaydet çalışır, panel kapanır, kart güncellenir
- [ ] Personel: Yeni Personel butonu BottomSheet açar, boş form
- [ ] Tüm paneller: Esc ile kapanır, backdrop ile kapanır
- [ ] StaffDetailPanel, BordroDetailSheet dokunulmadı — hâlâ çalışıyor
