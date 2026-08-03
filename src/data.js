// The 1950 line: Slussen to Hökarängen, opened 1 October 1950.
// geo drives ALL simulation (ride time here in M0); dia drives render only.
// geo values are approximate for M0; verify against real data at M1.

export const LINE = {
  id: 'green-1950',
  color: '#2fa860',
  opened: 1950,
};

export const STATIONS = [
  { name: 'Slussen',            geo: [59.3200, 18.0720], dia: [6, 0] },
  { name: 'Medborgarplatsen',   geo: [59.3143, 18.0736], dia: [6, 1] },
  { name: 'Skanstull',          geo: [59.3078, 18.0763], dia: [6, 2] },
  { name: 'Gullmarsplan',       geo: [59.2990, 18.0800], dia: [7, 3] },
  { name: 'Skärmarbrink',       geo: [59.2952, 18.0902], dia: [8, 4] },
  { name: 'Blåsut',             geo: [59.2896, 18.0885], dia: [8, 5] },
  { name: 'Sandsborg',          geo: [59.2843, 18.0925], dia: [8, 6] },
  { name: 'Skogskyrkogården',   geo: [59.2795, 18.0954], dia: [8, 7] },
  { name: 'Tallkrogen',         geo: [59.2710, 18.0865], dia: [7, 8] },
  { name: 'Gubbängen',          geo: [59.2628, 18.0817], dia: [7, 9] },
  { name: 'Hökarängen',         geo: [59.2570, 18.0824], dia: [7, 10] },
];

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
