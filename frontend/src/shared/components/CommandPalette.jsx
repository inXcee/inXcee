import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client.js'
import { COMMANDS, matchCommand } from '../hooks/useCommandPalette.js'

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export default function CommandPalette({ open, close, query, setQuery }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [selectedPerson, setSelectedPerson] = useState(null)

  const debouncedQuery = useDebounce(query, 200)

  // Backend kişi araması
  const { data: persons = [] } = useQuery({
    queryKey: ['cmd-search', debouncedQuery],
    queryFn: () => api.get('/checkin/search', { params: { q: debouncedQuery } }).then(r => r.data),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5_000,
  })

  // Statik komut fuzzy match
  const matchedCommands = query.length >= 1
    ? COMMANDS.filter(c => matchCommand(c, query))
    : COMMANDS.slice(0, 8) // boş query: ilk 8 komut

  // Gruplandırılmış sonuçlar (düz liste, idx hesabı için)
  const navItems    = matchedCommands.filter(c => c.type === 'nav')
  const actionItems = matchedCommands.filter(c => c.type === 'action')

  const allItems = [
    ...navItems.map(c => ({ ...c, _group: 'nav' })),
    ...actionItems.map(c => ({ ...c, _group: 'action' })),
    ...persons.map(p => ({ ...p, type: 'person', _group: 'person',
      id: `person-${p.id}`, label: p.full_name })),
  ]

  // Palette açılınca input'a focus
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setActiveIdx(0)
      setSelectedPerson(null)
    }
  }, [open])

  // query değişince activeIdx sıfırla
  useEffect(() => {
    setActiveIdx(0)
    setSelectedPerson(null)
  }, [query])

  const executeItem = useCallback((item) => {
    if (item.type === 'nav') {
      navigate(item.path)
      close()
    } else if (item.type === 'action') {
      navigate(item.path)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('yys:open-modal', { detail: { action: item.action } }))
      }, 50)
      close()
    } else if (item.type === 'person') {
      setSelectedPerson(item)
    }
  }, [navigate, close])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (allItems[activeIdx]) executeItem(allItems[activeIdx])
    }
  }, [allItems, activeIdx, executeItem])

  // Active item'ı scroll içinde görünür yap
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  if (!open) return null

  const sectionLabel = {
    fontFamily: 'var(--mono)', fontSize: 8, fontWeight: 700,
    letterSpacing: 2, color: 'var(--text3)', padding: '8px 14px 4px',
    textTransform: 'uppercase',
  }

  const renderItem = (item, idx) => {
    const active = idx === activeIdx
    return (
      <div
        key={item.id}
        data-idx={idx}
        onClick={() => executeItem(item)}
        onMouseEnter={() => setActiveIdx(idx)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', cursor: 'pointer',
          background: active ? 'rgba(240,165,0,0.08)' : 'transparent',
          borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
          transition: 'background 0.1s',
        }}
      >
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 13, color: active ? 'var(--accent)' : 'var(--text3)',
          width: 18, textAlign: 'center', flexShrink: 0,
        }}>
          {item.icon || (item.type === 'person' ? '◎' : '▸')}
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', flex: 1 }}>
          {item.label || item.full_name}
        </span>
        {item.type === 'person' && item.block && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>
            {item.block}·{item.room_no}
          </span>
        )}
        {item.type === 'action' && (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--accent)',
            padding: '1px 5px', borderRadius: 3,
            background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)',
          }}>
            EYLEM
          </span>
        )}
      </div>
    )
  }

  const navOffset    = 0
  const actionOffset = navItems.length
  const personOffset = navItems.length + actionItems.length

  return (
    <>
      {/* Overlay */}
      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 8999,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Palette */}
      <div style={{
        position: 'fixed', top: '18%', left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(560px, 92vw)',
        zIndex: 9000,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ color: 'var(--text3)', fontSize: 14, flexShrink: 0 }}>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ara veya komut gir..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--text)',
            }}
          />
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
            padding: '2px 6px', borderRadius: 4,
            border: '1px solid var(--border)',
          }}>
            ESC
          </span>
        </div>

        {/* Sonuç listesi */}
        <div ref={listRef} style={{ maxHeight: 380, overflowY: 'auto' }}>
          {allItems.length === 0 && (
            <div style={{
              padding: '24px', textAlign: 'center',
              fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)',
            }}>
              Sonuç bulunamadı
            </div>
          )}

          {/* Navigasyon grubu */}
          {navItems.length > 0 && (
            <>
              <div style={sectionLabel}>Sayfalar</div>
              {navItems.map((item, i) => renderItem({ ...item, _group: 'nav' }, navOffset + i))}
            </>
          )}

          {/* Eylemler grubu */}
          {actionItems.length > 0 && (
            <>
              <div style={sectionLabel}>Hızlı Eylemler</div>
              {actionItems.map((item, i) => renderItem({ ...item, _group: 'action' }, actionOffset + i))}
            </>
          )}

          {/* Kişiler grubu */}
          {persons.length > 0 && (
            <>
              <div style={sectionLabel}>Kişiler</div>
              {persons.map((p, i) => renderItem(
                { ...p, type: 'person', _group: 'person', id: `person-${p.id}`, icon: '◎' },
                personOffset + i
              ))}
            </>
          )}
        </div>

        {/* Kişi detay paneli */}
        {selectedPerson && (
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 16px',
            background: 'var(--surface2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  {selectedPerson.full_name}
                </div>
                {selectedPerson.block && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)', marginBottom: 2 }}>
                    {selectedPerson.block} Blok · Oda {selectedPerson.room_no}
                    {selectedPerson.bed_no ? ` · Yatak ${selectedPerson.bed_no}` : ''}
                  </div>
                )}
                {selectedPerson.job_title && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
                    {selectedPerson.job_title}
                    {selectedPerson.company ? ` · ${selectedPerson.company}` : ''}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedPerson(null)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text3)', fontSize: 16, lineHeight: 1,
                }}
              >×</button>
            </div>
          </div>
        )}

        {/* Footer kısayol ipuçları */}
        <div style={{
          display: 'flex', gap: 16, padding: '8px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface2)',
        }}>
          {[['↑↓', 'Seç'], ['↵', 'Uygula'], ['Esc', 'Kapat']].map(([key, label]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)',
                padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)',
              }}>{key}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text3)' }}>{label}</span>
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
