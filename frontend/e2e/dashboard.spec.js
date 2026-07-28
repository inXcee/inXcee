import { test, expect } from '@playwright/test'
const FRONTEND_URL = process.env.E2E_FRONTEND_URL || `http://localhost:${process.env.E2E_FRONTEND_PORT || '5174'}`

async function loginAsMudur(page) {
  await page.goto('/login')
  await page.getByPlaceholder('örn. selam.aydin').fill('mudur')
  await page.getByPlaceholder('••••••••').fill('admin123')
  await page.getByRole('button', { name: /Giriş Yap/ }).click()
  await expect(page).toHaveURL(`${FRONTEND_URL}/`, { timeout: 10_000 })
}

test.describe('dashboard — smoke', () => {
  test('renders header and main widgets without error boundary', async ({ page }) => {
    await loginAsMudur(page)

    await expect(page.getByRole('heading', { name: /^Dashboard/ })).toBeVisible({ timeout: 10_000 })
    // ErrorBoundary fallback metni — varsa testi düşür
    await expect(page.getByText(/Bir şeyler ters gitti|Beklenmeyen bir hata/)).toHaveCount(0)
  })

  test('navigates from sidebar to capacity page', async ({ page }) => {
    await loginAsMudur(page)
    // Sidebar'da Kapasite linkini bekle ve tıkla
    const capLink = page.getByRole('link', { name: /Kapasite/ }).first()
    await capLink.waitFor({ state: 'visible', timeout: 10_000 })
    await capLink.click()
    await expect(page).toHaveURL(/\/capacity/, { timeout: 10_000 })
  })
})
