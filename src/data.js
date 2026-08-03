// Anchors: the real 1950 line, Slussen to Hökarängen (opened 1 October 1950).
// Anchors are "logical spots": snapping a new station to one gives the real name
// and full demand. geo drives ALL simulation; dia is retained for a future
// schematic view. geo values are approximate for M0; verify at M1.

export const LINE = {
  id: 'green-1950',
  color: '#2fa860',
  opened: 1950,
};

// The game starts with the first three anchors built.
export const START_BUILT = 3;

export const ANCHORS = [
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

// Water rings, hand-authored in geo space. COST LOGIC ONLY (a segment crossing
// one pays the bridge/tunnel multiplier) plus the offline-fallback background;
// the visible water comes from the basemap tiles. Approximate bands for M0.
export const WATER = [
  { // Saltsjön / Söderström, north of Slussen
    label: 'Saltsjön',
    ring: [[59.3300, 18.0400], [59.3300, 18.1500], [59.3222, 18.1500], [59.3222, 18.0400]],
  },
  { // Hammarby sjö / kanal, between Skanstull and Gullmarsplan
    label: 'Hammarby sjö',
    ring: [[59.3046, 18.0400], [59.3046, 18.1500], [59.3008, 18.1500], [59.3008, 18.0400]],
  },
];

// The pull northward: T-Centralen is on the far side of the water, era 1957.
export const TEASE = {
  from: [59.3200, 18.0720],
  to: [59.3292, 18.0703],
  label: 'mot T-Centralen · 1957',
  labelAt: [59.3278, 18.0730],
};

const KM_PER_DEG_LAT = 111.32;

export function kmBetween(a, b) {
  const meanLat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const dLat = (b[0] - a[0]) * KM_PER_DEG_LAT;
  const dLon = (b[1] - a[1]) * KM_PER_DEG_LAT * Math.cos(meanLat);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// Ray-cast point-in-ring test ([lat, lon] points).
export function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1];
    const yj = ring[j][0], xj = ring[j][1];
    if (((yi > pt[0]) !== (yj > pt[0])) &&
        (pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Does the segment a-b cross water? Sampled test against the authored rings.
export function crossesWater(a, b) {
  for (let f = 0; f <= 1; f += 0.05) {
    const pt = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    for (const w of WATER) if (inRing(pt, w.ring)) return true;
  }
  return false;
}
