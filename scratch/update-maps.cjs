const fs = require('fs');
const https = require('https');
const path = require('path');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

// Current metadata from countries.js
const currentCountries = [
  { id: 'turkey', name: 'Türkiye', nameEn: 'Turkey', difficulty: 'easy', category: 'country', funFact: 'İki kıtada yer alan tek ülke!' },
  { id: 'italy', name: 'İtalya', nameEn: 'Italy', difficulty: 'easy', category: 'country', funFact: 'Haritada çizme şekline sahip olduğu için çok kolay tanınır.' },
  { id: 'japan', name: 'Japonya', nameEn: 'Japan', difficulty: 'easy', category: 'country', funFact: '6.852 adadan oluşur ancak genelde 4 ana adası çizilir.' },
  { id: 'brazil', name: 'Brezilya', nameEn: 'Brazil', difficulty: 'easy', category: 'country', funFact: 'Güney Amerika kıtasının neredeyse yarısını kaplar!' },
  { id: 'australia', name: 'Avustralya', nameEn: 'Australia', difficulty: 'easy', category: 'country', funFact: 'Hem bir ülke hem de bir kıtadır.' },
  { id: 'france', name: 'Fransa', nameEn: 'France', difficulty: 'medium', category: 'country', funFact: 'Altıgen (L\'Hexagone) şekliyle bilinir.' },
  { id: 'germany', name: 'Almanya', nameEn: 'Germany', difficulty: 'medium', category: 'country', funFact: '9 komşusu ile Avrupa\'da en çok komşusu olan ülkelerden biridir.' },
  { id: 'egypt', name: 'Mısır', nameEn: 'Egypt', difficulty: 'medium', category: 'country', funFact: 'Sınırlarının çoğu düz cetvel ile çizilmiş gibidir.' },
  { id: 'india', name: 'Hindistan', nameEn: 'India', difficulty: 'medium', category: 'country', funFact: 'Dünyanın en büyük yarımadalarından biridir.' },
  { id: 'spain', name: 'İspanya', nameEn: 'Spain', difficulty: 'medium', category: 'country', funFact: 'İber yarımadasının büyük bölümünü oluşturur.' },
  { id: 'romania', name: 'Romanya', nameEn: 'Romania', difficulty: 'hard', category: 'country', funFact: 'Karadeniz\'e kıyısı olan bir Balkan ülkesidir.' },
  { id: 'bulgaria', name: 'Bulgaristan', nameEn: 'Bulgaria', difficulty: 'hard', category: 'country', funFact: 'Türkiye\'nin kuzeybatı komşusudur.' },
  { id: 'hungary', name: 'Macaristan', nameEn: 'Hungary', difficulty: 'hard', category: 'country', funFact: 'Denize kıyısı olmayan bir Orta Avrupa ülkesidir.' },
  { id: 'poland', name: 'Polonya', nameEn: 'Poland', difficulty: 'hard', category: 'country', funFact: 'Avrupa\'nın kalbinde yer alır.' },
  { id: 'czechia', name: 'Çekya', nameEn: 'Czechia', difficulty: 'hard', category: 'country', funFact: 'Tarihi Bohemya, Moravya ve Silezya bölgelerinden oluşur.' }
];

async function main() {
  console.log('Fetching high-res countries...');
  const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
  
  try {
    const geojson = await fetchJson(url);
    const updatedCountries = [];

    for (const c of currentCountries) {
        let name = c.nameEn;
        let f = geojson.features.find(f => 
            f.properties.ADMIN === name || 
            f.properties.NAME === name || 
            f.properties.NAME_LONG === name ||
            (name === 'Czechia' && f.properties.ADMIN === 'Czechia')
        );
        
        let pathData = [];
        if (f) {
            let coords = f.geometry.coordinates;
            if (f.geometry.type === 'MultiPolygon') {
                // Get all outer rings and sort by number of points (descending)
                let polys = coords.map(c => c[0]).sort((a, b) => b.length - a.length);
                
                // Keep top N largest polygons (e.g., up to 4 for Japan, 2 for Turkey)
                let numToKeep = polys.length;
                if (name === 'Japan') numToKeep = Math.min(4, polys.length);
                else if (name === 'Italy') numToKeep = Math.min(3, polys.length);
                else numToKeep = Math.min(3, polys.length); // default keep up to 3 largest islands
                
                let merged = polys[0];
                for (let k = 1; k < numToKeep; k++) {
                    let poly2 = polys[k];
                    // Find closest points between merged and poly2
                    let minDist = Infinity;
                    let minI = 0, minJ = 0;
                    for (let i = 0; i < merged.length; i++) {
                        for (let j = 0; j < poly2.length; j++) {
                            let d = Math.pow(merged[i][0] - poly2[j][0], 2) + Math.pow(merged[i][1] - poly2[j][1], 2);
                            if (d < minDist) {
                                minDist = d;
                                minI = i;
                                minJ = j;
                            }
                        }
                    }
                    // Shift poly2 so it starts and ends at minJ
                    let poly2Shifted = poly2.slice(minJ).concat(poly2.slice(0, minJ + 1));
                    // Insert poly2 into merged at minI
                    merged = merged.slice(0, minI + 1).concat(poly2Shifted).concat(merged.slice(minI));
                }
                coords = [merged];
            }
            
            // outer ring
            // Negate latitude (pt[1]) because Canvas Y increases downwards, while Latitude increases upwards
            pathData = coords[0].map(pt => [Number(pt[0].toFixed(2)), Number((-pt[1]).toFixed(2))]);
        } else {
            console.log(`NOT FOUND: ${name}`);
        }
        
        updatedCountries.push({
            ...c,
            path: pathData
        });
    }

    let fileContent = `export const countries = [\n`;
    for (let i = 0; i < updatedCountries.length; i++) {
        const c = updatedCountries[i];
        fileContent += `  {\n`;
        fileContent += `    id: '${c.id}',\n`;
        fileContent += `    name: '${c.name}',\n`;
        fileContent += `    nameEn: '${c.nameEn}',\n`;
        fileContent += `    difficulty: '${c.difficulty}',\n`;
        fileContent += `    category: '${c.category}',\n`;
        fileContent += `    funFact: '${c.funFact.replace(/'/g, "\\'")}',\n`;
        fileContent += `    path: ${JSON.stringify(c.path)}\n`;
        fileContent += `  }${i < updatedCountries.length - 1 ? ',' : ''}\n`;
    }
    fileContent += `];\n`;

    const outPath = path.join(__dirname, '..', 'src', 'data', 'countries.js');
    fs.writeFileSync(outPath, fileContent);
    console.log('Successfully updated src/data/countries.js');
  } catch (e) {
    console.error(e);
  }
}

main();
