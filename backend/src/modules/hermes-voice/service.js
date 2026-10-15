// Sesli Hermes — YYS sahibinin telefonundaki sesli asistan sayfası (/hermes/) ile Hermes Agent arasında vekil.
// Hermes'in olay akışı sayfanın ihtiyacı kadar sadeleştirilir: konuşma metni, araç adımları, onay isteği, sonuç.
import { readSse } from './sse.js'

// Hermes'in çekirdek talimatının ÜSTÜNE eklenir (yetenekler aynı kalır) — yanıt sesli okunacak.
export const VOICE_INSTRUCTIONS = [
  'Bu istek telefondaki SESLİ ASİSTANDAN geliyor; yanıtın yüksek sesle okunacak.',
  'Kısa ve konuşma dilinde yanıt ver: en fazla birkaç cümle. Madde işareti, tablo, başlık, emoji, bağlantı kullanma.',
  'Sayıları ve saatleri okunur yaz. Uzun liste gerekiyorsa en önemli birkaçını söyle, gerisini Telegram\'a gönderebileceğini belirt.',
  'Konuşma tanıma hataları olabilir: isim ya da kelime tutmuyorsa en yakın anlamı seç, emin değilsen kısaca sor.',
].join(' ')

export const MAX_INPUT = 2000

// Araç adı → kullanıcıya gösterilecek kısa Türkçe adım
const TOOL_LABELS = {
  terminal: 'Komut çalıştırıyor',
  skill_view: 'Beceriye bakıyor',
  skills_list: 'Becerilere bakıyor',
  web_search: 'Web\'de arıyor',
  web_extract: 'Sayfayı okuyor',
  memory: 'Hafızaya bakıyor',
  session_search: 'Eski konuşmalara bakıyor',
  read_file: 'Dosya okuyor',
  write_file: 'Dosya yazıyor',
  patch: 'Dosyayı düzenliyor',
  search_files: 'Dosyalarda arıyor',
  vision_analyze: 'Görseli inceliyor',
  todo: 'Plan yapıyor',
  cronjob: 'Zamanlanmış işlere bakıyor',
  delegate_task: 'Alt görev başlatıyor',
  execute_code: 'Kod çalıştırıyor',
}

export function toolLabel(tool, preview) {
  const base = TOOL_LABELS[tool] || `Araç: ${tool}`
  const p = typeof preview === 'string' ? preview.trim() : ''
  if (tool === 'terminal' && /avs-ops|yys-write|yys_/.test(p)) return 'AVS / YYS kayıtlarına bakıyor'
  if (tool === 'skill_view' && p) return `Beceri: ${p.slice(0, 40)}`
  return base
}

// Hermes olayı → sayfa olayı (null = sayfaya iletilmez)
export function mapHermesEvent(event, data) {
  const d = data && typeof data === 'object' ? data : {}
  switch (event) {
    case 'run.started': return { type: 'run', run_id: d.run_id, session_id: d.session_id }
    case 'assistant.delta': return d.delta ? { type: 'delta', text: String(d.delta) } : null
    case 'assistant.commentary': return d.text ? { type: 'note', text: String(d.text) } : null
    case 'tool.started':
      if (!d.tool_name || String(d.tool_name).startsWith('_')) return null
      return { type: 'tool', state: 'start', tool: d.tool_name, label: toolLabel(d.tool_name, d.preview) }
    case 'tool.completed':
      if (!d.tool_name || String(d.tool_name).startsWith('_')) return null
      return { type: 'tool', state: 'done', tool: d.tool_name }
    case 'tool.failed':
      return { type: 'tool', state: 'fail', tool: d.tool_name || '?' }
    case 'approval.request':
      return {
        type: 'approval', run_id: d.run_id,
        request_id: d.request_id || null,
        command: typeof d.command === 'string' ? d.command.slice(0, 500) : null,
        description: typeof d.description === 'string' ? d.description.slice(0, 300) : null,
        choices: Array.isArray(d.choices) ? d.choices : ['once', 'deny'],
      }
    case 'assistant.completed': return { type: 'answer', text: String(d.content ?? '') }
    case 'run.completed': return { type: 'done' }
    case 'run.failed': return { type: 'error', message: String(d.error || d.message || 'Hermes yanıt veremedi').slice(0, 300) }
    case 'run.cancelled': return { type: 'cancelled' }
    default: return null
  }
}

// Sahip başına aynı anda tek istek (Hermes api_server max_concurrent_runs=2; ikinci slot Telegram/cron'a kalsın).
const active = new Set()
export function beginAsk(userId) {
  if (active.has(userId)) return false
  active.add(userId)
  return true
}
export function endAsk(userId) { active.delete(userId) }
export function _resetForTests() { active.clear() }

// Hermes akışını okuyup sayfa olaylarına çevirir; her olay için send(evt) çağrılır. Akış biterken sonuç döner.
export async function relayHermesStream(body, send) {
  let answer = ''
  let terminal = null
  for await (const { event, data } of readSse(body)) {
    const mapped = mapHermesEvent(event, data)
    if (!mapped) continue
    if (mapped.type === 'answer') answer = mapped.text
    if (['done', 'error', 'cancelled'].includes(mapped.type)) terminal = mapped.type
    send(mapped)
  }
  return { answer, terminal }
}
