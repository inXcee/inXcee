# /phase — Tek Faz Uygulama

Aşamalı planın bir sonraki fazını uygula. Rate limit'e takılmamak için tek faz ile sınırlı çalış.

## Adımlar

1. `PLAN.md` dosyasını oku (yoksa kullanıcıya sor)
2. İlk **tamamlanmamış** fazı bul
3. SADECE o fazı uygula — diğer fazlara dokunma
4. Her değişiklikten sonra `cd backend && npx vitest run` çalıştır
5. Tüm testler geçiyorsa commit at: `feat: Phase N — <kısa açıklama>`
6. `PLAN.md`'de o fazı ✅ olarak işaretle
7. **DUR** — kullanıcı onayı olmadan sonraki faza geçme

## Kurallar

- Bir fazda hata varsa önce düzelt, sonra commit at
- Faz içindeki özellikler bağımsızsa alt ajanlara dağıt
- Her faz sonunda test sonucunu kullanıcıya göster
- Scope dışına çıkma — sadece plandaki işleri yap
