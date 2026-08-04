// Anchors: the real 1950 line, Slussen to Hökarängen (opened 1 October 1950).
// Anchors are "logical spots": snapping a new station to one gives the real name
// and full demand. geo drives ALL simulation; dia is retained for a future
// schematic view. geo values are approximate for M0; verify at M1.

export const LINE = {
  id: 'green-1950',
  color: '#35a86b', // --tb-net-green
  opened: 1950,
};

// The game starts with the first three anchors built.
export const START_BUILT = 3;

export const ANCHORS = [
  // The hub. Historically the tunnelbana reached T-Centralen in 1957, but the
  // game starts here by owner ruling (2026-08-03): the network grows out from
  // the centre, and gameplay clarity beats strict chronology on this one.
  { name: 'T-Centralen',        geo: [59.3312, 18.0619], dia: [5, -2], hub: true },
  { name: 'Gamla stan',         geo: [59.3232, 18.0672], dia: [6, -1] },
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
  { // Norrström / Riddarfjärden, between T-Centralen and Gamla stan
    label: 'Riddarfjärden',
    ring: [[59.3288, 18.0400], [59.3288, 18.1500], [59.3250, 18.1500], [59.3250, 18.0400]],
  },
  { // Söderström, between Gamla stan and Slussen
    label: 'Söderström',
    ring: [[59.3226, 18.0400], [59.3226, 18.1500], [59.3210, 18.1500], [59.3210, 18.0400]],
  },
  { // Hammarby sjö / kanal, between Skanstull and Gullmarsplan
    label: 'Hammarby sjö',
    ring: [[59.3046, 18.0400], [59.3046, 18.1500], [59.3008, 18.1500], [59.3008, 18.0400]],
  },
];

// The pull outward from the hub: the 1952 line toward Vällingby is next.
export const TEASE = {
  from: [59.3312, 18.0619],
  to: [59.3345, 18.0525],
  label: 'mot Hötorget · 1952',
  labelAt: [59.3352, 18.0540],
};

// Authored population-density blobs: the first cut of the density field. A free
// spot's demand multiplier comes from the strongest blob at that point (anchors
// stay 1.0). Weights are hand-guessed for M0; SCB data replaces them at M1.
export const DISTRICTS = [
  { name: 'Södermalm',      geo: [59.3140, 18.0700], rKm: 1.2, w: 0.90 },
  { name: 'Gamla stan',     geo: [59.3250, 18.0710], rKm: 0.4, w: 0.70 },
  { name: 'Norrmalm',       geo: [59.3320, 18.0630], rKm: 1.0, w: 0.95 },
  { name: 'Kungsholmen',    geo: [59.3310, 18.0290], rKm: 1.0, w: 0.80 },
  { name: 'Årsta',          geo: [59.2980, 18.0490], rKm: 0.9, w: 0.60 },
  { name: 'Johanneshov',    geo: [59.2970, 18.0780], rKm: 0.7, w: 0.70 },
  { name: 'Hammarbyhöjden', geo: [59.2950, 18.1050], rKm: 0.8, w: 0.60 },
  { name: 'Enskede',        geo: [59.2850, 18.0750], rKm: 1.0, w: 0.55 },
  { name: 'Björkhagen',     geo: [59.2910, 18.1160], rKm: 0.7, w: 0.55 },
  { name: 'Bandhagen',      geo: [59.2700, 18.0490], rKm: 0.8, w: 0.50 },
  { name: 'Älvsjö',         geo: [59.2780, 17.9960], rKm: 0.9, w: 0.55 },
  { name: 'Sköndal',        geo: [59.2530, 18.1080], rKm: 0.8, w: 0.50 },
  { name: 'Farsta',         geo: [59.2430, 18.0930], rKm: 1.0, w: 0.60 },
];

const DENSITY_FLOOR = 0.35;
const DENSITY_CAP = 0.95; // anchors (1.0) always beat free spots

// Demand multiplier + district name for a free spot at geo.
export function densityAt(geo) {
  let mult = DENSITY_FLOOR;
  let district = null;
  let best = -1;
  for (const d of DISTRICTS) {
    const dist = kmBetween(geo, d.geo);
    if (dist > d.rKm * 1.4) continue;
    const score = d.w * Math.max(0, 1 - (dist / d.rKm) ** 2);
    if (score > best) {
      best = score;
      district = d.name; // the strongest blob names the place, even at its edge
    }
    if (score > mult) mult = score;
  }
  return { mult: Math.min(DENSITY_CAP, Math.round(mult * 100) / 100), district };
}

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
