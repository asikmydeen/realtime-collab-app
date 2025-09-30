// Predefined color palette for users
const userColors = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#FFA07A', // Light Salmon
  '#98D8C8', // Mint
  '#FFD93D', // Yellow
  '#95E1D3', // Light Green
  '#F38181', // Pink
  '#AA96DA', // Purple
  '#FCB900', // Orange
  '#00D2FF', // Cyan
  '#7209B7', // Deep Purple
  '#F72585', // Magenta
  '#4CC9F0', // Sky Blue
  '#4361EE', // Royal Blue
  '#3A0CA3', // Navy
];

// Generate random fun usernames
const adjectives = [
  'Happy', 'Swift', 'Bright', 'Cool', 'Cosmic', 'Digital', 'Mystic', 
  'Neon', 'Pixel', 'Quantum', 'Retro', 'Solar', 'Turbo', 'Ultra', 'Vivid'
];

const nouns = [
  'Artist', 'Brush', 'Canvas', 'Doodle', 'Eagle', 'Fox', 'Galaxy', 
  'Hero', 'Ink', 'Jazz', 'Knight', 'Lion', 'Moon', 'Ninja', 'Owl'
];

export function getUserColor(index) {
  return userColors[index % userColors.length];
}

export function generateUsername() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
}

export function getContrastColor(hexColor) {
  // Convert hex to RGB
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black or white based on luminance
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}