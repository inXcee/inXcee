import { test, expect } from '@playwright/test'

// Sesli Hermes sayfası (public/hermes/) — tarayıcının ses tanıma ve seslendirmesi sahte nesnelerle,
// /api/hermes/* uçları page.route ile karşılanır (gerçek Hermes gerekmez).
const sse = events => events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')

const ANSWER_EVENTS = [
  { type: 'run', run_id: 'run_1', session_id: 'api_1_test' },
  { type: 'tool', state: 'start', tool: 'terminal', label: 'AVS / YYS kayıtlarına bakıyor' },
  { type: 'tool', state: 'done', tool: 'terminal' },
  { type: 'delta', text: 'Bugün ' },
  { type: 'delta', text: 'dokuz kişi çalışıyor.' },
  { type: 'answer', text: '**Bugün** dokuz kişi çalışıyor.' },
  { type: 'done' },
]

async function fakeSpeech(page, utterances) {
  await page.addInitScript((list) => {
    window.__utterances = list
    window.__srStarts = 0
    window.__spoken = []
    class FakeRecognition {
      start() {
        window.__srStarts += 1
        const text = window.__utterances.shift()
        setTimeout(() => {
          if (text) {
            const result = Object.assign([{ transcript: text }], { isFinal: true })
            this.onresult?.({ resultIndex: 0, results: [result] })
          } else {
            this.onerror?.({ error: 'no-speech' })
          }
          this.onend?.()
        }, 60)
      }
      stop() {}
      abort() {}
    }
    window.SpeechRecognition = FakeRecognition
    window.webkitSpeechRecognition = FakeRecognition
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 20) },
        cancel() {},
        getVoices() { return [{ name: 'Google Türkçe', lang: 'tr-TR' }] },
        addEventListener() {},
      },
    })
  }, utterances)
}

async function mockApi(page, { askStatus = 200, askBody = sse(ANSWER_EVENTS), statusBody = { configured: true, reachable: true } } = {}) {
  const asked = []
  await page.route('**/api/hermes/status', r => r.fulfill({ json: statusBody }))
  await page.route('**/api/hermes/session', r => r.fulfill({ json: { session_id: 'api_1_test' } }))
  await page.route('**/api/hermes/ask', (r) => {
    asked.push(r.request().postDataJSON())
    if (askStatus !== 200) return r.fulfill({ status: askStatus, json: { error: 'Bulunamadı' } })
    return r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: askBody })
  })
  await page.route('**/api/auth/refresh', r => r.fulfill({ status: 401, json: { error: 'Oturum bulunamadı' } }))
  await page.route('**/hermes/sw.js', r => r.fulfill({ status: 404, body: '' }))
  return asked
}

test('açılınca dinler, soruyu sorar, yanıtı yazar ve okur; sohbet modu "teşekkürler"le biter', async ({ page }) => {
  await fakeSpeech(page, ['teknikte kimler var', 'teşekkürler'])
  const asked = await mockApi(page)
  await page.goto('/hermes/index.html')

  await expect(page.locator('#answer')).toHaveText('Bugün dokuz kişi çalışıyor.')
  await expect(page.locator('#steps li')).toHaveText(['AVS / YYS kayıtlarına bakıyor'])
  await expect(page.locator('#steps li')).toHaveClass('done')
  expect(asked).toEqual([{ text: 'teknikte kimler var', session_id: 'api_1_test' }])

  // seslendirme işaretlemesiz; ardından sohbet modu yeniden dinler ve "teşekkürler" ile durur
  await expect.poll(() => page.evaluate(() => window.__spoken)).toEqual(['Bugün dokuz kişi çalışıyor.'])
  await expect.poll(() => page.evaluate(() => window.__srStarts)).toBe(2)
  await expect(page.locator('#hint')).toHaveText('Tamam — dokununca yine dinlerim')
  expect(asked).toHaveLength(1)
})

test('yazarak sorulabilir; geçmiş listesi sonraki soruda dolar', async ({ page }) => {
  await fakeSpeech(page, [])
  await page.addInitScript(() => localStorage.setItem('hermes.settings', JSON.stringify({ autoListen: false })))
  const asked = await mockApi(page)
  await page.goto('/hermes/index.html')

  await page.locator('#typeInput').fill('su durumu nasıl')
  await page.locator('#typeInput').press('Enter')
  await expect(page.locator('#answer')).toHaveText('Bugün dokuz kişi çalışıyor.')
  await page.locator('#typeInput').fill('peki yarın')
  await page.locator('#typeInput').press('Enter')
  await expect(page.locator('#question')).toHaveText('“peki yarın”')
  await expect(page.locator('#history li .q')).toHaveText(['su durumu nasıl'])
  expect(asked.map(a => a.text)).toEqual(['su durumu nasıl', 'peki yarın'])
})

test('oturum kapanmışsa giriş bağlantısı gösterilir', async ({ page }) => {
  await fakeSpeech(page, [])
  await mockApi(page, { statusBody: null })
  await page.unroute('**/api/hermes/status')
  await page.route('**/api/hermes/status', r => r.fulfill({ status: 404, json: { error: 'Bulunamadı' } }))
  await page.goto('/hermes/index.html')
  await expect(page.locator('#notice')).toContainText('Oturumun kapanmış')
  await expect(page.locator('#notice a')).toHaveAttribute('href', '/')
})

test('Hermes kurulmamışsa dinlemeye başlamaz ve açıklar', async ({ page }) => {
  await fakeSpeech(page, ['merhaba'])
  await mockApi(page, { statusBody: { configured: false, reachable: false } })
  await page.goto('/hermes/index.html')
  await expect(page.locator('#notice')).toHaveText('Sesli Hermes bu sunucuda henüz kurulmamış.')
  expect(await page.evaluate(() => window.__srStarts)).toBe(0)
})
