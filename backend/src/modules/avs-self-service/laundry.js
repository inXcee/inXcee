import { Router } from 'express'
import { requireAvsKiosk } from '../../shared/auth/middleware.js'
import { validate } from '../../shared/middleware/validate.js'
import { deliverRoom, intakeBags, ledgerOverview, markRoomReady, undoLedger } from '../laundry/field-ledger.js'
import { requireFieldGroup } from './board.js'
import { fieldLaundryDeliverSchema, fieldLaundryIntakeSchema, fieldLaundryUndoSchema } from './schemas.js'

// Saha ekranı çamaşır defteri: çamaşırhane + kat hizmetleri oda bazında teslim al → hazır → teslim et
// (docs/saha-ekrani.md). İş kuralları laundry/field-ledger.js'te; hata genel işleyicide durum koduyla döner.
export const avsLaundryRouter = Router()

avsLaundryRouter.use(requireAvsKiosk, requireFieldGroup)

avsLaundryRouter.get('/', (req, res, next) => {
  try { res.json(ledgerOverview()) } catch (e) { next(e) }
})

avsLaundryRouter.post('/', validate(fieldLaundryIntakeSchema), (req, res, next) => {
  try {
    const { room_id: roomId, bags, ironing, urgent, note, client_request_id: clientRequestId } = req.validated
    res.json(intakeBags({ roomId, bags, ironing, urgent, note, clientRequestId, workerId: req.fieldWorker.id }))
  } catch (e) { next(e) }
})

avsLaundryRouter.post('/rooms/:roomId/ready', (req, res, next) => {
  try { res.json(markRoomReady({ roomId: Number(req.params.roomId), workerId: req.fieldWorker.id })) } catch (e) { next(e) }
})

avsLaundryRouter.post('/rooms/:roomId/deliver', validate(fieldLaundryDeliverSchema), (req, res, next) => {
  try {
    res.json(deliverRoom({ roomId: Number(req.params.roomId), name: req.validated.name, workerId: req.fieldWorker.id }))
  } catch (e) { next(e) }
})

avsLaundryRouter.post('/undo', validate(fieldLaundryUndoSchema), (req, res, next) => {
  try {
    const { action, ids } = req.validated
    res.json(undoLedger({ action, ids, workerId: req.fieldWorker.id }))
  } catch (e) { next(e) }
})
