import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

// ── Message Input Card ──────────────────────────────────────────────────────
function MessageInput({ onSubmit, isPending }) {
  const [text, setText] = useState('')
  const [sender, setSender] = useState('')
  const [groupName, setGroupName] = useState('')
  const [preview, setPreview] = useState(null)

  const handleAnalyze = async () => {
    if (!text.trim()) return
    try {
      const { data } = await api.post('/whatsapp/analyze', { text })
      setPreview(data)
    } catch { setPreview(null) }
  }

  const handleSubmit = () => {
    if (!text.trim()) return
    onSubmit({ text, sender: sender.trim() || undefined, groupName: groupName.trim() || undefined })
    setText('')
    setPreview(null)
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
      padding: '24px', marginBottom: '16px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '12px',
          background: 'linear-gradient(135deg, #25D366, #128C7E)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '22px', color: '#fff', flexShrink: 0,
        }}>WA</div>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '22px', letterSpacing: '3px', color: 'var(--text)' }}>
            WHATSAPP MESAJ GİRİŞİ
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)', marginTop: '2px', letterSpacing: '1px' }}>
            GRUP MESAJLARINI YAPIŞTIRIN — ARIZALAR OTOMATİK TESPİT EDİLİR
          </div>
        </div>
      </div>

      {/* How it works */}
      <div style={{
        background: 'var(--surface2)', borderRadius: '8px', padding: '14px', marginBottom: '16px',
        border: '1px solid var(--border)',
      }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px', color: 'var(--text3)', marginBottom: '8px' }}>
          NASIL ÇALIŞIR?
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.8 }}>
          1. WhatsApp grubundaki mesajları kopyalayın (mesaja uzun basın &rarr; Kopyala)<br/>
          2. Aşağıdaki alana yapıştırın (birden fazla satır da olabilir)<br/>
          3. Sistem arıza içeren mesajları otomatik tespit edip Teknik Servis'e iletir<br/>
          <span style={{ color: 'var(--accent)' }}>
            Örnek: "M1 101 musluk arızası" &rarr; Otomatik bakım talebi oluşturulur
          </span>
        </div>
      </div>

      {/* Sender & Group */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
        <div>
          <label style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px', color: 'var(--text3)', display: 'block', marginBottom: '6px' }}>
            GÖNDERİCİ
          </label>
          <input
            value={sender}
            onChange={e => setSender(e.target.value)}
            placeholder="Ör: Ahmet Usta"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--sans)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px', color: 'var(--text3)', display: 'block', marginBottom: '6px' }}>
            GRUP ADI
          </label>
          <input
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            placeholder="Ör: Şantiye Arıza Grubu"
            style={{
              width: '100%', padding: '10px 12px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--sans)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Message textarea */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px', color: 'var(--text3)', display: 'block', marginBottom: '6px' }}>
          MESAJLAR
        </label>
        <textarea
          value={text}
          onChange={e => { setText(e.target.value); setPreview(null) }}
          placeholder={"WhatsApp mesajlarını buraya yapıştırın...\n\nÖrnek:\nM1 101 musluk arızası\nS2 203 elektrik yok\nM3 102 kapı kırık"}
          rows={6}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: '8px',
            border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--sans)',
            outline: 'none', boxSizing: 'border-box', resize: 'vertical',
            lineHeight: 1.7,
          }}
        />
      </div>

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div style={{
          background: 'var(--surface2)', borderRadius: '8px', padding: '12px', marginBottom: '12px',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1.5px', color: 'var(--text3)', marginBottom: '8px' }}>
            ÖNİZLEME — {preview.filter(p => p.isFault).length} ARIZA TESPİT EDİLDİ
          </div>
          {preview.map((p, i) => (
            <div key={i} style={{
              padding: '6px 10px', borderRadius: '6px', marginBottom: '4px',
              background: p.isFault ? 'rgba(231,76,60,0.06)' : 'transparent',
              display: 'flex', alignItems: 'center', gap: '8px',
              borderLeft: p.isFault ? '3px solid var(--red)' : '3px solid transparent',
            }}>
              {p.isFault && (
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: '8px', letterSpacing: '1px',
                  padding: '2px 6px', borderRadius: '4px',
                  background: 'rgba(231,76,60,0.12)', color: 'var(--red)', fontWeight: 600,
                }}>ARIZA</span>
              )}
              <span style={{ fontSize: '12px', color: 'var(--text)', flex: 1 }}>{p.text}</span>
              {p.location && (
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: '9px',
                  padding: '2px 8px', borderRadius: '4px',
                  background: 'rgba(240,165,0,0.12)', color: 'var(--accent)',
                }}>{p.location}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleAnalyze}
          disabled={!text.trim()}
          style={{
            fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1.5px',
            padding: '12px 20px', borderRadius: '8px', cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--surface2)',
            color: 'var(--text2)', fontWeight: 500, opacity: text.trim() ? 1 : 0.4,
          }}
        >
          ÖNİZLE
        </button>
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isPending}
          style={{
            fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '1.5px',
            padding: '12px 24px', borderRadius: '8px', cursor: 'pointer',
            border: 'none', background: '#25D366', color: '#fff', fontWeight: 600,
            flex: 1, opacity: text.trim() && !isPending ? 1 : 0.4,
          }}
        >
          {isPending ? 'GÖNDERİLİYOR...' : 'MESAJLARI KAYDET VE ANALİZ ET'}
        </button>
      </div>
    </div>
  )
}

// ── Stats Strip ─────────────────────────────────────────────────────────────
function StatsStrip({ stats }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
      <MiniKpi label="TOPLAM MESAJ" value={stats?.total || 0} color="var(--text)" />
      <MiniKpi label="ARIZA TESPİT" value={stats?.faults || 0} color="var(--red)" />
      <MiniKpi label="BUGÜN ARIZA" value={stats?.todayFaults || 0} color="var(--accent)" />
    </div>
  )
}

function MiniKpi({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: '8px', padding: '12px 14px',
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '8px', color: 'var(--text3)', letterSpacing: '1.5px', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--display)', fontSize: '24px', color, letterSpacing: '1px' }}>
        {value}
      </div>
    </div>
  )
}

// ── Result Toast ────────────────────────────────────────────────────────────
function SubmitResult({ result }) {
  if (!result) return null
  return (
    <div style={{
      background: result.faults > 0 ? 'rgba(231,76,60,0.06)' : 'rgba(37,211,102,0.06)',
      border: `1px solid ${result.faults > 0 ? 'rgba(231,76,60,0.2)' : 'rgba(37,211,102,0.2)'}`,
      borderRadius: '8px', padding: '14px 18px', marginBottom: '16px',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: '50%',
        background: result.faults > 0 ? 'rgba(231,76,60,0.12)' : 'rgba(37,211,102,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', flexShrink: 0,
      }}>
        {result.faults > 0 ? '!' : '\u2713'}
      </div>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>
          {result.count} mesaj kaydedildi
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: result.faults > 0 ? 'var(--red)' : 'var(--text3)' }}>
          {result.faults > 0
            ? `${result.faults} arıza tespit edildi — Teknik Servis'e bildirim gönderildi`
            : 'Arıza tespit edilmedi'}
        </div>
      </div>
    </div>
  )
}

// ── Message Feed ────────────────────────────────────────────────────────────
function MessageFeed({ messages }) {
  if (!messages || messages.length === 0) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
        padding: '40px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '28px', marginBottom: '12px', opacity: 0.3 }}>WA</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)', letterSpacing: '1px' }}>
          Henüz mesaj yok — yukarıdan WhatsApp mesajlarını yapıştırın
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <div style={{ fontFamily: 'var(--display)', fontSize: '18px', letterSpacing: '3px', color: 'var(--text)' }}>
          MESAJ GEÇMİŞİ
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
          Son {messages.length} mesaj
        </span>
      </div>

      <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
        {messages.map((msg, i) => {
          const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''
          const date = msg.timestamp ? new Date(msg.timestamp).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : ''

          return (
            <div
              key={msg.id || i}
              style={{
                padding: '12px 20px', borderBottom: '1px solid var(--border)',
                background: msg.isFault ? 'rgba(231,76,60,0.04)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                {msg.isFault ? (
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '8px', letterSpacing: '1px',
                    padding: '2px 8px', borderRadius: '4px',
                    background: 'rgba(231,76,60,0.12)', color: 'var(--red)', fontWeight: 600,
                  }}>ARIZA #{msg.faultId}</span>
                ) : null}
                <span style={{ fontFamily: 'var(--sans)', fontSize: '12px', fontWeight: 600, color: '#25D366' }}>
                  {msg.sender}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                  {msg.groupName}
                </span>
                <div style={{ flex: 1 }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text4)' }}>
                  {date} {time}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.5 }}>
                {msg.text}
              </div>
              {msg.isFault && msg.parsedLocation && (
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '1px',
                    padding: '2px 8px', borderRadius: '4px',
                    background: 'rgba(240,165,0,0.12)', color: 'var(--accent)',
                  }}>
                    {msg.parsedLocation}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
                    Teknik Servis'e otomatik iletildi
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function WhatsAppPage() {
  const qc = useQueryClient()
  const [lastResult, setLastResult] = useState(null)

  const { data: stats } = useQuery({
    queryKey: ['wp-stats'],
    queryFn: () => api.get('/whatsapp/stats').then(r => r.data),
    refetchInterval: 10000,
  })

  const { data: messages } = useQuery({
    queryKey: ['wp-messages'],
    queryFn: () => api.get('/whatsapp/messages').then(r => r.data),
    refetchInterval: 10000,
  })

  const submitMut = useMutation({
    mutationFn: (payload) => api.post('/whatsapp/messages', payload),
    onSuccess: (res) => {
      setLastResult(res.data)
      qc.invalidateQueries({ queryKey: ['wp-messages'] })
      qc.invalidateQueries({ queryKey: ['wp-stats'] })
    },
  })

  return (
    <div>
      <MessageInput
        onSubmit={(payload) => submitMut.mutate(payload)}
        isPending={submitMut.isPending}
      />
      <SubmitResult result={lastResult} />
      <StatsStrip stats={stats} />
      <MessageFeed messages={messages || []} />
    </div>
  )
}
