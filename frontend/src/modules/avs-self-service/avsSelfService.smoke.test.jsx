import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { renderWithProviders } from '../../test/renderWithProviders.jsx'

vi.mock('../../shared/api/client.js', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
  },
}))

import AvsSelfServicePage from './AvsSelfServicePage.jsx'
import ShiftsTab from './tabs/ShiftsTab.jsx'
import TasksTab from './tabs/TasksTab.jsx'
import MealsTab from './tabs/MealsTab.jsx'
import QuickFaultTab from './tabs/QuickFaultTab.jsx'
import HomeTab from './tabs/HomeTab.jsx'

const idleQuery = { isLoading: false, isError: false, data: undefined, refetch: () => {} }

const housekeepingData = {
  type: 'housekeeping', assigned_block: 'M1',
  items: [
    { id: 10, area: 'M1 Oda 110', block: 'M1', floor: 1, task_type: 'room', qr_location: 'M1-110', completed_at: null, skipped: 0 },
  ],
}

function TaskDraftHarness() {
  const [visible, setVisible] = useState(true)
  const [drafts, setDrafts] = useState({ 10: ['data:image/jpeg;base64,AA=='] })
  return (
    <>
      <button type="button" onClick={() => setVisible(value => !value)}>Sekme değiştir</button>
      {visible && (
        <TasksTab query={{ ...idleQuery, data: housekeepingData }} data={housekeepingData}
          completeTask={{ mutate: vi.fn(), isPending: false }}
          skipTask={{ mutate: vi.fn(), isPending: false }}
          photoDrafts={drafts} setPhotoDrafts={setDrafts} uploadProgress={{}}
          onReportFault={() => {}} selectedBlock="" onSelectBlock={() => {}} />
      )}
    </>
  )
}

function FaultRoomHarness({ withToggle = false }) {
  const [visible, setVisible] = useState(true)
  const [form, setForm] = useState({
    location: '', description: '', priority: 'medium', category: 'genel',
    block: '', room_id: '', cleaning_task_id: '',
  })
  return (
    <>
      {withToggle && <button type="button" onClick={() => setVisible(value => !value)}>Arıza sekmesini değiştir</button>}
      <output data-testid="fault-room-id">{form.room_id}</output>
      {visible && (
        <QuickFaultTab
          faultForm={form} setFaultForm={setForm}
          faultPhoto={null} setFaultPhoto={() => {}}
          faultSuccess={false} setFaultSuccess={() => {}} faultError=""
          submitFault={{ mutate: vi.fn(), isPending: false }} myFaults={[]}
          locationRooms={[{ id: 501, block: 'M1', floor: 1, room_no: '101' }]}
        />
      )}
    </>
  )
}

describe('AvsSelfServicePage smoke', () => {
  it('token yokken login ekranı render olur (isim arama + giriş butonu)', () => {
    renderWithProviders(<AvsSelfServicePage />)
    expect(screen.getByPlaceholderText(/ad\/soyad ara/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /giriş yap/i })).toBeInTheDocument()
  })
})

describe('AVS sekme parçaları smoke', () => {
  it('ShiftsTab vardiya satırlarını render eder', () => {
    renderWithProviders(
      <ShiftsTab
        query={{ ...idleQuery, data: { shifts: [{ work_date: '2026-06-10', status: 'worked', shift_name: 'Gündüz', start_hour: 8, end_hour: 17 }] } }}
        data={{ shifts: [{ work_date: '2026-06-10', status: 'worked', shift_name: 'Gündüz', start_hour: 8, end_hour: 17 }] }}
      />
    )
    expect(screen.getByText(/Gündüz/)).toBeInTheDocument()
  })

  it('TasksTab housekeeping blok/kat/oda grid render eder', () => {
    const data = {
      type: 'housekeeping', assigned_block: 'M1',
      items: [
        { id: 1, area: 'M1 Oda 101', block: 'M1', floor: 1, task_type: 'room', qr_location: 'M1-101', completed_at: null, skipped: 0 },
        { id: 2, area: 'M1 Oda 102', block: 'M1', floor: 1, task_type: 'room', qr_location: 'M1-102', completed_at: '2026-06-11 09:00', skipped: 0 },
        { id: 3, area: 'M1 1.Kat Ortak Alan', block: 'M1', floor: 1, task_type: 'common_area', qr_location: 'M1-1-common', completed_at: null, skipped: 0 },
      ],
    }
    renderWithProviders(
      <TasksTab query={{ ...idleQuery, data }} data={data}
        completeTask={{ mutate: () => {}, isPending: false }}
        skipTask={{ mutate: () => {}, isPending: false }}
        photoDrafts={{}} setPhotoDrafts={() => {}}
        onReportFault={() => {}} selectedBlock="" onSelectBlock={() => {}} />
    )
    expect(screen.getByText('M1 · Kat 1')).toBeInTheDocument()
    expect(screen.getByText('101')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tümü' }))
    expect(screen.getByText('102 ✓')).toBeInTheDocument()
    expect(screen.getByText(/Ortak alan \/ WC/)).toBeInTheDocument()
  })

  it('TasksTab atamasız personelde blok seçmeden kampüs görevlerini göstermez', () => {
    const data = {
      type: 'housekeeping', assigned_block: null, selected_block: null,
      available_blocks: ['A', 'M1'], items: [],
    }
    renderWithProviders(
      <TasksTab query={{ ...idleQuery, data }} data={data}
        completeTask={{ mutate: vi.fn(), isPending: false }}
        skipTask={{ mutate: vi.fn(), isPending: false }}
        photoDrafts={{}} setPhotoDrafts={() => {}} uploadProgress={{}}
        onReportFault={() => {}} selectedBlock="" onSelectBlock={() => {}} />
    )
    expect(screen.getByText(/Görevleri görmek için blok seç/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument()
    expect(screen.queryByText('958')).not.toBeInTheDocument()
  })

  it('TasksTab oda araması ve durum filtresiyle listeyi daraltır', () => {
    const data = {
      type: 'housekeeping', assigned_block: 'M1',
      items: [
        { id: 21, area: 'M1 Oda 101', block: 'M1', floor: 1, task_type: 'room', qr_location: 'M1-101', completed_at: null, skipped: 0 },
        { id: 22, area: 'M1 Oda 102', block: 'M1', floor: 1, task_type: 'room', qr_location: 'M1-102', completed_at: '2026-07-29 09:00', skipped: 0 },
      ],
    }
    renderWithProviders(
      <TasksTab query={{ ...idleQuery, data }} data={data}
        completeTask={{ mutate: vi.fn(), isPending: false }}
        skipTask={{ mutate: vi.fn(), isPending: false }}
        photoDrafts={{}} setPhotoDrafts={() => {}} uploadProgress={{}}
        onReportFault={() => {}} selectedBlock="" onSelectBlock={() => {}} />
    )
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(screen.queryByText('102 ✓')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tümü' }))
    fireEvent.change(screen.getByPlaceholderText(/Oda veya alan ara/), { target: { value: '102' } })
    expect(screen.getByText('102 ✓')).toBeInTheDocument()
    expect(screen.queryByText('101')).not.toBeInTheDocument()
  })

  it('TasksTab teknik personelin kendi işini başlatmasını sağlar', () => {
    const updateMaintenanceStatus = { mutate: vi.fn(), isPending: false }
    const data = {
      type: 'maintenance',
      worker_id: 77,
      items: [{
        id: 301, location: 'M1 Kat 2 Oda 205', description: 'Priz kapağı kırılmış durumda',
        status: 'open', priority: 'high', category: 'elektrik',
        avs_assigned_worker_id: 77, avs_worker_name: 'Teknik Test', is_mine: 1,
        opened_at: '2026-07-29 08:00:00', assigned_at: '2026-07-29 08:10:00',
      }],
    }
    renderWithProviders(
      <TasksTab query={{ ...idleQuery, data }} data={data}
        completeTask={{ mutate: vi.fn(), isPending: false }}
        skipTask={{ mutate: vi.fn(), isPending: false }}
        photoDrafts={{}} setPhotoDrafts={() => {}} uploadProgress={{}}
        claimMaintenance={{ mutate: vi.fn(), isPending: false }}
        updateMaintenanceStatus={updateMaintenanceStatus}
        onReportFault={() => {}} selectedBlock="" onSelectBlock={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: /M1 Kat 2 Oda 205/ }))
    fireEvent.click(screen.getByRole('button', { name: /İşe başla/i }))
    expect(updateMaintenanceStatus.mutate).toHaveBeenCalledWith({ id: 301, status: 'in_progress' })
  })

  it('TasksTab alınabilir teknik arızayı sahiplenir', () => {
    const claimMaintenance = { mutate: vi.fn(), isPending: false }
    const data = {
      type: 'maintenance',
      worker_id: 77,
      items: [{
        id: 302, location: 'S1 Kazan Dairesi', description: 'Pompadan olağan dışı ses geliyor',
        status: 'open', priority: 'medium', category: 'tesisat',
        avs_assigned_worker_id: null, assigned_to: null, is_mine: 0,
        opened_at: '2026-07-29 09:00:00',
      }],
    }
    renderWithProviders(
      <TasksTab query={{ ...idleQuery, data }} data={data}
        completeTask={{ mutate: vi.fn(), isPending: false }}
        skipTask={{ mutate: vi.fn(), isPending: false }}
        photoDrafts={{}} setPhotoDrafts={() => {}} uploadProgress={{}}
        claimMaintenance={claimMaintenance}
        updateMaintenanceStatus={{ mutate: vi.fn(), isPending: false }}
        onReportFault={() => {}} selectedBlock="" onSelectBlock={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Alınabilir/i }))
    fireEvent.click(screen.getByRole('button', { name: /S1 Kazan Dairesi/ }))
    fireEvent.click(screen.getByRole('button', { name: /Bu işi üstlen/i }))
    expect(claimMaintenance.mutate).toHaveBeenCalledWith(302)
  })

  it('TasksTab arıza bildirim fotoğrafını teknik personele gösterir', () => {
    const data = {
      type: 'maintenance',
      worker_id: 77,
      items: [{
        id: 303, location: 'A Kat 1 Oda 101', description: 'Priz çevresinde kararma var',
        status: 'open', priority: 'high', category: 'elektrik',
        avs_assigned_worker_id: 77, avs_worker_name: 'Teknik Test', is_mine: 1,
        photo_before: '/uploads/ariza-bildirim.jpg', opened_at: '2026-07-29 10:00:00',
      }],
    }
    renderWithProviders(
      <TasksTab query={{ ...idleQuery, data }} data={data}
        completeTask={{ mutate: vi.fn(), isPending: false }}
        skipTask={{ mutate: vi.fn(), isPending: false }}
        photoDrafts={{}} setPhotoDrafts={() => {}} uploadProgress={{}}
        claimMaintenance={{ mutate: vi.fn(), isPending: false }}
        updateMaintenanceStatus={{ mutate: vi.fn(), isPending: false }}
        onReportFault={() => {}} selectedBlock="" onSelectBlock={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: /A Kat 1 Oda 101/ }))
    expect(screen.getByRole('img', { name: 'Bildirim fotoğrafı' })).toHaveAttribute(
      'src',
      '/uploads/ariza-bildirim.jpg'
    )
  })

  it('TasksTab çözüm fotoğrafı taslağıyla işi tamamlar', () => {
    const updateMaintenanceStatus = { mutate: vi.fn(), isPending: false }
    const photoDataUrl = 'data:image/jpeg;base64,AA=='
    const data = {
      type: 'maintenance',
      worker_id: 77,
      items: [{
        id: 304, location: 'M2 Kat 2 Oda 220', description: 'Sigorta tekrar tekrar atıyor',
        status: 'in_progress', priority: 'high', category: 'elektrik',
        avs_assigned_worker_id: 77, avs_worker_name: 'Teknik Test', is_mine: 1,
        opened_at: '2026-07-29 10:00:00', started_at: '2026-07-29 10:10:00',
      }],
    }
    renderWithProviders(
      <TasksTab query={{ ...idleQuery, data }} data={data}
        completeTask={{ mutate: vi.fn(), isPending: false }}
        skipTask={{ mutate: vi.fn(), isPending: false }}
        photoDrafts={{}} setPhotoDrafts={() => {}} uploadProgress={{}}
        claimMaintenance={{ mutate: vi.fn(), isPending: false }}
        updateMaintenanceStatus={updateMaintenanceStatus}
        maintenanceDrafts={{ 304: { note: 'Kablo değiştirildi', photoDataUrl } }}
        setMaintenanceDrafts={vi.fn()}
        onReportFault={() => {}} selectedBlock="" onSelectBlock={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: /M2 Kat 2 Oda 220/ }))
    expect(screen.getByRole('img', { name: 'Çözüm fotoğrafı' })).toHaveAttribute('src', photoDataUrl)
    fireEvent.click(screen.getByRole('button', { name: /İşi tamamla/i }))
    expect(updateMaintenanceStatus.mutate).toHaveBeenCalledWith({
      id: 304,
      status: 'done',
      note: 'Kablo değiştirildi',
      photoDataUrl,
    })
  })

  it('TasksTab fotoğraf olmadan tamamlama butonunu kapalı tutar', async () => {
    renderWithProviders(
      <TasksTab query={{ ...idleQuery, data: housekeepingData }} data={housekeepingData}
        completeTask={{ mutate: vi.fn(), isPending: false }}
        skipTask={{ mutate: vi.fn(), isPending: false }}
        photoDrafts={{}} setPhotoDrafts={() => {}} uploadProgress={{}}
        onReportFault={() => {}} selectedBlock="" onSelectBlock={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: '110' }))
    expect(screen.getByRole('button', { name: /Tamamla/ })).toBeDisabled()
    expect(screen.getByText(/en az 1 zorunlu/i)).toBeInTheDocument()
  })

  it('TasksTab yükleme yüzdesini aktif görev kartında gösterir', () => {
    renderWithProviders(
      <TasksTab query={{ ...idleQuery, data: housekeepingData }} data={housekeepingData}
        completeTask={{ mutate: vi.fn(), isPending: true, variables: { taskId: 10 } }}
        skipTask={{ mutate: vi.fn(), isPending: false }}
        photoDrafts={{ 10: ['data:image/jpeg;base64,AA=='] }} setPhotoDrafts={() => {}}
        uploadProgress={{ 10: 47 }}
        onReportFault={() => {}} selectedBlock="" onSelectBlock={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: '110' }))
    expect(screen.getByText(/Yükleniyor 47%/)).toBeInTheDocument()
  })

  it('TasksTab çevrimdışıyken taslağı korur ve gönderimi bekletir', () => {
    renderWithProviders(
      <TasksTab query={{ ...idleQuery, data: housekeepingData }} data={housekeepingData}
        completeTask={{ mutate: vi.fn(), isPending: false }}
        skipTask={{ mutate: vi.fn(), isPending: false }}
        photoDrafts={{ 10: ['data:image/jpeg;base64,AA=='] }} setPhotoDrafts={() => {}}
        uploadProgress={{}} isOnline={false}
        onReportFault={() => {}} selectedBlock="" onSelectBlock={() => {}} />
    )
    fireEvent.click(screen.getByRole('button', { name: '110' }))
    expect(screen.getByRole('button', { name: /Bağlantı bekleniyor/ })).toBeDisabled()
    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
  })

  it('temizlik fotoğraf taslağını sekme değişiminden sonra korur', () => {
    renderWithProviders(<TaskDraftHarness />)
    fireEvent.click(screen.getByRole('button', { name: '110' }))
    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sekme değiştir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sekme değiştir' }))
    fireEvent.click(screen.getByRole('button', { name: '110' }))
    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
  })

  it('HomeTab temizlik özeti ve hızlı aksiyonları render eder', () => {
    const data = {
      role_group: 'housekeeping',
      worker: { full_name: 'Ayşe Test', department_name: 'Temizlik', assigned_block: 'M1' },
      tasks: { pending: 4, completed: 7, skipped: 1, next: { area: 'M1 Oda 101', block: 'M1', floor: 1 } },
      faults: { open: 1, urgent: 0 },
    }
    renderWithProviders(<HomeTab query={{ ...idleQuery, data }} data={data} onNavigate={() => {}} />)
    expect(screen.getByText(/Ayşe Test/)).toBeInTheDocument()
    expect(screen.getByText('M1 Oda 101')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Görevlere git/ })).toBeInTheDocument()
  })

  it('HomeTab atamasız temizlikçiden oturumluk blok seçmesini ister', () => {
    const onSelectBlock = vi.fn()
    const data = {
      role_group: 'housekeeping',
      worker: { full_name: 'Bloksuz Test', department_name: 'Temizlik', assigned_block: null },
      selected_block: null,
      available_blocks: ['A', 'M1'],
      tasks: { total: 0, pending: 0, completed: 0, skipped: 0, next: null },
      faults: { open: 0, urgent: 0 },
    }
    renderWithProviders(
      <HomeTab query={{ ...idleQuery, data }} data={data} onNavigate={() => {}}
        selectedBlock="" onSelectBlock={onSelectBlock} />
    )
    expect(screen.getByText(/Başlamak için çalışacağın bloğu seç/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'M1' }))
    expect(onSelectBlock).toHaveBeenCalledWith('M1')
  })

  it('HomeTab teknik personelde kendi, alınabilir ve acil işleri gösterir', () => {
    const data = {
      role_group: 'technical',
      worker: { full_name: 'Teknik Test', department_name: 'Teknik' },
      tasks: {},
      faults: { open: 8, urgent: 2, in_progress: 3, mine: 4, available: 2 },
    }
    renderWithProviders(<HomeTab query={{ ...idleQuery, data }} data={data} onNavigate={() => {}} />)
    expect(screen.getByText('Aktif işlerim')).toBeInTheDocument()
    expect(screen.getByText('Alınabilir')).toBeInTheDocument()
    expect(screen.getByText('Acil')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Teknik iş havuzunu aç/i })).toBeInTheDocument()
  })

  it('HomeTab diğer rollerde vardiya, servis ve duyuru özetini gösterir', () => {
    const data = {
      role_group: 'general',
      worker: { full_name: 'Genel Test', department_name: 'Güvenlik' },
      tasks: {},
      faults: { open: 1, urgent: 0 },
      next_shift: { work_date: '2026-07-30', shift_name: 'Sabah', start_hour: '08:00', end_hour: '17:00' },
      transport: { pickup_name: 'Merkez', schedule: { route_name: 'Sabah Servisi', time: '07:15', plate: '34 AVS 1' } },
      announcements: [{ id: 1, title: 'Günlük Duyuru', body: 'Servis hareket saati güncellendi.' }],
    }
    renderWithProviders(<HomeTab query={{ ...idleQuery, data }} data={data} onNavigate={() => {}} />)
    expect(screen.getByText('Sabah Servisi')).toBeInTheDocument()
    expect(screen.getByText('Günlük Duyuru')).toBeInTheDocument()
    expect(screen.getByText('Sabah')).toBeInTheDocument()
  })

  it('MealsTab yarın seçimi 4 öğün butonu render eder', () => {
    renderWithProviders(
      <MealsTab menuToday={[]} mealSel={{ lunch: 1 }} setMealSel={{ mutate: () => {}, isPending: false }} />
    )
    expect(screen.getAllByRole('button').length).toBe(4)
  })

  it('QuickFaultTab form alanlarını render eder', () => {
    renderWithProviders(
      <QuickFaultTab
        faultForm={{ location: '', description: '', priority: 'medium', category: 'genel', block: '', room_id: '', cleaning_task_id: '' }}
        setFaultForm={() => {}} faultPhoto={null} setFaultPhoto={() => {}}
        faultSuccess={false} setFaultSuccess={() => {}} faultError=""
        submitFault={{ mutate: () => {}, isPending: false }} myFaults={[]}
      />
    )
    expect(screen.getAllByRole('textbox').length).toBeGreaterThanOrEqual(2)
  })

  it('genel arıza seçicisinde gerçek room_id değerini forma bağlar', () => {
    renderWithProviders(<FaultRoomHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'M1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Kat 1' }))
    fireEvent.click(screen.getByRole('button', { name: '101' }))
    expect(screen.getByTestId('fault-room-id')).toHaveTextContent('501')
    expect(screen.getByDisplayValue('M1 Kat 1 Oda 101')).toBeInTheDocument()
  })

  it('arıza form taslağını sekme değişiminden sonra korur', () => {
    renderWithProviders(<FaultRoomHarness withToggle />)
    fireEvent.change(screen.getByPlaceholderText(/Konum yaz/), { target: { value: 'M1 kazan dairesi' } })
    fireEvent.change(screen.getByPlaceholderText(/Sorunu ve gördüğünüz/), {
      target: { value: 'Boru bağlantısında su sızıntısı görülüyor' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Arıza sekmesini değiştir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Arıza sekmesini değiştir' }))
    expect(screen.getByDisplayValue('M1 kazan dairesi')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Boru bağlantısında su sızıntısı görülüyor')).toBeInTheDocument()
  })

  it('bildirdiklerim kartında bildirim ve çözüm fotoğraflarını gösterir', () => {
    renderWithProviders(
      <QuickFaultTab
        faultForm={{
          location: '', description: '', priority: 'medium', category: 'genel',
          block: '', room_id: '', cleaning_task_id: '',
        }}
        setFaultForm={() => {}} faultPhoto={null} setFaultPhoto={() => {}}
        faultSuccess={false} setFaultSuccess={() => {}} faultError=""
        submitFault={{ mutate: vi.fn(), isPending: false }}
        locationRooms={[]}
        myFaults={[{
          id: 901, tracking_no: 'ARZ-000901', location: 'M1 Oda 101',
          description: 'Musluk bağlantısı değiştirildi', status: 'done', category: 'tesisat',
          photo_before: '/uploads/bildirim.jpg', photo_url: '/uploads/cozum.jpg',
          technician_name: 'Teknik Test', opened_at: '2026-07-29 10:00:00',
        }]}
      />
    )
    expect(screen.getByRole('img', { name: 'Bildirim fotoğrafı' })).toHaveAttribute('src', '/uploads/bildirim.jpg')
    expect(screen.getByRole('img', { name: 'Çözüm fotoğrafı' })).toHaveAttribute('src', '/uploads/cozum.jpg')
  })
})
