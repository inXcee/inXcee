// Sesli Hermes — saf mantık (DOM yok): SSE okuma, konuşma metni hazırlama, ekran durumu.
// Tarayıcıda ES modülü olarak yüklenir; birim testleri frontend/src/modules/hermes-voice/ altında.

// ── SSE (fetch akışı) ──
export function parseSseBlock(block) {
  let event = 'message'
  const data = []
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    const i = line.indexOf(':')
    const field = i === -1 ? line : line.slice(0, i)
    const value = i === -1 ? '' : line.slice(i + 1).replace(/^ /, '')
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  if (!data.length) return null
  const raw = data.join('\n')
  try { return { event, data: JSON.parse(raw) } } catch { return { event, data: raw } }
}

// chunks: async iterable (ReadableStream okuyucusundan) ya da dizi — Uint8Array / string parçaları
export async function* readSse(chunks) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of chunks) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    let m
    while ((m = /\r?\n\r?\n/.exec(buffer))) {
      const parsed = parseSseBlock(buffer.slice(0, m.index))
      buffer = buffer.slice(m.index + m[0].length)
      if (parsed) yield parsed
    }
  }
  buffer += decoder.decode()
  const tail = parseSseBlock(buffer)
  if (tail) yield tail
}

export async function* streamChunks(body) {
  const reader = body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      yield value
    }
  } finally { reader.releaseLock() }
}

// ── Seslendirme metni ──
// Hermes'e kısa/konuşma dilinde yanıt vermesi söylenir ama yine de işaretleme gelebilir: okunurken
// yıldız, diyez, kod işareti, bağlantı adresi sesli söylenmesin.
export function speakable(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\((?:https?:)?[^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'bağlantı')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/\|/g, ', ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Ekranda gösterim: işaretleme sembolleri temizlenir, satır sonları ve bağlantı adresleri korunur.
export function plainText(text) {
  return String(text ?? '')
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/(\*\*|__|~~)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=[\s).,!?:;]|$)/gm, '$1$2')
    .trim()
}

// Android'de uzun tek parça seslendirme yarıda kesilebiliyor → cümle cümle, en fazla ~max karakter.
export function splitForSpeech(text, max = 220) {
  const sentences = String(text ?? '').match(/[^.!?…]+[.!?…]*\s*/g) || []
  const out = []
  let cur = ''
  for (const s of sentences) {
    if ((cur + s).length > max && cur) { out.push(cur.trim()); cur = '' }
    if (s.length > max) {
      for (const part of s.match(new RegExp(`.{1,${max}}(\\s|$)`, 'g')) || [s]) out.push(part.trim())
      continue
    }
    cur += s
  }
  if (cur.trim()) out.push(cur.trim())
  return out.filter(Boolean)
}

// Sohbet modunda bu sözlerle konuşma biter (dinleme yeniden başlamaz).
const STOP_PHRASES = ['tamam', 'tamamdır', 'teşekkürler', 'teşekkür ederim', 'sağ ol', 'sağol', 'eyvallah',
  'kapat', 'görüşürüz', 'bu kadar', 'yeter', 'iptal', 'sus', 'dur']
export function isStopPhrase(text) {
  const t = String(text ?? '').toLocaleLowerCase('tr').replace(/[.!?,]/g, '').trim()
  return STOP_PHRASES.includes(t) || /^(tamam|teşekkür|sağ ?ol)\b.{0,12}$/.test(t)
}

// ── Ekran durumu ──
export const initialTurn = () => ({
  phase: 'thinking', runId: null, steps: [], draft: '', answer: '', notes: [], approval: null, error: null,
})

// Sayfa olayı (backend /api/hermes/ask akışı) → yeni tur durumu (saf)
export function reduceTurn(turn, evt) {
  const t = { ...turn }
  switch (evt?.type) {
    case 'run': t.runId = evt.run_id || t.runId; break
    case 'delta': t.draft = t.draft + (evt.text || ''); break
    case 'note': t.notes = [...t.notes, evt.text]; break
    case 'tool':
      if (evt.state === 'start') t.steps = [...t.steps, { tool: evt.tool, label: evt.label, state: 'start' }]
      else {
        const i = t.steps.map(s => s.tool).lastIndexOf(evt.tool)
        if (i !== -1) t.steps = t.steps.map((s, n) => (n === i ? { ...s, state: evt.state } : s))
      }
      break
    case 'approval': t.approval = { runId: evt.run_id || t.runId, requestId: evt.request_id || null,
      command: evt.command || evt.description || 'Bir işlem', choices: evt.choices || ['once', 'deny'] }; break
    case 'answer': t.answer = evt.text || t.draft; break
    case 'done': t.phase = 'done'; t.approval = null; if (!t.answer) t.answer = t.draft; break
    case 'cancelled': t.phase = 'cancelled'; t.approval = null; break
    case 'error': t.phase = 'error'; t.error = evt.message || 'Bir şeyler ters gitti'; t.approval = null; break
    default: break
  }
  return t
}

// Oturum: aynı sohbet bağlamı 6 saat sürer, sonra yeni sohbet (eski ayrıntılar Hermes'in hafızasında kalır)
export const SESSION_TTL_MS = 6 * 60 * 60 * 1000
export function sessionValid(saved, now = Date.now()) {
  return Boolean(saved?.id && /^[A-Za-z0-9_.:-]{1,128}$/.test(saved.id) && now - (saved.at || 0) < SESSION_TTL_MS)
}
