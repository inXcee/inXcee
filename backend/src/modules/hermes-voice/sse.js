// Server-Sent Events ayrıştırıcı — Hermes'in akışını (fetch gövdesi) olay olay okur.
// Olaylar boş satırla ayrılır; "event:" adı, "data:" (çok satırlı olabilir) JSON yükü; ":" ile başlayan
// satır yorumdur (Hermes 10 sn'de bir ": keepalive" yollar) ve atlanır.

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

// Bayt parçaları (Uint8Array/Buffer/string) akışından tam olayları üretir; yarım kalan blok bir sonraki parçayı bekler.
export async function* readSse(chunks) {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of chunks) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
    let m
    while ((m = /\r?\n\r?\n/.exec(buffer))) {
      const block = buffer.slice(0, m.index)
      buffer = buffer.slice(m.index + m[0].length)
      const parsed = parseSseBlock(block)
      if (parsed) yield parsed
    }
  }
  buffer += decoder.decode()
  const tail = parseSseBlock(buffer)
  if (tail) yield tail
}
