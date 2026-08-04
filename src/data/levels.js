import { countries } from './countries.js';
import { turkeyProvinces } from './turkey-provinces.js';

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
  return [...countries, ...turkeyProvinces];
}

export function getRegionById(id) {
  return getAllRegions().find(region => region.id === id);
}
