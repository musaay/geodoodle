import fs from 'fs';
import https from 'https';
import zlib from 'zlib';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import { feature as topoFeature, mesh as topoMesh } from 'topojson-client';
import { clipPolygonToRect, projectMercatorPoint } from '../src/engine/canvas-manager.js';

const COUNTRIES_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';
// #20 follow-up: tr-cities-utf8 (the previous source) only had 43 raw points
// for İstanbul and shared almost no vertices with its neighbours (see the
// report) — geoBoundaries' TUR ADM1 release is public-domain-adjacent
// (CC BY 4.0, attribution required — see the privacy page/README) and one
// coherently-digitized dataset, so adjacent provinces genuinely share
// vertices. Two variants are published for the same release; FULL is tried
// first for maximum detail, falling back to SIMPLIFIED per-category if FULL
// blows the geometry budget (see generateData).
const TURKEY_PROVINCES_URL_FULL = 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/TUR/ADM1/geoBoundaries-TUR-ADM1.geojson';
const TURKEY_PROVINCES_URL_SIMPLIFIED = 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/TUR/ADM1/geoBoundaries-TUR-ADM1_simplified.geojson';
// #20 follow-up: switched from PublicaMundi (which shared only ~97.5% of a
// real border's vertices, e.g. Texas/Oklahoma) to Natural Earth 10m admin-1,
// public domain, measured at ~99% for the same pair.
const US_STATES_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';

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

  { id: 'switzerland', name: 'İsviçre', nameEn: 'Switzerland', difficulty: 'hard', funFact: 'Alpler\'in ortasında, tamamen karayla çevrili küçük bir ülkedir.', funFactEn: 'A small, landlocked country in the heart of the Alps.' },
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

// Follows redirects (geoBoundaries' GitHub release assets are Git LFS files,
// served via a 302 to media.githubusercontent.com) up to a small hop limit.
function fetchJson(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) { reject(new Error(`Too many redirects fetching ${url}`)); return; }
        resolve(fetchJson(res.headers.location, redirectsLeft - 1));
        return;
      }
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
function densify(path, minPoints, precision) {
  if (path.length >= minPoints || path.length < 2) return path;
  const pts = path.map((p) => [...p]);
  const p = 10 ** precision;

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
    const mid = [Math.round((x1 + x2) / 2 * p) / p, Math.round((y1 + y2) / 2 * p) / p];
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

// Converts a topology-simplified outer ring (still raw [lon, lat], real —
// not quantized — coordinates, per topojson-client's feature()/mesh()) to
// our stored [lon, -lat] convention, rounded to `precision` decimal places
// (4 for countries, 5 for provinces/states — see generateData; applied
// identically to path/rings/context/borders at this last step, per #20's
// report: a coarser 2-decimal rounding was destroying real detail at
// province scale — Istanbul's main ring only had 40 points at 2dp).
function toStoredRing(ring, precision) {
  const p = 10 ** precision;
  return ring.map(([x, y]) => [Math.round(x * p) / p, Math.round(-y * p) / p]);
}

// Multi-part regions (#18) — extracts every OUTER ring of an ALREADY
// topology-simplified (Multi)Polygon feature (inner rings/holes are
// ignored: this is for the visual "islands" outline, not real topology),
// main ring first, converted to our stored convention. No further
// simplification happens here — the topology this feature came from was
// already simplified ONCE for the whole category (see
// buildCategoryTopology), which is what keeps two adjacent features'
// shared border vertex-identical; simplifying a ring again per-call, like
// the old Douglas-Peucker pipeline did, would undo that.
//
// The main ring is the one with the largest real (shoelace) area — with
// every region now generated from one shared topology rather than
// independently, point-count is no longer a meaningful proxy for "the
// actual mainland" (see the Japan/Spain/Italy/Australia findings in #20's
// report, all of which had a real ISLAND spliced into a historically
// "byte-identical" point-count-selected ring). Extra rings are ranked the
// same way, kept only above `areaThresholdRatio` of the main ring's own
// area (drops slivers/rocks), capped at `maxRings - 1` extras.
function extractRingsFromTopologyFeature(feature, {
  maxRings = 7, areaThresholdRatio = 0.02, minPoints = 8, precision = 4,
} = {}) {
  if (!feature) return [];
  const coords = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates
    : [feature.geometry.coordinates];
  const outerRings = coords.map((poly) => poly[0]).filter((r) => r && r.length >= 3);
  if (outerRings.length === 0) return [];

  const ranked = outerRings
    .map((ring) => ({ ring, area: ringArea(ring) }))
    .sort((a, b) => b.area - a.area)
    .slice(0, maxRings);
  const mainArea = ranked[0].area;

  return ranked
    .filter((r, i) => i === 0 || r.area >= mainArea * areaThresholdRatio)
    .map((r) => densify(toStoredRing(r.ring, precision), minPoints, precision));
}

/**
 * Builds one topojson topology for a WHOLE source category (all features —
 * every playable target in it AND every other feature used as context),
 * quantized then simplified ONCE, so any two features that share a border
 * in the raw source end up sharing the exact same arc — structurally
 * guaranteed, not just likely from matching epsilons (see #20's report:
 * independently-digitized provinces/countries can have genuinely different
 * vertices along a "shared" border even at a very fine, matched epsilon,
 * which is exactly the Tekirdağ/İstanbul divergence that prompted this).
 *
 * `quantization` snaps coordinates to a grid before topology extraction so
 * near-coincident (not just byte-identical) vertices from independently
 * digitized neighbours also snap to a shared arc. `quantileP` is roughly
 * "fraction of points kept" (0 = most aggressive, 1 = keep everything),
 * tuned per category against real point counts/chunk sizes.
 */
function buildCategoryTopology(geoFeatures, quantileP, quantization = 1e5) {
  const fc = { type: 'FeatureCollection', features: geoFeatures };
  const topo = topology({ features: fc }, quantization);
  const presimplified = presimplify(topo);
  const minWeight = quantile(presimplified, quantileP);
  return simplify(presimplified, minWeight);
}

// Liang-Barsky clip of one line segment against an axis-aligned box.
// Returns the clipped [start, end] pair, or null if the segment doesn't
// intersect the box at all.
function clipSegmentToBox([x0, y0], [x1, y1], box) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - box.minX, box.maxX - x0, y0 - box.minY, box.maxY - y0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [[x0 + t0 * dx, y0 + t0 * dy], [x0 + t1 * dx, y0 + t1 * dy]];
}

// Clips an OPEN polyline (not a closed ring — used for border mesh lines,
// see buildCategoryBorders) to a box, walking segment-by-segment and
// splitting into multiple sub-polylines wherever the line exits and
// re-enters the box, rather than assuming a single contiguous run.
function clipPolylineToBox(line, box) {
  const segments = [];
  let current = null;
  for (let i = 0; i < line.length - 1; i++) {
    const clipped = clipSegmentToBox(line[i], line[i + 1], box);
    if (!clipped) {
      if (current) { segments.push(current); current = null; }
      continue;
    }
    if (!current) {
      current = [clipped[0]];
    } else {
      const last = current[current.length - 1];
      if (Math.hypot(last[0] - clipped[0][0], last[1] - clipped[0][1]) > 1e-9) {
        segments.push(current);
        current = [clipped[0]];
      }
    }
    current.push(clipped[1]);
  }
  if (current) segments.push(current);
  return segments;
}

function escapeQuotes(str) {
  return str.replace(/'/g, "\\'");
}

/** Full lon/lat bbox of a ring (raw GeoJSON [lon, lat] OR stored [lon, -lat] — axis-agnostic). */
export function ringBBoxOf(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

// Sutherland-Hodgman clip against an arbitrary axis-aligned box, reusing
// canvas-manager.js's clipPolygonToRect (which only clips against [0,0,w,h])
// by shifting the ring into that box's own coordinate frame and back — one
// clipping implementation for both on-screen (pixel) and lon/lat (degree)
// rectangles, rather than a second copy of the same algorithm here.
export function clipRingToBox(ring, box, precision = 4) {
  const p = 10 ** precision;
  const shifted = ring.map(([x, y]) => [x - box.minX, y - box.minY]);
  const clipped = clipPolygonToRect(shifted, box.maxX - box.minX, box.maxY - box.minY);
  return clipped.map(([x, y]) => [
    Math.round((x + box.minX) * p) / p,
    Math.round((y + box.minY) * p) / p,
  ]);
}

// Caps the FINAL box's own width/height (after the 50% expansion below) at
// a flat 50 degrees, centered on the expanded box. Every genuine target's
// own bbox lands well under this even after expansion (a Canada/Brazil-sized
// country's own bbox is itself around 40°, i.e. the pre-expansion figure —
// the biggest legitimate targets), so this only engages for a target whose
// OWN bbox is itself broken: see the France finding in #20's report —
// pinned-country-paths.json's "france" ring splices in a French-Guiana
// segment, giving it a raw ~64°x49° bbox that, even expanded, swallowed
// half the Atlantic and pulled in West Africa/South America as "neighbours".
// A per-side expansion cap alone can't distinguish that case from a
// genuinely huge (but valid) target of similar raw size, so this clamps the
// box's own total footprint directly instead.
const MAX_BOX_SIZE_DEGREES = 50;

function clampBoxSize(box) {
  const clampAxis = (min, max) => {
    const size = max - min;
    if (size <= MAX_BOX_SIZE_DEGREES) return [min, max];
    const center = (min + max) / 2;
    return [center - MAX_BOX_SIZE_DEGREES / 2, center + MAX_BOX_SIZE_DEGREES / 2];
  };
  const [minX, maxX] = clampAxis(box.minX, box.maxX);
  const [minY, maxY] = clampAxis(box.minY, box.maxY);
  return { minX, maxX, minY, maxY };
}

// The context box must cover whatever the canvas fit (normalizeRingsToCanvasPoints
// in canvas-manager.js — a "contain" fit centered on the main ring, see its
// own doc comment) actually shows on screen, for ANY plausible canvas
// aspect ratio — not just a flat expansion of the target's own bbox. That
// fit's scale is set by whichever axis is more constraining, so a canvas
// aspect ratio that DIFFERS from the target's own bbox aspect ratio always
// reveals MORE than the target's own bbox on the other axis (e.g. a wide
// desktop canvas showing a tall, narrow target reveals lots of extra width
// beyond the target's own bbox). Sizing the box only from the target's own
// aspect (the old flat 50%-each-side rule) leaves uncovered canvas at the
// edges whenever a target's aspect diverges enough from the actual canvas
// aspect — found in #20's report as visible white strips on Kırşehir (a
// roughly-square province) viewed in a wide canvas.
//
// CONTEXT_ASPECT_MIN/MAX bracket the expected range of canvas aspect ratios
// (width/height) — tallest a portrait phone's canvas plausibly gets (~1:1.5)
// to widest a desktop canvas plausibly gets (~2.5:1). CONTEXT_SAFETY_MARGIN
// adds a little extra beyond the mathematically-exact worst case to absorb
// normalizeRingsToCanvasPoints' fixed-pixel `padding`, which this box
// computation (working in projected units, with no pixel dimensions to
// reference) can't account for exactly — padding eats proportionally more
// of a small/mobile canvas, making the effective available-area aspect
// ratio slightly more extreme than the raw canvas aspect.
const CONTEXT_ASPECT_MIN = 1 / 1.5;
const CONTEXT_ASPECT_MAX = 2.5;
const CONTEXT_SAFETY_MARGIN = 1.15;

// Inverse of projectMercatorPoint (canvas-manager.js) — recovers our stored
// [lon, -lat] convention from a Web Mercator [x, y] pair. X is linear in
// longitude (trivial to invert); Y needs the inverse Gudermannian.
function unprojectMercatorPoint([x, y]) {
  const lon = (x * 180) / Math.PI;
  const lat = (2 * Math.atan(Math.exp(-y)) - Math.PI / 2) * (180 / Math.PI);
  return [lon, -lat];
}

/**
 * The lon/lat box a target's context is clipped to: sized to cover every
 * canvas aspect ratio in [CONTEXT_ASPECT_MIN, CONTEXT_ASPECT_MAX] under the
 * "contain" fit (see this function's own comment above), centered on the
 * target's own bbox, then capped at MAX_BOX_SIZE_DEGREES overall (see
 * above — guards against a corrupted/spliced target bbox, unrelated to the
 * aspect-ratio sizing here).
 *
 * The aspect-ratio math runs in Web MERCATOR-PROJECTED space, not raw
 * lon/lat degrees — normalizeRingsToCanvasPoints (canvas-manager.js) fits
 * the PROJECTED ring to the canvas, and Mercator's Y axis stretches
 * increasingly with latitude (a real finding: Kırşehir's raw lon/lat bbox
 * has aspect ratio 1.33, but its actual PROJECTED aspect is 1.03 — using
 * the raw-degree aspect under-sized the box and left visible white canvas
 * strips at the edges, #20's report). Mercator is separable (X depends only
 * on longitude, Y only on latitude), so the bbox corners can be projected
 * directly without projecting every ring point.
 *
 * Exported standalone so its arithmetic is unit-testable without going
 * through the full GeoJSON pipeline.
 */
export function computeContextBox(mainRingPath) {
  const { minX, minY, maxX, maxY } = ringBBoxOf(mainRingPath);
  const [px0, py0] = projectMercatorPoint([minX, minY]);
  const [px1, py1] = projectMercatorPoint([maxX, maxY]);
  const projMinX = Math.min(px0, px1), projMaxX = Math.max(px0, px1);
  const projMinY = Math.min(py0, py1), projMaxY = Math.max(py0, py1);
  const projW = (projMaxX - projMinX) || 1e-9;
  const projH = (projMaxY - projMinY) || 1e-9;
  const targetAspect = projW / projH;

  // A canvas relatively WIDER than the target (aspect > targetAspect) shows
  // extra width beyond the target's own bbox width; one relatively TALLER
  // (aspect < targetAspect) shows extra height. Each factor is >1 only when
  // the corresponding extreme of the aspect range actually exceeds the
  // target's own aspect in that direction.
  const widthFactor = Math.max(1, CONTEXT_ASPECT_MAX / targetAspect);
  const heightFactor = Math.max(1, targetAspect / CONTEXT_ASPECT_MIN);

  const visibleProjW = projW * widthFactor * CONTEXT_SAFETY_MARGIN;
  const visibleProjH = projH * heightFactor * CONTEXT_SAFETY_MARGIN;
  const pcx = (projMinX + projMaxX) / 2;
  const pcy = (projMinY + projMaxY) / 2;

  const [lonA, latA] = unprojectMercatorPoint([pcx - visibleProjW / 2, pcy - visibleProjH / 2]);
  const [lonB, latB] = unprojectMercatorPoint([pcx + visibleProjW / 2, pcy + visibleProjH / 2]);

  return clampBoxSize({
    minX: Math.min(lonA, lonB), maxX: Math.max(lonA, lonB),
    minY: Math.min(latA, latB), maxY: Math.max(latA, latB),
  });
}

/**
 * Per-region neighbour context. For one target region, returns every OTHER
 * feature in the SAME source category that falls within the target's own
 * bbox expanded by 50% on each side, clipped to that box. `simplifiedFeatures`
 * all come from the ONE shared topology built for this whole category (see
 * buildCategoryTopology) — the same topology the target's own `path`/`rings`
 * were extracted from — so a border shared with the target (or with another
 * context feature) is the exact same arc, vertex-for-vertex, not just a
 * close match from independently matching epsilons.
 *
 * The target's own feature is excluded by name — it's drawn only from the
 * target's own `rings`, never duplicated into its own context data.
 *
 * `mainRingPath` is the FINAL resolved path for this target (pinned-aware —
 * the same value written into countries.js/etc.), so the context box always
 * matches exactly what's actually rendered as the target.
 */
function buildRegionContext({
  mainRingPath, targetName, simplifiedFeatures, getName, getIso2, precision = 4,
}) {
  const box = computeContextBox(mainRingPath);

  const entries = [];
  for (const feature of simplifiedFeatures) {
    const name = getName(feature);
    if (name === targetName) continue;

    // Generous ring/area caps here (vs. extractRingsFromTopologyFeature's
    // defaults for playable regions) — a coastal target like Greece needs
    // its neighbour's own island chains to show up too, not just its
    // mainland.
    const rings = extractRingsFromTopologyFeature(feature, { maxRings: 20, areaThresholdRatio: 0.005, minPoints: 4, precision });

    const clippedRings = rings
      .map((ring) => clipRingToBox(ring, box, precision))
      .filter((ring) => ring.length >= 3 && ringArea(ring) > 1e-6)
      .sort((a, b) => ringArea(b) - ringArea(a));
    if (clippedRings.length === 0) continue;

    const iso2 = getIso2 ? getIso2(feature) : null;
    clippedRings.forEach((ring, i) => {
      // Only the largest visible piece of a feature gets labeled — avoids
      // e.g. "Yunanistan" printed once per Greek island in view.
      entries.push({ rings: [ring], name: i === 0 ? name : null, ...(iso2 ? { iso2 } : {}) });
    });
  }

  return entries;
}

/**
 * Precomputes the WHOLE category's shared-border mesh ONCE: every arc shared
 * between two different features (a real country/province/state border).
 * Using topojson-client's `mesh()` means each arc is walked exactly once
 * regardless of how many features reference it.
 *
 * Coastline is deliberately NOT included here (see #20's budget follow-up):
 * a coastline is by definition never shared between two features, so it
 * carries no vertex-coincidence risk — it's drawn straight from each land
 * polygon's own ring in context-renderer.js instead of shipping a second,
 * separate copy of the same geometry as mesh data (which was measured to
 * push several countries' chunks well past budget for zero coincidence
 * benefit, since coastal rings were never going to share vertices anyway).
 *
 * IMPORTANT limitation, found and verified in #20's follow-up (the
 * Tekirdağ/İstanbul report): `interior` only ever contains a border SEGMENT
 * where the two sides' raw source vertices are already exactly (or, with
 * quantization, near-exactly) coincident. Several of this project's
 * sources digitize adjacent administrative boundaries INDEPENDENTLY rather
 * than as one shared network — confirmed for multiple Turkish province
 * pairs and at least one country pair (Turkey/Greece) — so a real border
 * can be only PARTIALLY represented here, with the rest of its length
 * genuinely absent from the topology as a shared arc. Given that,
 * context-renderer.js draws this mesh on TOP of each context land polygon's
 * own (potentially divergent) ring stroke, plus a land-colored buffer stroke
 * under everything, so the residual, unrepresented part of a border reads as
 * a small, visually-absorbed seam rather than two independently-digitized,
 * visibly diverging lines.
 * Returns a plain array of lines (arrays of points), in real (unquantized)
 * lon/lat.
 */
function buildCategoryBorders(simplifiedTopology) {
  const objects = simplifiedTopology.objects.features;
  return topoMesh(simplifiedTopology, objects, (a, b) => a !== b).coordinates;
}

/**
 * Clips a category's precomputed shared-border mesh (see
 * buildCategoryBorders) to one target's context box, and drops empty
 * results. `box` (see computeContextBox) is in our stored [lon, -lat]
 * convention, so each raw (real lon/lat) mesh line is converted to that
 * SAME convention first — clipping against a box before converting compares
 * mismatched coordinate systems (a raw line's positive latitude against a
 * box already negated), which silently drops nearly everything rather than
 * erroring. Each category-wide line can split into several segments per
 * target (clipPolylineToBox), or disappear entirely if it never enters the
 * box.
 */
function clipCategoryBorders(categoryBorderLines, box, precision = 4) {
  const p = 10 ** precision;
  const round = (n) => Math.round(n * p) / p;
  return categoryBorderLines
    .map((line) => line.map(([x, y]) => [x, -y]))
    .flatMap((line) => clipPolylineToBox(line, box))
    .filter((seg) => seg.length >= 2)
    .map((seg) => seg.map(([x, y]) => [round(x), round(y)]));
}

/** Mean of a ring's points, rounded — a cheap position proxy kept as
 * lightweight METADATA (see buildRegionModule) so features that only need
 * "roughly where is this region" (the Neighbor Chain's nearest-unplayed
 * fallback) never have to load a region's full geometry chunk. */
function computeCentroid(path) {
  let sx = 0, sy = 0;
  for (const [x, y] of path) { sx += x; sy += y; }
  return {
    x: Math.round((sx / path.length) * 1000) / 1000,
    y: Math.round((sy / path.length) * 1000) / 1000,
  };
}

// A pinned/generated country `path` spanning more than this many degrees of
// longitude is almost certainly a spliced/corrupted ring (see the France,
// Japan, Spain, Italy and Australia findings in #20's report — each had a
// distant overseas territory or a separate island physically merged into
// the mainland ring, most likely a defect from whenever these were first
// pinned) rather than a real, valid landmass — flagged here so a future
// pin update can't silently reintroduce the same class of bug.
//
// 60° was the original ask, but two REAL, correctly-shaped mainlands in our
// own set already exceed it (Canada ~85°, China ~61°) — a flat 60° would
// false-positive on both. 100° comfortably clears every legitimate country
// we ship while still catching anything as extreme as the France bug (a
// ~64° span from a French-Guiana splice) if a future re-pin reintroduces
// something similar — not a perfect detector (a smaller, nearer-neighbour
// splice like the old Japan/Hokkaido case doesn't blow the bbox this much),
// but a reasonable regression tripwire for the worst class of the bug.
const MAX_VALID_PATH_LONGITUDE_SPAN = 100;

/**
 * Re-derives every PINNED country's `path` from the current topology
 * (mainland = largest real-area outer ring), compares it against the
 * currently-frozen pin (bbox width/height + area, logged as a % delta —
 * not gated on a threshold, since this regeneration is a deliberate,
 * one-time re-baseline: every pinned country must come from the SAME
 * topology as its neighbours for their shared borders to align), and
 * OVERWRITES both the in-memory `PINNED_COUNTRY_PATHS` and
 * pinned-country-paths.json with the new value. Subsequent runs go back to
 * treating the (now-updated) pin as frozen, same mechanism as before — this
 * just re-captures it once, from this generation's topology.
 */
function rePinCountries(metadata, simplifiedFeatures, matchName) {
  function bboxArea(ring) {
    const { minX, minY, maxX, maxY } = ringBBoxOf(ring);
    return { w: maxX - minX, h: maxY - minY, area: ringArea(ring) };
  }

  for (const meta of metadata) {
    if (!PINNED_COUNTRY_PATHS[meta.id]) continue;
    const lookupName = matchName(meta);
    const simplified = simplifiedFeatures.find((f) => f.properties.name === lookupName);
    if (!simplified) {
      console.warn(`WARNING: pinned country "${lookupName}" (${meta.id}) not found in the current topology — keeping its existing pin unchanged.`);
      continue;
    }
    const [newMain] = extractRingsFromTopologyFeature(simplified, { maxRings: 1, minPoints: 20 });
    if (!newMain) continue;

    const old = bboxArea(PINNED_COUNTRY_PATHS[meta.id]);
    const next = bboxArea(newMain);
    const pctDelta = (a, b) => (a === 0 ? 0 : Math.abs(b - a) / a * 100);
    console.log(
      `Re-pinned ${meta.id}: bboxW ${old.w.toFixed(2)}->${next.w.toFixed(2)} (${pctDelta(old.w, next.w).toFixed(1)}%), `
      + `bboxH ${old.h.toFixed(2)}->${next.h.toFixed(2)} (${pctDelta(old.h, next.h).toFixed(1)}%), `
      + `area ${old.area.toFixed(2)}->${next.area.toFixed(2)} (${pctDelta(old.area, next.area).toFixed(1)}%)`
    );
    PINNED_COUNTRY_PATHS[meta.id] = newMain;
  }
  fs.writeFileSync(new URL('./pinned-country-paths.json', import.meta.url), `${JSON.stringify(PINNED_COUNTRY_PATHS)}\n`, 'utf-8');
}

// Emits `export const <exportName> = [ ... ]` to `outFile` — METADATA ONLY
// (id, name, nameEn, difficulty, category, funFact, funFactEn, centroid),
// no geometry — matching each metadata entry against `simplifiedFeatures`
// (topology-simplified, see buildCategoryTopology) by `geoName ?? nameEn`
// (or `?? name` when neither is set, for pure-lookup-by-name sources). Logs
// a WARNING and skips any entry it can't find — the caller should treat any
// such warning as a blocker, not silently ship a missing region.
//
// Geometry (the `path`/`rings` used to render/score a region) moves to its
// own lazily-loaded chunk, `regionsOutDir/<id>.js`, exporting
// `{ path, rings, context, borders }` — `context` is this region's
// neighbour-context data (see buildRegionContext) and `borders` its clipped
// slice of the category's shared-border mesh (see clipCategoryBorders, a
// plain array of lines — coastline is drawn from each land ring directly,
// not shipped as mesh data, see buildCategoryBorders), both merged into the
// SAME chunk rather than separate ones, since a screen that needs one
// always needs the others. `rings[0] === path`, always (multi-part regions,
// #18) — scoring only ever reads `path`. A PINNED entry's `path` stays
// completely frozen (see rePinCountries above), but its OTHER rings (island
// chains etc.) are still derived live from the current topology.
//
// `precision` (decimal places for every emitted coordinate — path, rings,
// context and borders alike, applied at this last step) is 4 for countries
// and 5 for provinces/states (see generateData) — coarser 2-decimal
// rounding was destroying real province-scale detail (#20's report).
function buildRegionModule({
  metadata, simplifiedFeatures, categoryBorders, exportName, category, matchName, outFile,
  contextGetName, contextGetIso2, regionsOutDir, precision = 4,
}) {
  let output = `export const ${exportName} = [\n`;
  let missing = 0;
  const geometryStats = [];

  for (const meta of metadata) {
    const pinned = PINNED_COUNTRY_PATHS[meta.id];
    const lookupName = matchName(meta);
    const simplified = simplifiedFeatures.find((f) => contextGetName(f) === lookupName);
    // See PATH_PRECISION_OVERRIDES' own comment — canada is the only id that
    // needs this; its own path/rings, not context/borders, are the cost.
    const pathPrecision = PATH_PRECISION_OVERRIDES[meta.id] ?? precision;

    let path;
    let rings;
    if (pinned) {
      path = pinned;
      if (simplified) {
        const liveRings = extractRingsFromTopologyFeature(simplified, { minPoints: 20, precision: pathPrecision });
        rings = [path, ...liveRings.slice(1)];
      } else {
        console.warn(`WARNING: "${lookupName}" (${meta.id}) is pinned but no longer found upstream — shipping its main ring only, no extra islands.`);
        rings = [path];
      }
    } else {
      if (!simplified) {
        console.warn(`WARNING: Could not find "${lookupName}" (${meta.id}) in the source data!`);
        missing++;
        continue;
      }
      rings = extractRingsFromTopologyFeature(simplified, { minPoints: 20, precision: pathPrecision });
      if (rings.length === 0) {
        console.warn(`WARNING: "${lookupName}" (${meta.id}) resolved to zero valid rings after topology extraction — skipping!`);
        missing++;
        continue;
      }
      path = rings[0];
    }

    const { minX, maxX } = ringBBoxOf(path);
    if (maxX - minX > MAX_VALID_PATH_LONGITUDE_SPAN) {
      console.warn(`WARNING: "${meta.id}"'s path spans ${(maxX - minX).toFixed(1)}° of longitude (> ${MAX_VALID_PATH_LONGITUDE_SPAN}°) — likely a spliced/corrupted ring, not a real landmass.`);
    }

    const centroid = computeCentroid(path);
    output += `  {
    id: '${meta.id}',
    name: '${meta.name}',
    nameEn: '${meta.nameEn}',
    difficulty: '${meta.difficulty}',
    category: '${category}',
    funFact: '${escapeQuotes(meta.funFact)}',
    funFactEn: '${escapeQuotes(meta.funFactEn)}',
    centroid: { x: ${centroid.x}, y: ${centroid.y} }
  },\n`;

    // `path`/`rings` (the scored geometry) always stay at the category's
    // full `precision` — CONTEXT_PRECISION_OVERRIDES only coarsens the
    // decorative neighbour context + border mesh for a handful of ids whose
    // context/borders alone would otherwise blow the geometry budget (see
    // that map's own comment), never the region actually being scored.
    const contextPrecision = CONTEXT_PRECISION_OVERRIDES[meta.id] ?? precision;
    const context = buildRegionContext({
      mainRingPath: path,
      targetName: lookupName,
      simplifiedFeatures,
      getName: contextGetName,
      getIso2: contextGetIso2,
      precision: contextPrecision,
    });
    const borders = clipCategoryBorders(categoryBorders, computeContextBox(path), contextPrecision);

    const geomOutFile = `${regionsOutDir}/${meta.id}.js`;
    const geomContents = `export const geometry = ${JSON.stringify({ path, rings, context, borders })};\n`;
    fs.writeFileSync(geomOutFile, geomContents, 'utf-8');
    geometryStats.push({ id: meta.id, bytes: Buffer.byteLength(geomContents), gzipBytes: zlib.gzipSync(geomContents).length });
  }
  output += '];\n';
  fs.writeFileSync(outFile, output, 'utf-8');
  console.log(`Updated ${outFile} (${metadata.length - missing}/${metadata.length} regions)`);
  return { missing, geometryStats };
}

// A handful of genuinely huge, complex-coastline countries (own mainland
// ring in the thousands of points, even at a quantile tuned for everyone
// else's detail) can't be trimmed further without either coarsening every
// OTHER country's detail too (undoing the whole point of this pass) or
// re-simplifying just their own ring after the fact — which would re-break
// vertex-sharing with their real neighbours (Canada/USA, USA/Mexico,
// Argentina/Chile) for exactly the reason this rewrite exists. Letting
// these few, rarely-picked giants ship a larger (but still lazy,
// per-region) chunk is the accepted trade-off instead. This list and the
// ceiling below are both measured against real generator output, not
// guessed — see the report.
const LARGER_BUDGET_IDS = new Set(['canada', 'australia', 'usa', 'brazil', 'argentina', 'china', 'india', 'norway', 'sweden']);

// Even at the raised LARGER_GEOMETRY_BUDGET_BYTES ceiling, china and india
// still exceed it at 4-decimal context/border precision (#20 follow-up) —
// both huge countries with many, large neighbours already on the exception
// list above. Coarsening ONLY their (decorative) context + border mesh to
// 3 decimals (~110m) brings them back under budget without touching their
// own scored `path`/`rings`, which always stay at the full 4-decimal
// precision regardless of this map. Does NOT help canada — see
// PATH_PRECISION_OVERRIDES below, a separate mechanism for that case.
const CONTEXT_PRECISION_OVERRIDES = { china: 3, india: 3 };

// canada is the one id CONTEXT_PRECISION_OVERRIDES can't fix: its cost is
// almost entirely its OWN path/rings (~116kB of its ~124kB total, from its
// famously complex Arctic archipelago coastline — thousands of islands),
// not context/borders. Coarsening ONLY its path/rings to 3 decimals (~110m,
// imperceptible at the continental scale Canada is drawn/scored at) is the
// #20-agreed fix. This does not affect border rendering/coincidence: the
// shared Canada/USA border LINE always comes from `borders` (the category's
// shared topology mesh, see buildCategoryBorders/clipCategoryBorders),
// clipped and rounded per-region at that region's own `contextPrecision`
// (unchanged, 4 decimals for both canada and usa — CONTEXT_PRECISION_OVERRIDES
// doesn't list either) — this map only coarsens canada's own FILL/scored
// ring, which the existing land-buffer-stroke mitigation already absorbs
// against any residual gap versus the (unchanged, crisp) border mesh drawn
// on top of it, same as it does for the coincidence-limited source pairs
// documented in buildCategoryBorders' own comment.
//
// CAUTION if an id listed here is ever added to PINNED_COUNTRY_PATHS: the
// pinned branch below splices the frozen `path` with LIVE `liveRings.slice(1)`
// (island rings) — the frozen path's own precision (whatever it was pinned
// at) would then silently coexist with this map's override applied only to
// the live island rings, mixing precision within one `rings` array. Not
// reachable today (canada isn't pinned) but worth a second look if that
// ever changes.
const PATH_PRECISION_OVERRIDES = { canada: 3 };

// canada still doesn't clear LARGER_GEOMETRY_BUDGET_BYTES even at 3-decimal
// path/rings (measured ~115-125kB depending on context-box sizing changes,
// vs. the shared 105kB ceiling) — #20-agreed as a documented, one-off
// exception rather than reducing precision further (2 decimals) or raising
// the shared ceiling for every other "larger" id too. 110kB here (checked
// against this script's own pre-Vite-build gzip measurement) corresponds to
// ~120kB in the actual production build, per the ~9% Vite overhead noted on
// GEOMETRY_BUDGET_BYTES/LARGER_GEOMETRY_BUDGET_BYTES above.
const PER_ID_BUDGET_BYTES = { canada: 125 * 1024 };

async function generateData() {
  let totalMissing = 0;
  let allGeometryStats = [];
  const regionsOutDir = 'src/data/regions';
  // The real budget is checked against the BUILT chunk, but Vite's
  // production bundling/minification consistently measures ~9% larger than
  // gzipping this raw generated source directly (checked against
  // usa/china/norway) — budgets checked here are scaled down so a pass here
  // reliably means a pass there.
  // Ceilings reflect the realism-first decision in #20: a player downloads
  // only the one region they play, so ~65 kB (normal) / ~120 kB (largest
  // coastlines) in the real build is acceptable rather than cutting detail.
  const GEOMETRY_BUDGET_BYTES = 65 * 1024;
  const LARGER_GEOMETRY_BUDGET_BYTES = 110 * 1024;

  // #20 follow-up: geometry (path/rings/context/borders) all moved into one
  // lazily-loaded chunk per region, replacing the older separate
  // src/data/context/<id>.js chunks entirely — remove that whole directory
  // so a stale copy can't linger and get imported by mistake.
  const staleContextDir = 'src/data/context';
  if (fs.existsSync(staleContextDir)) fs.rmSync(staleContextDir, { recursive: true });
  fs.mkdirSync(regionsOutDir, { recursive: true });

  console.log('Fetching countries...');
  const geoCountries = await fetchJson(COUNTRIES_URL);
  // Quantile ("fraction of points kept") tuned against real point counts —
  // 0.3 keeps Turkey/Greece near their old (pre-topology) Douglas-Peucker
  // detail (~750-1500 points) and Cyprus clearly island-shaped (~54 points),
  // while still bounding the biggest countries' point counts to something
  // clip-to-box can reasonably work with (see LARGER_BUDGET_IDS above for
  // the few that still need a bigger chunk regardless).
  const countriesTopology = buildCategoryTopology(geoCountries.features, 0.3);
  const countriesFeatures = topoFeature(countriesTopology, countriesTopology.objects.features).features;
  const countryMatchName = (meta) => meta.geoName ?? meta.nameEn;
  // Re-pinning overwrites pinned-country-paths.json with a fresh main ring
  // derived from whatever the upstream source returns right now — a
  // deliberate one-time re-baseline (see rePinCountries' doc comment), NOT
  // something a routine regen (e.g. adding one new country) should trigger.
  // Gated behind an explicit opt-in so `node scripts/generate_geo_data.js`
  // leaves the frozen pins untouched by default.
  if (process.env.REPIN_COUNTRIES) {
    rePinCountries(COUNTRIES_METADATA, countriesFeatures, countryMatchName);
  }
  const countriesBorders = buildCategoryBorders(countriesTopology);
  const countriesResult = buildRegionModule({
    metadata: COUNTRIES_METADATA,
    simplifiedFeatures: countriesFeatures,
    categoryBorders: countriesBorders,
    exportName: 'countries',
    category: 'country',
    matchName: countryMatchName,
    outFile: 'src/data/countries.js',
    contextGetName: (f) => f.properties.name,
    contextGetIso2: (f) => {
      const raw = f.properties['ISO3166-1-Alpha-2'];
      if (raw && raw !== '-99') return raw;
      return ISO2_OVERRIDES[f.properties.name] || null;
    },
    regionsOutDir,
    precision: 4,
  });
  totalMissing += countriesResult.missing;
  allGeometryStats = allGeometryStats.concat(countriesResult.geometryStats);

  console.log('Fetching provinces (geoBoundaries TUR ADM1, FULL variant)...');
  // Try FULL first for maximum detail; its raw per-province point counts are
  // enormous (Muğla ~49k) so the quantile below is far more aggressive than
  // countries/states need, then fall back to the SIMPLIFIED release variant
  // if even that still blows the (province-scale) geometry budget — checked
  // against the province chunks alone, not the whole run's aggregate.
  const buildProvinces = async (url, quantileP) => {
    const geoProvinces = await fetchJson(url);
    const provincesTopology = buildCategoryTopology(geoProvinces.features, quantileP);
    const provincesFeatures = topoFeature(provincesTopology, provincesTopology.objects.features).features;
    const provincesBorders = buildCategoryBorders(provincesTopology);
    return buildRegionModule({
      metadata: PROVINCES_METADATA,
      simplifiedFeatures: provincesFeatures,
      categoryBorders: provincesBorders,
      exportName: 'turkeyProvinces',
      category: 'province',
      matchName: (meta) => meta.geoName ?? meta.name,
      outFile: 'src/data/turkey-provinces.js',
      // Provinces' context is other Turkish provinces only — a bordering
      // country (e.g. Greece/Bulgaria near Edirne) is a real upstream source
      // ADDED to the picture, not just clip/label plumbing; left out of this
      // pass, called out explicitly in the report rather than folded in silently.
      contextGetName: (f) => f.properties.shapeName,
      regionsOutDir,
      precision: 5,
    });
  };
  let provincesResult = await buildProvinces(TURKEY_PROVINCES_URL_FULL, 0.05);
  const maxProvinceChunk = Math.max(...provincesResult.geometryStats.map((s) => s.gzipBytes));
  if (maxProvinceChunk > GEOMETRY_BUDGET_BYTES) {
    console.log(`FULL variant's largest province chunk (${(maxProvinceChunk / 1024).toFixed(1)}kB) exceeds budget — falling back to the SIMPLIFIED release variant...`);
    provincesResult = await buildProvinces(TURKEY_PROVINCES_URL_SIMPLIFIED, 0.3);
  }
  totalMissing += provincesResult.missing;
  allGeometryStats = allGeometryStats.concat(provincesResult.geometryStats);

  console.log('Fetching US states (NE 10m admin-1)...');
  const geoStatesRaw = await fetchJson(US_STATES_URL);
  // The source is ALL admin-1 units worldwide — filter to the US before
  // building a topology, both so context stays purely other US states and
  // so we're not building a shared topology across ~4,600 world features.
  const geoStates = { features: geoStatesRaw.features.filter((f) => f.properties.iso_a2 === 'US') };
  const statesTopology = buildCategoryTopology(geoStates.features, 0.6);
  const statesFeatures = topoFeature(statesTopology, statesTopology.objects.features).features;
  const statesBorders = buildCategoryBorders(statesTopology);
  const statesResult = buildRegionModule({
    metadata: US_STATES_METADATA,
    simplifiedFeatures: statesFeatures,
    categoryBorders: statesBorders,
    exportName: 'usStates',
    category: 'state',
    matchName: (meta) => meta.geoName ?? meta.nameEn,
    outFile: 'src/data/us-states.js',
    contextGetName: (f) => f.properties.name,
    regionsOutDir,
    precision: 5,
  });
  totalMissing += statesResult.missing;
  allGeometryStats = allGeometryStats.concat(statesResult.geometryStats);

  const sizes = allGeometryStats.map((s) => s.gzipBytes).sort((a, b) => a - b);
  const total = sizes.reduce((a, b) => a + b, 0);
  const median = sizes[Math.floor(sizes.length / 2)];
  console.log(
    `\nPer-region geometry chunks: ${sizes.length} — `
    + `min ${(sizes[0] / 1024).toFixed(1)}kB, median ${(median / 1024).toFixed(1)}kB, `
    + `max ${(sizes[sizes.length - 1] / 1024).toFixed(1)}kB gzip, total ${(total / 1024).toFixed(1)}kB gzip.`
  );
  const overBudget = allGeometryStats.filter((s) => {
    const budget = PER_ID_BUDGET_BYTES[s.id]
      ?? (LARGER_BUDGET_IDS.has(s.id) ? LARGER_GEOMETRY_BUDGET_BYTES : GEOMETRY_BUDGET_BYTES);
    return s.gzipBytes > budget;
  });
  if (overBudget.length > 0) {
    console.error(`WARNING: over the geometry gzip budget: ${overBudget.map((s) => `${s.id} (${(s.gzipBytes / 1024).toFixed(1)}kB)`).join(', ')}`);
    process.exitCode = 1;
  }

  if (totalMissing > 0) {
    console.error(`\n${totalMissing} region(s) could not be matched in their source GeoJSON — see WARNINGs above.`);
    process.exitCode = 1;
  }
}

// Only auto-run when executed directly (`node scripts/generate_geo_data.js`)
// — guarded so tests can import individual pure functions above (e.g.
// computeContextBox, clipRingToBox) without triggering a real network fetch.
if (import.meta.url === `file://${process.argv[1]}`) {
  generateData().catch(console.error);
}
