// Kamera fotoğrafını küçült (max kenar + JPEG dataURL) — upload boyutu ve
// offline kuyrukta localStorage'a sığması için. Kiosk akışlarının ortak helper'ı.
export function downscalePhoto(file, maxDim = 1280, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Fotoğraf okunamadı')) }
    img.src = url
  })
}

// Dosya seçiciden gelen File'ı küçültülmüş JPEG Blob'a çevirir — FormData'ya
// doğrudan eklenebilir. Küçültme başarısızsa ham dosyayla devam eder (yükleme
// büyük olur ama kullanıcı istisna kaydını kaybetmez).
export async function downscalePhotoFile(file, maxDim = 1280, quality = 0.75) {
  if (!file) return null
  try {
    return dataUrlToBlob(await downscalePhoto(file, maxDim, quality))
  } catch {
    return file
  }
}

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',')
  const mime = (head.match(/data:(.*?);/) || [])[1] || 'image/jpeg'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
