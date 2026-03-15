export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
  safelist: [
    // Department colors (stored as strings in DB)
    'bg-red-600', 'bg-green-600', 'bg-orange-500', 'bg-blue-600',
    'bg-yellow-500', 'bg-lime-500', 'bg-pink-500', 'bg-purple-600',
    // Shift colors
    'bg-blue-400', 'bg-orange-400', 'bg-indigo-600',
    // Gender borders
    'border-blue-400', 'border-pink-400',
  ],
}
