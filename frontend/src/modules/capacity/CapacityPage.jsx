import { useState } from 'react'
import BlockView from './BlockView.jsx'

const BLOCKS = ['M1', 'M2', 'S1', 'S2', 'S3']

export default function CapacityPage() {
  const [selectedBlock, setSelectedBlock] = useState('M1')

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-100 mb-6">Kapasite Yönetimi</h1>

      {/* Block selector */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {BLOCKS.map(b => (
          <button
            key={b}
            onClick={() => setSelectedBlock(b)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedBlock === b ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            {b}
          </button>
        ))}
      </div>

      <BlockView block={selectedBlock} />
    </div>
  )
}
