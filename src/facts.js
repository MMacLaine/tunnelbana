// City notes: the little things the game says between the numbers (owner ask,
// 2026-08-07: "little pop up messages to read, perhaps facts and interesting
// things too about Stockholm, the Metro, and the like").
//
// RULES OF THE FILE. Facts are checked before they enter; where a story is
// folklore it is TOLD as folklore ("Stockholmers say..."), never asserted.
// Nothing here uses operator branding, and everything is common knowledge or
// public history: facts are facts, but the phrasing is ours. English prose,
// Swedish only where it is a real name or real signage (the house language
// rule). Keep each under ~140 characters so the toast never wraps twice.

export const FACTS = [
  'The first tunnelbana line opened on 1 October 1950, running from Slussen south to Hökarängen.',
  'The T in T-bana stands for tunnel. Tunnelbana simply means underground railway.',
  'T-Centralen is the only station where every line in the system meets.',
  'Stockholm’s metro is often called the world’s longest art gallery: most of its stations carry commissioned art.',
  'Kymlinge, on the blue line, was built but never opened. Stockholmers say only the dead alight there.',
  'Silverpilen, the Silver Arrow, was an unpainted aluminium train that became the city’s favourite ghost story.',
  'Many blue line stations are left as raw blasted bedrock, painted rather than clad.',
  'Solna centrum’s ceiling is a kilometre of red sunset over a spruce forest, painted in the 1970s.',
  'Rådhuset station is sometimes mistaken for a natural cave. It is deliberate.',
  'Östermalmstorg station was designed to double as a civil defence shelter.',
  'Kungsträdgården station is home to a spider found almost nowhere else in northern Europe.',
  'The green line is the system’s oldest and busiest.',
  'Gamla stan station stands in the open air, squeezed between the old town and the water.',
  'In 1957 the two halves of the green line were joined through T-Centralen, and the lines became a system.',
  'Hötorget station still wears its white 1950s tiles.',
  'Västra skogen has one of the longest escalators in northern Europe.',
  'Vällingby was a model ABC town: arbete, bostad, centrum. Work, housing and centre around the station.',
  'Parts of the blue line run more than 30 metres below the surface.',
  'Tensta station’s walls speak of solidarity in many languages.',
  'Rinkeby station glitters with gold mosaics inspired by Viking age finds nearby.',
  'T-Centralen’s blue line platforms are painted with calming vines, a quiet gift to rushed commuters.',
  'Stockholm’s bedrock is so hard that stretches of tunnel needed no lining at all.',
  'Hökarängen had one of Sweden’s first pedestrian-only shopping streets.',
  'The red line crosses the water at Liljeholmen in the open air, one of the network’s few over-water moments.',
  'At Ropsten the tunnelbana hangs at the water’s edge and hands its passengers to the Lidingö trains.',
  'Some stations were built for suburbs that did not exist yet. The trains arrived first; the city followed.',
  'Odenplan honours Odin. Stockholm’s map is full of Norse gods.',
  'Fridhemsplan joins the green and blue lines beneath Kungsholmen.',
  'Some of the green line’s tunnels were dug for trams in the 1930s, decades before the first metro train.',
  'Slussen has been rebuilt so many times that Stockholmers treat the construction site as a landmark.',
  'Midsommarkransen is said to be named after a midsummer wreath that hung at a local inn.',
  'Blackeberg’s station vault appears in Swedish fiction, most famously in Let the Right One In.',
  'Akalla and Husby stand on Järvafältet, an old military exercise field turned Million Programme suburbs.',
  'Skogskyrkogården serves the woodland cemetery, a UNESCO World Heritage site.',
  'Stockholm names its line ends on the platform signs: SLUTSTATION, the last station. This game borrowed the word.',
];

// Curiosities (owner ask, 2026-08-07: "little easter eggs that are on the
// map are great, link them to achievements too"). Each is a quiet politic
// diamond (pass 03: rewards noticing, never reads as a task), revealed only
// when the network reaches its neighbourhood, found by clicking, worth a
// fact and an achievement tick. `needs` receives the set of built anchor
// indices; the indices are ANCHORS positions in data.js, named in comments.
// Silverpilen is special: it has no fixed place, it is a TRAIN, and it only
// runs at night; the renderer owns its position.
export const EGGS = [
  { id: 'kymlinge', name: 'Kymlinge', geo: [59.3890, 17.9580],
    needs: (used) => used.has(55) && used.has(56),   // Hallonbergen and Kista
    fact: 'Kymlinge: the station that was built and never opened. Its shell still stands on the line you are riding. Stockholmers say only the dead alight here.' },
  { id: 'silverpilen', name: 'Silverpilen', geo: null,   // a night train, not a place
    needs: () => true,
    fact: 'You saw it: Silverpilen, the unpainted aluminium train that haunted the network for decades. Eight cars, no livery, never in the timetable.' },
  { id: 'thorildsplan', name: 'Thorildsplan', geo: [59.3316, 18.0135],
    needs: (used) => used.has(17) && used.has(18),   // Fridhemsplan and Kristineberg
    fact: 'Thorildsplan is missing from this map, but the real station is there between your two stops, decorated corner to corner in pixel art.' },
  { id: 'norrstrom', name: 'Under Norrström', geo: [59.3270, 18.0645],
    needs: (used) => used.has(0) && used.has(1),     // T-Centralen and Gamla stan
    fact: 'Beneath this water runs the tunnel that joined the two halves of the green line in 1957 and turned Stockholm’s lines into a system.' },
  { id: 'skogskyrkogarden', name: 'Skogskyrkogården', geo: [59.2760, 18.1010],
    needs: (used) => used.has(9),                    // Skogskyrkogården station
    fact: 'East of the platform lies the woodland cemetery, a UNESCO World Heritage site. Greta Garbo rests there, a short walk from your station.' },
  { id: 'ostermalmstorg', name: 'Östermalmstorg', geo: [59.3355, 18.0740],
    needs: (used) => used.has(38),                   // Östermalmstorg station
    fact: 'This station was engineered to double as a civil defence shelter, deep and blast-doored. The calm platform was designed for a very different day.' },
];

// Postcard names: common Swedish first names across a century of commuters.
export const NAMES = [
  'Astrid', 'Erik', 'Maja', 'Lars', 'Ingrid', 'Nils', 'Karin', 'Sven',
  'Elsa', 'Gunnar', 'Britta', 'Olle', 'Sigrid', 'Bengt', 'Greta', 'Åke',
  'Linnea', 'Per', 'Saga', 'Bo', 'Ebba', 'Rune', 'Alva', 'Folke',
  'Märta', 'Henrik', 'Tove', 'Emil', 'Vera', 'Axel', 'Stina', 'Gösta',
  'Hedvig', 'Torsten', 'Ylva', 'Arvid', 'Klara', 'Leif', 'Freja', 'Hasse',
];
