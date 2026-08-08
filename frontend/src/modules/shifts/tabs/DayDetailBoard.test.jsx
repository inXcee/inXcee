import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DayDetailBoard from './DayDetailBoard.jsx'
import api from '../../../shared/api/client.js'

vi.mock('../../../shared/api/client.js', () => ({ default: { get: vi.fn() } }))

const detail = {
  date: '2026-07-05',
  group_by: 'dept',
  totals: { working: 3, on_leave: 1, sick: 1, absent: 1, off: 0, groups: 2 },
  groups: [
    {
      name: 'Yemekhane',
      shifts: [{ shift_def_id: 10, shift_name: 'Sabah', start_hour: '08:00', end_hour: '16:00', count: 2, people: [
        { staff_id: 1, full_name: 'Ali', role_name: 'Aşçı', work_location_name: 'Mutfak', site: 'Yemekhane' },
        { staff_id: 2, full_name: 'Veli', role_name: 'Garson', work_location_name: 'Mutfak', site: 'Yemekhane' },
      ] }],
      on_leave: [{ staff_id: 4, full_name: 'Ayşe', leave_type: 'annual', leave_type_label: 'Yıllık izin' }],
      sick: [{ staff_id: 5, full_name: 'Mehmet' }],
      absent: [{ staff_id: 6, full_name: 'Hasan', reason: 'Haber vermedi' }],
      off: [],
      totals: { working: 2, on_leave: 1, sick: 1, absent: 1, off: 0 },
    },
    {
      name: 'Temizlik',
      shifts: [{ shift_def_id: 10, shift_name: 'Sabah', start_hour: '08:00', end_hour: '16:00', count: 1, people: [
        { staff_id: 8, full_name: 'Emre', role_name: 'Temizlikçi', work_location_name: 'OTC-A', site: 'OTC' },
      ] }],
      on_leave: [], sick: [], absent: [], off: [],
      totals: { working: 1, on_leave: 0, sick: 0, absent: 0, off: 0 },
    },
  ],
}

const renderBoard = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DayDetailBoard weekDays={['2026-07-05', '2026-07-06']} onPersonClick={vi.fn()} />
    </QueryClientProvider>,
  )
}

// Ortak test kurulumundaki IntersectionObserver stub'ı hiç tetiklenmez; yüzen
// gün çubuğu "liste ekranda mı" bilgisini ondan aldığı için testte görünmez
// kalıyordu. Burada hemen "görünür" bildiren bir gözlemci veriyoruz.
const gercekIO = globalThis.IntersectionObserver
beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: detail })
  globalThis.IntersectionObserver = class {
    constructor(cb) { this.cb = cb }
    observe() { this.cb([{ isIntersecting: true }]) }
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
})
afterEach(() => { globalThis.IntersectionObserver = gercekIO })

describe('DayDetailBoard', () => {
  it('açık başlar; toplu özet, vardiya toplamı ve tüm bölümleri gösterir', async () => {
    renderBoard()

    expect(await screen.findByRole('button', { name: 'Yemekhane detayları' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/shifts/day-detail', expect.objectContaining({
      params: { date: '2026-07-05', group_by: 'dept' },
    }))
    // Toplu özet rozetleri
    expect(screen.getByText('GÜN KADROSU')).toBeInTheDocument()
    expect(screen.getByText('ÇALIŞAN')).toBeInTheDocument()
    expect(screen.getByText('RAPORLU')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Temizlik detayları' })).toBeInTheDocument()
  })

  // Analiz tabloları açılışta geliyordu; "bugün kim hangi vardiyada" sorusuna
  // ulaşmak için üç tablo aşağı inmek gerekiyordu. Artık istendiğinde açılır.
  it('analiz blokları varsayılan kapalı, açılınca gelir', async () => {
    const user = userEvent.setup()
    renderBoard()
    await screen.findByRole('button', { name: 'Yemekhane detayları' })

    expect(screen.queryByText('VARDİYA TOPLAMLARI')).not.toBeInTheDocument()
    expect(screen.queryByText('VARDİYA × DEPARTMAN — KİŞİ SAYILARI')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Analiz/ }))
    expect(screen.getByText('VARDİYA TOPLAMLARI')).toBeInTheDocument()
    expect(screen.getByText('VARDİYA × DEPARTMAN — KİŞİ SAYILARI')).toBeInTheDocument()
  })

  it('bölüme tıklayınca vardiya + kişi + izin/rapor/devamsız kovaları açılır', async () => {
    const user = userEvent.setup()
    renderBoard()
    const groupButton = await screen.findByRole('button', { name: 'Yemekhane detayları' })

    expect(screen.queryByText('Ali')).not.toBeInTheDocument()
    await user.click(groupButton)

    expect(await screen.findByRole('button', { name: 'Ali' })).toBeInTheDocument()
    expect(screen.getByText(/2 kişi/)).toBeInTheDocument()
    expect(screen.getByText('İzinli (1)')).toBeInTheDocument()
    expect(screen.getByText('Raporlu (1)')).toBeInTheDocument()
    expect(screen.getByText('Devamsız (1)')).toBeInTheDocument()
    // Konum artık ayrı etiket değil, ismin yanındaki meta içinde (rol · nokta).
    expect(screen.getByText('Aşçı · Mutfak')).toBeInTheDocument()
  })

  it('kişiye tıklayınca onPersonClick çağrılır', async () => {
    const onPersonClick = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={client}>
        <DayDetailBoard weekDays={['2026-07-05']} onPersonClick={onPersonClick} />
      </QueryClientProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'Yemekhane detayları' }))
    await user.click(await screen.findByRole('button', { name: 'Ali' }))
    expect(onPersonClick).toHaveBeenCalledWith(1)
  })

  it('gruplama değişince yeni istek atılır', async () => {
    const user = userEvent.setup()
    renderBoard()
    await screen.findByRole('button', { name: 'Yemekhane detayları' })

    await user.click(screen.getByRole('button', { name: 'Site' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/shifts/day-detail', expect.objectContaining({
      params: { date: '2026-07-05', group_by: 'site' },
    })))
  })

  it('kayıt yoksa bilgilendirir, indirme butonları çıkmaz', async () => {
    api.get.mockResolvedValue({ data: { date: '2026-07-05', group_by: 'dept', totals: {}, groups: [] } })
    renderBoard()
    expect(await screen.findByText('Bu gün için çizelge kaydı yok.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Excel/ })).not.toBeInTheDocument()
  })

  it('kişi/rol/konum araması eşleşen bölümü bulur ve detayını açar', async () => {
    const user = userEvent.setup()
    renderBoard()
    await screen.findByRole('button', { name: 'Yemekhane detayları' })

    await user.type(screen.getByRole('searchbox', { name: 'Gün detayında ara' }), 'Temizlikçi')

    expect(screen.queryByRole('button', { name: 'Yemekhane detayları' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Temizlik detayları' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Emre' })).toBeInTheDocument()
  })

  // Panel içindeki gün seçici liste uzayınca ekrandan çıkıyordu; kullanıcı
  // "gün gün kim vardiyada" listesine bakarken günü hızlı değiştirmek istiyor.
  // Yüzen çubuk kaydırma kabından bağımsız (position:fixed).
  it('yüzen gün çubuğu listeye bakarken görünür', async () => {
    renderBoard()
    await screen.findByRole('button', { name: 'Yemekhane detayları' })
    const cubuk = await screen.findByRole('group', { name: 'Gün değiştir' })
    expect(cubuk).toBeInTheDocument()
    expect(within(cubuk).getByRole('button', { name: 'Önceki gün' })).toBeDisabled()  // haftanın ilk günü
    expect(within(cubuk).getByRole('button', { name: 'Sonraki gün' })).toBeEnabled()
  })

  it('yüzen çubuktan gün değişince o günün verisi çekilir', async () => {
    const user = userEvent.setup()
    renderBoard()
    await screen.findByRole('button', { name: 'Yemekhane detayları' })
    const cubuk = screen.getByRole('group', { name: 'Gün değiştir' })

    await user.click(within(cubuk).getByRole('button', { name: 'Sonraki gün' }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/shifts/day-detail', expect.objectContaining({
      params: { date: '2026-07-06', group_by: 'dept' },
    })))
  })

  it('sağ/sol ok tuşu günü değiştirir', async () => {
    const user = userEvent.setup()
    renderBoard()
    await screen.findByRole('button', { name: 'Yemekhane detayları' })

    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/shifts/day-detail', expect.objectContaining({
      params: { date: '2026-07-06', group_by: 'dept' },
    })))
  })

  // Çubuk panelin içinde kalsaydı, .fade-up animasyonu transform uyguladığı
  // sürece position:fixed viewport'a değil o kutuya bağlanırdı — sticky'yi
  // bozan tuzağın aynısı. Portal ile body'ye taşınıyor.
  it('yüzen çubuk panelin dışında, body altında render edilir', async () => {
    const { container } = renderBoard()
    await screen.findByRole('button', { name: 'Yemekhane detayları' })
    const cubuk = screen.getByRole('group', { name: 'Gün değiştir' })

    expect(container.contains(cubuk)).toBe(false)
    expect(document.body.contains(cubuk)).toBe(true)
    expect(cubuk.closest('.panel')).toBeNull()
  })

  // Gün değişince sonucu görmek için panelin tepesine dönmek gerekmesin.
  it('yüzen çubuk seçili günün çalışan sayısını gösterir', async () => {
    renderBoard()
    await screen.findByRole('button', { name: 'Yemekhane detayları' })
    const cubuk = screen.getByRole('group', { name: 'Gün değiştir' })
    expect(within(cubuk).getByText('3')).toBeInTheDocument()   // totals.working
  })

  // Sebep tooltip'te saklıydı, ekranda görünmüyordu. Kart olunca ismin altına
  // yazılıyor: devamsızlık nedeni ve izin türü bakışta okunmalı.
  it('izin/rapor/devamsız kartında sebep GÖRÜNÜR', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(await screen.findByRole('button', { name: 'Yemekhane detayları' }))

    expect(screen.getByRole('button', { name: 'Hasan' })).toHaveTextContent('Haber vermedi')
    expect(screen.getByRole('button', { name: 'Ayşe' })).toHaveTextContent('Yıllık izin')
    expect(screen.getByRole('button', { name: 'Mehmet' })).toHaveTextContent('Sağlık raporu')
  })

  // Aynı vardiyada farklı noktalardaki kişiler karışık geliyordu; hangi noktada
  // kimin olduğunu görmek için tek tek okumak gerekiyordu.
  it('vardiya içinde kişiler noktaya göre kümelenir', async () => {
    // İsimler bilerek öyle seçildi ki ALFABETİK sıra ile NOKTAYA GÖRE sıra
    // farklı olsun; yoksa kümeleme çalışmasa da test geçerdi.
    // Alfabetik: Ali, Bora, Cem — noktaya göre: Bora (OTC), Ali + Cem (Tas Bina)
    api.get.mockResolvedValue({ data: { ...detail, groups: [{
      ...detail.groups[0],
      shifts: [{ shift_def_id: 10, shift_name: 'Sabah', count: 3, people: [
        { staff_id: 21, full_name: 'Ali', work_location_name: 'Tas Bina' },
        { staff_id: 22, full_name: 'Bora', work_location_name: 'OTC Yemekhane' },
        { staff_id: 23, full_name: 'Cem', work_location_name: 'Tas Bina' },
      ] }],
    }] } })
    const user = userEvent.setup()
    renderBoard()
    await user.click(await screen.findByRole('button', { name: 'Yemekhane detayları' }))

    const sirali = ['Ali', 'Bora', 'Cem']
      .map(ad => screen.getByRole('button', { name: ad }))
      .sort((a, b) => ((a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1))
    expect(sirali.map(el => el.getAttribute('aria-label'))).toEqual(['Bora', 'Ali', 'Cem'])
  })

  // "İkram ve Lokaller"i gün gün takip eden kişi her gün değişiminde bölümü
  // yeniden açmak zorunda kalıyordu.
  it('gün değişince açık bölüm açık kalır', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(await screen.findByRole('button', { name: 'Yemekhane detayları' }))
    expect(await screen.findByRole('button', { name: 'Ali' })).toBeInTheDocument()

    const cubuk = screen.getByRole('group', { name: 'Gün değiştir' })
    await user.click(within(cubuk).getByRole('button', { name: 'Sonraki gün' }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/shifts/day-detail', expect.objectContaining({
      params: { date: '2026-07-06', group_by: 'dept' },
    })))
    expect(screen.getByRole('button', { name: 'Yemekhane detayları' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Ali' })).toBeInTheDocument()
  })

  // Gruplama değişince anahtarların anlamı değişir (departman → site → nokta),
  // eski açık anahtarlar karşılık gelmez.
  it('gruplama değişince açık bölümler sıfırlanır', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(await screen.findByRole('button', { name: 'Yemekhane detayları' }))
    expect(await screen.findByRole('button', { name: 'Ali' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Site' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yemekhane detayları' })).toHaveAttribute('aria-expanded', 'false'))
  })

  // Konumlar isim aralarına karışınca hangi konumun kime ait olduğu
  // ayırt edilemiyordu: isim ve konum ayrı satırlarda olmalı.
  it('kişi kartında isim ve konum ayrı satırlarda', async () => {
    const user = userEvent.setup()
    renderBoard()
    await user.click(await screen.findByRole('button', { name: 'Yemekhane detayları' }))
    const kart = await screen.findByRole('button', { name: 'Ali' })

    const satirlar = [...kart.querySelectorAll('span')]
    expect(satirlar.length).toBe(2)
    satirlar.forEach(satir => expect(satir.style.display).toBe('block'))
    expect(satirlar[0]).toHaveTextContent('Ali')
    expect(satirlar[1]).toHaveTextContent('Aşçı · Mutfak')
  })
})
