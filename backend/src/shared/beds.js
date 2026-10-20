// Odadaki en küçük boş yatak numarası. Eskiden her atama yolu `aktif sayı + 1` veriyordu:
// 3 yataklı odada 1 numara boşalınca yeni gelen 2 numarayı alıyor, iki kişi aynı yatakta görünüyordu.
// Çağıran transaction içindeyse kendi az önceki INSERT'lerini görür (toplu atamada tekrar çağrılabilir).
export function nextFreeBedNo(db, roomId) {
  const taken = new Set(
    db.prepare('SELECT bed_no FROM room_assignments WHERE room_id=? AND check_out_at IS NULL')
      .all(roomId).map(r => Number(r.bed_no))
  )
  let bed = 1
  while (taken.has(bed)) bed++
  return bed
}
