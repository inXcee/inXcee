import { test, expect } from '@playwright/test'

test.describe('auth — login flow', () => {
  test('login page renders form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByPlaceholder('kullanici_adi')).toBeVisible()
    await expect(page.getByPlaceholder('••••••••')).toBeVisible()
    await expect(page.getByRole('button', { name: /GIRIS YAP/ })).toBeVisible()
  })

  test('logging in as mudur lands on dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('kullanici_adi').fill('mudur')
    await page.getByPlaceholder('••••••••').fill('admin123')
    await page.getByRole('button', { name: /GIRIS YAP/ }).click()

    await expect(page).toHaveURL('http://localhost:5174/', { timeout: 10_000 })
    await expect(page.getByRole('heading', { name: /^Dashboard/ })).toBeVisible({ timeout: 10_000 })
  })

  test('wrong password shows error', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('kullanici_adi').fill('mudur')
    await page.getByPlaceholder('••••••••').fill('yanlissifre')
    await page.getByRole('button', { name: /GIRIS YAP/ }).click()

    await expect(page.getByText(/Kullanici adi veya sifre hatali/)).toBeVisible({ timeout: 10_000 })
  })
})
