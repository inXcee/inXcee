import { test, expect } from '@playwright/test'

// TP-OTC sinematik landing kabul turu — hero + 9 bölüm + HUD + dil + gerçek login.
// Bölümler scroll-reveal'lı; görünür olması için viewport'a kaydırılır.
test.describe('login landing — sinematik redesign kabul turu', () => {
  test.beforeEach(async ({ context }) => { await context.clearCookies() })

  test('hero: login kartı + tanıtım başlığı render eder', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByPlaceholder('örn. selam.aydin')).toBeVisible()
    await expect(page.getByPlaceholder('••••••••')).toBeVisible()
    await expect(page.getByRole('heading', { name: /814 yatak/ })).toBeVisible()
  })

  test('nav bölüm linkleri görünür', async ({ page }) => {
    await page.goto('/login')
    const nav = page.locator('.nav-sections')
    for (const lbl of ['Modüller', 'Sayılarla', 'Bloklar', 'Filyos', 'Güvenlik'])
      await expect(nav.getByRole('link', { name: lbl })).toBeVisible()
  })

  test('misyon bandı görünür', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /kesintisiz nefesi/ })).toBeVisible()
  })

  test('hizmet sütunları (3) reveal olur', async ({ page }) => {
    await page.goto('/login')
    const pillars = page.locator('.pillar')
    await pillars.first().scrollIntoViewIfNeeded()
    await expect(pillars).toHaveCount(3)
    await expect(page.getByRole('heading', { name: /Tesis & Bakım/ })).toBeVisible()
  })

  test('modül carousel 10 kart + canlı rozet gösterir', async ({ page }) => {
    await page.goto('/login')
    const cards = page.locator('#modules .mcard')
    await cards.first().scrollIntoViewIfNeeded()
    await expect(cards).toHaveCount(10)
    // "Oda & Yatak" kartında stats'tan türetilen "% dolu" rozeti
    await expect(page.locator('#modules .mcard', { hasText: 'Oda & Yatak' }).locator('.liveb')).toBeVisible()
  })

  test('sayaçlar viewport\'a girince count-up yapar (Aktif blok = 19)', async ({ page }) => {
    await page.goto('/login')
    const stat = page.locator('#stats .stat', { hasText: 'Aktif blok' }).locator('.v')
    await stat.scrollIntoViewIfNeeded()
    await expect(stat).toHaveText('19', { timeout: 5_000 })
  })

  test('heatmap 19 blok hücresi (M1 dahil)', async ({ page }) => {
    await page.goto('/login')
    const cells = page.locator('[data-testid="heat-cell"]')
    await cells.first().scrollIntoViewIfNeeded()
    await expect(cells).toHaveCount(19)
    await expect(page.locator('[data-testid="heat-cell"]', { hasText: 'M1' })).toBeVisible()
  })

  test('Filyos ortam + güvenlik bandı görünür', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#env').scrollIntoViewIfNeeded()
    await expect(page.getByRole('heading', { name: /Filyos anlık ortam/ })).toBeVisible()
    await page.locator('#sec').scrollIntoViewIfNeeded()
    // #sec'e scope — "TLS 1.3" ticker'da da geçiyor (strict-mode çakışmasını önle)
    await expect(page.locator('#sec').getByText('TLS 1.3')).toBeVisible()
  })

  test('ticker + landing footer görünür', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('.tickerbar')).toBeVisible()
    const footer = page.locator('footer.footer')
    await footer.scrollIntoViewIfNeeded()
    await expect(footer.getByText(/© 2026 AVS Kamp Alanı/)).toBeVisible()
    await expect(footer.getByText(/KampüsERP v5\.0/)).toBeVisible()
  })

  test('HUD: hareket modu + yağmur toggle çalışır', async ({ page }) => {
    await page.goto('/login')
    const seg = page.locator('.hud .seg')
    await seg.getByRole('button', { name: 'Normal' }).click()
    await expect(seg.getByRole('button', { name: 'Normal' })).toHaveClass(/on/)
    // yağmur toggle aria-pressed değişir
    const rain = page.locator('.hud .toggle')
    const before = await rain.getAttribute('aria-pressed')
    await rain.click()
    await expect(rain).not.toHaveAttribute('aria-pressed', before ?? '')
  })

  test('dil seçici TR/EN/AR + AR ile RTL', async ({ page }) => {
    await page.goto('/login')
    const lang = page.locator('.card .lang')
    await lang.getByRole('button', { name: 'EN' }).click()
    await expect(lang.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
    // AR → html dir=rtl
    await lang.getByRole('button', { name: 'AR' }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    // TR'ye dönünce LTR
    await lang.getByRole('button', { name: 'TR' }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  })

  // Not: Gerçek giriş akışı (mudur → dashboard, /login = yeni landing) auth.spec.js'te
  // kapsanıyor — burada tekrarlamak hem redundant hem authLimiter'ı tetikliyor.
})
