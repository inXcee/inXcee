import { Router } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { requireRole } from '../../shared/auth/middleware.js'
import { logger } from '../../shared/logger.js'
import {
  listBackupsService, runBackupService, getBackupFileService,
  deleteBackupService, restoreBackupService,
} from './service.js'

export const backupRouter = Router()
const adminOnly = requireRole('campus_manager')

// Restore upload — uploads/backup-tmp dizinine yaz, max 100MB SQLite
const restoreDir = path.join(process.env.UPLOADS_DIR || 'uploads', 'backup-tmp')
fs.mkdirSync(restoreDir, { recursive: true })

const restoreUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, restoreDir),
    filename: (req, file, cb) => cb(null, `restore_${Date.now()}.db`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.endsWith('.db')) {
      return cb(new Error('Sadece .db uzantılı dosyalar kabul edilir'))
    }
    cb(null, true)
  },
})

backupRouter.get('/list', ...adminOnly, (req, res) => {
  try { res.json(listBackupsService()) }
  catch (e) { logger.error('[Backup]', e); res.status(500).json({ error: 'Sunucu hatası' }) }
})

backupRouter.post('/run', ...adminOnly, async (req, res) => {
  try {
    const result = await runBackupService()
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.status(201).json(result)
  } catch (e) {
    logger.error('[Backup]', e)
    res.status(500).json({ error: 'Yedekleme başarısız: ' + e.message })
  }
})

backupRouter.get('/download/:name', ...adminOnly, (req, res) => {
  const result = getBackupFileService(req.params.name)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.download(result.path, result.name)
})

backupRouter.delete('/:name', ...adminOnly, (req, res) => {
  const result = deleteBackupService(req.params.name)
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

backupRouter.post('/restore', ...adminOnly, restoreUpload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Yedek dosyası yüklenmedi' })
  try {
    const result = await restoreBackupService(req.file.path)
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json(result)
    // 1sn sonra process'i kapat — PM2 yeniden başlatır
    if (process.env.NODE_ENV === 'production') {
      setTimeout(() => process.exit(0), 1000)
    }
  } catch (e) {
    logger.error('[Backup/restore]', e)
    res.status(500).json({ error: 'Geri yükleme başarısız: ' + e.message })
  }
})
