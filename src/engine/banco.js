// BANCO DI PROVA STANDARD — le scene che la diagnostica costruisce da sé.
//
// PERCHÉ ESISTE. Fino a ieri la batteria misurava «quello che il committente
// aveva davanti», e due giri a tredici minuti di distanza davano per l'acqua
// 3,4 ms e 18,0 ms: non era cambiato il codice, era cambiata l'inquadratura.
// Con misure così non si decide niente — e infatti per tre volte ho cercato il
// collo nel posto sbagliato.
//
// Qui invece ogni scena è COSTRUITA dal codice: stesso terreno, stessa camera,
// stessa ora, stesso meteo, stesse luci. Due misure sono confrontabili fra loro
// anche a giorni di distanza, fra due dispositivi diversi e fra due versioni del
// gioco. È la differenza fra un termometro e un'impressione.
//
// OGNI SCENA ISOLA UNA COSA SOLA, ed è il punto: se «notte» costa il doppio di
// «terreno», il di più sono le luci e le ombre, perché tutto il resto è identico.
// Il mondo del committente NON viene toccato: la diagnostica lo tiene da parte
// in memoria e lo rimette com'era (vedi main.js, _diagBanco).

const LATO = 26;          // semilato del piano: piccolo, così costruirlo costa ~50 ms
const Y = 6;              // quota del terreno
const PELO = Y;           // quota del pelo d'acqua nelle scene bagnate

/** Piano di base. `tipo` decide il terreno, `buca` scava una conca da riempire. */
function piano(mondo, tipo = 'erba', buca = null) {
  for (let x = -LATO; x <= LATO; x++) {
    for (let z = -LATO; z <= LATO; z++) {
      const dentroBuca = buca && Math.abs(x - buca.x) <= buca.r && Math.abs(z - buca.z) <= buca.r;
      const cima = dentroBuca ? Y - 2 : Y;
      for (let y = cima - 2; y <= cima; y++) mondo.metti(x, y, z, y === cima ? tipo : 'roccia', true);
    }
  }
}

/** Riempie d'acqua la conca fino al pelo. Sorgenti: la sim non deve fare nulla. */
function riempi(mondo, buca) {
  for (let x = buca.x - buca.r; x <= buca.x + buca.r; x++) {
    for (let z = buca.z - buca.r; z <= buca.z + buca.r; z++) {
      for (let y = Y - 1; y <= PELO; y++) mondo.metti(x, y, z, 'acqua', true);
    }
  }
}

/** Collinetta di gradini: dà silhouette, ombre proprie e superfici a varie quote. */
function collina(mondo, cx, cz, alt = 6) {
  for (let h = 1; h <= alt; h++) {
    const r = alt - h + 1;
    for (let x = cx - r; x <= cx + r; x++) {
      for (let z = cz - r; z <= cz + r; z++) mondo.metti(x, Y + h, z, h > alt - 2 ? 'roccia' : 'erba', true);
    }
  }
}

/**
 * LE SCENE. Ognuna: come si costruisce, dove sta la camera, in che condizioni.
 * `condizioni` è dichiarativo apposta — chi legge il report deve poter sapere
 * cosa c'era in scena senza andarsi a leggere il codice.
 */
export const SCENE = [
  {
    id: 'terreno',
    nome: 'terreno asciutto, giorno',
    perche: 'il fondo della scala: quanto costa il mondo e basta, senza acqua né luci',
    condizioni: { ora: 0.5, pioggia: 0, luci: 0 },
    costruisci(mondo) { piano(mondo, 'erba'); collina(mondo, 0, -8); },
    camera: { bersaglio: [0, Y + 2, 0], distanza: 18, pitch: 0.75, yaw: 0.6 },
  },
  {
    id: 'acqua',
    nome: 'lago aperto, giorno',
    perche: 'il pelo dell\'acqua a tutto campo: riflesso, schiuma di riva, correnti',
    condizioni: { ora: 0.5, pioggia: 0, luci: 0 },
    costruisci(mondo) { const b = { x: 0, z: 0, r: 16 }; piano(mondo, 'erba', b); riempi(mondo, b); },
    camera: { bersaglio: [0, PELO, 0], distanza: 14, pitch: 1.15, yaw: 0.4 },
  },
  {
    id: 'impatti',
    nome: 'cascate che colpiscono il lago',
    perche: 'gli anelli d\'impatto: erano l\'80% del costo dell\'acqua e nessuna scena normale li accendeva',
    condizioni: { ora: 0.5, pioggia: 0, luci: 0, impatti: 12 },
    costruisci(mondo) { const b = { x: 0, z: 0, r: 16 }; piano(mondo, 'erba', b); riempi(mondo, b); },
    camera: { bersaglio: [0, PELO, 0], distanza: 14, pitch: 1.15, yaw: 0.4 },
  },
  {
    id: 'pioggia',
    nome: 'temporale sull\'acqua',
    perche: 'increspature di pioggia sul pelo, il caso peggiore della superficie',
    condizioni: { ora: 0.5, pioggia: 1, luci: 0 },
    costruisci(mondo) { const b = { x: 0, z: 0, r: 16 }; piano(mondo, 'erba', b); riempi(mondo, b); },
    camera: { bersaglio: [0, PELO, 0], distanza: 14, pitch: 1.15, yaw: 0.4 },
  },
  {
    id: 'notte',
    nome: 'notte con lampioni (ombre vere)',
    perche: 'le luci PESANTI: ognuna fa camminare il raggio d\'ombra nella griglia, per pixel',
    condizioni: { ora: 0.0, pioggia: 0, luci: 8, ombre: true },
    costruisci(mondo, arredo) {
      piano(mondo, 'erba'); collina(mondo, 0, -8);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        arredo.piazza('lampione', [Math.round(Math.cos(a) * 12), Y + 1, Math.round(Math.sin(a) * 12)], 0, true);
      }
    },
    camera: { bersaglio: [0, Y + 2, 0], distanza: 18, pitch: 0.75, yaw: 0.6 },
  },
  {
    id: 'lucicolorate',
    nome: 'molte luci colorate leggere',
    perche: 'lucciole e blocchi luminosi: luce senza ombra — deve costare molto meno dei lampioni',
    condizioni: { ora: 0.0, pioggia: 0, luci: 24, ombre: false },
    costruisci(mondo) {
      piano(mondo, 'erba'); collina(mondo, 0, -8);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, r = 8 + (i % 3) * 4;
        mondo.metti(Math.round(Math.cos(a) * r), Y + 2 + (i % 3), Math.round(Math.sin(a) * r), 'lucciola', true);
      }
    },
    camera: { bersaglio: [0, Y + 2, 0], distanza: 18, pitch: 0.75, yaw: 0.6 },
  },
  {
    id: 'affollata',
    nome: 'bosco fitto (draw call e vertici)',
    perche: 'il caso in cui a pesare non sono i pixel ma il numero di oggetti da mandare alla scheda',
    condizioni: { ora: 0.5, pioggia: 0, luci: 0 },
    costruisci(mondo, arredo) {
      piano(mondo, 'erba');
      for (let x = -20; x <= 20; x += 4) {
        for (let z = -20; z <= 20; z += 4) arredo.piazza('albero', [x, Y + 1, z], 0, true);
      }
    },
    camera: { bersaglio: [0, Y + 3, 0], distanza: 22, pitch: 0.6, yaw: 0.6 },
  },
];

/** Gli id, per chi deve solo elencarle (menu, test). */
export const ID_SCENE = SCENE.map((s) => s.id);

/**
 * Il RIASSUNTO del banco: due righe che dicono dove va il tempo, confrontando
 * ogni scena col terreno asciutto — che è il fondo della scala. Puro: si prova
 * in Node senza GPU (test/banco.test.mjs).
 * @param banco { id: { fps, gpu:{totaleMedia, passate}, cpuMediana } }
 */
export function riassuntoBanco(banco) {
  if (!banco || !banco.terreno) return [];
  const arr = (x) => Math.round(x * 10) / 10;

  // MILLISECONDI DI GPU SE CI SONO, altrimenti i FRAME AL SECONDO convertiti in
  // millisecondi a frame. Non è un ripiego da poco: il telefono del committente
  // — cioè il bersaglio principale — NON ha le timer query, e la prima versione
  // di questo riassunto pretendeva i ms e restava muta proprio lì.
  // Si usano gli fps MEDI e non la mediana perché su uno schermo agganciato al
  // vsync la mediana si incolla al passo del display (22,3 ms per tutte e sette
  // le scene, misurato) mentre la media distingue eccome.
  const conGpu = typeof (banco.terreno.gpu || {}).totaleMedia === 'number';
  const metrica = (s) => {
    if (!s) return null;
    if (conGpu) return (s.gpu && typeof s.gpu.totaleMedia === 'number') ? s.gpu.totaleMedia : null;
    return (typeof s.fps === 'number' && s.fps > 0) ? 1000 / s.fps : null;
  };
  const unita = conGpu ? 'ms GPU' : 'ms a frame';

  const base = metrica(banco.terreno);
  if (base == null) return [];
  const righe = [`Banco standard — terreno asciutto: ${arr(base)} ${unita}${conGpu ? '' : ` (${Math.round(banco.terreno.fps)} fps)`}, è il fondo della scala.`];
  const extra = SCENE.filter((s) => s.id !== 'terreno')
    .map((s) => ({ nome: s.nome, v: metrica(banco[s.id]), fps: banco[s.id] && banco[s.id].fps }))
    .filter((s) => s.v != null)
    .map((s) => ({ ...s, di: s.v - base }))
    .sort((a, b) => b.di - a.di);
  if (extra.length) {
    righe.push(`Quanto costa IN PIÙ ogni condizione (${unita}): ${extra.map((s) => `${s.nome} ${s.di >= 0 ? '+' : ''}${arr(s.di)}`).join(' · ')}.`);
  }
  return righe;
}
