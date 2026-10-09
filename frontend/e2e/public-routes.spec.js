import { test, expect } from '@playwright/test'

test.describe('public routes — smoke', () => {
  test('laundry kiosk loads', async ({ page }) => {
    await page.goto('/laundry-kiosk')
    await expect(page).toHaveURL(/\/laundry-kiosk/)
    // Sayfa içeriğinin yüklendiğini doğrula — kiosk personel girişi ekranı görünmeli
    await expect(page.getByRole('heading', { name: 'Personel girişi' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('searchbox', { name: 'Personel ara' })).toBeVisible()
  })

  test('mobile login shows role selection', async ({ page }) => {
    await page.goto('/mobile')
    // Rol seçeneklerinden en az birini bekle
    await expect(page.getByText(/Temizlik|Teknik|Çamaşırhane|Vardiya|Müdür/).first()).toBeVisible({ timeout: 10_000 })
  })

  test('login redirects unauthenticated user from / to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})
