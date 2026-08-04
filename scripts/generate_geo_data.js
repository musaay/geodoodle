import fs from 'fs';
import https from 'https';

const COUNTRIES_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';
const TURKEY_PROVINCES_URL = 'https://raw.githubusercontent.com/cihadturhan/tr-geojson/master/geo/tr-cities-utf8.json';

const COUNTRIES_METADATA = [
  { id: 'turkey', name: 'Türkiye', nameEn: 'Turkey', difficulty: 'easy', funFact: 'İki kıtada yer alan tek ülke!' },
  { id: 'italy', name: 'İtalya', nameEn: 'Italy', difficulty: 'easy', funFact: 'Haritada çizme şekline sahip olduğu için çok kolay tanınır.' },
  { id: 'japan', name: 'Japonya', nameEn: 'Japan', difficulty: 'easy', funFact: '6.852 adadan oluşur ancak genelde 4 ana adası çizilir.' },
  { id: 'brazil', name: 'Brezilya', nameEn: 'Brazil', difficulty: 'easy', funFact: 'Güney Amerika kıtasının neredeyse yarısını kaplar!' },
  { id: 'australia', name: 'Avustralya', nameEn: 'Australia', difficulty: 'easy', funFact: 'Hem bir ülke hem de bir kıtadır!' },
  { id: 'france', name: 'Fransa', nameEn: 'France', difficulty: 'medium', funFact: 'Altıgen (L\'Hexagone) şekliyle bilinir.' },
  { id: 'germany', name: 'Almanya', nameEn: 'Germany', difficulty: 'medium', funFact: 'Üçte biri hala ormanlarla kaplıdır!' },
  { id: 'egypt', name: 'Mısır', nameEn: 'Egypt', difficulty: 'medium', funFact: 'Sınırları neredeyse tamamen düz çizgilerden oluşur!' },
  { id: 'india', name: 'Hindistan', nameEn: 'India', difficulty: 'medium', funFact: 'Ters bir üçgene benzeyen devasa bir yarımadadır.' },
  { id: 'spain', name: 'İspanya', nameEn: 'Spain', difficulty: 'medium', funFact: 'İber Yarımadası\'nın %85\'ini kaplar.' },
  { id: 'romania', name: 'Romanya', nameEn: 'Romania', difficulty: 'hard', funFact: 'Karadeniz\'e kıyısı olan yuvarlakımsı bir ülkedir.' },
  { id: 'bulgaria', name: 'Bulgaristan', nameEn: 'Bulgaria', difficulty: 'hard', funFact: 'Balkan Dağları ülkeyi tam ortadan ikiye böler.' },
  { id: 'hungary', name: 'Macaristan', nameEn: 'Hungary', difficulty: 'hard', funFact: 'Tuna nehri ülkeyi ikiye ayırır.' },
  { id: 'poland', name: 'Polonya', nameEn: 'Poland', difficulty: 'hard', funFact: 'Neredeyse kusursuz bir altıgene benzer.' },
  { id: 'czechia', name: 'Çekya', nameEn: 'Czechia', difficulty: 'hard', funFact: 'Tamamen karayla çevrili bir Orta Avrupa ülkesidir.' }
];

const PROVINCES_METADATA = [
  { id: 'istanbul', name: 'İstanbul', nameEn: 'Istanbul', difficulty: 'easy', funFact: 'Asya ve Avrupa\'yı birbirine bağlayan efsanevi şehir!' },
  { id: 'ankara', name: 'Ankara', nameEn: 'Ankara', difficulty: 'easy', funFact: 'Türkiye\'nin kalbi ve başkenti.' },
  { id: 'antalya', name: 'Antalya', nameEn: 'Antalya', difficulty: 'easy', funFact: 'Türkiye\'nin turizm başkenti, upuzun bir sahile sahip.' },
  { id: 'izmir', name: 'İzmir', nameEn: 'Izmir', difficulty: 'easy', funFact: 'Ege\'nin incisi, kordonuyla meşhur!' },
  { id: 'konya', name: 'Konya', nameEn: 'Konya', difficulty: 'easy', funFact: 'Türkiye\'nin yüzölçümü en büyük ilidir!' },
  { id: 'trabzon', name: 'Trabzon', nameEn: 'Trabzon', difficulty: 'easy', funFact: 'Karadeniz\'in hırçın dalgalarına kıyısı var.' },
  { id: 'hatay', name: 'Hatay', nameEn: 'Hatay', difficulty: 'easy', funFact: 'Akdeniz\'in en güney ucunda ince uzun bir şekle sahip.' },
  { id: 'van', name: 'Van', nameEn: 'Van', difficulty: 'easy', funFact: 'Türkiye\'nin en büyük gölüne ev sahipliği yapar.' },
  { id: 'bursa', name: 'Bursa', nameEn: 'Bursa', difficulty: 'medium', funFact: 'Uludağ\'ın eteklerinde tarihi bir şehir.' },
  { id: 'adana', name: 'Adana', nameEn: 'Adana', difficulty: 'medium', funFact: 'Kebabıyla meşhur, Çukurova\'nın kalbi.' },
  { id: 'samsun', name: 'Samsun', nameEn: 'Samsun', difficulty: 'medium', funFact: 'Milli Mücadelenin başladığı şehir.' },
  { id: 'erzurum', name: 'Erzurum', nameEn: 'Erzurum', difficulty: 'medium', funFact: 'Palandöken dağlarıyla kış turizminin gözdesi.' },
  { id: 'diyarbakir', name: 'Diyarbakır', nameEn: 'Diyarbakir', difficulty: 'medium', funFact: 'Tarihi surları uzaydan bile görülebilir.' },
  { id: 'mugla', name: 'Muğla', nameEn: 'Mugla', difficulty: 'medium', funFact: 'Türkiye\'nin en uzun sahil şeridine sahip.' },
  { id: 'kayseri', name: 'Kayseri', nameEn: 'Kayseri', difficulty: 'medium', funFact: 'Erciyes dağının gölgesinde ticaretiyle ünlü.' },
  { id: 'bolu', name: 'Bolu', nameEn: 'Bolu', difficulty: 'hard', funFact: 'Yedigöller\'i ve aşçılarıyla bilinir.' },
  { id: 'tokat', name: 'Tokat', nameEn: 'Tokat', difficulty: 'hard', funFact: 'Tarihi konakları ve yaprak sarması meşhurdur.' },
  { id: 'kirsehir', name: 'Kırşehir', nameEn: 'Kirsehir', difficulty: 'hard', funFact: 'Neşet Ertaş\'ın memleketi, bozkırın tezenesi.' },
  { id: 'sinop', name: 'Sinop', nameEn: 'Sinop', difficulty: 'hard', funFact: 'Türkiye\'nin en kuzey noktası İnceburun buradadır.' },
  { id: 'burdur', name: 'Burdur', nameEn: 'Burdur', difficulty: 'hard', funFact: 'Salda Gölü ile Türkiye\'nin Maldivleri\'ne ev sahipliği yapar.' }
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

function extractPolygon(feature, epsilon = 0.5) {
  if (!feature) return [];
  
  let coords = feature.geometry.coordinates;
  if (feature.geometry.type === 'MultiPolygon') {
    let largest = coords[0];
    for (let poly of coords) {
      if (poly[0].length > largest[0].length) largest = poly;
    }
    coords = largest;
  }
  
  let outerRing = coords[0];
  let mapped = outerRing.map(pt => [pt[0], -pt[1]]);
  let simplified = douglasPeucker(mapped, epsilon);
  return simplified.map(pt => [Math.round(pt[0] * 100) / 100, Math.round(pt[1] * 100) / 100]);
}

async function generateData() {
  console.log('Fetching countries...');
  const geoCountries = await fetchJson(COUNTRIES_URL);
  
  let countriesOutput = 'export const countries = [\n';
  
  for (const meta of COUNTRIES_METADATA) {
    const feature = geoCountries.features.find(f => f.properties.name === meta.nameEn);
    if (!feature) {
      console.warn(`WARNING: Could not find ${meta.nameEn} in GeoJSON!`);
      continue;
    }
    const path = extractPolygon(feature, 0.05);
    countriesOutput += `  {
    id: '${meta.id}',
    name: '${meta.name}',
    nameEn: '${meta.nameEn}',
    difficulty: '${meta.difficulty}',
    category: 'country',
    funFact: '${meta.funFact.replace(/'/g, "\\'")}',
    path: ${JSON.stringify(path)}
  },\n`;
  }
  countriesOutput += '];\n';
  fs.writeFileSync('src/data/countries.js', countriesOutput, 'utf-8');
  console.log('Updated src/data/countries.js');

  console.log('Fetching provinces...');
  const geoProvinces = await fetchJson(TURKEY_PROVINCES_URL);
  
  let provincesOutput = 'export const turkeyProvinces = [\n';
  
  for (const meta of PROVINCES_METADATA) {
    const feature = geoProvinces.features.find(f => f.properties.name === meta.name);
    if (!feature) {
      console.warn(`WARNING: Could not find ${meta.name} in GeoJSON!`);
      continue;
    }
    const path = extractPolygon(feature, 0.005);
    provincesOutput += `  {
    id: '${meta.id}',
    name: '${meta.name}',
    nameEn: '${meta.nameEn}',
    difficulty: '${meta.difficulty}',
    category: 'province',
    funFact: '${meta.funFact.replace(/'/g, "\\'")}',
    path: ${JSON.stringify(path)}
  },\n`;
  }
  provincesOutput += '];\n';
  fs.writeFileSync('src/data/turkey-provinces.js', provincesOutput, 'utf-8');
  console.log('Updated src/data/turkey-provinces.js');
}

generateData().catch(console.error);
