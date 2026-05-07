// Web Push icin VAPID public/private key cifti uretir.
// Kullanim: node backend/scripts/generate-vapid-keys.js
// Ciktiyi .env dosyasina kopyala (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).

import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()
console.log('VAPID anahtarlari uretildi. .env dosyasina ekleyin:')
console.log('')
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
console.log(`VAPID_SUBJECT=mailto:berkayinxce@gmail.com`)
console.log('')
console.log('Public key frontend\'e build sirasinda VITE_VAPID_PUBLIC_KEY olarak verilir.')
