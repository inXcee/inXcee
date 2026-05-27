import { test, expect, request as pwRequest } from '@playwright/test'

const API = 'http://localhost:3001/api'
const WORKER = `Env Test ${Date.now()}`
let workerId

test.beforeAll(async () => {
  const ctx = await pwRequest.newContext()
  const token = (await (await ctx.post(`${API}/auth/login`, { data: { username: 'mudur', password: 'admin123' } })).json()).token
  const auth = { Authorization: `Bearer ${token}` }
  // Temizlik Görevlisi → dept 2 (Temizlik) → inventory_category=housekeeping
  const w = await ctx.post(`${API}/avs-workers`, { headers: auth, data: { full_name: WORKER, role_label: 'Temizlik Görevlisi' } })
  workerId = (await w.json()).id
  await ctx.put(`${API}/avs-workers/${workerId}/pin`, { headers: auth, data: { new_pin: '1234' } })
  await ctx.dispose()
})

// Regresyon: "Malzeme" sekmesi login sonrası (Profil'e girmeden) görünmeli.
// myInfo eager yüklenmezse hasInventory false kalır ve sekme hiç çıkmaz.
test('envanter: login → Daha fazla → Malzeme → ürün al → stok düşer → Aldıklarım', async ({ page }) => {
  await page.goto('/avs-kiosk')
  await expect(page.getByRole('heading', { name: 'AVS Personel Kiosk' })).toBeVisible()

  // Worker ara + seç
  await page.getByPlaceholder('Ad/soyad ara…').fill('Env Test')
  await page.getByRole('button', { name: new RegExp(WORKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()

  // Numpad PIN 1234 (4. hanede otomatik giriş)
  for (const d of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: new RegExp(`^${d}$`) }).click()
  }
  await expect(page.getByRole('tab', { name: /Vardiya/ })).toBeVisible({ timeout: 10_000 })

  // "Daha fazla" → "Malzeme" (envanter sekmesi overflow'da) — Profil'e girmeden görünür olmalı
  await page.getByRole('button', { name: /Daha fazla/ }).click()
  await page.getByRole('menuitem', { name: /Malzeme/ }).click()

  // Envanter paneli açıldı
  await expect(page.getByRole('heading', { name: 'Malzeme Al' })).toBeVisible({ timeout: 10_000 })

  // Housekeeping ürünü listede (seed: 'Eldiven (M)') — .first() ile dup-seed'e dayanıklı
  const itemBtn = page.getByRole('button', { name: /Eldiven \(M\)/ }).first()
  await expect(itemBtn).toBeVisible({ timeout: 10_000 })
  await itemBtn.click()

  // Ürün formu — varsayılan miktar 1 ile "Aldım"
  await page.getByRole('button', { name: /^Aldım$/ }).click()

  // Başarı mesajı (201 → stok aynı transaction'da düşer)
  await expect(page.getByText('Alındı, stoktan düşüldü.')).toBeVisible({ timeout: 10_000 })

  // "Aldıklarım" bölümünde görünür (my-checkouts → inventory_checkouts kaydı)
  const mine = page.locator('text=Aldıklarım').locator('..')
  await expect(mine.getByText('Eldiven (M)').first()).toBeVisible({ timeout: 10_000 })
})
