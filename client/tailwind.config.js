/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'fixed', 'inset-0', 'bg-gray-900/95', 'backdrop-blur-sm', 'z-50', 'flex', 'flex-col', 'animate-fade-in',
    'items-center', 'justify-between', 'p-4', 'md:p-6', 'bg-gray-800/50', 'backdrop-blur', 'border-b', 'border-gray-700',
    'space-x-4', 'animate-slide-down', 'text-lg', 'md:text-xl', 'font-semibold', 'text-white', 'text-sm', 'text-gray-300',
    'gap-2', 'gap-3', 'relative', 'p-2.5', 'rounded-full', 'bg-gray-700/50', 'hover:bg-gray-700', 'transition-colors',
    'duration-200', 'animate-scale-in', 'text-xl', 'absolute', '-top-1', '-right-1', 'bg-blue-500', 'text-xs', 'w-5', 'h-5',
    'font-semibold', 'hover:bg-red-500/20', 'hover:text-red-400', 'transition-all', 'flex-1', 'min-h-0', 'gap-4',
    'rounded-lg', 'shadow-2xl', 'overflow-hidden', 'pointer-events-none', 'w-full', 'h-full', 'bottom-6', 'left-1/2',
    'transform', '-translate-x-1/2', 'bg-gray-800/90', 'rounded-full', 'px-6', 'py-3', 'animate-slide-up', 'text-center',
    'mb-3', 'bg-green-500/20', 'text-green-300', 'px-4', 'py-2', 'text-sm', 'font-medium', 'bg-blue-500', 'hover:bg-blue-600',
    'bg-gray-800/95', 'rounded-lg', 'shadow-2xl', 'w-80', 'max-h-96', 'border-b', 'border-gray-700', 'space-y-2',
    'overflow-y-auto', 'max-h-80', 'bg-blue-500/20', 'border-blue-500/40', 'p-3', 'bg-green-500/20', 'text-green-300',
    'px-3', 'py-1', 'rounded-full', 'bg-gray-700/50', 'bg-orange-500', 'hover:bg-orange-600', 'bg-red-500', 'hover:bg-red-600',
    'max-w-xs', 'text-gray-400', 'bg-gray-800/50', 'space-y-2', 'max-h-60', 'bg-green-500', 'hover:bg-green-600',
    'bg-red-500', 'hover:bg-red-600', 'right-4', 'top-20', 'text-gray-300', 'border', 'text-blue-300', 'bg-red-500/20',
    'text-red-300'
  ],
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}