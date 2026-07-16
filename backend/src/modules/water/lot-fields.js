import { isIsoDate } from '../../shared/validation/date.js'

const badRequest = message => Object.assign(new Error(message), { statusCode: 400 })

function optionalDate(value, label) {
  if (value == null || String(value).trim() === '') return null
  const normalized = String(value).trim()
  if (!isIsoDate(normalized)) throw badRequest(`${label} geçerli bir YYYY-MM-DD tarihi olmalı`)
  return normalized
}

export function normalizeIntakeLot(data, product, moveDate) {
  const lotNo = data?.lot_no == null ? '' : String(data.lot_no).trim()
  if (lotNo.length > 80) throw badRequest('Lot numarası en fazla 80 karakter olabilir')

  const productionDate = optionalDate(data?.production_date, 'Üretim tarihi')
  const expiryDate = optionalDate(data?.expiry_date, 'SKT')
  if (product?.expiry_tracking && !lotNo) throw badRequest(`${product.name} için lot numarası zorunlu`)
  if (product?.expiry_tracking && !expiryDate) throw badRequest(`${product.name} için SKT zorunlu`)
  if (productionDate && productionDate > moveDate) throw badRequest('Üretim tarihi giriş tarihinden sonra olamaz')
  if (productionDate && expiryDate && productionDate > expiryDate) throw badRequest('SKT üretim tarihinden önce olamaz')
  if (expiryDate && expiryDate < moveDate) throw badRequest('SKT giriş tarihinden önce olamaz')

  return {
    lot_no: lotNo || null,
    production_date: productionDate,
    expiry_date: expiryDate,
  }
}
