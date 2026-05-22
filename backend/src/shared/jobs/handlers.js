// Job handler map: { 'job.type': async (payload, ctx) => result }
// Hata firlatirsa retry edilir. err.permanent=true ise retry edilmez (is bitti say).
// Yeni handler eklemek icin bu map'e satir ekle.

export const handlers = {}
