# YYS Toplu Import — Roster + Envanter

AVS personeli (roster) ve envanter kalemlerini **API üzerinden** toplu girer.
Doğrudan SQL değil → validation, audit log ve departman-eşleme mantığı korunur.

## 1. Şablonu doldur

- `roster.template.csv` → kendi personel listenle `roster.csv` olarak kaydet
- `inventory.template.csv` → `inventory.csv` olarak kaydet

(Template dosyalarındaki satırlar **örnektir**, sil ve gerçek veriyi yaz. Excel ile açıp düzenleyebilirsin; "CSV UTF-8" olarak kaydet.)

### Roster sütunları
| sütun | zorunlu | not |
|-------|---------|-----|
| `full_name` | ✓ | en az 2 karakter |
| `role_label` | – | **departmanı belirler** (boşsa envanter/vardiya erişimi olmaz). Anahtar kelimeler: `Temizlik/Kat/Meydancı`→Temizlik(housekeeping), `Teknik/Bakım`→Teknik(maintenance), `Çamaşır`→Çamaşırhane(laundry), `Güvenlik`, `Mutfak/Aşçı`, `İdari/Ofis`, `Bahçe`, `Sağlık/Revir` |
| `pin` | – | kiosk girişi için **4 haneli rakam**; boşsa sonra panelden verilir |
| `phone` | – | |
| `pickup_point` | – | servis noktası **adı** ya da id; bulunamazsa boş bırakılır |

### Envanter sütunları
| sütun | zorunlu | not |
|-------|---------|-----|
| `item_name` | ✓ | |
| `category` | ✓ | `housekeeping` · `maintenance` · `laundry` · `general` (kiosk bunlara göre filtreler) |
| `unit` | ✓ | litre/adet/kg… |
| `quantity` | – | başlangıç stok (varsayılan 0) |
| `reorder_threshold` | – | kritik stok eşiği |
| `unit_price` | – | |
| `location` | – | |
| `track_locations` | – | 0/1 — lokasyon bazlı stok takibi |

## 2. Önce DRY-RUN (hiçbir şey yazmaz)

```powershell
$env:YYS_ADMIN_USER = "kullanici_adi"
$env:YYS_ADMIN_PASS = "sifre"
node scripts/import/import-prod.mjs --url https://avskamp.com `
  --roster scripts/import/roster.csv --inventory scripts/import/inventory.csv
```

Çıktıyı incele: ne oluşturulacak, ne atlanacak (zaten var), hata var mı.

## 3. Gerçekten yaz: `--apply`

```powershell
node scripts/import/import-prod.mjs --url https://avskamp.com --apply `
  --roster scripts/import/roster.csv --inventory scripts/import/inventory.csv
```

- **Idempotent:** aynı isimli personel/ürün varsa atlanır → tekrar çalıştırmak güvenli.
- Sadece birini girmek istersen diğer `--roster`/`--inventory` argümanını verme.
- `roster.csv` / `inventory.csv` **commit edilmez** (gerçek veri / PII) — `.gitignore`'da.
