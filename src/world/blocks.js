// Registry dei tipi di blocco. Colori per zona (cima/lato/fondo) — palette
// allineata alle texture dei prefab Unity e al mockup.

export const BLOCCHI = {
  // cappello: bordino 3D del GrassCell.fbx (brim a 20 px, cima a filo cella)
  // fam: quale attrezzo lo rompe in un colpo (scavo=vanga, mina=piccone, taglia=ascia)
  erba:    { nome: 'Erba',    cima: 0x64bb4f, lato: 0xc98f60, fondo: 0xb57e50, solido: true,  nav: 10, cappello: true, fam: 'scavo' },
  terra:   { nome: 'Terra',   cima: 0xc98f60, lato: 0xbc8153, fondo: 0xb57e50, solido: true,  nav: 10, fam: 'scavo' },
  sabbia:  { nome: 'Sabbia',  cima: 0xe9d49c, lato: 0xdec388, fondo: 0xd2b276, solido: true,  nav: 12, fam: 'scavo' },
  ghiaia:  { nome: 'Ghiaia',  cima: 0x9a948c, lato: 0x8b857d, fondo: 0x7f7972, solido: true,  nav: 12, fam: 'scavo' },
  neve:    { nome: 'Neve',    cima: 0xf2f7f7, lato: 0xe0eaea, fondo: 0xd0dcdc, solido: true,  nav: 12, fam: 'scavo' },
  roccia:  { nome: 'Roccia',  cima: 0xa8aeba, lato: 0x939aa8, fondo: 0x878e9c, solido: true,  nav: 10, fam: 'mina' },
  pietra:  { nome: 'Pietra liscia', cima: 0xbdc3cd, lato: 0xaeb4bf, fondo: 0xa2a8b3, solido: true, nav: 10, fam: 'mina' },
  mattoni: { nome: 'Mattoni', cima: 0xb0533d, lato: 0xa14a36, fondo: 0x93422f, solido: true,  nav: 10, fam: 'mina' },
  legno:   { nome: 'Legno',   cima: 0xb08650, lato: 0x9c7242, fondo: 0x8d6539, solido: true,  nav: 10, fam: 'taglia' },
  tronco:  { nome: 'Tronco',  cima: 0xc09a62, lato: 0x7a5230, fondo: 0xc09a62, solido: true,  nav: 10, fam: 'taglia' },
  asse:    { nome: 'Assi chiare', cima: 0xd9b97e, lato: 0xc8a86d, fondo: 0xb9995e, solido: true, nav: 10, fam: 'taglia' },
  lanaBianca: { nome: 'Lana bianca', cima: 0xeff0f2, lato: 0xe2e3e6, fondo: 0xd5d6da, solido: true, nav: 10, fam: 'scavo' },
  lanaRossa:  { nome: 'Lana rossa',  cima: 0xe05a4e, lato: 0xcc4b40, fondo: 0xba4238, solido: true, nav: 10, fam: 'scavo' },
  lanaBlu:    { nome: 'Lana blu',    cima: 0x4a7fd4, lato: 0x3f6ec0, fondo: 0x3760ab, solido: true, nav: 10, fam: 'scavo' },
  lanaGialla: { nome: 'Lana gialla', cima: 0xf2c94c, lato: 0xe0b83e, fondo: 0xcda634, solido: true, nav: 10, fam: 'scavo' },
  lanaVerde:  { nome: 'Lana verde',  cima: 0x58b368, lato: 0x4aa05a, fondo: 0x3f8f4e, solido: true, nav: 10, fam: 'scavo' },
  // LUCE DINAMICA per-blocco: def.luce = {colore, raggio, intensita} accende
  // una sfera fake-pointlight al centro della cella (gestita da main) —
  // il banco di prova delle performance del sistema luci
  lucciola: {
    nome: 'Lucciola verde', cima: 0xa8ffb0, lato: 0x5fd66e, fondo: 0x46b957,
    solido: true, nav: 10, fam: 'mina', salute: 100,
    luce: { colore: 0x7dffa0, raggio: 5, intensita: 1.1 },
  },
  acqua:   { nome: 'Acqua',   cima: 0x4fc2ec, lato: 0x3dade0, fondo: 0x3096cc, solido: false, nav: null, acqua: true },
};

/** Categorie del menu creativa (stile Minecraft). */
export const CATEGORIE_BLOCCHI = [
  { id: 'naturali', nome: 'Naturali', emoji: '🌿', blocchi: ['erba', 'terra', 'sabbia', 'ghiaia', 'neve', 'roccia', 'lucciola', 'acqua'] },
  { id: 'costruzione', nome: 'Costruzione', emoji: '🧱', blocchi: ['legno', 'tronco', 'asse', 'pietra', 'mattoni'] },
  { id: 'lane', nome: 'Lane', emoji: '🎨', blocchi: ['lanaBianca', 'lanaRossa', 'lanaBlu', 'lanaGialla', 'lanaVerde'] },
];

// ---- blocchi dell'OFFICINA (definiti in-game, registrati a runtime) --------

export const CATEGORIA_OFFICINA = { id: 'officina', nome: 'Officina', emoji: '🛠️', blocchi: [] };
CATEGORIE_BLOCCHI.push(CATEGORIA_OFFICINA);

export function registraBlocco(id, def) {
  BLOCCHI[id] = def;
  if (!CATEGORIA_OFFICINA.blocchi.includes(id)) CATEGORIA_OFFICINA.blocchi.push(id);
}

export function rimuoviBlocco(id) {
  delete BLOCCHI[id];
  const i = CATEGORIA_OFFICINA.blocchi.indexOf(id);
  if (i >= 0) CATEGORIA_OFFICINA.blocchi.splice(i, 1);
}

// un blocco custom cancellato può restare nei mondi salvati: si mostra come
// "blocco perduto" invece di far crollare mesher e fisica
const IGNOTO = { nome: 'Blocco perduto', cima: 0xc59ad1, lato: 0xac83b8, fondo: 0x97709f, solido: true, nav: 10, fam: 'mina' };

export function defBlocco(tipo) { return BLOCCHI[tipo]; }

/** Def dal tipo memorizzato: l'acqua che scorre è codificata "acqua~N". */
export function defDi(tipo) {
  return BLOCCHI[tipo.charCodeAt(0) === 97 && tipo.startsWith('acqua') ? 'acqua' : tipo] || IGNOTO;
}

/** Tipo base senza il livello d'acqua. */
export function tipoBase(tipo) {
  const i = tipo.indexOf('~');
  return i < 0 ? tipo : tipo.slice(0, i);
}

/** Livello dell'acqua: 0 = sorgente, 1..N flusso; null se non è acqua. */
export function livelloAcqua(tipo) {
  if (!tipo || !tipo.startsWith('acqua')) return null;
  const i = tipo.indexOf('~');
  return i < 0 ? 0 : Number(tipo.slice(i + 1));
}
