export default function BlacklistAlert({ person, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-red-950 border-2 border-red-500 rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl">
        <div className="text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-red-400 mb-2">KARA LİSTE UYARISI</h2>
          <p className="text-xl font-semibold text-white mb-4">{person.full_name}</p>
          <div className="bg-red-900 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-red-300 mb-1"><span className="font-medium">Sebep:</span></p>
            <p className="text-red-100">{person.blacklist_reason || 'Belirtilmemiş'}</p>
            {person.blacklisted_at && (
              <p className="text-xs text-red-400 mt-2">Tarih: {new Date(person.blacklisted_at).toLocaleDateString('tr-TR')}</p>
            )}
          </div>
          <p className="text-red-300 text-sm mb-6">Bu kişiye check-in yapılamaz. Güvenlik birimini bilgilendirin.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white rounded-lg text-sm"
            >
              Tutanak Yazdır
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
