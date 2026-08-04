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
  // The 1952 Västerort line, Hötorget toward Vällingby (unlocked by megaproject).
  { name: 'Hötorget',           geo: [59.3355, 18.0635], dia: [4, -3] },
  { name: 'Rådmansgatan',       geo: [59.3405, 18.0590], dia: [3, -4] },
  { name: 'Odenplan',           geo: [59.3428, 18.0496], dia: [2, -5] },
  { name: 'S:t Eriksplan',      geo: [59.3395, 18.0370], dia: [1, -5] },
  { name: 'Fridhemsplan',       geo: [59.3322, 18.0290], dia: [0, -4] },
  { name: 'Kristineberg',       geo: [59.3330, 18.0030], dia: [-1, -4] },
  { name: 'Alvik',              geo: [59.3335, 17.9800], dia: [-2, -4] },
  { name: 'Stora mossen',       geo: [59.3345, 17.9663], dia: [-3, -4] },
  { name: 'Abrahamsberg',       geo: [59.3364, 17.9530], dia: [-4, -4] },
  { name: 'Åkeshov',            geo: [59.3419, 17.9247], dia: [-5, -5] },
  { name: 'Islandstorget',      geo: [59.3462, 17.8927], dia: [-6, -6] },
  { name: 'Blackeberg',         geo: [59.3482, 17.8823], dia: [-7, -6] },
  { name: 'Råcksta',            geo: [59.3546, 17.8817], dia: [-7, -7] },
  { name: 'Vällingby',          geo: [59.3634, 17.8722], dia: [-8, -8] },
  // Röda linjen, opened 5 April 1964: T-Centralen toward Fruängen via
  // Liljeholmen. The trunk stations it shared (T-Centralen, Gamla stan,
  // Slussen) already exist as anchors: threading through them is the
  // junction mechanic's job, the corridor holds only the NEW ground.
  // Coordinates from stations.geojson (the SL station DB). Indices 27-35.
  { name: 'Mariatorget',        geo: [59.3167, 18.0619], dia: [5, 1] },
  { name: 'Zinkensdamm',        geo: [59.3178, 18.0496], dia: [4, 1] },
  { name: 'Hornstull',          geo: [59.3160, 18.0354], dia: [3, 1] },
  { name: 'Liljeholmen',        geo: [59.3106, 18.0248], dia: [2, 2] },
  { name: 'Midsommarkransen',   geo: [59.3021, 18.0115], dia: [1, 3] },
  { name: 'Telefonplan',        geo: [59.2983, 17.9973], dia: [0, 4] },
  { name: 'Hägerstensåsen',     geo: [59.2951, 17.9785], dia: [-1, 5] },
  { name: 'Västertorp',         geo: [59.2913, 17.9668], dia: [-2, 6] },
  { name: 'Fruängen',           geo: [59.2865, 17.9650], dia: [-2, 7] },
  // The Örnsberg arm (1964), branching at Liljeholmen. Indices 36-37.
  { name: 'Aspudden',           geo: [59.3067, 18.0018], dia: [1, 2] },
  { name: 'Örnsberg',           geo: [59.3055, 17.9891], dia: [0, 2] },
  // The northeast arm toward Ropsten (1965-67, same era). Indices 38-41.
  { name: 'Östermalmstorg',     geo: [59.3349, 18.0764], dia: [6, -3] },
  { name: 'Karlaplan',          geo: [59.3392, 18.0915], dia: [7, -4] },
  { name: 'Gärdet',             geo: [59.3453, 18.0986], dia: [8, -5] },
  { name: 'Ropsten',            geo: [59.3573, 18.1025], dia: [9, -6] },
  // Blå linjen, opened 31 August 1975: T-Centralen toward Hjulsta over
  // Järvafältet. Fridhemsplan (already an anchor) is the natural junction.
  // Indices 42-52.
  { name: 'Rådhuset',           geo: [59.3300, 18.0450], dia: [4, -2] },
  { name: 'Stadshagen',         geo: [59.3375, 18.0157], dia: [3, -3] },
  { name: 'Västra skogen',      geo: [59.3479, 18.0031], dia: [2, -4] },
  { name: 'Huvudsta',           geo: [59.3497, 17.9869], dia: [1, -4] },
  { name: 'Solna strand',       geo: [59.3547, 17.9733], dia: [0, -5] },
  { name: 'Sundbybergs centrum', geo: [59.3608, 17.9704], dia: [-1, -6] },
  { name: 'Duvbo',              geo: [59.3680, 17.9628], dia: [-2, -7] },
  { name: 'Rissne',             geo: [59.3760, 17.9398], dia: [-3, -8] },
  { name: 'Rinkeby',            geo: [59.3882, 17.9281], dia: [-4, -9] },
  { name: 'Tensta',             geo: [59.3941, 17.9025], dia: [-5, -10] },
  { name: 'Hjulsta',            geo: [59.3966, 17.8887], dia: [-6, -11] },
  // The Akalla arm (1977), branching at Västra skogen. Kymlinge, the ghost
  // station, is deliberately absent (delight backlog). Indices 53-58.
  { name: 'Solna centrum',      geo: [59.3614, 17.9963], dia: [1, -6] },
  { name: 'Näckrosen',          geo: [59.3674, 17.9819], dia: [0, -7] },
  { name: 'Hallonbergen',       geo: [59.3745, 17.9694], dia: [-1, -8] },
  { name: 'Kista',              geo: [59.4030, 17.9429], dia: [-2, -10] },
  { name: 'Husby',              geo: [59.4095, 17.9265], dia: [-3, -11] },
  { name: 'Akalla',             geo: [59.4138, 17.9173], dia: [-4, -12] },
];

// Index of the anchor where the Västerort megaproject seeds its line.
export const WEST_FIRST = 13; // Hötorget

// Corridors: the campaign's spine (owner direction, 2026-08-04). Each is a
// contiguous ANCHORS range with the era that OPENS it (its first stake
// appears on the map when the era arrives; after that, one-ahead reveal
// walks it). A corridor may carry a tease: the dashed promise drawn until
// its first anchor is built. Eras gate WHERE THE CITY GROWS NEXT, never what
// the player may do.
export const CORRIDORS = [
  { id: 'green-south', name: 'Söderort',  opensIn: 1950, start: 0,  end: 13 },
  { id: 'green-west',  name: 'Västerort', opensIn: 1952, start: 13, end: 27,
    tease: {
      from: [59.3312, 18.0619],
      to: [59.3345, 18.0525],
      label: 'mot Hötorget · 1952',
      labelAt: [59.3352, 18.0540],
    } },
  { id: 'red-south',   name: 'Röda linjen', opensIn: 1964, start: 27, end: 36,
    tease: {
      from: [59.3200, 18.0720],   // Slussen: history turns west along Söder
      to: [59.3175, 18.0645],
      label: 'mot Fruängen · 1964',
      labelAt: [59.3162, 18.0570],
    } },
  { id: 'red-orn',     name: 'Örnsbergsgrenen', opensIn: 1964, start: 36, end: 38 },
  { id: 'red-ost',     name: 'Östermalm',   opensIn: 1964, start: 38, end: 42 },
  { id: 'blue-main',   name: 'Blå linjen',  opensIn: 1975, start: 42, end: 53,
    tease: {
      from: [59.3312, 18.0619],   // T-Centralen: the deep line digs northwest
      to: [59.3305, 18.0480],
      label: 'mot Hjulsta · 1975',
      labelAt: [59.3320, 18.0430],
    } },
  { id: 'blue-akalla', name: 'Akallagrenen', opensIn: 1975, start: 53, end: 59 },
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
  { // Strömmen / Saltsjön, the open bay east of Gamla stan and Slussen (owner
    // built a floating station here 2026-08-04; the bands above never covered
    // it). Crude like its siblings: it also blankets western Djurgården,
    // which has no tube station in reality either.
    label: 'Strömmen',
    ring: [[59.3310, 18.0790], [59.3310, 18.1500], [59.3200, 18.1500], [59.3200, 18.0790]],
  },
  { // Riddarfjärden proper, the open water west of Gamla stan (the band above
    // only covers the Norrström strip; the fjärd itself was buildable).
    label: 'Riddarfjärden väst',
    ring: [[59.3285, 18.0300], [59.3285, 18.0660], [59.3220, 18.0660], [59.3220, 18.0300]],
  },
  { // Hammarby sjö / kanal, between Skanstull and Gullmarsplan
    label: 'Hammarby sjö',
    ring: [[59.3046, 18.0400], [59.3046, 18.1500], [59.3008, 18.1500], [59.3008, 18.0400]],
  },
  { // Tranebergssund, between Kristineberg and Alvik (the 1952 bridge)
    label: 'Tranebergssund',
    ring: [[59.3360, 17.9860], [59.3360, 18.0000], [59.3310, 18.0000], [59.3310, 17.9860]],
  },
  { // Liljeholmsviken, between Hornstull and Liljeholmen (the red 1964 bridge)
    label: 'Liljeholmsviken',
    ring: [[59.3155, 18.0150], [59.3155, 18.0400], [59.3112, 18.0400], [59.3112, 18.0150]],
  },
  { // Bällstaviken, between Huvudsta and Solna strand (the blue line's water)
    label: 'Bällstaviken',
    ring: [[59.3560, 17.9760], [59.3560, 17.9830], [59.3490, 17.9830], [59.3490, 17.9760]],
  },
];

// (The old standalone TEASE moved into CORRIDORS: teases are per corridor now.)

// Authored population-density blobs: the first cut of the density field. A free
// spot's demand multiplier comes from the strongest blob at that point (anchors
// stay 1.0). Weights are hand-guessed for M0; SCB data replaces them at M1.
export const DISTRICTS = [
  { name: 'Södermalm',      geo: [59.3140, 18.0700], rKm: 1.2, w: 0.90 },
  { name: 'Gamla stan',     geo: [59.3250, 18.0710], rKm: 0.4, w: 0.70 },
  { name: 'Norrmalm',       geo: [59.3320, 18.0630], rKm: 1.0, w: 0.95 },
  { name: 'Kungsholmen',    geo: [59.3310, 18.0290], rKm: 1.0, w: 0.80 },
  { name: 'Vasastan',       geo: [59.3430, 18.0480], rKm: 0.9, w: 0.85 },
  { name: 'Bromma',         geo: [59.3350, 17.9700], rKm: 1.2, w: 0.60 },
  { name: 'Blackeberg',     geo: [59.3480, 17.8850], rKm: 0.8, w: 0.50 },
  { name: 'Vällingby',      geo: [59.3634, 17.8722], rKm: 1.0, w: 0.60 },
  { name: 'Årsta',          geo: [59.2980, 18.0490], rKm: 0.9, w: 0.60 },
  { name: 'Johanneshov',    geo: [59.2970, 18.0780], rKm: 0.7, w: 0.70 },
  { name: 'Hammarbyhöjden', geo: [59.2950, 18.1050], rKm: 0.8, w: 0.60 },
  { name: 'Enskede',        geo: [59.2850, 18.0750], rKm: 1.0, w: 0.55 },
  { name: 'Björkhagen',     geo: [59.2910, 18.1160], rKm: 0.7, w: 0.55 },
  { name: 'Bandhagen',      geo: [59.2700, 18.0490], rKm: 0.8, w: 0.50 },
  { name: 'Älvsjö',         geo: [59.2780, 17.9960], rKm: 0.9, w: 0.55 },
  { name: 'Sköndal',        geo: [59.2530, 18.1080], rKm: 0.8, w: 0.50 },
  { name: 'Farsta',         geo: [59.2430, 18.0930], rKm: 1.0, w: 0.60 },
  // Röda linjen country (1964 era).
  { name: 'Hornstull',      geo: [59.3155, 18.0340], rKm: 0.8, w: 0.75 },
  { name: 'Liljeholmen',    geo: [59.3100, 18.0230], rKm: 0.9, w: 0.70 },
  { name: 'Aspudden',       geo: [59.3060, 17.9960], rKm: 0.8, w: 0.55 },
  { name: 'Hägersten',      geo: [59.2990, 18.0040], rKm: 1.1, w: 0.65 },
  { name: 'Fruängen',       geo: [59.2870, 17.9650], rKm: 0.9, w: 0.55 },
  { name: 'Östermalm',      geo: [59.3370, 18.0820], rKm: 1.1, w: 0.95 },
  { name: 'Gärdet',         geo: [59.3450, 18.0980], rKm: 0.8, w: 0.60 },
  { name: 'Hjorthagen',     geo: [59.3560, 18.1000], rKm: 0.7, w: 0.50 },
  // Blå linjen country (1975 era): Miljonprogrammet over Järvafältet.
  { name: 'Solna',          geo: [59.3600, 17.9980], rKm: 1.2, w: 0.75 },
  { name: 'Sundbyberg',     geo: [59.3620, 17.9700], rKm: 1.0, w: 0.70 },
  { name: 'Rissne',         geo: [59.3760, 17.9400], rKm: 0.8, w: 0.50 },
  { name: 'Rinkeby',        geo: [59.3880, 17.9280], rKm: 0.9, w: 0.60 },
  { name: 'Tensta',         geo: [59.3940, 17.9030], rKm: 0.9, w: 0.60 },
  { name: 'Kista',          geo: [59.4030, 17.9430], rKm: 1.0, w: 0.70 },
  { name: 'Husby',          geo: [59.4100, 17.9250], rKm: 0.8, w: 0.55 },
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
