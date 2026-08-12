import { useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../shared/store/authStore.js'
import { useIsNarrow } from '../../shared/hooks/useMediaQuery.js'
import {
  visibleGroups, searchSettings, settingsPath, loadFavorites, toggleFavorite,
  loadRecents, pushRecent, itemsByKeys, ALL_ITEMS,
} from './settingsNav.js'

// Ayarlar 37 kalemlik düz bir listeydi: arama yok, açıklama yok, gruplar hep
// açık, aradığını bulmak 37 etiketi gözle taramak demekti.
//
// Buradaki dört değişiklik o işi kısaltıyor:
//   1) Arama — Türkçe karakter duyarsız, açıklama ve eş anlamlılarda da arar
//   2) Sık kullanılan + son ziyaret — en çok gidilen 3-4 sayfa hep üstte
//   3) Katlanabilir gruplar — ilgilenmediğin bölüm yer kaplamaz
//   4) Dar ekranda kenar çubuğu açılır menüye döner (sabit 230px sığmıyordu)
//
// Menü kalemleri settingsNav.js'ten gelir; rota koruması da aynı kaynaktan
// beslendiği için "menüde yok ama URL'den açılıyor" durumu oluşamaz.

const KAPALI_KEY = 'settings.collapsedGroups.v1'

function loadCollapsed() {
  try {
    const d = JSON.parse(localStorage.getItem(KAPALI_KEY) || '[]')
    return Array.isArray(d) ? d : []
  } catch {
    return []   // bozuk kayıt menüyü kilitlemesin
  }
}

function saveCollapsed(list) {
  try {
    localStorage.setItem(KAPALI_KEY, JSON.stringify(list))
  } catch {
    /* depolama kapalı — tercih kaydedilmez, menü çalışmaya devam eder */
  }
}

function Yildiz({ dolu, onClick, label }) {
  return (
    <button
      type="button"
      onClick={e => { e.preventDefault(); e.stopPropagation(); onClick() }}
      aria-label={label}
      title={label}
      style={{
        background: 'none', border: 0, cursor: 'pointer', padding: '0 2px',
        color: dolu ? 'var(--accent)' : 'var(--text4)', fontSize: 12, lineHeight: 1, flexShrink: 0,
      }}
    >
      {dolu ? '★' : '☆'}
    </button>
  )
}

function MenuSatiri({ item, favori, onToggleFav, onNavigate, gosterGrup = false }) {
  return (
    <NavLink to={settingsPath(item.key)} onClick={onNavigate} style={{ textDecoration: 'none', display: 'block' }}>
      {({ isActive }) => (
        <div
          title={item.desc}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '7px 10px', borderRadius: 7, marginBottom: 2,
            cursor: 'pointer', transition: 'background 0.15s',
            background: isActive ? 'rgba(240,165,0,0.10)' : 'transparent',
            borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            color: isActive ? 'var(--text)' : 'var(--text2)',
            fontSize: 13, fontWeight: isActive ? 600 : 400,
          }}
        >
          <span style={{ fontSize: 14, width: 18, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
            {gosterGrup && (
              <span style={{ display: 'block', fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)' }}>
                {item.groupLabel}
              </span>
            )}
          </span>
          <Yildiz
            dolu={favori}
            onClick={() => onToggleFav(item.key)}
            label={favori ? `${item.label} sık kullanılanlardan çıkar` : `${item.label} sık kullanılanlara ekle`}
          />
        </div>
      )}
    </NavLink>
  )
}

export default function SettingsLayout() {
  const role = useAuthStore(s => s.user?.role)
  const konum = useLocation()
  const navigate = useNavigate()
  const dar = useIsNarrow(900)

  const [arama, setArama] = useState('')
  const [favoriler, setFavoriler] = useState(loadFavorites)
  const [sonlar, setSonlar] = useState(loadRecents)
  const [kapali, setKapali] = useState(loadCollapsed)
  const [menuAcik, setMenuAcik] = useState(false)
  const aramaRef = useRef(null)

  const aktifKey = konum.pathname.split('/')[2] || ''
  const aktifItem = ALL_ITEMS.find(i => i.key === aktifKey)

  // Ziyaret edilen sayfa "son gidilenler"e düşer; bir dahaki sefere üstte olur.
  useEffect(() => {
    if (aktifKey) setSonlar(pushRecent(aktifKey))
  }, [aktifKey])

  // Dar ekranda sayfa değişince menü kendini kapatsın; açık kalırsa içeriği örter.
  useEffect(() => { setMenuAcik(false) }, [konum.pathname])

  // Ctrl/Cmd+K aramaya odaklanır — 37 kalemde fare ile gezmek yerine yaz-git.
  useEffect(() => {
    const dinle = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setMenuAcik(true)
        setTimeout(() => aramaRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', dinle)
    return () => window.removeEventListener('keydown', dinle)
  }, [])

  const gruplar = useMemo(() => visibleGroups(role), [role])
  const sonuclar = useMemo(() => (arama.trim() ? searchSettings(arama, role) : null), [arama, role])
  const favoriItems = useMemo(() => itemsByKeys(favoriler, role), [favoriler, role])
  const sonItems = useMemo(
    () => itemsByKeys(sonlar, role).filter(i => !favoriler.includes(i.key) && i.key !== aktifKey).slice(0, 4),
    [sonlar, role, favoriler, aktifKey])

  const favToggle = key => setFavoriler(toggleFavorite(key))
  const grupToggle = key => {
    const yeni = kapali.includes(key) ? kapali.filter(k => k !== key) : [...kapali, key]
    setKapali(yeni)
    saveCollapsed(yeni)
  }

  // Aramada tek sonuç kaldıysa Enter doğrudan oraya götürsün.
  const aramaEnter = e => {
    if (e.key === 'Enter' && sonuclar?.length) {
      navigate(settingsPath(sonuclar[0].key))
      setArama('')
    }
    if (e.key === 'Escape') setArama('')
  }

  const kenarIcerik = (
    <>
      <div style={{ padding: '0 10px', marginBottom: 10 }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)',
          letterSpacing: 2.5, marginBottom: 8,
        }}>
          AYARLAR
        </div>
        <input
          ref={aramaRef}
          className="form-input"
          type="search"
          aria-label="Ayarlarda ara"
          placeholder="Ara…  (Ctrl+K)"
          value={arama}
          onChange={e => setArama(e.target.value)}
          onKeyDown={aramaEnter}
          style={{ width: '100%', fontSize: 12, padding: '6px 9px' }}
        />
      </div>

      {sonuclar
        ? (
          <div style={{ padding: '0 4px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: 2, padding: '0 8px 6px' }}>
              {sonuclar.length} SONUÇ
            </div>
            {sonuclar.length === 0
              ? (
                <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 10px' }}>
                  “{arama}” için sonuç yok.
                </div>
              )
              : sonuclar.map(i => (
                <MenuSatiri
                  key={i.key} item={i} gosterGrup
                  favori={favoriler.includes(i.key)}
                  onToggleFav={favToggle}
                  onNavigate={() => setArama('')}
                />
              ))}
          </div>
        )
        : (
          <div style={{ padding: '0 4px' }}>
            {favoriItems.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', letterSpacing: 2, padding: '0 8px 6px' }}>
                  ★ SIK KULLANILAN
                </div>
                {favoriItems.map(i => (
                  <MenuSatiri key={i.key} item={i} favori onToggleFav={favToggle} />
                ))}
              </div>
            )}

            {sonItems.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text4)', letterSpacing: 2, padding: '0 8px 6px' }}>
                  SON GİDİLENLER
                </div>
                {sonItems.map(i => (
                  <MenuSatiri key={i.key} item={i} favori={false} onToggleFav={favToggle} />
                ))}
              </div>
            )}

            {gruplar.map(g => {
              const acik = !kapali.includes(g.key)
              // Kapalı grupta aktif sayfa varsa kullanıcı nerede olduğunu
              // kaybetmesin diye grup yine de açılır.
              const aktifIcerir = g.items.some(i => i.key === aktifKey)
              const gosterilir = acik || aktifIcerir
              return (
                <div key={g.key} style={{ marginBottom: 12 }}>
                  <button
                    type="button"
                    onClick={() => grupToggle(g.key)}
                    aria-expanded={gosterilir}
                    title={g.hint}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                      background: 'none', border: 0, cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)',
                      letterSpacing: 2, padding: '0 8px 6px',
                    }}
                  >
                    <span style={{ width: 8 }}>{gosterilir ? '▾' : '▸'}</span>
                    <span style={{ flex: 1 }}>{g.label}</span>
                    {!gosterilir && <span style={{ color: 'var(--text4)' }}>{g.items.length}</span>}
                  </button>
                  {gosterilir && g.items.map(i => (
                    <MenuSatiri key={i.key} item={i} favori={favoriler.includes(i.key)} onToggleFav={favToggle} />
                  ))}
                </div>
              )
            })}
          </div>
        )}
    </>
  )

  if (dar) {
    return (
      <div style={{ minHeight: 'calc(100vh - 60px)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          borderBottom: '1px solid var(--border)', background: 'var(--surface)',
          position: 'sticky', top: 0, zIndex: 30,
        }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setMenuAcik(o => !o)}
            aria-expanded={menuAcik}
            aria-label="Ayarlar menüsü"
          >
            ☰ Ayarlar
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {aktifItem ? `${aktifItem.icon} ${aktifItem.label}` : 'Genel bakış'}
          </span>
        </div>

        {menuAcik && (
          <div style={{
            borderBottom: '1px solid var(--border)', background: 'var(--surface)',
            padding: '12px 6px', maxHeight: '70vh', overflowY: 'auto',
          }}>
            {kenarIcerik}
          </div>
        )}

        <main>
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
      <aside style={{
        width: 240, padding: '20px 6px',
        borderRight: '1px solid var(--border)', background: 'var(--surface)',
        flexShrink: 0, overflowY: 'auto', maxHeight: 'calc(100vh - 60px)',
        position: 'sticky', top: 0,
      }}>
        {kenarIcerik}
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  )
}
