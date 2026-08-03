// The 1950 line: Slussen to Hökarängen, opened 1 October 1950.
// geo drives ALL simulation and the top-down map render; dia is retained for a
// future schematic diagram view. geo values are approximate for M0; verify at M1.

export const LINE = {
  id: 'green-1950',
  color: '#2fa860',
  opened: 1950,
};

// The game starts with this many stations built (Slussen, Medborgarplatsen, Skanstull).
export const START_BUILT = 3;

// ext = cost to extend the line to this station.
export const STATIONS = [
  { name: 'Slussen',            geo: [59.3200, 18.0720], dia: [6, 0] },
  { name: 'Medborgarplatsen',   geo: [59.3143, 18.0736], dia: [6, 1] },
  { name: 'Skanstull',          geo: [59.3078, 18.0763], dia: [6, 2] },
  { name: 'Gullmarsplan',       geo: [59.2990, 18.0800], dia: [7, 3],
    ext: { cost: 320, note: 'Crosses Hammarby kanal on Skanstullsbron.' } },
  { name: 'Skärmarbrink',       geo: [59.2952, 18.0902], dia: [8, 4],  ext: { cost: 430 } },
  { name: 'Blåsut',             geo: [59.2896, 18.0885], dia: [8, 5],  ext: { cost: 580 } },
  { name: 'Sandsborg',          geo: [59.2843, 18.0925], dia: [8, 6],  ext: { cost: 800 } },
  { name: 'Skogskyrkogården',   geo: [59.2795, 18.0954], dia: [8, 7],  ext: { cost: 1100 } },
  { name: 'Tallkrogen',         geo: [59.2710, 18.0865], dia: [7, 8],  ext: { cost: 1500 } },
  { name: 'Gubbängen',          geo: [59.2628, 18.0817], dia: [7, 9],  ext: { cost: 2050 } },
  { name: 'Hökarängen',         geo: [59.2570, 18.0824], dia: [7, 10], ext: { cost: 2800 } },
];

// Stylized water, hand-authored in geo space (no map tiles, plan §3/§7).
// Each polygon is a ring of [lat, lon] points.
export const WATER = [
  { // Saltsjön / Söderström, north of Slussen
    label: 'Saltsjön', labelAt: [59.3262, 18.0615],
    ring: [[59.3300, 18.0400], [59.3300, 18.1500], [59.3222, 18.1500], [59.3222, 18.0400]],
  },
  { // Hammarby sjö / kanal, between Skanstull and Gullmarsplan
    label: 'Hammarby sjö', labelAt: [59.3030, 18.0960],
    ring: [[59.3046, 18.0400], [59.3046, 18.1500], [59.3008, 18.1500], [59.3008, 18.0400]],
  },
];

// The pull northward: T-Centralen is on the far side of the water, era 1957.
export const TEASE = {
  from: 0, // station index the dashed stub leaves from
  to: [59.3292, 18.0703],
  label: 'mot T-Centralen · 1957',
  labelAt: [59.3278, 18.0730],
};

const KM_PER_DEG_LAT = 111.32;

function kmBetween(a, b) {
  const meanLat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const dLat = (b[0] - a[0]) * KM_PER_DEG_LAT;
  const dLon = (b[1] - a[1]) * KM_PER_DEG_LAT * Math.cos(meanLat);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// SEG_KM[i] is the distance from station i to station i+1.
export const SEG_KM = STATIONS.slice(0, -1).map((s, i) => kmBetween(s.geo, STATIONS[i + 1].geo));

export const LINE_KM = SEG_KM.reduce((a, b) => a + b, 0);
