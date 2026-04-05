# Laundry Records, Reports & Archive Improvements Design

## Overview

Enhance the Laundry module's Kayıtlar (Records), Raporlar (Reports), and Arşiv (Archive) sections for better usability and visual consistency. The primary change is adding a new "Tümü" tab to Kayıtlar that shows every laundry item individually with full detail including inline expandable premium garment lists.

## Goals

- Add "Tümü" tab to Kayıtlar: every laundry item individually visible, premium items visually distinguished, full clothing/color/pattern detail, inline expandable premium garment list
- Reports section: visual consistency improvements only (no new data/metrics)
- Archive section: visual consistency improvements only (no new functionality)

---

## Section 1: Kayıtlar — Tümü Tab

### Tab Structure

Current tabs: `Bugün | Premium | Teslim Edildi`
New tab order: `Tümü | Bugün | Premium | Teslim Edildi`

### Data Scope

The "Tümü" tab shows all `laundry_items` records — active and delivered — sorted by `created_at` descending (newest first). No date filter by default; the user can narrow via the filter bar.

### Filter Bar

A single-line filter row above the list:
- **Durum dropdown**: Tümü / Bekliyor / Yıkanıyor / Hazır / Teslim Edildi / Kayıp
- **Arama input**: free-text search on room number (`room_number`) and resident name (`resident_name`)
- Filters apply client-side (data already fetched); no additional API call needed

### Record Row Layout

Each `laundry_items` row renders as a card with two visible lines and an optional accordion:

**Line 1 — Summary**
```
[★] ODA 204  •  Ahmet Yılmaz  •  3 parça  •  [DURUM BADGE]  •  2s 15dk
```
- `★` shown only when `has_premium_items = true`, color: `#f59e0b` (gold)
- Duration: difference between `created_at` and `delivered_at` (if delivered), else time since `created_at`
- Durum badge: same color system used throughout the module

**Line 2 — Clothing Detail**
```
👕 Mont, Kazak  |  ● Mavi ● Siyah  ▤ Çizgili
```
- Clothing items from `clothing_items` JSON column (comma-joined type names)
- Color dots: `parseColors()` from `ColorPatternPicker.jsx`
- Pattern badge: icon + name, only if present

**Accordion trigger** (shown only when `has_premium_items = true`)
```
[▼ 2 premium parça]   or   [▲ 2 premium parça]  (when open)
```
- Clicking toggles `expandedId` state (only one row open at a time)
- Accordion content: readonly `PremiumGarmentList` — shows each garment's type/brand/model/size/color/pattern/status
- Accordion renders inside the same card, no page scroll jump

### Implementation Notes

- New component: `AllRecordsTab.jsx` in `frontend/src/modules/laundry/components/`
- Uses existing `useLaundryItems()` query (or equivalent) — no new API endpoint needed
- `ColorPatternDisplay` from `ColorPatternPicker.jsx` for color/pattern rendering
- Premium garment data fetched lazily: only when accordion is opened (use `laundryApi.getPremiumGarments(item.id)` with queryKey `['premium-garments', item.id]` — same as `PremiumGarmentList.jsx`)
- `expandedId` state: `null` or `laundry_item.id` — only one expanded at a time

---

## Section 2: Raporlar — Visual Improvements

**Scope:** Layout and styling only. No changes to data, metrics, or chart logic.

### Stat Cards

- Enforce equal height across all stat cards (CSS `align-items: stretch` on the grid)
- Consistent padding: `16px`
- Visual hierarchy: icon (24px, `var(--accent)`) → label (12px, `var(--mono)`) → value (28px bold)

### WeeklyTrendChart

- Line/bar color: `var(--accent)` instead of hardcoded hex
- Grid lines: `var(--border)` color
- Tooltip background: `var(--surface-2)`
- No changes to data or chart type

### Premium Report Section

- Wrap in the same card component as stat cards (consistent border, padding, border-radius)
- Header style matches other section headers

### CSV Export Button

- Move to top-right of the Reports section header row
- Always visible; does not scroll out of view

---

## Section 3: Arşiv — Visual Improvements

**Scope:** Styling and layout only. No changes to filters, columns, pagination, or data.

### Table Rows

- Row height: increase to `48px` minimum (from current ~36px)
- Hover: `background: var(--surface-2)`
- Alternating rows: subtle `var(--surface)` / `var(--surface-2)` striping (optional, implement only if it improves readability)

### Status Badges

- Use the same badge component/styles as Kayıtlar and Raporlar
- Remove any ad-hoc inline styles on badges

### Filter Row

- Date, status dropdown, and search input on a single row (flex, gap 8px)
- Currently they may be stacked — align them horizontally

### Column Alignment

- Numeric columns (PARÇA, SÜRE): right-aligned
- Text columns: left-aligned (current behavior kept)

---

## Out of Scope

- No new API endpoints
- No new metrics or data in Reports
- No new columns or functionality in Archive
- No changes to Bugün / Premium / Teslim Edildi tabs
- No changes to existing PremiumGarmentList edit/delivery functionality
