import { countries } from './countries.js';
import { turkeyProvinces } from './turkey-provinces.js';
import { usStates } from './us-states.js';

export const RANKS = {
  EXPLORER: { name: 'Keşifçi', nameEn: 'Explorer', minScore: 0, maxScore: 50, badge: '🥉', color: '#CD7F32' },
  CARTOGRAPHER: { name: 'Kartograf', nameEn: 'Cartographer', minScore: 51, maxScore: 80, badge: '🥈', color: '#C0C0C0' },
  MAP_MASTER: { name: 'Harita Ustası', nameEn: 'Map Master', minScore: 81, maxScore: 95, badge: '🥇', color: '#FFD700' },
  PIRI_REIS: { name: 'Modern Piri Reis', nameEn: 'Modern Piri Reis', minScore: 96, maxScore: 100, badge: '💎', color: '#B9F2FF' },
};

export function getRank(score) {
  if (score >= 96) return RANKS.PIRI_REIS;
  if (score >= 81) return RANKS.MAP_MASTER;
  if (score >= 51) return RANKS.CARTOGRAPHER;
  return RANKS.EXPLORER;
}

export const levels = [
  {
    id: 1,
    sectionName: 'Kolay Ülkeler - Eğitim',
    sectionNameEn: 'Easy Countries - Training',
    description: 'Belirgin şekilli ülkelerin sınırlarını çizerek başla!',
    descriptionEn: 'Start by tracing countries with distinct shapes!',
    mode: 'trace',
    requiredStars: 0,
    regions: ['turkey', 'italy', 'japan', 'brazil', 'australia'],
  },
  {
    id: 2,
    sectionName: 'Kolay Ülkeler - Hafıza',
    sectionNameEn: 'Easy Countries - Memory',
    description: 'Şimdi hafızandan çiz!',
    descriptionEn: 'Now draw them from memory!',
    mode: 'blind',
    requiredStars: 3,
    regions: ['turkey', 'italy', 'japan', 'brazil', 'australia'],
  },
  {
    id: 3,
    sectionName: 'Orta Ülkeler - Eğitim',
    sectionNameEn: 'Medium Countries - Training',
    description: 'Biraz daha zor ülkeler, önce üzerinden geç!',
    descriptionEn: 'Slightly harder countries, trace them first!',
    mode: 'trace',
    requiredStars: 5,
    regions: ['france', 'germany', 'egypt', 'india', 'spain'],
  },
  {
    id: 4,
    sectionName: 'Orta Ülkeler - Hafıza',
    sectionNameEn: 'Medium Countries - Memory',
    description: 'Orta seviye ülkeleri hafızandan çizebilecek misin?',
    descriptionEn: 'Can you draw medium level countries from memory?',
    mode: 'blind',
    requiredStars: 8,
    regions: ['france', 'germany', 'egypt', 'india', 'spain'],
  },
  {
    id: 5,
    sectionName: 'Zor Ülkeler - Eğitim',
    sectionNameEn: 'Hard Countries - Training',
    description: 'Avrupa ülkelerinin detaylı sınırları, dikkatli çiz!',
    descriptionEn: 'Detailed borders of European countries, draw carefully!',
    mode: 'trace',
    requiredStars: 11,
    regions: ['romania', 'bulgaria', 'hungary', 'poland', 'czechia'],
  },
  {
    id: 6,
    sectionName: 'Zor Ülkeler - Hafıza',
    sectionNameEn: 'Hard Countries - Memory',
    description: 'En zorlu ülkeleri hafızandan çizmeyi dene!',
    descriptionEn: 'Try to draw the hardest countries from memory!',
    mode: 'blind',
    requiredStars: 14,
    regions: ['romania', 'bulgaria', 'hungary', 'poland', 'czechia'],
  },
  // World countries + US states pack (#3) — ids 11+ so existing ids (and
  // any already-persisted unlockedLevels referencing them) stay stable;
  // inserted here in array order so the level LIST reads countries → world
  // → USA → Türkiye, ahead of the Turkish province sections below.
  {
    id: 11,
    sectionName: 'Dünya Ülkeleri (Kolay) - Eğitim',
    sectionNameEn: 'World Countries (Easy) - Training',
    description: 'Tanıdık kıtalardan kolay ülkeler, önce üzerinden geç!',
    descriptionEn: 'Familiar easy countries from around the world — trace them first!',
    mode: 'trace',
    // Deliberately low (matches level 2) so international/CrazyGames
    // visitors reach non-Turkish content within a round or two, rather
    // than grinding through the whole original ladder first.
    requiredStars: 3,
    regions: ['usa', 'canada', 'mexico', 'argentina', 'chile', 'uk', 'greece', 'norway'],
  },
  {
    id: 12,
    sectionName: 'Dünya Ülkeleri (Kolay) - Hafıza',
    sectionNameEn: 'World Countries (Easy) - Memory',
    description: 'Şimdi hafızandan çiz!',
    descriptionEn: 'Now draw them from memory!',
    mode: 'blind',
    requiredStars: 6,
    regions: ['usa', 'canada', 'mexico', 'argentina', 'chile', 'uk', 'greece', 'norway'],
  },
  {
    id: 13,
    sectionName: 'Dünya Ülkeleri (Orta) - Eğitim',
    sectionNameEn: 'World Countries (Medium) - Training',
    description: 'Biraz daha zor dünya ülkeleri, önce üzerinden geç!',
    descriptionEn: 'Slightly harder countries from around the world, trace them first!',
    mode: 'trace',
    requiredStars: 9,
    regions: ['portugal', 'sweden', 'finland', 'ireland', 'ukraine', 'china', 'south-korea', 'vietnam', 'thailand', 'saudi-arabia'],
  },
  {
    id: 14,
    sectionName: 'Dünya Ülkeleri (Orta) - Hafıza',
    sectionNameEn: 'World Countries (Medium) - Memory',
    description: 'Orta seviye dünya ülkelerini hafızandan çizebilecek misin?',
    descriptionEn: 'Can you draw these medium-level world countries from memory?',
    mode: 'blind',
    requiredStars: 12,
    regions: ['portugal', 'sweden', 'finland', 'ireland', 'ukraine', 'china', 'south-korea', 'vietnam', 'thailand', 'saudi-arabia'],
  },
  {
    id: 15,
    sectionName: 'Dünya Ülkeleri (Zor) - Eğitim',
    sectionNameEn: 'World Countries (Hard) - Training',
    description: 'En zorlu dünya ülkelerinin sınırları, dikkatli çiz!',
    descriptionEn: 'Borders of the toughest world countries — draw carefully!',
    mode: 'trace',
    requiredStars: 15,
    regions: ['switzerland', 'south-africa'],
  },
  {
    id: 16,
    sectionName: 'Dünya Ülkeleri (Zor) - Hafıza',
    sectionNameEn: 'World Countries (Hard) - Memory',
    description: 'Bu zorlu ülkeleri hafızandan çizmeyi dene!',
    descriptionEn: 'Try to draw these tough countries from memory!',
    mode: 'blind',
    requiredStars: 18,
    regions: ['switzerland', 'south-africa'],
  },
  {
    id: 17,
    sectionName: 'ABD Eyaletleri - Eğitim',
    sectionNameEn: 'US States - Training',
    description: 'Amerika Birleşik Devletleri\'nin eyaletlerini çizerek keşfet!',
    descriptionEn: 'Explore the states of the United States by tracing them!',
    mode: 'trace',
    requiredStars: 21,
    regions: ['texas', 'california', 'florida', 'colorado', 'utah', 'nevada', 'idaho', 'new-york', 'washington', 'oklahoma'],
  },
  {
    id: 18,
    sectionName: 'ABD Eyaletleri - Hafıza',
    sectionNameEn: 'US States - Memory',
    description: 'Eyalet sınırlarını hafızandan ne kadar iyi çizebilirsin?',
    descriptionEn: 'How well can you draw state borders from memory?',
    mode: 'blind',
    requiredStars: 24,
    regions: ['texas', 'california', 'florida', 'colorado', 'utah', 'nevada', 'idaho', 'new-york', 'washington', 'oklahoma'],
  },
  {
    id: 7,
    sectionName: 'Türkiye İlleri (Kolay) - Eğitim',
    sectionNameEn: 'Turkish Provinces (Easy) - Training',
    description: 'Tanıdık şehirlerin sınırlarını çizerek başla!',
    descriptionEn: 'Start by tracing borders of familiar cities!',
    mode: 'trace',
    requiredStars: 17,
    regions: ['istanbul', 'ankara', 'antalya', 'izmir', 'konya', 'trabzon', 'hatay', 'van'],
  },
  {
    id: 8,
    sectionName: 'Türkiye İlleri (Kolay) - Hafıza',
    sectionNameEn: 'Turkish Provinces (Easy) - Memory',
    description: 'Kendi şehirlerimizi hafızandan ne kadar iyi çizebilirsin?',
    descriptionEn: 'How well can you draw our own cities from memory?',
    mode: 'blind',
    requiredStars: 21,
    regions: ['istanbul', 'ankara', 'antalya', 'izmir', 'konya', 'trabzon', 'hatay', 'van'],
  },
  {
    id: 9,
    sectionName: 'Türkiye İlleri (Zor) - Eğitim',
    sectionNameEn: 'Turkish Provinces (Hard) - Training',
    description: 'Daha az bilinen şehirler, üzerinden geç!',
    descriptionEn: 'Less known cities, trace them!',
    mode: 'trace',
    requiredStars: 26,
    regions: ['bursa', 'adana', 'samsun', 'erzurum', 'diyarbakir', 'mugla', 'kayseri', 'bolu', 'tokat', 'kirsehir', 'sinop', 'burdur'],
  },
  {
    id: 10,
    sectionName: 'Türkiye İlleri (Zor) - Hafıza',
    sectionNameEn: 'Turkish Provinces (Hard) - Memory',
    description: 'Piri Reis seviyesine ulaşmak için son mücadele!',
    descriptionEn: 'The final challenge to reach Piri Reis rank!',
    mode: 'blind',
    requiredStars: 32,
    regions: ['bursa', 'adana', 'samsun', 'erzurum', 'diyarbakir', 'mugla', 'kayseri', 'bolu', 'tokat', 'kirsehir', 'sinop', 'burdur'],
  }
];

// Helper to get all regions
export function getAllRegions() {
  return [...countries, ...turkeyProvinces, ...usStates];
}

export function getRegionById(id) {
  return getAllRegions().find(region => region.id === id);
}
