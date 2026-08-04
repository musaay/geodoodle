const fs = require('fs');
const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Node.js' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

const TARGET_COUNTRIES = [
  'Turkey', 'Italy', 'Japan', 'Brazil', 'Australia', 'France', 'Germany', 
  'Egypt', 'India', 'Spain', 'Romania', 'Bulgaria', 'Hungary', 'Poland', 'Czechia' // Note: 'Czech Republic' might be the name in geojson
];

async function main() {
  console.log('Fetching high-res countries...');
  // 1:50m scale from Natural Earth (converted to GeoJSON)
  // We can use a popular GitHub CDN for this
  const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
  
  try {
    const geojson = await fetchJson(url);
    console.log('Total features:', geojson.features.length);
    
    for (const name of TARGET_COUNTRIES) {
        let f = geojson.features.find(f => 
            f.properties.ADMIN === name || 
            f.properties.NAME === name || 
            f.properties.NAME_LONG === name ||
            (name === 'Czechia' && f.properties.ADMIN === 'Czechia')
        );
        if (f) {
            let pts = 0;
            if (f.geometry.type === 'Polygon') {
                pts = f.geometry.coordinates[0].length;
            } else if (f.geometry.type === 'MultiPolygon') {
                for (let p of f.geometry.coordinates) {
                    pts += p[0].length;
                }
            }
            console.log(`Found ${name} - Points: ${pts}`);
        } else {
            console.log(`NOT FOUND: ${name}`);
        }
    }
  } catch (e) {
    console.error(e);
  }
}

main();
