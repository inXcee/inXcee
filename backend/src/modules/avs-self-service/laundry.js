import { Router } from 'express'
import { requireAvsKiosk } from '../../shared/auth/middleware.js'
import { getDB } from '../../shared/db/index.js'
import { validate } from '../../shared/middleware/validate.js'
import { deliverRoom, intakeBags, ledgerOverview, markRoomReady, undoLedger } from '../laundry/field-ledger.js'
import { BLOCK_DENIED, blockAllowed, requireFieldGroup } from './board.js'
import { fieldLaundryDeliverSchema, fieldLaundryIntakeSchema, fieldLaundryUndoSchema } from './schemas.js'

// Saha ekranı çamaşır defteri: çamaşırhane + kat hizmetleri oda bazında teslim al → hazır → teslim et
// (docs/saha-ekrani.md). İş kuralları laundry/field-ledger.js'te; hata genel işleyicide durum koduyla döner.
export const avsLaundryRouter = Router()

avsLaundryRouter.use(requireAvsKiosk, requireFieldGroup)

// Oda panosuyla aynı blok kuralı: atanmış personel başka bloğun odasına / torbasına dokunamaz.
// Olmayan oda servise bırakılır (404 orada).
function roomAllowed(req, roomId) {
  const room = getDB().prepare('SELECT block FROM rooms WHERE id=?').get(roomId)
  return !room || blockAllowed(req, room.block)
}

function bagsAllowed(req, ids) {
  if (!req.fieldWorker.assigned_block) return true
  return getDB().prepare(`
    SELECT DISTINCT r.block FROM laundry_items li JOIN rooms r ON r.id=li.room_id
    WHERE li.id IN (${ids.map(() => '?').join(',')})
  `).all(...ids).every(row => blockAllowed(req, row.block))
}

avsLaundryRouter.get('/', (req, res, next) => {
  try { res.json(ledgerOverview(undefined, { block: req.fieldWorker.assigned_block })) } catch (e) { next(e) }
})

avsLaundryRouter.post('/', validate(fieldLaundryIntakeSchema), (req, res, next) => {
  try {
    const { room_id: roomId, bags, ironing, urgent, note, client_request_id: clientRequestId } = req.validated
    if (!roomAllowed(req, roomId)) return res.status(403).json(BLOCK_DENIED)
    res.json(intakeBags({ roomId, bags, ironing, urgent, note, clientRequestId, workerId: req.fieldWorker.id }))
  } catch (e) { next(e) }
})

avsLaundryRouter.post('/rooms/:roomId/ready', (req, res, next) => {
  try {
    const roomId = Number(req.params.roomId)
    if (!roomAllowed(req, roomId)) return res.status(403).json(BLOCK_DENIED)
    res.json(markRoomReady({ roomId, workerId: req.fieldWorker.id }))
  } catch (e) { next(e) }
})

avsLaundryRouter.post('/rooms/:roomId/deliver', validate(fieldLaundryDeliverSchema), (req, res, next) => {
  try {
    const roomId = Number(req.params.roomId)
    if (!roomAllowed(req, roomId)) return res.status(403).json(BLOCK_DENIED)
    res.json(deliverRoom({ roomId, name: req.validated.name, workerId: req.fieldWorker.id }))
  } catch (e) { next(e) }
})

avsLaundryRouter.post('/undo', validate(fieldLaundryUndoSchema), (req, res, next) => {
  try {
    const { action, ids } = req.validated
    if (!bagsAllowed(req, ids)) return res.status(403).json(BLOCK_DENIED)
    res.json(undoLedger({ action, ids, workerId: req.fieldWorker.id }))
  } catch (e) { next(e) }
})
