import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryMocks = vi.hoisted(() => ({
  createTruckArrival: vi.fn(),
  createWaybillPhoto: vi.fn(),
  deleteTruckArrival: vi.fn(),
  deleteWaybillPhoto: vi.fn(),
  getBrand: vi.fn(),
  getMovement: vi.fn(),
  getTruckArrival: vi.fn(),
  listTruckArrivals: vi.fn(),
  listWaybillPhotos: vi.fn(),
  setTruckChecked: vi.fn(),
  setTruckMailQueued: vi.fn(),
  setTruckMailSent: vi.fn(),
  updateTruckArrival: vi.fn(),
}))
const enqueue = vi.hoisted(() => vi.fn())
const parseRecipients = vi.hoisted(() => vi.fn())
const notifyWaterOperations = vi.hoisted(() => vi.fn())
const getDB = vi.hoisted(() => vi.fn())

vi.mock('./queries.js', () => queryMocks)
vi.mock('../../shared/db/index.js', () => ({ getDB }))
vi.mock('../../shared/jobs/index.js', () => ({ enqueue }))
vi.mock('../email/service.js', () => ({ parseRecipients }))
vi.mock('./notifications.js', () => ({ notifyWaterOperations }))

import {
  checkTruckArrivalAlerts,
  createTruckArrivalService,
  createWaybillPhotoService,
  sendTruckArrivalMailService,
  truckArrivalsService,
} from './trucks.js'

function readyTruck(overrides = {}) {
  return {
    id: 7,
    arrival_date: '2027-03-17',
    arrival_start_time: '10:00',
    arrival_end_time: '12:00',
    mail_deadline_date: '2027-03-17',
    mail_deadline_time: '17:00',
    reminder_start_time: '08:00',
    reminder_end_time: '17:00',
    reminder_interval_minutes: 30,
    supplier_name: 'Mila Su',
    brand_id: null,
    brand_name: 'Mila',
    driver_name: 'Yüksel Bektaş',
    driver_tc: '11111111111',
    driver_phone: '05551112233',
    plate: '34 SU 217',
    trailer_plate: '34 DRS 400',
    identity_type: 'tc',
    visit_company: 'Tedarik ve Yönetim',
    host_person_name: 'Sercan Sucu',
    host_person_phone: '05553334455',
    entry_reason: 'SU AMAÇLI NAKLİYE',
    work_area: 'FPU KAMP',
    center_email: 'merkez@example.com',
    status: 'planned',
    note: null,
    mail_sent_at: null,
    mail_job_id: null,
    mail_job_status: null,
    mail_job_attempts: null,
    mail_job_max_attempts: null,
    mail_job_last_error: null,
    mail_queued_at: null,
    photo_count: 0,
    ...overrides,
  }
}

describe('water truck operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDB.mockReturnValue({
      transaction: operation => ({ immediate: operation }),
    })
    enqueue.mockReturnValue(91)
    parseRecipients.mockReturnValue(['merkez@example.com'])
    notifyWaterOperations.mockReturnValue(['campus_manager'])
    queryMocks.createTruckArrival.mockReturnValue(41)
    queryMocks.createWaybillPhoto.mockReturnValue(51)
    queryMocks.getBrand.mockReturnValue({ id: 3, name: 'Mila' })
    queryMocks.listTruckArrivals.mockReturnValue([])
    queryMocks.listWaybillPhotos.mockReturnValue([])
    queryMocks.setTruckMailQueued.mockReturnValue(true)
  })

  it('normalizes gate-entry data and enforces operational time rules', () => {
    expect(createTruckArrivalService({
      arrival_date: '2027-03-17',
      plate: ' 34 su 217 ',
      trailer_plate: ' 34 drs 400 ',
      supplier_name: ' Mila Su ',
      brand_id: '3',
      reminder_interval_minutes: '5',
    }, 12)).toBe(41)

    expect(queryMocks.getBrand).toHaveBeenCalledWith(3)
    expect(queryMocks.createTruckArrival).toHaveBeenCalledWith(expect.objectContaining({
      arrival_date: '2027-03-17',
      arrival_start_time: '08:00',
      arrival_end_time: '17:00',
      mail_deadline_date: '2027-03-17',
      mail_deadline_time: '17:00',
      reminder_interval_minutes: 15,
      plate: '34 SU 217',
      trailer_plate: '34 DRS 400',
      supplier_name: 'Mila Su',
      brand_id: 3,
      created_by: 12,
      updated_by: 12,
    }))

    expect(() => createTruckArrivalService({
      arrival_date: '2027-03-17',
      arrival_start_time: '18:00',
      arrival_end_time: '17:00',
      plate: '34 HATA 1',
    }, 12)).toThrowError(expect.objectContaining({
      statusCode: 400,
      message: 'Geliş aralığı başlangıcı bitişten sonra olamaz',
    }))
  })

  it('decorates list rows with mail readiness and gate-entry summaries', () => {
    queryMocks.listTruckArrivals.mockReturnValue([readyTruck()])

    const [truck] = truckArrivalsService({ limit: 5000 })

    expect(queryMocks.listTruckArrivals).toHaveBeenCalledWith({ limit: 1000 })
    expect(truck).toMatchObject({
      status_label: 'Planlandı',
      arrival_window: '10:00-12:00',
      mail_ready: true,
      vehicle_summary: '34 SU 217 / 34 DRS 400',
      gate_entry: {
        full_name: 'Yüksel Bektaş',
        identity_no: '11111111111',
        ready: true,
        work_area: 'FPU KAMP',
      },
      mail_preview: {
        to: 'merkez@example.com',
        ready: true,
      },
    })
    expect(truck.mail_subject).toContain('2027-03-17 - 34 SU 217')
    expect(truck.mail_body).toContain('Personel ve araç girişinin sağlanması')
  })

  it('queues mail transactionally and returns the existing active job on duplicate requests', () => {
    let row = readyTruck()
    queryMocks.getTruckArrival.mockImplementation(() => row)
    queryMocks.setTruckMailQueued.mockImplementation((id, jobId) => {
      row = { ...row, mail_job_id: jobId, mail_job_status: 'pending', mail_queued_at: '2027-03-16 09:00:00' }
      return true
    })

    const queued = sendTruckArrivalMailService(7, 12)

    expect(parseRecipients).toHaveBeenCalledWith('merkez@example.com')
    expect(enqueue).toHaveBeenCalledWith('water.truck-mail', expect.objectContaining({
      truckArrivalId: 7,
      requestedBy: 12,
      to: 'merkez@example.com',
      subject: expect.stringContaining('34 SU 217'),
      body: expect.stringContaining('PERSONEL GÜNLÜK GİRİŞ BİLGİLERİ'),
    }), { maxAttempts: 5 })
    expect(queryMocks.setTruckMailQueued).toHaveBeenCalledWith(7, 91, 12)
    expect(queued).toMatchObject({
      queued: true,
      alreadyQueued: false,
      job_id: 91,
      truck: { mail_phase: 'queued', mail_queue: { job_id: 91, active: true } },
    })

    expect(sendTruckArrivalMailService(7, 12)).toMatchObject({
      queued: true,
      alreadyQueued: true,
      job_id: 91,
    })
    expect(enqueue).toHaveBeenCalledOnce()
  })

  it('uses the current reminder slot for minute-level mail and arrival alerts', () => {
    queryMocks.listTruckArrivals.mockReturnValue([readyTruck()])

    const first = checkTruckArrivalAlerts({ now: new Date('2027-03-17T11:07:00+03:00') })

    expect(first).toMatchObject({ checked: 1, created: 2, date: '2027-03-17', time: '11:07' })
    expect(notifyWaterOperations).toHaveBeenCalledWith(expect.objectContaining({
      dedup_key: 'water_truck_mail_7_2027-03-17_1100',
    }))
    expect(notifyWaterOperations).toHaveBeenCalledWith(expect.objectContaining({
      dedup_key: 'water_truck_arrival_7_2027-03-17_1100',
    }))

    notifyWaterOperations.mockClear()
    checkTruckArrivalAlerts({ now: new Date('2027-03-17T11:30:00+03:00') })
    expect(notifyWaterOperations).toHaveBeenCalledWith(expect.objectContaining({
      dedup_key: 'water_truck_mail_7_2027-03-17_1130',
    }))
  })

  it('accepts only intake-linked waybill photos and preserves normalized metadata', () => {
    queryMocks.getTruckArrival.mockReturnValue(readyTruck())
    queryMocks.getMovement.mockReturnValue({
      id: 22,
      type: 'in',
      move_date: '2027-03-17',
      waybill_no: 'IRS-22',
    })

    expect(createWaybillPhotoService({
      truck_arrival_id: '7',
      movement_id: '22',
      note: ' Teslim alındı ',
    }, {
      filename: 'water-waybill-22.jpg',
      originalname: 'irsaliye.jpg',
      mimetype: 'image/jpeg',
      size: 2048,
    }, 12)).toBe(51)

    expect(queryMocks.createWaybillPhoto).toHaveBeenCalledWith({
      truck_arrival_id: 7,
      movement_id: 22,
      waybill_no: 'IRS-22',
      move_date: '2027-03-17',
      photo_url: '/uploads/water-waybill-22.jpg',
      original_name: 'irsaliye.jpg',
      mime: 'image/jpeg',
      size: 2048,
      note: 'Teslim alındı',
      uploaded_by: 12,
    })

    queryMocks.getMovement.mockReturnValue({ id: 23, type: 'out', move_date: '2027-03-17' })
    expect(() => createWaybillPhotoService({
      movement_id: '23',
    }, { filename: 'out.jpg' }, 12)).toThrowError(expect.objectContaining({
      statusCode: 400,
      message: 'Fotoğraf sadece giriş/irsaliye kaydına bağlanabilir',
    }))
  })
})
