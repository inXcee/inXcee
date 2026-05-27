import KioskSkeleton from './KioskSkeleton.jsx'
import { useTranslation } from '../../../shared/i18n/index.js'

// Sekme veri durumlarını tek yerde standartlaştırır:
//   yükleniyor (skeleton) / hata + "tekrar dene" / boş / veri.
//
// Daha önce her sekme `!data ? skeleton : ...` yazıyordu; istek patlarsa
// sonsuza kadar skeleton'da kalıyordu. Bu sarmalayıcı hatayı görünür kılar
// ve kullanıcıya tekrar deneme yolu verir.
//
// props:
//   query        — react-query (v5) sonucu: { data, isPending, isError, isFetching, refetch }
//   isEmpty       — veri geldi ama boş mu (ör. liste uzunluğu 0)
//   emptyText     — boş durum mesajı
//   skeletonRows  — yüklenirken gösterilecek skeleton satır sayısı
//   children      — veri durumunda render edilecek içerik
export default function TabState({ query, isEmpty, emptyText, skeletonRows, children }) {
  const { t } = useTranslation()

  // Hata varken kullanıcı "tekrar dene"ye bastığında refetch isFetching=true yapar;
  // bu sırada hata kutusu yerine skeleton göstermek için isFetching'i de yüklemeye sayarız.
  const showLoading = query.isPending || (query.isError && query.isFetching)
  const showError = query.isError && !query.isFetching

  if (showLoading) return <KioskSkeleton rows={skeletonRows} />

  if (showError) {
    return (
      <div className="bg-slate-900 rounded-2xl p-6 text-center space-y-3">
        <div className="text-3xl">⚠️</div>
        <div className="text-slate-400 text-sm">{t('avs_kiosk.load_error')}</div>
        <button type="button" onClick={() => query.refetch()}
          className="inline-block bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-xl px-4 py-2 text-sm font-medium">
          {t('common.retry')}
        </button>
      </div>
    )
  }

  if (isEmpty) {
    return <div className="bg-slate-900 rounded-2xl p-5 text-slate-400 text-sm">{emptyText}</div>
  }

  return children
}
