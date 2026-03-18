import multer from 'multer'
import path from 'path'
import fs from 'fs'

const uploadDir = 'uploads'
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir)

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, unique + path.extname(file.originalname))
  }
})

const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function fileFilter(req, file, cb) {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Sadece resim dosyalari yuklenebilir (JPEG, PNG, GIF, WebP)'))
  }
}

export const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter })
