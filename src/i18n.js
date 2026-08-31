let currentLang = 'tr';

export const setLanguage = (lang) => {
  if (['tr', 'en'].includes(lang)) {
    currentLang = lang;
  }
};

export const getLanguage = () => currentLang;

const translations = {
  tr: {
    // Home Screen
    app_subtitle: 'Sınırları Çiz',
    mode_trace: 'Eğitim',
    mode_trace_desc: 'Sınırları takip et ve öğren',
    mode_blind: 'Hafıza',
    mode_blind_desc: 'Hafızandan çiz',
    player_count: 'Oyuncu Sayısı',
    player_1: '1 Kişi',
    player_2: '2 Kişi',
    go_to_levels: 'Seviyelere Git',
    statistics: 'İstatistikler',
    regions: 'bölge',
    fun_fact: 'Bilgi: GeoDoodle\'da {count} farklı bölge seni bekliyor!',
    daily_title: 'Günün Bölgesi',
    daily_streak: '{count} gün seri',
    daily_today_score: 'Bugün: {score}',
    privacy_link: 'Gizlilik',

    // Level Select Screen
    levels_trace: 'Eğitim Seviyeleri',
    levels_blind: 'Hafıza Seviyeleri',
    levels_all: 'Tüm Seviyeler',
    stars_required: 'yıldız gerekli',
    best: 'En İyi',

    // Game Screen
    hint_title: 'İpucu ({count} kaldı)',
    mode_text_blind: 'HAFIZADAN',
    mode_text_trace: 'EĞİTİM',
    mode_text_daily: 'GÜNÜN BÖLGESİ',
    tool_thin_title: 'İnce Kalem',
    tool_thin: 'İnce',
    tool_medium_title: 'Orta Kalem',
    tool_medium: 'Orta',
    tool_thick_title: 'Kalın Kalem',
    tool_thick: 'Kalın',
    tool_eraser_title: 'Silgi',
    tool_eraser: 'Silgi',
    tool_undo_title: 'Geri Al',
    tool_undo: 'Geri',
    tool_clear_title: 'Temizle',
    tool_clear: 'Temizle',
    tool_submit_title: 'Gönder',
    tool_submit: 'Gönder',
    toast_no_hints: 'İpucu hakkın kalmadı!',
    toast_hint_shown: 'İpucu: 2 saniye! ({count} kaldı)',
    toast_draw_first: 'Önce bir çizim yapmalısın!',

    // Result Screen
    result_winner: 'KAZANAN',
    result_tie: 'BERABERE',
    result_nice_try: 'İYİ DENEME',
    result_score: 'SKOR',
    result_avg_dev: 'ORT. SAPMA',
    result_similarity: 'BENZERLİK',
    result_hints_used: 'İPUCU KULLANIMI',
    result_completed: 'TAMAMLANDI',
    result_ref: 'REFERANS',
    result_pts: 'NOKTALARINIZ',
    result_out: 'DIŞARI',
    result_in: 'İÇERİ',
    play_again: 'TEKRAR OYNA',
    back_to_menu: 'MENÜYE DÖN',
    result_share: 'PAYLAŞ',
    player: 'O', // Oyuncu (O1, O2)
    share_text_normal: 'GeoDoodle\'da {region} sınırını çizdim: {score}/100!',
    share_text_daily: 'Günün Bölgesi\'nde {score} aldım — beni geçebilir misin?',

    // Stats Screen
    stats_total_drawings: 'Toplam Çizim',
    stats_total_stars: 'Toplam Yıldız',
    stats_regions_completed: 'Tamamlanan Bölge',
    stats_avg_score: 'Ortalama Skor',
    stats_best_score: 'En Yüksek Skor',
    stats_best_region: 'En İyi Bölge',
    stats_hints_used: 'İpucu Kullanılan',
    stats_progress: 'İlerleme',
    stats_overall_progress: 'Genel İlerleme',
    stats_no_drawings: 'Henüz çizim yapmadın!',
    stats_go_to_levels: 'Seviyelere gidip ilk çizimini yap.',
    stats_start: 'Başla',
    stats_reset_all: 'Tüm İlerlemeyi Sıfırla',
    stats_reset_confirm: 'Tüm ilerlemen silinecek. Emin misin?',

    // Handoff Screen
    handoff_title: 'Sıra Sende!',
    handoff_subtitle: 'Cihazı Oyuncu 2\'ye verin.',
    handoff_instruction: 'Oyuncu 2, hazır olduğunda başla butonuna bas. Süre başladıktan sonra aynı bölgeyi çizeceksin.',
    handoff_ready: 'Başla',

    // Levels Data
    level_basic_regions: 'Temel Bölgeler',
    level_basic_desc: 'Büyük ve belirgin sınırları olan bölgeler',
    level_med_regions: 'Orta Zorluk Bölgeler',
    level_med_desc: 'Daha karmaşık sınırlara sahip bölgeler',
    level_adv_regions: 'İleri Seviye Bölgeler',
    level_adv_desc: 'Zorlu ve detaylı sınırlar',
    level_expert_regions: 'Uzman Bölgeler',
    level_expert_desc: 'Çok detaylı ve zorlayıcı sınırlar',
    level_master_regions: 'Usta Bölgeler',
    level_master_desc: 'En küçük ve zor bölgeler',
  },
  en: {
    // Home Screen
    app_subtitle: 'Draw the Borders',
    mode_trace: 'Training',
    mode_trace_desc: 'Trace and learn the borders',
    mode_blind: 'Memory',
    mode_blind_desc: 'Draw from memory',
    player_count: 'Number of Players',
    player_1: '1 Player',
    player_2: '2 Players',
    go_to_levels: 'Go to Levels',
    statistics: 'Statistics',
    regions: 'regions',
    fun_fact: 'Did you know: {count} different regions are waiting for you!',
    daily_title: 'Daily Challenge',
    daily_streak: '{count} day streak',
    daily_today_score: 'Today: {score}',
    privacy_link: 'Privacy',

    // Level Select Screen
    levels_trace: 'Training Levels',
    levels_blind: 'Memory Levels',
    levels_all: 'All Levels',
    stars_required: 'stars required',
    best: 'Best',

    // Game Screen
    hint_title: 'Hint ({count} left)',
    mode_text_blind: 'FROM MEMORY',
    mode_text_trace: 'TRAINING',
    mode_text_daily: 'DAILY CHALLENGE',
    tool_thin_title: 'Thin Pen',
    tool_thin: 'Thin',
    tool_medium_title: 'Medium Pen',
    tool_medium: 'Medium',
    tool_thick_title: 'Thick Pen',
    tool_thick: 'Thick',
    tool_eraser_title: 'Eraser',
    tool_eraser: 'Eraser',
    tool_undo_title: 'Undo',
    tool_undo: 'Undo',
    tool_clear_title: 'Clear',
    tool_clear: 'Clear',
    tool_submit_title: 'Submit',
    tool_submit: 'Submit',
    toast_no_hints: 'No hints left!',
    toast_hint_shown: 'Hint: 2 seconds! ({count} left)',
    toast_draw_first: 'You need to draw something first!',

    // Result Screen
    result_winner: 'WINNER',
    result_tie: 'TIE',
    result_nice_try: 'NICE TRY',
    result_score: 'SCORE',
    result_avg_dev: 'AVG DEVIATION',
    result_similarity: 'SIMILARITY',
    result_hints_used: 'HINTS USED',
    result_completed: 'COMPLETED',
    result_ref: 'REFERENCE',
    result_pts: 'YOUR POINTS',
    result_out: 'OUTSIDE',
    result_in: 'INSIDE',
    play_again: 'PLAY AGAIN',
    back_to_menu: 'BACK TO MENU',
    result_share: 'SHARE',
    player: 'P', // Player (P1, P2)
    share_text_normal: 'I drew {region}\'s border on GeoDoodle: {score}/100!',
    share_text_daily: 'I scored {score} on today\'s Daily Challenge — can you beat me?',

    // Stats Screen
    stats_total_drawings: 'Total Drawings',
    stats_total_stars: 'Total Stars',
    stats_regions_completed: 'Regions Completed',
    stats_avg_score: 'Average Score',
    stats_best_score: 'Best Score',
    stats_best_region: 'Best Region',
    stats_hints_used: 'Hints Used',
    stats_progress: 'Progress',
    stats_overall_progress: 'Overall Progress',
    stats_no_drawings: 'You haven\'t drawn anything yet!',
    stats_go_to_levels: 'Go to levels and make your first drawing.',
    stats_start: 'Start',
    stats_reset_all: 'Reset All Progress',
    stats_reset_confirm: 'All your progress will be deleted. Are you sure?',

    // Handoff Screen
    handoff_title: 'Your Turn!',
    handoff_subtitle: 'Pass the device to Player 2.',
    handoff_instruction: 'Player 2, press start when you are ready. You will draw the same region after the timer starts.',
    handoff_ready: 'Start',

    // Levels Data
    level_basic_regions: 'Basic Regions',
    level_basic_desc: 'Regions with large and distinct borders',
    level_med_regions: 'Medium Regions',
    level_med_desc: 'Regions with more complex borders',
    level_adv_regions: 'Advanced Regions',
    level_adv_desc: 'Challenging and detailed borders',
    level_expert_regions: 'Expert Regions',
    level_expert_desc: 'Very detailed and challenging borders',
    level_master_regions: 'Master Regions',
    level_master_desc: 'The smallest and hardest regions',
  }
};

/**
 * Uppercase a region name with the locale matching the name actually
 * picked (Turkish `name` vs English `nameEn`), not the UI language — plain
 * .toUpperCase() turns "Diyarbakır" into "DIYARBAKIR" (i→I) instead of the
 * correct Turkish "DİYARBAKIR" (i→İ). Pass `isEnglishName: true` only when
 * `nameEn` was actually used for `name`.
 */
export const localeUpperCase = (name, isEnglishName) =>
  name.toLocaleUpperCase(isEnglishName ? 'en-US' : 'tr-TR');

export const t = (key, params = {}) => {
  let text = translations[currentLang][key] || key;
  
  // Replace params e.g. {count}
  Object.keys(params).forEach(p => {
    text = text.replace(`{${p}}`, params[p]);
  });
  
  return text;
};
