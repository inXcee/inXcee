import { useState, useEffect } from 'react'
import PurchaseOrdersTab from './PurchaseOrdersTab.jsx'
import RequestsTab from './RequestsTab.jsx'
import ReceiptsTab from './ReceiptsTab.jsx'
import SuppliersTab from './SuppliersTab.jsx'
import { SubTabBar } from './ActivityTab.jsx'

const SUB = [
  { key: 'po', label: 'SİPARİŞLER' },
  { key: 'requests', label: 'TALEPLER' },
  { key: 'receipts', label: 'MAL GİRİŞ' },
  { key: 'suppliers', label: 'TEDARİKÇİ' },
]

export default function PurchasingTab({ items, poPrefill, onPrefillConsumed, onNewReceipt }) {
  const [sub, setSub] = useState('po')

  // Drawer'dan po prefill ile gelinince siparişler sub-tab'ı zorla aç
  useEffect(() => { if (poPrefill) setSub('po') }, [poPrefill])

  return (
    <div>
      <SubTabBar tabs={SUB} active={sub} onChange={setSub} />
      {sub === 'po' && <PurchaseOrdersTab items={items} prefill={poPrefill} onPrefillConsumed={onPrefillConsumed} />}
      {sub === 'requests' && <RequestsTab items={items} />}
      {sub === 'receipts' && <ReceiptsTab onNewReceipt={onNewReceipt} />}
      {sub === 'suppliers' && <SuppliersTab />}
    </div>
  )
}
