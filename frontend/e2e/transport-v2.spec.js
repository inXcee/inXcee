import { test, expect } from '@playwright/test'

const today = new Date().toISOString().slice(0, 10)
const suffix = String(Date.now()).slice(-6)
const FRONTEND_URL = process.env.E2E_FRONTEND_URL || `http://localhost:${process.env.E2E_FRONTEND_PORT || '5174'}`
const state = {}

async function login(page) {
  await page.goto('/login')
  await page.getByPlaceholder('örn. selam.aydin').fill('mudur')
  await page.getByPlaceholder('••••••••').fill('admin123')
  await page.getByRole('button', { name: /Giriş Yap/ }).click()
  await expect(page).toHaveURL(`${FRONTEND_URL}/`, { timeout: 10_000 })
}

async function api(page, method, path, data) {
  const response = await page.context().request.fetch(path, {
    method,
    data,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok()) {
    throw new Error(`${method} ${path} → ${response.status()}: ${await response.text()}`)
  }
  return response.json()
}

test.describe.serial('Servisler V2 kritik kabul akışı', () => {
  test('kurulumdan rapora tüm operasyon zinciri çalışır', async ({ page }) => {
    test.setTimeout(90_000)
    await login(page)

    const rollout = await api(page, 'PATCH', '/api/transport/v2/status', {
      enabled: true,
      reason: 'Playwright kritik kabul turu',
    })
    expect(rollout.ready).toBe(true)

    await page.goto('/transport')
    const setupWizard = page.getByLabel('Servisler ilk kurulum')
    if (await setupWizard.count()) {
      await expect(setupWizard).toBeVisible()
    } else {
      await expect(page.getByRole('button', { name: /OPERASYON/ })).toBeVisible()
    }

    const point = await api(page, 'POST', '/api/transport/pickup-points', {
      name: `E2E Durak ${suffix}`,
      district: 'Çaycuma',
      lat: 41.42,
      lng: 31.78,
    })
    const route = await api(page, 'POST', '/api/transport/routes', {
      name: `E2E Hat ${suffix}`,
      capacity: 4,
    })
    const stop = await api(page, 'POST', `/api/transport/routes/${route.id}/stops`, {
      pickup_point_id: point.id,
      scheduled_time: '07:00',
    })
    const vehicle = await api(page, 'POST', '/api/transport/vehicles', {
      plate: `67 E2E ${suffix}`,
      label: 'Kabul Aracı',
      capacity: 4,
    })
    const replacement = await api(page, 'POST', '/api/transport/vehicles', {
      plate: `67 YDK ${suffix}`,
      label: 'Yedek Araç',
      capacity: 4,
    })
    const driver = await api(page, 'POST', '/api/transport/drivers', {
      full_name: `E2E Şoför ${suffix}`,
      phone: '05320000999',
    })
    const staff = await api(page, 'GET', '/api/transport/staff')
    await api(page, 'PUT', `/api/transport/staff/${staff[0].id}/pickup`, {
      pickup_point_id: point.id,
    })
    const qr = await api(page, 'POST', `/api/qr/staff/${staff[0].id}/generate`, {})

    const template = await api(page, 'POST', '/api/transport/trip-templates', {
      name: `E2E Sabah ${suffix}`,
      route_id: route.id,
      direction: 'outbound',
      departure_time: '07:00',
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      default_vehicle_id: vehicle.id,
      default_driver_id: driver.id,
    })
    const preview = await api(page, 'POST', '/api/transport/plan/preview', {
      start_date: today,
      end_date: today,
      template_ids: [template.id],
    })
    expect(preview.summary.trip_count).toBe(1)
    expect(preview.summary.blocker_count).toBe(0)

    const published = await api(page, 'POST', '/api/transport/plan/publish', {
      start_date: today,
      end_date: today,
      template_ids: [template.id],
      base_revision: preview.base_revision,
      warning_reason: 'Kritik kabul turu kontrol edildi',
    })
    const trip = published.trips[0]
    await api(page, 'POST', `/api/transport/trips/${trip.id}/assignments`, {
      staff_id: staff[0].id,
      stop_id: stop.id,
    })

    await page.goto(`/transport?tab=operation`)
    await page.getByLabel('Operasyon tarihi').fill(today)
    await expect(page.locator('.transport-trip-grid').getByText(`E2E Hat ${suffix}`).first())
      .toBeVisible()

    await api(page, 'POST', `/api/transport/trips/${trip.id}/boarding`, {})
    const scan = await api(page, 'POST', `/api/transport/trips/${trip.id}/scan`, {
      qr_token: `AVS:${qr.qr_token}`,
      client_event_id: `e2e-scan-${suffix}`,
      device_time: new Date().toISOString(),
    })
    expect(scan).toMatchObject({ result: 'boarded', duplicate: false })

    await api(page, 'PATCH', `/api/transport/trips/${trip.id}`, {
      vehicle_id: replacement.id,
      change_reason: 'Kritik kabul turu araç değişimi',
    })
    const notifications = await api(
      page,
      'GET',
      '/api/notifications?module=transport&limit=100',
    )
    expect(notifications.items.some(item => item.module === 'transport')).toBe(true)

    const shared = await api(page, 'POST', `/api/transport/trips/${trip.id}/share-link`, {
      expires_in_hours: 1,
    })
    await page.goto(`/driver/trips/${shared.token}`)
    await expect(page.getByText(`E2E Hat ${suffix}`)).toBeVisible()
    await expect(page.getByText(/Telefon numaraları.*gizlidir/)).toBeVisible()
    await page.getByRole('button', { name: 'SEFERE BAŞLADIM' }).click()
    await expect(page.getByRole('button', { name: 'SEFERİ TAMAMLADIM' })).toBeVisible()
    await page.getByRole('button', { name: 'SEFERİ TAMAMLADIM' }).click()
    await expect(page.getByText('✓ Sefer tamamlandı')).toBeVisible()

    const analytics = await api(
      page,
      'GET',
      `/api/transport/analytics?start=${today}&end=${today}&route_id=${route.id}`,
    )
    expect(analytics.kpis.trips).toBe(1)
    expect(analytics.trips[0]).toMatchObject({
      id: trip.id,
      status: 'completed',
      vehicle: 'Yedek Araç',
    })

    await page.goto('/transport?tab=analytics')
    await expect(page.getByRole('button', { name: /ANALİZ/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'Günlük operasyon' })).toBeVisible()

    Object.assign(state, {
      routeName: `E2E Hat ${suffix}`,
      tripId: trip.id,
    })
  })

  test('390 px mobil görünümde ana işlemler dokunulabilir ve taşma yapmaz', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await login(page)
    await page.goto('/transport?tab=operation')

    await expect(page.getByRole('button', { name: /OPERASYON/ })).toBeVisible()
    if (state.routeName) {
      await page.getByLabel('Operasyon tarihi').fill(today)
      await expect(page.locator('.transport-trip-grid').getByText(state.routeName).first())
        .toBeVisible()
    }

    const tabSizes = await page.locator('.transport-v2__tabs > button').evaluateAll(buttons =>
      buttons.map(button => {
        const box = button.getBoundingClientRect()
        return { width: box.width, height: box.height }
      }),
    )
    expect(tabSizes.every(size => size.height >= 44 && size.width >= 44)).toBe(true)
    const hasPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(hasPageOverflow).toBe(false)
  })
})
