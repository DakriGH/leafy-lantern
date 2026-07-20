// SCHEMI dell'Officina: COSA si può definire, separato da COME lo si disegna.
// L'editor genera le form da qui — aggiungere una proprietà a un contenuto è
// una riga di dati, non codice nuovo. Le "fabbriche" traducono i dati salvati
// in def di gioco (registry blocchi / attrezzi).
//
// Tipi di campo gestiti dall'editor: testo · colore · scelta · numero ·
// interruttore · facce (i 6 lati dipinti singolarmente).

import { registraBlocco } from '../world/blocks.js?v=mrsi80i0';
import { ATTREZZI } from '../gioco/inventario.js?v=mrsi80i0';
import { MOTIVI } from '../world/motivi.js?v=mrsi80i0';

export const hexInt = (h) => parseInt(String(h).slice(1), 16);
export const intHex = (n) => '#' + (n || 0).toString(16).padStart(6, '0');

/** I 6 lati, nell'ordine usato da coloreFaccia(): +X −X +Y −Y +Z −Z */
export const LATI_BLOCCO = [
  { id: 'est', nome: 'Est' }, { id: 'ovest', nome: 'Ovest' },
  { id: 'cima', nome: 'Cima' }, { id: 'fondo', nome: 'Fondo' },
  { id: 'sud', nome: 'Sud' }, { id: 'nord', nome: 'Nord' },
];

export const SCHEMI = {
  blocco: {
    nome: 'Blocchi', emoji: '🧱',
    campi: [
      { id: 'nome', tipo: 'testo', etichetta: 'Nome', def: 'Blocco nuovo' },

      { sezione: '🎨 Aspetto' },
      {
        id: 'pittura', tipo: 'scelta', etichetta: 'Come si colora', def: 'zone',
        opzioni: [['zone', 'A zone (cima/lato/fondo)'], ['facce', 'Faccia per faccia']],
      },
      // visibili solo con pittura = zone
      { id: 'cima', tipo: 'colore', etichetta: 'Cima', def: '#8ecf6a', se: (d) => d.pittura !== 'facce' },
      { id: 'lato', tipo: 'colore', etichetta: 'Lati', def: '#79b657', se: (d) => d.pittura !== 'facce' },
      { id: 'fondo', tipo: 'colore', etichetta: 'Fondo', def: '#659c49', se: (d) => d.pittura !== 'facce' },
      // visibile solo con pittura = facce
      { id: 'facce', tipo: 'facce', etichetta: 'Dipingi i lati', def: null, se: (d) => d.pittura === 'facce' },

      { sezione: '🪵 Motivo (la “texture” di qui)' },
      {
        id: 'motivo', tipo: 'scelta', etichetta: 'Variazione', def: 'liscio',
        opzioni: MOTIVI.map((m) => [m.id, m.nome]),
        aiuto: 'I blocchi sono colorati per vertice: il “materiale” nasce variando il colore cella per cella, sempre uguale per la stessa cella.',
      },
      { id: 'motivoForza', tipo: 'numero', etichetta: 'Quanto si nota', def: 60, min: 10, max: 100, passo: 10, se: (d) => d.motivo && d.motivo !== 'liscio' },

      { sezione: '📐 Forma e resa' },
      {
        id: 'forma', tipo: 'scelta', etichetta: 'Forma', def: 'cubo',
        opzioni: [
          ['cubo', '🧊 Cubo smussato'],
          ['cappello', '🌱 Col bordino (come l’erba)'],
          ['lastra', '▭ Lastra (mezza altezza)'],
          ['pilastro', '🗼 Pilastro (colonna)'],
          ['croce', '🌿 Croce (pianta, si attraversa)'],
        ],
      },
      {
        id: 'solido', tipo: 'interruttore', etichetta: 'Ci si può camminare sopra', def: true,
        aiuto: 'Spegnilo per erbe e fiori che si attraversano. Le forme non piene non nascondono mai le facce dei vicini.',
      },

      { sezione: '🌦 Reagisce all’ambiente' },
      {
        id: 'reagisce', tipo: 'scelta', etichetta: 'Cambia colore con', def: 'niente',
        opzioni: [['niente', 'Niente (colore fisso)'], ['stagione', '🍂 Le stagioni (come l’erba)'], ['quota', '⛰ L’altezza']],
        aiuto: 'I colori sono cotti nella mesh: si può reagire solo a ciò che fa ricostruire il mondo. Per il giorno/notte usa la luce.',
      },
      { id: 'reagisceForza', tipo: 'numero', etichetta: 'Quanto', def: 100, min: 20, max: 100, passo: 10, se: (d) => d.reagisce && d.reagisce !== 'niente' },

      { sezione: '✨ Particelle' },
      {
        id: 'particelle', tipo: 'scelta', etichetta: 'Emette', def: 'niente',
        opzioni: [['niente', 'Niente'], ['scintille', '✨ Scintille'], ['fumo', '💨 Fumo'], ['bolle', '🫧 Bolle']],
      },
      { id: 'partColore', tipo: 'colore', etichetta: 'Colore delle particelle', def: '#ffe28a', se: (d) => d.particelle && d.particelle !== 'niente' },
      { id: 'partRitmo', tipo: 'numero', etichetta: 'Quanto spesso', def: 40, min: 10, max: 100, passo: 10, se: (d) => d.particelle && d.particelle !== 'niente' },

      { sezione: '⛏ Comportamento' },
      {
        id: 'fam', tipo: 'scelta', etichetta: 'Attrezzo giusto', def: 'scavo',
        opzioni: [['scavo', '🥄 Vanga'], ['mina', '⛏ Piccone'], ['taglia', '🪓 Ascia']],
      },
      { id: 'salute', tipo: 'numero', etichetta: 'Resistenza', def: 100, min: 25, max: 400, passo: 25 },

      { sezione: '💡 Luce' },
      { id: 'luceRaggio', tipo: 'numero', etichetta: 'Raggio (0 = spenta)', def: 0, min: 0, max: 8, passo: 1 },
      { id: 'luceColore', tipo: 'colore', etichetta: 'Colore', def: '#7dffa0', se: (d) => d.luceRaggio > 0 },
    ],
  },

  attrezzo: {
    nome: 'Attrezzi', emoji: '🛠',
    campi: [
      { id: 'nome', tipo: 'testo', etichetta: 'Nome', def: 'Attrezzo nuovo' },
      {
        id: 'famiglia', tipo: 'scelta', etichetta: 'Rompe in fretta i blocchi da', def: 'scavo',
        opzioni: [['scavo', '🥄 Terra e sabbia'], ['mina', '⛏ Pietra e roccia'], ['taglia', '🪓 Legno']],
      },
      { id: 'emoji', tipo: 'testo', etichetta: 'Icona (una emoji)', def: '🔧' },
    ],
  },

  furni: { nome: 'Mobili', emoji: '🪑', presto: true },
  npc: { nome: 'NPC', emoji: '🐱', presto: true },
  veicoli: { nome: 'Veicoli', emoji: '🛶', presto: true },
};

/** Valori di partenza di un contenuto nuovo, dallo schema. */
export function valoriDefault(tipo) {
  const s = SCHEMI[tipo];
  const d = {};
  for (const c of (s.campi || [])) if (c.id) d[c.id] = typeof c.def === 'function' ? c.def() : c.def;
  return d;
}

/** I campi da mostrare ORA, dati i valori correnti (gestisce le dipendenze). */
export function campiVisibili(tipo, dati) {
  return (SCHEMI[tipo].campi || []).filter((c) => !c.se || c.se(dati));
}

// ---- fabbriche: dati salvati → def di gioco ---------------------------------

/** I 6 colori delle facce, con ricaduta sulle zone se non dipinte. */
function facceDa(d) {
  if (d.pittura !== 'facce') return null;
  const f = d.facce || {};
  const zona = (id) => (id === 'cima' ? d.cima : id === 'fondo' ? d.fondo : d.lato) || '#79b657';
  return LATI_BLOCCO.map((l) => hexInt(f[l.id] || zona(l.id)));
}

export function fabbricaBlocco(d) {
  const def = {
    nome: d.nome, officina: true,
    cima: hexInt(d.cima), lato: hexInt(d.lato), fondo: hexInt(d.fondo),
    solido: d.solido !== false, nav: 10, fam: d.fam, salute: d.salute,
  };
  const facce = facceDa(d);
  if (facce) def.facce = facce;
  if (d.forma === 'cappello') def.cappello = true;
  else if (d.forma && d.forma !== 'cubo') def.forma = d.forma;   // lastra/pilastro/croce
  if (d.motivo && d.motivo !== 'liscio') {
    def.motivo = d.motivo;
    def.motivoForza = (d.motivoForza ?? 60) / 100;
  }
  if (d.reagisce && d.reagisce !== 'niente') {
    def.reagisce = d.reagisce;
    def.reagisceForza = (d.reagisceForza ?? 100) / 100;
  }
  if (d.particelle && d.particelle !== 'niente') {
    // ogni tipo ha la sua fisica: le scintille salgono piano, il fumo di più,
    // le bolle ondeggiano (galleggiano) — la forma la fa il sistema particelle
    const stile = {
      scintille: { salita: 0.55, su: 1.0 },
      fumo:      { salita: 1.15, su: 1.0 },
      bolle:     { salita: 0.35, su: 0.7 },
    }[d.particelle] || {};
    const c = hexInt(d.partColore || '#ffe28a');
    def.particelle = {
      tipo: d.particelle,
      colore: [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255],
      ritmo: (d.partRitmo ?? 40) / 100,
      ...stile,
    };
  }
  if (d.luceRaggio > 0) def.luce = { colore: hexInt(d.luceColore || '#7dffa0'), raggio: d.luceRaggio, intensita: 1.1 };
  registraBlocco(d.id, def);
  return def;
}

export function fabbricaAttrezzo(d) {
  ATTREZZI[d.id] = { id: d.id, nome: d.nome, emoji: d.emoji || '🔧', famiglia: d.famiglia, officina: true };
  return ATTREZZI[d.id];
}

export const FABBRICHE = { blocco: fabbricaBlocco, attrezzo: fabbricaAttrezzo };
