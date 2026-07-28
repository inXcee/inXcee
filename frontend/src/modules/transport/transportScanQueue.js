import api from '../../shared/api/client.js'
import { dequeue, enqueue, getQueue } from '../../shared/utils/offlineDB.js'

export function createClientEventId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `transport-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export async function enqueueTransportScan({
  tripId,
  qrToken,
  clientEventId = createClientEventId(),
  deviceTime = new Date().toISOString(),
}) {
  await enqueue('transport_scan', {
    trip_id: Number(tripId),
    qr_token: qrToken,
    client_event_id: clientEventId,
    device_time: deviceTime,
  })
  return clientEventId
}

export async function getTransportScanQueue() {
  const queue = await getQueue()
  return queue.filter(item => item.type === 'transport_scan')
}

export async function flushTransportScanQueue(client = api) {
  const queue = await getTransportScanQueue()
  let sent = 0
  let dropped = 0
  for (const item of queue) {
    try {
      await client.post(`/transport/trips/${item.payload.trip_id}/scan`, {
        qr_token: item.payload.qr_token,
        client_event_id: item.payload.client_event_id,
        device_time: item.payload.device_time,
      })
      await dequeue(item.id)
      sent++
    } catch (error) {
      const status = error?.response?.status
      if (status >= 400 && status < 500 && status !== 409) {
        await dequeue(item.id)
        dropped++
      }
    }
  }
  return {
    sent,
    dropped,
    remaining: (await getTransportScanQueue()).length,
  }
}
