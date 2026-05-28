import { test, expect } from '@playwright/test'

test.describe('login v4 — modal + mod altyapısı', () => {
  // Her test için temiz context — önceki testlerin cookie/session'ı sızmasın.
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('KVKK footer link modal açar', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /KVKK/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: /KVKK Aydınlatma Metni/ })).toBeVisible()
    // ESC ile kapanır
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('Destek modalı iletişim kartları gösterir', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /^Destek$/ }).click()
    await expect(page.getByText(/Acil 7\/24/)).toBeVisible()
    await expect(page.getByText(/destek@avskamp\.com/).first()).toBeVisible()
    // Backdrop tıklamasıyla kapanır
    await page.locator('.lp-modal-back').click({ position: { x: 10, y: 10 } })
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('Şifremi unuttum self-service yok mesajı', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /Şifremi unuttum/ }).click()
    await expect(page.getByText(/self-service şifre sıfırlama yoktur/)).toBeVisible()
  })

  test('Mod sekme değişimi URL\'ye yansır', async ({ page }) => {
    await page.goto('/login')
    // standard varsayılan — URL'de ?mode yok
    expect(new URL(page.url()).searchParams.get('mode')).toBeNull()

    await page.getByRole('tab', { name: /Yönetici/ }).click()
    await expect(page).toHaveURL(/\?mode=admin/)

    await page.getByRole('tab', { name: /Güvenlik/ }).click()
    await expect(page).toHaveURL(/\?mode=security/)

    // standard'a dönünce ?mode parametresi temizlenir
    await page.getByRole('tab', { name: /Personel/ }).click()
    await expect(page).not.toHaveURL(/\?mode=/)
  })

  test('Direkt ?mode=admin ile açılınca yönetici sekmesi seçili', async ({ page }) => {
    await page.goto('/login?mode=admin')
    // form başlığı admin moduna geçtiğimizi gösterir
    await expect(page.locator('.lp-root .card .title').filter({ hasText: 'Yönetici Girişi' })).toBeVisible()
    // ve admin tab'ı aktif görünüyor
    await expect(page.locator('button.mode.on').filter({ hasText: 'Yönetici' })).toBeVisible()
  })

  test('Yönetici sekmesinde personel hesabı role_mismatch hatası alır', async ({ page }) => {
    // Backend'i mock'la — authLimiter sayacını ve gerçek DB seed'ini etkilemeden
    // frontend rol-mismatch UX'ini doğrula. (Diğer testlerle aynı suite içinde
    // çalıştırıldığında /api/auth/* rate-limit kuyruğuna girmemek için.)
    await page.route('**/api/auth/login', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 99, username: 'vardiya', role: 'shift_supervisor', full_name: 'Vardiya Amiri' } }),
    }))
    await page.route('**/api/auth/logout', route => route.fulfill({ status: 204 }))

    await page.goto('/login?mode=admin')
    await page.getByPlaceholder('örn. selam.aydin').fill('vardiya')
    await page.getByPlaceholder('••••••••').fill('admin123')
    await page.getByRole('button', { name: /Giriş Yap/ }).click()
    await expect(page.getByText(/Bu sekme yönetici hesapları içindir/)).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('Şifre alanı başlangıçta CAPS-LOCK KAPALI hint gösterir', async ({ page }) => {
    // Not: Playwright'ın headless Chrome'u getModifierState('CapsLock') değerini
    // güvenilir şekilde toggle edemiyor — sadece varsayılan durum + DOM yapısı
    // smoke kontrolü yapıyoruz. Canlı tespiti manuel/gerçek tarayıcıda doğruluyoruz.
    await page.goto('/login')
    await expect(page.getByText(/CAPS-LOCK KAPALI/)).toBeVisible()
  })
})
