import { useTranslation } from '../../../shared/i18n/index.js'
import TabState from '../components/TabState.jsx'

export default function InventoryTab({
  query, data, myCheckouts, invLocations,
  invSearch, setInvSearch, invSelected, setInvSelected,
  invQty, setInvQty, invNote, setInvNote, invLocation, setInvLocation,
  invMsg, setInvMsg, submitCheckout,
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4 pb-4">
      <h2 className="font-medium text-slate-300">{t('avs_kiosk.inventory.title')}</h2>

      {/* Seçili ürün formu */}
      {invSelected ? (
        <div className="bg-slate-900 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-medium text-slate-100">{invSelected.item_name}</div>
            <button onClick={() => { setInvSelected(null); setInvLocation('') }}
              className="text-xs text-slate-500">{t('avs_kiosk.change')}</button>
          </div>
          <div className="text-xs text-slate-500">{invSelected.quantity} {invSelected.unit} {t('avs_kiosk.inventory.stock')}</div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">{t('avs_kiosk.inventory.quantity')}</label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setInvQty(q => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 text-xl">−</button>
              <span className="text-xl text-slate-100 w-10 text-center">{invQty}</span>
              <button type="button" onClick={() => setInvQty(q => Math.min(invSelected.quantity, q + 1))}
                className="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 text-xl">+</button>
            </div>
          </div>

          {invSelected.track_locations ? (
            <div>
              <label className="block text-sm text-slate-400 mb-1">{t('avs_kiosk.inventory.location')}</label>
              <select value={invLocation} onChange={e => setInvLocation(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100">
                <option value="">{t('avs_kiosk.inventory.choose_location')}</option>
                {invLocations.map(l => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.block ? `${l.block} · ` : ''}{l.name} ({l.quantity})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="block text-sm text-slate-400 mb-1">{t('avs_kiosk.inventory.note')}</label>
            <input type="text" value={invNote} onChange={e => setInvNote(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-slate-100" />
          </div>

          <button type="button" disabled={submitCheckout.isPending || (invSelected.track_locations && !invLocation)}
            onClick={() => { setInvMsg({ type: '', text: '' }); submitCheckout.mutate() }}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl py-3 font-medium">
            {t('avs_kiosk.inventory.take')}
          </button>
        </div>
      ) : (
        <>
          <input type="text" value={invSearch} onChange={e => setInvSearch(e.target.value)}
            placeholder={t('avs_kiosk.inventory.search')}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100" />
          <div className="space-y-2">
            <TabState query={query}
              isEmpty={!!data && (data.items || []).filter(i => i.item_name.toLowerCase().includes(invSearch.toLowerCase())).length === 0}
              emptyText={t('avs_kiosk.inventory.none_items')}>
            {(() => {
              const filtered = (data?.items || []).filter(i =>
                i.item_name.toLowerCase().includes(invSearch.toLowerCase()))
              return filtered.map(i => {
                const out = i.quantity <= 0
                return (
                  <button key={i.id} type="button" disabled={out}
                    onClick={() => { setInvSelected(i); setInvQty(1); setInvNote(''); setInvLocation(''); setInvMsg({ type: '', text: '' }) }}
                    className={`w-full text-left bg-slate-900 rounded-xl px-4 py-3 flex justify-between items-center ${out ? 'opacity-50' : 'hover:bg-slate-800'}`}>
                    <span className="text-sm text-slate-200">{i.item_name}</span>
                    <span className={`text-xs ${out ? 'text-red-400' : 'text-slate-500'}`}>
                      {out ? t('avs_kiosk.inventory.out_of_stock') : `${i.quantity} ${i.unit}`}
                    </span>
                  </button>
                )
              })
            })()}
            </TabState>
          </div>
        </>
      )}

      {invMsg.text && (
        <div className={`text-sm text-center ${invMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>{invMsg.text}</div>
      )}

      {/* Aldıklarım */}
      <div>
        <h3 className="text-sm font-medium text-slate-400 mb-2">{t('avs_kiosk.inventory.mine')}</h3>
        {myCheckouts.length === 0 ? (
          <div className="bg-slate-900 rounded-2xl p-4 text-slate-500 text-sm">{t('avs_kiosk.inventory.none_mine')}</div>
        ) : (
          <div className="space-y-2">
            {myCheckouts.map(c => (
              <div key={c.id} className="bg-slate-900 rounded-xl px-4 py-2 flex justify-between text-sm">
                <span className="text-slate-200">{c.item_name}</span>
                <span className="text-slate-500">{c.quantity} {c.unit}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
