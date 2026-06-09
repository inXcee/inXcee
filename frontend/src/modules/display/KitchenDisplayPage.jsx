import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../shared/api/client.js'

// Mutfak TV ekranı — auth gerekmiyor, 30sn'de bir refresh (DisplayPage kalıbı).
// URL: /display/kitchen (public route). İsim göstermez, sadece sayım + menü.

const MEAL_LABELS = { breakfast: 'KAHVALTI', lunch: 'ÖĞLE', dinner: 'AKŞAM', snack: 'ARA ÖĞÜN' }
const MEAL_ICONS = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' }

// Şu anki öğün dönemi — aktif kart vurgusu için.
export function currentMealPeriod(hour) {
  if (hour >= 5 && hour < 10) return 'breakfast'
  if (hour >= 10 && hour < 15) return 'lunch'
  if (hour >= 15 && hour < 23) return 'dinner'
  return null
}

export default function KitchenDisplayPage() {
  const [now, setNow] = useState(new Date())

  const { data } = useQuery({
    queryKey: ['display-kitchen'],
    queryFn: () => api.get('/display/kitchen').then(r => r.data),
    refetchInterval: 30000,
  })

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  if (!data) {
    return <div style={{ ...styles.shell, color: '#666' }}>Yükleniyor...</div>
  }

  const active = currentMealPeriod(now.getHours())
  const mealKeys = ['breakfast', 'lunch', 'dinner']
  const snack = data.meals.snack
  const showSnack = snack && (snack.expected > 0 || snack.served > 0 || snack.menu)
  const cols = showSnack ? [...mealKeys, 'snack'] : mealKeys

  return (
    <div style={styles.shell}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: 8, color: '#f0a500' }}>🍽 MUTFAK</div>
          <div>
            <div style={{ fontSize: 16, color: '#999', letterSpacing: 3 }}>GÜNLÜK ÖĞÜN PANOSU</div>
            <div style={{ fontSize: 12, color: '#666', letterSpacing: 2, marginTop: 4 }}>BEKLENEN · SERVİS · KALAN</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 64, fontFamily: 'var(--mono)', color: '#fff', fontWeight: 600 }}>
            {now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 14, color: '#999', letterSpacing: 2 }}>
            {now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      {/* Öğün kartları */}
      <div style={{ ...styles.grid, gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
        {cols.map(m => {
          const meal = data.meals[m]
          const isActive = m === active
          return (
            <div key={m} style={{
              ...styles.bigCard,
              border: isActive ? '2px solid #f0a500' : '1px solid #222',
              background: isActive ? '#161208' : '#111',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ ...styles.cardLabel, color: isActive ? '#f0a500' : '#666' }}>
                  {MEAL_ICONS[m]} {MEAL_LABELS[m]}
                </div>
                {isActive && <div style={{ fontSize: 11, color: '#f0a500', letterSpacing: 2 }}>● ŞİMDİ</div>}
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 18, alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontSize: 52, fontWeight: 700, color: '#fff', fontFamily: 'var(--mono)' }}>{meal.expected}</div>
                  <div style={{ fontSize: 11, color: '#666', letterSpacing: 2 }}>BEKLENEN</div>
                </div>
                <div>
                  <div style={{ fontSize: 52, fontWeight: 700, color: '#22c55e', fontFamily: 'var(--mono)' }}>{meal.served}</div>
                  <div style={{ fontSize: 11, color: '#666', letterSpacing: 2 }}>SERVİS</div>
                </div>
                <div>
                  <div style={{ fontSize: 52, fontWeight: 700, color: isActive && meal.remaining > 0 ? '#f0a500' : '#444', fontFamily: 'var(--mono)' }}>{meal.remaining}</div>
                  <div style={{ fontSize: 11, color: '#666', letterSpacing: 2 }}>KALAN</div>
                </div>
              </div>
              {meal.menu && (
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #222' }}>
                  <div style={{ fontSize: 11, color: '#666', letterSpacing: 2, marginBottom: 8 }}>MENÜ</div>
                  {String(meal.menu).split(',').map((item, i) => (
                    <div key={i} style={{ fontSize: 20, color: '#ddd', lineHeight: 1.7 }}>{item.trim()}</div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Diyet uyarıları */}
      {data.diet?.length > 0 && (
        <div style={{ ...styles.bigCard, marginTop: 16, flexDirection: 'row', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ ...styles.cardLabel, color: '#ef4444' }}>⚠ ÖZEL DİYET (bugün beklenen)</div>
          {data.diet.map((d, i) => (
            <div key={i} style={{ fontSize: 22, color: '#fff' }}>
              <span style={{ fontWeight: 700, color: '#ef4444' }}>{d.count}×</span> {d.flag}
            </div>
          ))}
        </div>
      )}

      {/* Yarın öngörüsü */}
      <div style={{ ...styles.bigCard, marginTop: 16, flexDirection: 'row', gap: 36, alignItems: 'center' }}>
        <div style={styles.cardLabel}>YARIN BEKLENEN</div>
        {mealKeys.map(m => (
          <div key={m} style={{ fontSize: 20, color: '#999' }}>
            {MEAL_LABELS[m]}: <span style={{ color: '#fff', fontWeight: 700, fontFamily: 'var(--mono)' }}>{data.tomorrow[m]}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#444' }}>
          30 sn'de bir yenilenir · {new Date(data.generated_at).toLocaleTimeString('tr-TR')}
        </div>
      </div>
    </div>
  )
}

const styles = {
  shell: {
    minHeight: '100vh', background: '#0a0a0a', color: '#fff',
    padding: 32, fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #222',
  },
  grid: {
    display: 'grid', gap: 16,
  },
  bigCard: {
    background: '#111', border: '1px solid #222', borderRadius: 12,
    padding: 24, display: 'flex', flexDirection: 'column',
  },
  cardLabel: {
    fontSize: 12, color: '#666', letterSpacing: 3, fontFamily: 'var(--mono, monospace)',
  },
}
