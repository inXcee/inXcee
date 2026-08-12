import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import axios from 'axios'
import {
  clearDeviceIdentity,
  detectDeviceCapabilities,
  readDeviceIdentity,
  saveDeviceIdentity,
} from './deviceIdentity.js'
import { setOfflineContext, clearOfflineContext, getQueue, getQueueSummary, updateQueueItem } from '../utils/offlineDB.js'

const DEVICE_PATHS = ['/kiosk', '/laundry-kiosk', '/avs-kiosk', '/station', '/display']

function isDevicePath(pathname) {
  return DEVICE_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`))
}

export default function KioskDeviceAgent() {
  const location = useLocation()
  const [identity, setIdentity] = useState(null)
  const [device, setDevice] = useState(null)
  const active = isDevicePath(location.pathname)

  const request = useCallback(async (method, path, data) => {
    if (!identity?.device_key) return null
    try {
      const response = await axios.request({
        method,
        url: `/api${path}`,
        timeout: 15_000,
        data,
        headers: { 'X-Kiosk-Device-Key': identity.device_key },
      })
      return response.data
    } catch (error) {
      if (error.response?.status === 401) {
        await clearDeviceIdentity()
        setIdentity(null)
        setDevice(null)
      }
      return null
    }
  }, [identity])

  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    readDeviceIdentity().then(value => {
      if (!cancelled && value) {
        setIdentity(value)
        setDevice(value.device || null)
        setOfflineContext({ deviceId: value.device?.id || null })
      }
    }).catch(() => {})
    return () => { cancelled = true; clearOfflineContext() }
  }, [active])

  const processCommands = useCallback(async () => {
    const commands = await request('get', '/kiosk-device/commands')
    if (!Array.isArray(commands)) return
    for (const command of commands) {
      let status = 'completed'
      let result = {}
      try {
        if (command.command_type === 'lock') setDevice(current => ({ ...current, status: 'locked' }))
        if (command.command_type === 'config_refresh') {
          const config = await request('get', '/kiosk-device/config')
          if (config?.device) setDevice(config.device)
        }
        if (command.command_type === 'rotate_key') {
          const rotated = await request('post', '/kiosk-device/rotate-key')
          if (!rotated?.device_key) throw new Error('Yeni anahtar alınamadı')
          const nextIdentity = { ...identity, device_key: rotated.device_key }
          await saveDeviceIdentity(nextIdentity)
          setIdentity(nextIdentity)
          await axios.post(`/api/kiosk-device/commands/${command.id}/ack`, { status, result }, {
            timeout: 15_000,
            headers: { 'X-Kiosk-Device-Key': rotated.device_key },
          })
          continue
        }
        if (command.command_type === 'app_reload') {
          await request('post', `/kiosk-device/commands/${command.id}/ack`, { status, result })
          window.location.reload()
          return
        }
      } catch (error) {
        status = 'failed'
        result = { error: error instanceof Error ? error.message : 'Komut uygulanamadı' }
      }
      await request('post', `/kiosk-device/commands/${command.id}/ack`, { status, result })
    }
  }, [identity, request])

  const reconcileQueue = useCallback(async () => {
    const queue = await getQueue().catch(() => [])
    if (!queue.length) return
    const response = await request('post', '/kiosk-device/sync', {
      client_action_ids: queue.slice(0, 500).map(item => String(item.id)),
    })
    for (const receipt of response?.items || []) {
      if (receipt.status === 'completed') {
        await updateQueueItem(receipt.client_action_id, {
          status: 'synced', error: null, server_result: receipt.result?.body || receipt.result || null,
        })
      } else if (receipt.status === 'conflict' || receipt.status === 'rejected') {
        await updateQueueItem(receipt.client_action_id, {
          status: receipt.status,
          error: receipt.result?.body?.error || `Sunucu durumu: ${receipt.status}`,
          server_result: receipt.result?.body || receipt.result || null,
        })
      }
    }
  }, [request])

  useEffect(() => {
    if (!active || !identity?.device_key) return undefined
    let stopped = false
    const heartbeat = async () => {
      await reconcileQueue()
      const queue = await getQueueSummary().catch(() => ({ total: 0, statuses: {} }))
      const updated = await request('post', '/kiosk-device/heartbeat', {
        app_version: 'web-1.0.0',
        capabilities: detectDeviceCapabilities(),
        health: {
          online: navigator.onLine,
          path: window.location.pathname,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          queue_statuses: queue.statuses,
        },
        queue_count: queue.total,
        error_count: (queue.statuses?.conflict || 0) + (queue.statuses?.rejected || 0) + (queue.statuses?.manual_review || 0),
      })
      if (!stopped && updated) setDevice(updated)
    }
    heartbeat()
    processCommands()
    const heartbeatTimer = window.setInterval(heartbeat, 60_000)
    const commandTimer = window.setInterval(processCommands, 15_000)
    return () => {
      stopped = true
      window.clearInterval(heartbeatTimer)
      window.clearInterval(commandTimer)
    }
  }, [active, identity?.device_key, processCommands, reconcileQueue, request])

  if (!active || device?.status !== 'locked') return null
  return (
    <div role="alertdialog" aria-modal="true" aria-label="Kiosk cihazı kilitli" style={{
      position: 'fixed', inset: 0, zIndex: 100000, background: '#07101d', color: '#f8fafc',
      display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center',
    }}>
      <div style={{ maxWidth: 520 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 28, letterSpacing: 2 }}>CİHAZ KİLİTLİ</h1>
        <p style={{ color: '#94a3b8', marginTop: 12, lineHeight: 1.6 }}>
          {device.name || 'Bu kiosk'} yönetici tarafından kilitlendi. İşleme devam etmek için yöneticinin cihazı yeniden etkinleştirmesi gerekir.
        </p>
        <div style={{ marginTop: 18, fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>Cihaz: {device.id}</div>
      </div>
    </div>
  )
}
