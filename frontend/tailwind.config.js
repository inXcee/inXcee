export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#f59e0b',
        'accent-hover': '#fbbf24',
        'bg-primary': '#09090b',
        'bg-secondary': '#121214',
        'bg-card': 'rgba(24,24,27,0.65)',
      },
      fontFamily: {
        outfit: ['Outfit', 'Inter', 'sans-serif'],
        inter: ['Inter', 'system-ui', 'sans-serif'],
      },
      backdropBlur: { card: '12px' },
      boxShadow: {
        accent: '0 0 20px rgba(245,158,11,0.4)',
        card: '0 8px 32px rgba(0,0,0,0.4)',
      },
    },
  },
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
