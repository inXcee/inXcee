import { useState } from 'react'
import api from '../../shared/api/client.js'
import BlacklistAlert from './BlacklistAlert.jsx'
import ZimmetForm from './ZimmetForm.jsx'

const STEPS = ['Arama', 'Kayıt', 'Oda Ataması', 'Zimmet']

export default function CheckinPage() {
  const [step, setStep] = useState(0)
  const [tcNo, setTcNo] = useState('')
  const [passportNo, setPassportNo] = useState('')
  const [foundPerson, setFoundPerson] = useState(null)
  const [blacklistPerson, setBlacklistPerson] = useState(null)
  const [formData, setFormData] = useState({ full_name: '', company: '', hometown: '', preferred_block: '' })
  const [personnelId, setPersonnelId] = useState(null)
  const [suggestedRoom, setSuggestedRoom] = useState(null)
  const [assignedBed, setAssignedBed] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLookup = async () => {
    if (!tcNo && !passportNo) return
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/checkin/lookup', { tc_no: tcNo || undefined, passport_no: passportNo || undefined })
      if (res.data.found) {
        if (res.data.is_blacklisted) {
          setBlacklistPerson(res.data)
          return
        }
        setFoundPerson(res.data)
        setPersonnelId(res.data.id)
        setFormData({ full_name: res.data.full_name, company: res.data.company || '', hometown: res.data.hometown || '', preferred_block: res.data.preferred_block || '' })
        // Suggest room automatically
        const roomRes = await api.post('/checkin/suggest-room', { company: res.data.company || '', hometown: res.data.hometown || '' })
        setSuggestedRoom(roomRes.data)
        setStep(2)
      } else {
        setStep(1)
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Arama hatası')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/checkin/register', { tc_no: tcNo || undefined, passport_no: passportNo || undefined, ...formData })
      setPersonnelId(res.data.id)
      const roomRes = await api.post('/checkin/suggest-room', { company: formData.company, hometown: formData.hometown })
      setSuggestedRoom(roomRes.data)
      setStep(2)
    } catch (e) {
      setError(e.response?.data?.error || 'Kayıt hatası')
    } finally {
      setLoading(false)
    }
  }

  const handleAssignRoom = async () => {
    if (!suggestedRoom) return
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/checkin/assign-room', { personnel_id: personnelId, room_id: suggestedRoom.room_id || suggestedRoom.id })
      setAssignedBed(res.data.bed_no)
      setStep(3)
    } catch (e) {
      setError(e.response?.data?.error || 'Oda atama hatası')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {blacklistPerson && <BlacklistAlert person={blacklistPerson} onClose={() => setBlacklistPerson(null)} />}

      <h1 className="text-xl font-bold text-slate-100 mb-6">Check-in / Giriş Kaydı</h1>

      {/* Steps */}
      <div className="flex gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className={`flex-1 text-center text-xs py-1 rounded ${i === step ? 'bg-blue-700 text-white' : i < step ? 'bg-green-800 text-green-300' : 'bg-slate-800 text-slate-500'}`}>
            {i < step ? '✓ ' : ''}{s}
          </div>
        ))}
      </div>

      {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">{error}</div>}

      {/* Step 0: Lookup */}
      {step === 0 && (
        <div className="bg-slate-900 rounded-xl p-6 space-y-4">
          <h2 className="font-medium text-slate-200">TC No / Pasaport ile Ara</h2>
          <div>
            <label className="block text-xs text-slate-400 mb-1">TC Kimlik No</label>
            <input value={tcNo} onChange={e => setTcNo(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" maxLength={11} />
          </div>
          <div className="text-center text-xs text-slate-500">veya</div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Pasaport No</label>
            <input value={passportNo} onChange={e => setPassportNo(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
          </div>
          <button onClick={handleLookup} disabled={loading || (!tcNo && !passportNo)} className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
            {loading ? 'Aranıyor...' : 'Sorgula'}
          </button>
        </div>
      )}

      {/* Step 1: Register */}
      {step === 1 && (
        <div className="bg-slate-900 rounded-xl p-6 space-y-4">
          <h2 className="font-medium text-slate-200">Yeni Kayıt</h2>
          {['full_name', 'company', 'hometown', 'preferred_block'].map(field => (
            <div key={field}>
              <label className="block text-xs text-slate-400 mb-1 capitalize">{field.replace('_', ' ')}</label>
              <input value={formData[field]} onChange={e => setFormData(p => ({ ...p, [field]: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setStep(0)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Geri</button>
            <button onClick={handleRegister} disabled={loading || !formData.full_name} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
              {loading ? 'Kaydediliyor...' : 'Kaydet ve Devam'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Room Assignment */}
      {step === 2 && (
        <div className="bg-slate-900 rounded-xl p-6 space-y-4">
          <h2 className="font-medium text-slate-200">Oda Ataması</h2>
          {suggestedRoom ? (
            <div className="bg-slate-800 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">Önerilen Oda</div>
              <div className="text-lg font-semibold text-blue-400">{suggestedRoom.block} - {suggestedRoom.room_no}</div>
              <div className="text-xs text-slate-500">Kat {suggestedRoom.floor} · {suggestedRoom.current_count ?? 0}/{suggestedRoom.active_beds} kişi</div>
            </div>
          ) : (
            <div className="text-sm text-yellow-400">Uygun oda bulunamadı</div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Geri</button>
            <button onClick={handleAssignRoom} disabled={loading || !suggestedRoom} className="flex-1 bg-green-700 hover:bg-green-600 disabled:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
              {loading ? 'Atanıyor...' : 'Odayı Onayla'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Zimmet */}
      {step === 3 && (
        <div className="bg-slate-900 rounded-xl p-6 space-y-4">
          <div className="bg-green-900/40 border border-green-700 rounded-lg p-3 text-sm text-green-300">
            ✅ Oda atandı — Yatak No: <strong>{assignedBed}</strong>
          </div>
          <ZimmetForm personnelId={personnelId} onDone={() => {}} />
        </div>
      )}
    </div>
  )
}
