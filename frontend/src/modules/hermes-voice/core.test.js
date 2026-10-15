import { describe, it, expect } from 'vitest'
import {
  readSse, speakable, plainText, splitForSpeech, isStopPhrase, initialTurn, reduceTurn, sessionValid, SESSION_TTL_MS,
} from '../../../public/hermes/core.js'

describe('Sesli Hermes çekirdeği — SSE', () => {
  it('parça sınırına düşen olayı birleştirir, yorum satırını atlar', async () => {
    const enc = new TextEncoder()
    const parts = [enc.encode('event: delta\ndata: {"type":"del'), enc.encode('ta","text":"Merhaba"}\n\n: keepalive\n\n'),
      'event: done\r\ndata: {"type":"done"}\r\n\r\n']
    const out = []
    for await (const e of readSse(parts)) out.push(e)
    expect(out).toEqual([
      { event: 'delta', data: { type: 'delta', text: 'Merhaba' } },
      { event: 'done', data: { type: 'done' } },
    ])
  })

  it('Türkçe çok baytlı karakter iki parçaya bölünse de bozulmaz', async () => {
    const bytes = new TextEncoder().encode('data: {"text":"ışığı"}\n\n')
    const out = []
    for await (const e of readSse([bytes.slice(0, 15), bytes.slice(15)])) out.push(e)
    expect(out[0].data.text).toBe('ışığı')
  })
})

describe('Sesli Hermes çekirdeği — seslendirme metni', () => {
  it('işaretlemeyi, bağlantıyı ve emojiyi okumaz', () => {
    expect(speakable('**Bugün** 9 kişi çalışıyor 👷\n- Ayhan *off*\n- Detay: https://avskamp.com/x'))
      .toBe('Bugün 9 kişi çalışıyor. Ayhan off. Detay: bağlantı')
    expect(speakable('### Özet\n`avs-ops` çıktısı: [rapor](https://x.y/z)')).toBe('Özet. avs-ops çıktısı: rapor')
  })

  it('ekranda işaretleme temizlenir; satır sonu ve bağlantı adresi korunur', () => {
    expect(plainText('**Bugün** 9 kişi\n*Ayhan* off\n[rapor](https://x.y/z) · `avs-ops`'))
      .toBe('Bugün 9 kişi\nAyhan off\nrapor (https://x.y/z) · avs-ops')
    expect(plainText('2*3*4 = 24')).toBe('2*3*4 = 24')
  })

  it('uzun metni cümle sınırından ~220 karakterlik parçalara böler', () => {
    const long = 'Birinci cümle burada bitiyor. '.repeat(12)
    const parts = splitForSpeech(long)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every(p => p.length <= 220)).toBe(true)
    expect(parts.join(' ').replace(/\s+/g, ' ')).toBe(long.trim())
    expect(splitForSpeech('')).toEqual([])
  })

  it('sohbeti bitiren sözler', () => {
    for (const t of ['Tamam', 'teşekkürler.', 'Sağ ol', 'tamam teşekkürler', 'kapat']) expect(isStopPhrase(t), t).toBe(true)
    for (const t of ['tamam mı bugün su geldi', 'su durumu ne', 'teknikte kimler var']) expect(isStopPhrase(t), t).toBe(false)
  })
})

describe('Sesli Hermes çekirdeği — tur durumu', () => {
  it('adımlar, taslak yanıt, sonuç ve bitiş', () => {
    const events = [
      { type: 'run', run_id: 'run_1' },
      { type: 'tool', state: 'start', tool: 'terminal', label: 'AVS / YYS kayıtlarına bakıyor' },
      { type: 'tool', state: 'done', tool: 'terminal' },
      { type: 'delta', text: 'Bugün ' },
      { type: 'delta', text: 'dokuz kişi.' },
      { type: 'answer', text: 'Bugün dokuz kişi.' },
      { type: 'done' },
    ]
    const turn = events.reduce(reduceTurn, initialTurn())
    expect(turn).toMatchObject({ phase: 'done', runId: 'run_1', answer: 'Bugün dokuz kişi.', draft: 'Bugün dokuz kişi.' })
    expect(turn.steps).toEqual([{ tool: 'terminal', label: 'AVS / YYS kayıtlarına bakıyor', state: 'done' }])
  })

  it('onay isteği gösterilir, bitişte kalkar; hata mesajı tutulur', () => {
    let t = reduceTurn(initialTurn(), { type: 'run', run_id: 'run_2' })
    t = reduceTurn(t, { type: 'approval', request_id: 'q1', command: 'rm -rf /tmp/x', choices: ['once', 'deny'] })
    expect(t.approval).toEqual({ runId: 'run_2', requestId: 'q1', command: 'rm -rf /tmp/x', choices: ['once', 'deny'] })
    expect(reduceTurn(t, { type: 'done' }).approval).toBeNull()
    expect(reduceTurn(t, { type: 'error', message: 'kota' })).toMatchObject({ phase: 'error', error: 'kota', approval: null })
  })

  it('answer gelmeden done gelirse taslak yanıt kullanılır', () => {
    const t = [{ type: 'delta', text: 'kısmi' }, { type: 'done' }].reduce(reduceTurn, initialTurn())
    expect(t.answer).toBe('kısmi')
  })

  it('oturum 6 saat hareketsizlikte yenilenir; bozuk kimlik geçersiz', () => {
    const now = 10 * SESSION_TTL_MS
    expect(sessionValid({ id: 'api_1_abc', at: now - 1000 }, now)).toBe(true)
    expect(sessionValid({ id: 'api_1_abc', at: now - SESSION_TTL_MS - 1 }, now)).toBe(false)
    expect(sessionValid({ id: '../x', at: now }, now)).toBe(false)
    expect(sessionValid(null, now)).toBe(false)
  })
})
