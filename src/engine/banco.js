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

/** 24 lampade in cerchio, a tre quote: la stessa disposizione per le due scene
 *  della coppia, così a cambiare è solo il tipo di lampada. */
function lampade(mondo, id) {
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = 8 + (i % 3) * 4;
    mondo.metti(Math.round(Math.cos(a) * r), Y + 2 + (i % 3), Math.round(Math.sin(a) * r), id, true);
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
  // LA COPPIA DEL CONFRONTO. `lampadaPesante` e `lampadaLeggera` hanno la STESSA
  // identica luce (colore, raggio, intensità) e le stesse facce: l'unica
  // differenza è se proiettano ombra. Esistono in blocks.js apposta per questo,
  // e metterle qui affiancate significa che la differenza fra le due scene È il
  // costo dell'ombra, senza nient'altro in mezzo.
  // (Qui prima c'era una scena chiamata «luci leggere» che però piazzava
  // LUCCIOLE — che hanno `ombra: true` per progetto, essendo blocchi-lampada
  // fermi. Misurava quindi 24 luci PESANTI mentre in etichetta ne dichiarava
  // zero: +17,6 ms sul Chromebook, il doppio degli otto lampioni. Il numero era
  // giusto, il nome no — ed è così che è saltato fuori il costo delle ombre.)
  {
    id: 'lucileggere',
    nome: '24 luci senza ombra',
    perche: 'luce pura: sfere colorate che trapassano i muri, il termine di paragone',
    condizioni: { ora: 0.0, pioggia: 0, luci: 24, ombre: false },
    costruisci(mondo) { piano(mondo, 'erba'); collina(mondo, 0, -8); lampade(mondo, 'lampadaLeggera'); },
    camera: { bersaglio: [0, Y + 2, 0], distanza: 18, pitch: 0.75, yaw: 0.6 },
  },
  {
    id: 'lucipesanti',
    nome: '24 luci CON ombra',
    perche: 'le stesse identiche lampade, ma che proiettano: la differenza è il costo dell\'ombra',
    condizioni: { ora: 0.0, pioggia: 0, luci: 24, ombre: true },
    costruisci(mondo) { piano(mondo, 'erba'); collina(mondo, 0, -8); lampade(mondo, 'lampadaPesante'); },
    camera: { bersaglio: [0, Y + 2, 0], distanza: 18, pitch: 0.75, yaw: 0.6 },
  },
  {
    id: 'ombracielo',
    nome: 'ombra del sole (cel shading)',
    perche: 'il cammino verso il sole per OGNI pixel: è l\'unica ombra che tocca tutto lo schermo, non solo una pozza',
    condizioni: { ora: 0.35, pioggia: 0, luci: 0, ombraCielo: true },
    // Sole basso di metà mattina + roba che sporge. GLI OSTACOLI SONO BLOCCHI
    // apposta: qui si vuole misurare il CAMMINO NELLA GRIGLIA da solo, pulito.
    // (Storicamente questa scena era nata sbagliata con un bosco di alberi,
    // quando i furni non entravano in griglia e misurava zero. Adesso ci
    // entrano — vedi ombreFurni — e infatti la scena «bosco fitto» misura anche
    // quelli; ma tenerle separate è il punto: una passata, una causa.)
    // NOTA: le ombre DINAMICHE (corpi in movimento) non sono in nessuna scena
    // del banco. Il ciclo di gioco riscrive le loro uniform a ogni frame,
    // quindi una scena che le inventasse misurerebbe una scena che non esiste.
    costruisci(mondo) {
      piano(mondo, 'erba'); collina(mondo, -10, -10, 8);
      for (let x = -16; x <= 16; x += 8) {
        for (let z = 0; z <= 16; z += 8) {
          for (let h = 1; h <= 5; h++) mondo.metti(x, Y + h, z, 'tronco', true);
        }
      }
    },
    camera: { bersaglio: [0, Y + 2, 4], distanza: 20, pitch: 0.7, yaw: 0.9 },
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
  // arrotondamento che segue la grandezza: sul Chromebook si parla di decine di
  // millisecondi, su una scheda veloce di decimi — con una cifra fissa metà
  // delle voci uscivano tutte "+0" e il riassunto non diceva niente
  const arr = (x) => (Math.abs(x) < 2 ? Math.round(x * 100) / 100 : Math.round(x * 10) / 10);

  // MILLISECONDI DI GPU SE CI SONO, altrimenti i FRAME AL SECONDO convertiti in
  // millisecondi a frame. Non è un ripiego da poco: il telefono del committente
  // — cioè il bersaglio principale — NON ha le timer query, e la prima versione
  // di questo riassunto pretendeva i ms e restava muta proprio lì.
  // Si usano gli fps MEDI e non la mediana perché su uno schermo agganciato al
  // vsync la mediana si incolla al passo del display (22,3 ms per tutte e sette
  // le scene, misurato) mentre la media distingue eccome.
  // TRE METRICHE IN ORDINE DI FIDUCIA:
  //  1. i ms di GPU, se il dispositivo ha le timer query (Chromebook sì);
  //  2. `renderMs` — N disegni di fila con un gl.finish() in fondo, cioè il
  //     costo VERO di un disegno fuori dal vsync. È il numero che ha salvato la
  //     misura sul telefono: senza, tutte e sette le scene leggevano 36-38 fps
  //     perché lo schermo agganciato al vsync appiattisce tutto a gradini;
  //  3. gli fps medi, ultimo ripiego per i file vecchi che non hanno renderMs.
  const conGpu = typeof (banco.terreno.gpu || {}).totaleMedia === 'number';
  const conRender = typeof banco.terreno.renderMs === 'number' && banco.terreno.renderMs > 0;
  const metrica = (s) => {
    if (!s) return null;
    if (conGpu) return (s.gpu && typeof s.gpu.totaleMedia === 'number') ? s.gpu.totaleMedia : null;
    if (conRender) return (typeof s.renderMs === 'number' && s.renderMs > 0) ? s.renderMs : null;
    return (typeof s.fps === 'number' && s.fps > 0) ? 1000 / s.fps : null;
  };
  const unita = conGpu ? 'ms GPU' : (conRender ? 'ms a disegno' : 'ms a frame');

  const base = metrica(banco.terreno);
  if (base == null) return [];
  const righe = [`Banco standard — terreno asciutto: ${arr(base)} ${unita}${conGpu ? '' : ` (${Math.round(banco.terreno.fps || 0)} fps a schermo)`}, è il fondo della scala.`];
  const extra = SCENE.filter((s) => s.id !== 'terreno')
    .map((s) => ({ nome: s.nome, v: metrica(banco[s.id]), fps: banco[s.id] && banco[s.id].fps }))
    .filter((s) => s.v != null)
    .map((s) => ({ ...s, di: s.v - base }))
    .sort((a, b) => b.di - a.di);

  // ---- LO STRUMENTO DEVE SAPER DIRE «NON HO MISURATO» ----------------------
  // È la cosa più importante che fa, e per un giro intero non l'ha fatta: sul
  // telefono del committente (Mali-G68, nessun timer GPU) il report ha
  // pubblicato una classifica in cui SEI scene su otto costavano MENO del
  // terreno asciutto — cioè aggiungere l'acqua, la pioggia e ventiquattro luci
  // faceva andare più veloce. Non è un'anomalia da interpretare: è la prova che
  // il numero su cui è costruita la classifica non misura il nostro lavoro.
  //
  // PERCHÉ SUCCEDE: senza timer GPU il costo di un disegno si stima ripetendo il
  // disegno con un gl.finish() in fondo. Su una GPU a TILE — tutti i telefoni —
  // il driver può accorgersi che il framebuffer viene riscritto da capo e
  // buttare via i disegni ripetuti, oppure accorparli. Quel che resta è rumore.
  //
  // LA REGOLA È AUTOEVIDENTE e non ha soglie da tarare: una scena PIÙ CARICA non
  // può misurare MENO del fondo della scala. Se capita più di una volta, qui non
  // si pubblica nessun ordinamento — si dice cosa è successo e quali numeri di
  // questo file restano validi.
  const negativi = extra.filter((s) => s.di < 0);
  const scarti = SCENE.map((s) => banco[s.id] && banco[s.id].renderScarto)
    .filter((v) => typeof v === 'number');
  const ballo = scarti.length ? scarti.sort((a, b) => a - b)[scarti.length >> 1] : null;
  if (!conGpu && negativi.length >= 2) {
    righe.push(`⚠ QUI NON SI STA MISURANDO IL COSTO: ${negativi.length} scene su ${extra.length} risultano più leggere del terreno asciutto, e aggiungere acqua o luci non può far andare più veloce.${ballo != null ? ` Fra una ripetizione e l'altra lo stesso disegno balla di ${arr(ballo)} ms.` : ''} Senza timer GPU (EXT_disjoint_timer_query_webgl2) su una scheda a tile il disegno ripetuto non è misurabile: di questo file restano validi gli fps a gradini e la CPU per frame, non la classifica delle condizioni.`);
  } else if (extra.length) {
    righe.push(`Quanto costa IN PIÙ ogni condizione (${unita}): ${extra.map((s) => `${s.nome} ${s.di >= 0 ? '+' : ''}${arr(s.di)}`).join(' · ')}.`);
  }

  // ---- IL GRADINO DEL VSYNC ------------------------------------------------
  // Se i tempi di frame sono tutti multipli interi dello stesso passo, lo
  // schermo è agganciato al vsync e gli fps NON possono valere numeri in mezzo:
  // valgono il refresh, la sua metà, il suo terzo. Dirlo cambia come si legge
  // tutto il resto — «45 contro 45» non vuol dire «uguale», vuol dire «la
  // differenza è più piccola del gradino, e da qui non si vede».
  const passi = SCENE.map((s) => banco[s.id] && banco[s.id].frameMs)
    .filter((v) => typeof v === 'number' && v > 1);
  if (passi.length >= 3) {
    const minimo = Math.min(...passi);
    const interi = passi.every((v) => Math.abs(v / minimo - Math.round(v / minimo)) < 0.06);
    // si arrotonda al refresh COMMERCIALE più vicino (entro il 3%): 1000/11.2 fa
    // 89.3, e scrivere «89 Hz» fa sembrare sbagliata una misura che è giusta
    const noti = [60, 75, 90, 100, 120, 144, 165, 240];
    const grezzo = 1000 / minimo;
    const hz = noti.find((h) => Math.abs(grezzo - h) / h < 0.03) || Math.round(grezzo);
    if (interi && hz >= 50) {
      const gradini = [...new Set(passi.map((v) => Math.round(hz / Math.round(v / minimo))))]
        .sort((a, b) => b - a);
      righe.push(`Schermo a ${hz} Hz col vsync agganciato: i tempi di frame sono tutti multipli esatti di ${arr(minimo)} ms, quindi gli fps possono valere SOLO ${gradini.join(' · ')}. Due scene che leggono lo stesso numero non costano uguale: costano meno di un gradino di differenza.`);
    }
  }
  return righe;
}
