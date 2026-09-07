import fs from 'fs';
import https from 'https';

const COUNTRIES_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';
const TURKEY_PROVINCES_URL = 'https://raw.githubusercontent.com/cihadturhan/tr-geojson/master/geo/tr-cities-utf8.json';
const US_STATES_URL = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

// The upstream COUNTRIES_URL source has changed its geometry since these 15
// were first generated (re-simplified for most; a genuinely different
// largest-ring selection for a few, e.g. Japan/France) — regenerating them
// from HEAD today would silently change already-shipped shapes for existing
// players. Their paths are pinned to the original generation instead, so
// only genuinely new countries pull fresh geometry from upstream. Remove an
// id from this file (and re-run) to deliberately pick up new upstream data
// for it, once that's a decision someone's made on purpose.
const PINNED_COUNTRY_PATHS = JSON.parse(fs.readFileSync(new URL('./pinned-country-paths.json', import.meta.url), 'utf-8'));

// COUNTRIES_URL's `ISO3166-1-Alpha-2` is a real Natural-Earth-derived quirk:
// 22 features (mostly disputed/uninhabited territories) ship the literal
// placeholder "-99" instead of a real code, which would otherwise make
// context-renderer.js's Intl.DisplayNames lookup throw and silently fall
// back to the English name — wrong for these two, since they're common,
// real neighbours (unlike the other ~20, which are obscure enough that an
// English fallback is a non-issue not worth a lookup table for).
const ISO2_OVERRIDES = { France: 'FR', Norway: 'NO' };

const COUNTRIES_METADATA = [
  { id: 'turkey', name: 'Türkiye', nameEn: 'Turkey', difficulty: 'easy', funFact: 'İki kıtada yer alan tek ülke!', funFactEn: 'The only country located on two continents!' },
  { id: 'italy', name: 'İtalya', nameEn: 'Italy', difficulty: 'easy', funFact: 'Haritada çizme şekline sahip olduğu için çok kolay tanınır.', funFactEn: 'Instantly recognizable for its boot shape on the map.' },
  { id: 'japan', name: 'Japonya', nameEn: 'Japan', difficulty: 'easy', funFact: '6.852 adadan oluşur ancak genelde 4 ana adası çizilir.', funFactEn: 'Made up of 6,852 islands, though usually drawn as its 4 main ones.' },
  { id: 'brazil', name: 'Brezilya', nameEn: 'Brazil', difficulty: 'easy', funFact: 'Güney Amerika kıtasının neredeyse yarısını kaplar!', funFactEn: 'Covers nearly half of the South American continent!' },
  { id: 'australia', name: 'Avustralya', nameEn: 'Australia', difficulty: 'easy', funFact: 'Hem bir ülke hem de bir kıtadır!', funFactEn: 'Both a country and a continent!' },
  { id: 'france', name: 'Fransa', nameEn: 'France', difficulty: 'medium', funFact: 'Altıgen (L\'Hexagone) şekliyle bilinir.', funFactEn: 'Known for its hexagon shape, nicknamed "L\'Hexagone".' },
  { id: 'germany', name: 'Almanya', nameEn: 'Germany', difficulty: 'medium', funFact: 'Üçte biri hala ormanlarla kaplıdır!', funFactEn: 'About a third of the country is still covered in forest!' },
  { id: 'egypt', name: 'Mısır', nameEn: 'Egypt', difficulty: 'medium', funFact: 'Sınırları neredeyse tamamen düz çizgilerden oluşur!', funFactEn: 'Its borders are made up almost entirely of straight lines!' },
  { id: 'india', name: 'Hindistan', nameEn: 'India', difficulty: 'medium', funFact: 'Ters bir üçgene benzeyen devasa bir yarımadadır.', funFactEn: 'A vast peninsula shaped like an inverted triangle.' },
  { id: 'spain', name: 'İspanya', nameEn: 'Spain', difficulty: 'medium', funFact: 'İber Yarımadası\'nın %85\'ini kaplar.', funFactEn: 'Covers about 85% of the Iberian Peninsula.' },
  { id: 'romania', name: 'Romanya', nameEn: 'Romania', difficulty: 'hard', funFact: 'Karadeniz\'e kıyısı olan yuvarlakımsı bir ülkedir.', funFactEn: 'A roughly round-shaped country with a Black Sea coastline.' },
  { id: 'bulgaria', name: 'Bulgaristan', nameEn: 'Bulgaria', difficulty: 'hard', funFact: 'Balkan Dağları ülkeyi tam ortadan ikiye böler.', funFactEn: 'The Balkan Mountains split the country almost right down the middle.' },
  { id: 'hungary', name: 'Macaristan', nameEn: 'Hungary', difficulty: 'hard', funFact: 'Tuna nehri ülkeyi ikiye ayırır.', funFactEn: 'The Danube River divides the country in two.' },
  { id: 'poland', name: 'Polonya', nameEn: 'Poland', difficulty: 'hard', funFact: 'Neredeyse kusursuz bir altıgene benzer.', funFactEn: 'Its shape is close to a near-perfect hexagon.' },
  { id: 'czechia', name: 'Çekya', nameEn: 'Czechia', difficulty: 'hard', funFact: 'Tamamen karayla çevrili bir Orta Avrupa ülkesidir.', funFactEn: 'A landlocked country in the heart of Central Europe.' },

  // World countries pack (#3) — same source, matched by properties.name.
  // `geoName` overrides the GeoJSON lookup name when it differs from `nameEn`.
  { id: 'usa', name: 'ABD', nameEn: 'United States', geoName: 'United States of America', difficulty: 'easy', funFact: '50 eyaletten oluşur, kıtanın büyük bölümünü kaplar!', funFactEn: 'Made up of 50 states spanning nearly the whole continent!' },
  { id: 'canada', name: 'Kanada', nameEn: 'Canada', difficulty: 'easy', funFact: 'Dünyanın yüzölçümü en büyük ikinci ülkesidir!', funFactEn: "The world's second-largest country by area!" },
  { id: 'mexico', name: 'Meksika', nameEn: 'Mexico', difficulty: 'easy', funFact: 'Kuzey Amerika\'yı Orta Amerika\'ya bağlayan huni şeklindedir.', funFactEn: 'Its funnel shape links North America to Central America.' },
  { id: 'argentina', name: 'Arjantin', nameEn: 'Argentina', difficulty: 'easy', funFact: 'Güney Amerika\'nın en uzun ikinci ülkesi, upuzun ve incedir!', funFactEn: 'A long, narrow country stretching almost the length of South America!' },
  { id: 'chile', name: 'Şili', nameEn: 'Chile', difficulty: 'easy', funFact: '4.300 km\'den uzun ama ortalama sadece 180 km genişliğindedir!', funFactEn: 'Over 4,300 km long but only about 180 km wide on average!' },
  { id: 'uk', name: 'Birleşik Krallık', nameEn: 'United Kingdom', difficulty: 'easy', funFact: 'İngiltere, İskoçya, Galler ve Kuzey İrlanda\'dan oluşur.', funFactEn: 'Made up of England, Scotland, Wales, and Northern Ireland.' },
  { id: 'greece', name: 'Yunanistan', nameEn: 'Greece', difficulty: 'easy', funFact: 'Binlerce adaya sahip, kıyı şeridi Avrupa\'nın en uzunları arasında!', funFactEn: "Home to thousands of islands and one of Europe's longest coastlines!" },
  { id: 'norway', name: 'Norveç', nameEn: 'Norway', difficulty: 'easy', funFact: 'Fiyortlarıyla ünlü, kuzeyde Kutup Dairesi\'ne kadar uzanır.', funFactEn: 'Famous for its fjords, stretching north into the Arctic Circle.' },

  { id: 'portugal', name: 'Portekiz', nameEn: 'Portugal', difficulty: 'medium', funFact: 'İber Yarımadası\'nın batısında, Atlantik\'e uzun bir kıyısı vardır.', funFactEn: 'Sits on the western edge of the Iberian Peninsula with a long Atlantic coast.' },
  { id: 'sweden', name: 'İsveç', nameEn: 'Sweden', difficulty: 'medium', funFact: 'İskandinav Yarımadası\'nın doğusunu kaplayan uzun bir ülkedir.', funFactEn: 'A long country covering the eastern side of the Scandinavian Peninsula.' },
  { id: 'finland', name: 'Finlandiya', nameEn: 'Finland', difficulty: 'medium', funFact: 'On binlerce göle sahip olduğu için "Bin Göl Ülkesi" denir.', funFactEn: 'Called the "Land of a Thousand Lakes" for its tens of thousands of lakes.' },
  { id: 'ireland', name: 'İrlanda', nameEn: 'Ireland', difficulty: 'medium', funFact: 'Yeşil tepeleriyle bilinen bir ada ülkesidir.', funFactEn: 'An island nation known for its green hills.' },
  { id: 'ukraine', name: 'Ukrayna', nameEn: 'Ukraine', difficulty: 'medium', funFact: 'Avrupa\'nın yüzölçümü en büyük ikinci ülkesidir (Rusya hariç).', funFactEn: 'The second-largest country in Europe by area (excluding Russia).' },
  { id: 'china', name: 'Çin', nameEn: 'China', difficulty: 'medium', funFact: 'Dünyanın en kalabalık ülkelerinden biri, geniş ve girintili bir sınıra sahiptir.', funFactEn: "One of the world's most populous countries, with a vast, irregular border." },
  { id: 'south-korea', name: 'Güney Kore', nameEn: 'South Korea', difficulty: 'medium', funFact: 'Kore Yarımadası\'nın güney yarısını kaplar, kuzeyde DMZ ile sınırlanır.', funFactEn: 'Covers the southern half of the Korean Peninsula, bordered by the DMZ to the north.' },
  { id: 'vietnam', name: 'Vietnam', nameEn: 'Vietnam', difficulty: 'medium', funFact: 'Harita üzerinde ince uzun bir "S" harfine benzer.', funFactEn: 'Shaped like a long, curving letter "S" on the map.' },
  { id: 'thailand', name: 'Tayland', nameEn: 'Thailand', difficulty: 'medium', funFact: 'Güneydeki uzun yarımadasıyla bir fil başına benzetilir.', funFactEn: "Often compared to an elephant's head, thanks to its long southern peninsula." },
  { id: 'saudi-arabia', name: 'Suudi Arabistan', nameEn: 'Saudi Arabia', difficulty: 'medium', funFact: 'Arap Yarımadası\'nın büyük bölümünü kaplayan geniş bir çöl ülkesidir.', funFactEn: 'A vast desert country covering most of the Arabian Peninsula.' },

  { id: 'switzerland', name: 'İsviçre', nameEn: 'Switzerland', difficulty: 'hard', epsilon: 0.02, funFact: 'Alpler\'in ortasında, tamamen karayla çevrili küçük bir ülkedir.', funFactEn: 'A small, landlocked country in the heart of the Alps.' },
  { id: 'south-africa', name: 'Güney Afrika', nameEn: 'South Africa', difficulty: 'hard', funFact: 'İçinde bağımsız bir ülke olan Lesotho\'yu tamamen çevreler.', funFactEn: 'Completely surrounds the independent country of Lesotho.' },
];

const PROVINCES_METADATA = [
  { id: 'istanbul', name: 'İstanbul', nameEn: 'Istanbul', difficulty: 'easy', funFact: 'Asya ve Avrupa\'yı birbirine bağlayan efsanevi şehir!', funFactEn: 'The legendary city linking Asia and Europe!' },
  { id: 'ankara', name: 'Ankara', nameEn: 'Ankara', difficulty: 'easy', funFact: 'Türkiye\'nin kalbi ve başkenti.', funFactEn: "Turkey's capital, at the heart of the country." },
  { id: 'antalya', name: 'Antalya', nameEn: 'Antalya', difficulty: 'easy', funFact: 'Türkiye\'nin turizm başkenti, upuzun bir sahile sahip.', funFactEn: "Turkey's tourism capital, with a long stretch of coastline." },
  { id: 'izmir', name: 'İzmir', nameEn: 'Izmir', difficulty: 'easy', funFact: 'Ege\'nin incisi, kordonuyla meşhur!', funFactEn: 'The pearl of the Aegean, famous for its waterfront promenade!' },
  { id: 'konya', name: 'Konya', nameEn: 'Konya', difficulty: 'easy', funFact: 'Türkiye\'nin yüzölçümü en büyük ilidir!', funFactEn: "Turkey's largest province by area!" },
  { id: 'trabzon', name: 'Trabzon', nameEn: 'Trabzon', difficulty: 'easy', funFact: 'Karadeniz\'in hırçın dalgalarına kıyısı var.', funFactEn: 'Faces the choppy waves of the Black Sea.' },
  { id: 'hatay', name: 'Hatay', nameEn: 'Hatay', difficulty: 'easy', funFact: 'Akdeniz\'in en güney ucunda ince uzun bir şekle sahip.', funFactEn: 'A long, narrow province at the southern tip of the Mediterranean coast.' },
  { id: 'van', name: 'Van', nameEn: 'Van', difficulty: 'easy', funFact: 'Türkiye\'nin en büyük gölüne ev sahipliği yapar.', funFactEn: "Home to Turkey's largest lake." },
  { id: 'bursa', name: 'Bursa', nameEn: 'Bursa', difficulty: 'medium', funFact: 'Uludağ\'ın eteklerinde tarihi bir şehir.', funFactEn: 'A historic city at the foot of Mount Uludağ.' },
  { id: 'adana', name: 'Adana', nameEn: 'Adana', difficulty: 'medium', funFact: 'Kebabıyla meşhur, Çukurova\'nın kalbi.', funFactEn: 'Famous for its kebab, at the heart of the Çukurova plain.' },
  { id: 'samsun', name: 'Samsun', nameEn: 'Samsun', difficulty: 'medium', funFact: 'Milli Mücadelenin başladığı şehir.', funFactEn: "The city where Turkey's War of Independence began." },
  { id: 'erzurum', name: 'Erzurum', nameEn: 'Erzurum', difficulty: 'medium', funFact: 'Palandöken dağlarıyla kış turizminin gözdesi.', funFactEn: 'A winter sports favorite thanks to the Palandöken mountains.' },
  { id: 'diyarbakir', name: 'Diyarbakır', nameEn: 'Diyarbakir', difficulty: 'medium', funFact: 'Tarihi surları uzaydan bile görülebilir.', funFactEn: 'Its ancient city walls are said to be visible from space.' },
  { id: 'mugla', name: 'Muğla', nameEn: 'Mugla', difficulty: 'medium', funFact: 'Türkiye\'nin en uzun sahil şeridine sahip.', funFactEn: "Home to Turkey's longest stretch of coastline." },
  { id: 'kayseri', name: 'Kayseri', nameEn: 'Kayseri', difficulty: 'medium', funFact: 'Erciyes dağının gölgesinde ticaretiyle ünlü.', funFactEn: 'Known for its trade tradition, in the shadow of Mount Erciyes.' },
  { id: 'bolu', name: 'Bolu', nameEn: 'Bolu', difficulty: 'hard', funFact: 'Yedigöller\'i ve aşçılarıyla bilinir.', funFactEn: 'Known for its Seven Lakes (Yedigöller) and its chefs.' },
  { id: 'tokat', name: 'Tokat', nameEn: 'Tokat', difficulty: 'hard', funFact: 'Tarihi konakları ve yaprak sarması meşhurdur.', funFactEn: 'Famous for its historic mansions and stuffed grape leaves.' },
  { id: 'kirsehir', name: 'Kırşehir', nameEn: 'Kirsehir', difficulty: 'hard', funFact: 'Neşet Ertaş\'ın memleketi, bozkırın tezenesi.', funFactEn: "Hometown of folk musician Neşet Ertaş, the pick of the steppe." },
  { id: 'sinop', name: 'Sinop', nameEn: 'Sinop', difficulty: 'hard', funFact: 'Türkiye\'nin en kuzey noktası İnceburun buradadır.', funFactEn: "Home to İnceburun, Turkey's northernmost point." },
  { id: 'burdur', name: 'Burdur', nameEn: 'Burdur', difficulty: 'hard', funFact: 'Salda Gölü ile Türkiye\'nin Maldivleri\'ne ev sahipliği yapar.', funFactEn: 'Home to Lake Salda, often called Turkey\'s Maldives.' },
];

// US states pack (#3) — new source, matched by properties.name.
const US_STATES_METADATA = [
  { id: 'texas', name: 'Teksas', nameEn: 'Texas', difficulty: 'easy', funFact: 'ABD\'nin Alaska\'dan sonra yüzölçümü en büyük ikinci eyaletidir.', funFactEn: 'The second-largest U.S. state by area, after Alaska.' },
  { id: 'california', name: 'Kaliforniya', nameEn: 'California', difficulty: 'easy', funFact: 'ABD\'nin en kalabalık eyaleti, uzun bir Pasifik kıyısına sahiptir.', funFactEn: 'The most populous U.S. state, with a long Pacific coastline.' },
  { id: 'florida', name: 'Florida', nameEn: 'Florida', difficulty: 'easy', funFact: 'Meksika Körfezi\'ne doğru uzanan ince bir yarımadadır.', funFactEn: 'A narrow peninsula reaching out into the Gulf of Mexico.' },
  { id: 'colorado', name: 'Kolorado', nameEn: 'Colorado', difficulty: 'easy', funFact: 'Sınırları neredeyse tamamen düz çizgilerden oluşan bir dikdörtgendir.', funFactEn: 'Its borders are almost perfectly straight lines, forming a near-rectangle.' },
  { id: 'utah', name: 'Utah', nameEn: 'Utah', difficulty: 'easy', funFact: 'Colorado gibi kenarları büyük ölçüde düz çizgilerle çizilmiştir.', funFactEn: 'Like Colorado, its edges are drawn largely with straight lines.' },
  { id: 'nevada', name: 'Nevada', nameEn: 'Nevada', difficulty: 'easy', funFact: 'Kuzeyi ve doğusu düz, güneybatısı Colorado Nehri\'ni takip eder.', funFactEn: 'Straight to the north and east, while its southwest edge follows the Colorado River.' },
  { id: 'idaho', name: 'Idaho', nameEn: 'Idaho', difficulty: 'easy', funFact: 'Kuzeyde ince bir çıkıntıyla Kanada sınırına kadar uzanır.', funFactEn: 'Narrows to a thin northern panhandle that reaches the Canadian border.' },
  { id: 'new-york', name: 'New York', nameEn: 'New York', difficulty: 'medium', funFact: 'Kuzeyinde Ontario ve Erie gölleri, güneyinde Atlantik kıyısı vardır.', funFactEn: 'Bordered by Lakes Ontario and Erie to the north and the Atlantic to the south.' },
  { id: 'washington', name: 'Washington', nameEn: 'Washington', difficulty: 'medium', funFact: 'Ülkenin kuzeybatı ucunda, Kanada sınırına komşu bir eyalettir.', funFactEn: "A state in the country's far northwest corner, bordering Canada." },
  { id: 'oklahoma', name: 'Oklahoma', nameEn: 'Oklahoma', difficulty: 'easy', funFact: 'Kuzeybatısında "Tava Sapı" (Panhandle) adı verilen ince bir uzantısı vardır.', funFactEn: 'Has a long, narrow "panhandle" extension in its northwest.' },
];

// Simplified DP Algorithm for point reduction
function perpendicularDistance(point, lineStart, lineEnd) {
  let x = point[0], y = point[1];
  let x1 = lineStart[0], y1 = lineStart[1];
  let x2 = lineEnd[0], y2 = lineEnd[1];

  let A = x - x1;
  let B = y - y1;
  let C = x2 - x1;
  let D = y2 - y1;

  let dot = A * C + B * D;
  let len_sq = C * C + D * D;
  let param = -1;

  if (len_sq != 0) param = dot / len_sq;

  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  let dx = x - xx;
  let dy = y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

function douglasPeucker(points, epsilon) {
  let maxDistance = 0;
  let index = 0;
  let end = points.length - 1;

  for (let i = 1; i < end; i++) {
    let d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDistance) {
      index = i;
      maxDistance = d;
    }
  }

  let res = [];
  if (maxDistance > epsilon) {
    let recResults1 = douglasPeucker(points.slice(0, index + 1), epsilon);
    let recResults2 = douglasPeucker(points.slice(index), epsilon);
    res = recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    res = [points[0], points[end]];
  }
  return res;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

// Subdivides the longest edges of a closed path, splitting each at its
// midpoint, until it has at least `minPoints`. Purely additive — every
// inserted point lies exactly on an existing straight edge, so the shape
// is unchanged; this only matters for a genuinely simple/rectangular
// region (e.g. Colorado) whose real border has too few vertices to begin
// with, in either the source data or after simplification.
function densify(path, minPoints) {
  if (path.length >= minPoints || path.length < 2) return path;
  const pts = path.map((p) => [...p]);

  while (pts.length < minPoints) {
    let maxLen = -1;
    let maxIdx = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len > maxLen) {
        maxLen = len;
        maxIdx = i;
      }
    }
    const [x1, y1] = pts[maxIdx];
    const [x2, y2] = pts[maxIdx + 1];
    const mid = [Math.round((x1 + x2) / 2 * 100) / 100, Math.round((y1 + y2) / 2 * 100) / 100];
    pts.splice(maxIdx + 1, 0, mid);
  }
  return pts;
}

// Shoelace-formula ring area — units are raw lon/lat degrees squared, only
// ever used to RANK rings against each other (main vs. islands), never as a
// real-world area, so no projection is needed here.
function ringArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function simplifyRing(ring, epsilon, minPoints) {
  const mapped = ring.map(pt => [pt[0], -pt[1]]);
  const simplified = douglasPeucker(mapped, epsilon);
  const rounded = simplified.map(pt => [Math.round(pt[0] * 100) / 100, Math.round(pt[1] * 100) / 100]);
  return densify(rounded, minPoints);
}

// Multi-part regions (#18) — extracts every OUTER ring of a (Multi)Polygon
// feature (inner rings/holes are ignored: this is for the visual "islands"
// outline, not topology), returns them simplified, main ring first.
//
// The main ring is picked by point count — the exact heuristic
// extractPolygon() always used — so `rings[0]` is byte-identical to what
// `path` has always been for every already-shipped non-pinned region; nobody's
// shipped shape moves just because this function now also looks at area.
// The remaining rings are ranked by real (shoelace) area, kept only above
// `areaThresholdRatio` of the main ring's own area (drops slivers/rocks),
// capped at `maxRings - 1` extras. They're decorative only (never scored),
// so they're simplified harder than the main ring (`extraEpsilonMultiplier`)
// and allowed a lower point-count floor — trims real weight off the main JS
// bundle, which ships every region's rings inline.
function extractRings(feature, epsilon, minPoints, {
  maxRings = 7, areaThresholdRatio = 0.02, extraEpsilonMultiplier = 2, extraMinPoints = 8,
} = {}) {
  if (!feature) return [];
  const coords = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates];
  const outerRings = coords.map(poly => poly[0]);

  if (outerRings.length === 1) {
    return [simplifyRing(outerRings[0], epsilon, minPoints)];
  }

  let mainIndex = 0;
  for (let i = 1; i < outerRings.length; i++) {
    if (outerRings[i].length > outerRings[mainIndex].length) mainIndex = i;
  }
  const mainArea = ringArea(outerRings[mainIndex]);

  const others = outerRings
    .map((ring, i) => ({ ring, i, area: ringArea(ring) }))
    .filter((r) => r.i !== mainIndex && r.area >= mainArea * areaThresholdRatio)
    .sort((a, b) => b.area - a.area)
    .slice(0, maxRings - 1);

  return [
    simplifyRing(outerRings[mainIndex], epsilon, minPoints),
    ...others.map((o) => simplifyRing(o.ring, epsilon * extraEpsilonMultiplier, Math.min(minPoints, extraMinPoints))),
  ];
}

function extractPolygon(feature, epsilon = 0.5, minPoints = 20) {
  return extractRings(feature, epsilon, minPoints)[0] || [];
}

/** Raw lon/lat bbox width of a ring, in degrees — used only to pick a per-feature epsilon. */
function ringBBoxWidth(ring) {
  let minX = Infinity, maxX = -Infinity;
  for (const [x] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  return maxX - minX;
}

/**
 * Per-feature epsilon for context shapes (#18 restyle): `bboxWidth / divisor`,
 * clamped to `[minEps, maxEps]`. Large countries hit the `maxEps` ceiling
 * (same coarse detail as before — their scale hides it anyway); small/
 * medium countries (Syria, South Korea, the Balkans — exactly the ones that
 * looked visibly polygonal next to our playable targets) get proportionally
 * finer detail instead of one flat epsilon for the whole world.
 */
function adaptiveEpsilon(ring, { minEps, maxEps, divisor }) {
  return Math.min(maxEps, Math.max(minEps, ringBBoxWidth(ring) / divisor));
}

function escapeQuotes(str) {
  return str.replace(/'/g, "\\'");
}

// Emits `export const <exportName> = [ ... ]` to `outFile`, matching each
// metadata entry against `geoFeatures` by `geoName ?? nameEn` (or `?? name`
// when neither is set, for pure-lookup-by-name sources), simplifying its
// rings with `meta.epsilon ?? defaultEpsilon`. Logs a WARNING and skips any
// entry it can't find — the caller should treat any such warning as a
// blocker, not silently ship a missing region.
//
// Multi-part regions (#18): every entry gets a `rings` array alongside the
// existing `path` (`rings[0] === path`, always — scoring only ever reads
// `path`, so it's untouched by any of this). A PINNED entry's `path` stays
// completely frozen as before, but its OTHER rings (island chains etc.) are
// still derived live from upstream — the pin only ever protected the single
// path players are scored against, not the supplementary art. If the pinned
// name can no longer be found upstream at all, it ships with `rings: [path]`
// (no islands) rather than failing the build.
function buildRegionModule({ metadata, geoFeatures, exportName, category, defaultEpsilon, matchName, outFile }) {
  let output = `export const ${exportName} = [\n`;
  let missing = 0;

  for (const meta of metadata) {
    const pinned = PINNED_COUNTRY_PATHS[meta.id];
    const lookupName = matchName(meta);
    const feature = geoFeatures.find(f => f.properties.name === lookupName);
    const epsilon = meta.epsilon ?? defaultEpsilon;

    let path;
    let rings;
    if (pinned) {
      path = pinned;
      if (feature) {
        const liveRings = extractRings(feature, epsilon, 20);
        rings = [path, ...liveRings.slice(1)];
      } else {
        console.warn(`WARNING: "${lookupName}" (${meta.id}) is pinned but no longer found upstream — shipping its main ring only, no extra islands.`);
        rings = [path];
      }
    } else {
      if (!feature) {
        console.warn(`WARNING: Could not find "${lookupName}" (${meta.id}) in GeoJSON!`);
        missing++;
        continue;
      }
      rings = extractRings(feature, epsilon, 20);
      path = rings[0];
    }

    output += `  {
    id: '${meta.id}',
    name: '${meta.name}',
    nameEn: '${meta.nameEn}',
    difficulty: '${meta.difficulty}',
    category: '${category}',
    funFact: '${escapeQuotes(meta.funFact)}',
    funFactEn: '${escapeQuotes(meta.funFactEn)}',
    path: ${JSON.stringify(path)},
    rings: ${JSON.stringify(rings)}
  },\n`;
  }
  output += '];\n';
  fs.writeFileSync(outFile, output, 'utf-8');
  console.log(`Updated ${outFile} (${metadata.length - missing}/${metadata.length} regions)`);
  return missing;
}

// Neighbour context (#18c) — a coarse, decorative background layer showing
// every OTHER feature in a source's full dataset (not just the ones we ship
// as playable regions), so trace mode/the result overlay can draw
// "surrounding land" behind the target. Reuses the SAME already-fetched
// GeoJSON as the playable regions (countries.geojson has ~255 countries;
// the TR/US sources cover all 81 provinces / 50 states, not just our
// smaller played subset) — no new network dependency. Heavily simplified
// (a much coarser epsilon than playable geometry, main ring only, no
// densify floor) since this is background dressing, never scored or
// traced. Written as its own module so it can be dynamically `import()`-ed
// as a separate chunk per category, only when a trace/result screen
// actually needs it.
// Each entry carries its main ring plus enough to LABEL it client-side
// without shipping a translation table: `name` (the source's own English/
// native admin name — provinces/states just use this as-is, per-language,
// since TR province names are already Turkish and US state names stay
// English either way) and, for countries only, `iso2` (ISO 3166-1 alpha-2)
// so the renderer can localize via `Intl.DisplayNames`, falling back to
// `name` if that lookup fails or `iso2` is missing.
function buildContextModule({ geoFeatures, exportName, outFile, epsilonOpts, getName, getIso2 }) {
  const entries = [];
  for (const f of geoFeatures) {
    let coords = f.geometry.coordinates;
    if (f.geometry.type === 'MultiPolygon') {
      let largest = coords[0];
      for (const poly of coords) if (poly[0].length > largest[0].length) largest = poly;
      coords = largest;
    }
    const outerRing = coords[0];
    const epsilon = adaptiveEpsilon(outerRing, epsilonOpts);
    const ring = simplifyRing(outerRing, epsilon, 4);
    if (ring.length <= 2) continue;
    entries.push({ rings: [ring], name: getName(f), ...(getIso2 ? { iso2: getIso2(f) } : {}) });
  }
  fs.writeFileSync(outFile, `export const ${exportName} = ${JSON.stringify(entries)};\n`, 'utf-8');
  console.log(`Updated ${outFile} (${entries.length} context shapes)`);
}

async function generateData() {
  let totalMissing = 0;

  console.log('Fetching countries...');
  const geoCountries = await fetchJson(COUNTRIES_URL);
  totalMissing += buildRegionModule({
    metadata: COUNTRIES_METADATA,
    geoFeatures: geoCountries.features,
    exportName: 'countries',
    category: 'country',
    defaultEpsilon: 0.05,
    matchName: (meta) => meta.geoName ?? meta.nameEn,
    outFile: 'src/data/countries.js',
  });
  buildContextModule({
    geoFeatures: geoCountries.features,
    exportName: 'countriesContext',
    // minEps/maxEps/divisor tuned by hand against the actual gzip size of
    // this chunk (see #18 restyle) — keeps small/mid countries noticeably
    // more detailed than the old flat 0.3 while staying under ~45kB gzip.
    epsilonOpts: { minEps: 0.18, maxEps: 0.3, divisor: 160 },
    getName: (f) => f.properties.name,
    getIso2: (f) => {
      const raw = f.properties['ISO3166-1-Alpha-2'];
      if (raw && raw !== '-99') return raw;
      return ISO2_OVERRIDES[f.properties.name] || null;
    },
    outFile: 'src/data/context/countries-context.js',
  });

  console.log('Fetching provinces...');
  const geoProvinces = await fetchJson(TURKEY_PROVINCES_URL);
  totalMissing += buildRegionModule({
    metadata: PROVINCES_METADATA,
    geoFeatures: geoProvinces.features,
    exportName: 'turkeyProvinces',
    category: 'province',
    defaultEpsilon: 0.005,
    matchName: (meta) => meta.geoName ?? meta.name,
    outFile: 'src/data/turkey-provinces.js',
  });
  buildContextModule({
    geoFeatures: geoProvinces.features,
    exportName: 'provincesContext',
    epsilonOpts: { minEps: 0.005, maxEps: 0.02, divisor: 50 },
    getName: (f) => f.properties.name,
    outFile: 'src/data/context/provinces-context.js',
  });

  console.log('Fetching US states...');
  const geoStates = await fetchJson(US_STATES_URL);
  totalMissing += buildRegionModule({
    metadata: US_STATES_METADATA,
    geoFeatures: geoStates.features,
    exportName: 'usStates',
    category: 'state',
    defaultEpsilon: 0.03,
    matchName: (meta) => meta.geoName ?? meta.nameEn,
    outFile: 'src/data/us-states.js',
  });
  buildContextModule({
    geoFeatures: geoStates.features,
    exportName: 'statesContext',
    epsilonOpts: { minEps: 0.02, maxEps: 0.1, divisor: 100 },
    getName: (f) => f.properties.name,
    outFile: 'src/data/context/states-context.js',
  });

  if (totalMissing > 0) {
    console.error(`\n${totalMissing} region(s) could not be matched in their source GeoJSON — see WARNINGs above.`);
    process.exitCode = 1;
  }
}

generateData().catch(console.error);
