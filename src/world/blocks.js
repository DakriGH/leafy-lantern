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
  // LUCE DINAMICA per-blocco: def.luce = {colore, raggio, intensita, ombra}
  // accende una sfera fake-pointlight al centro della cella (gestita da main).
  //
  // `ombra` SCEGLIE LA CLASSE, e va DICHIARATA: non si deduce da niente.
  //  · true  = luce PESANTE: non passa i muri. L'ombra la cammina lo shader
  //            sulla griglia dei solidi (fx/materials.js, ombraVoxel), quindi
  //            costa a schermo e non in CPU. Un blocco-lampada e' fermo e
  //            occlude: qui e' la scelta giusta.
  //  · false = luce LEGGERA: trapassa tutto, si muove gratis, costo zero in CPU.
  //            E' quella dei fuochi fatui e degli effetti (vedi creaLuceLeggera).
  // Il default di creaLuce e' `false`: chi si dimentica finisce nella classe che
  // non costa niente, e una luce che pesa resta una scelta scritta.
  lucciola: {
    nome: 'Lucciola verde', cima: 0xa8ffb0, lato: 0x5fd66e, fondo: 0x46b957,
    solido: true, nav: 10, fam: 'mina', salute: 100,
    luce: { colore: 0x7dffa0, raggio: 5, intensita: 1.1, ombra: true },
  },

  // ---- LA COPPIA DEL CONFRONTO -------------------------------------------
  // Due blocchi con la STESSA IDENTICA luce (colore, raggio, intensita') e
  // anche le stesse facce: l'UNICA differenza e' `ombra`. Sono fatti per stare
  // affiancati dietro due muri uguali (world/testLuci.js, zona 1): a quel punto
  // tutto cio' che si vede di diverso a schermo e' la classe di luce, non la
  // lampada. Se un giorno viene la tentazione di dare a uno dei due un colore
  // diverso per distinguerli nell'inventario: NON FARLO, si perde la prova.
  // Nel mondo di test si distinguono dal marcatore di lana ai loro piedi
  // (bianca = pesante, rossa = leggera); nel menu li distingue il nome.
  lampadaPesante: {
    nome: 'Lampada pesante (con ombra)', cima: 0xffeab4, lato: 0xf0c063, fondo: 0xd9a744,
    solido: true, nav: 10, fam: 'mina', salute: 100,
    luce: { colore: 0xffd889, raggio: 8, intensita: 1.1, ombra: true },
  },
  lampadaLeggera: {
    nome: 'Lampada leggera (trapassa i muri)', cima: 0xffeab4, lato: 0xf0c063, fondo: 0xd9a744,
    solido: true, nav: 10, fam: 'mina', salute: 100,
    luce: { colore: 0xffd889, raggio: 8, intensita: 1.1, ombra: false },
  },

  // ---- LE TRE COLORATE ----------------------------------------------------
  // Primarie additive quasi pure (un canale a 1, gli altri bassi): servono a
  // LEGGERE la mescolanza, e un rosso "caldo" con dentro un po' di verde
  // renderebbe illeggibile la somma. Raggio 8 perche' nel mondo di test stanno
  // appese a mezz'aria sopra un pavimento chiaro: da 5 celle e mezzo di quota
  // una sfera da 8 lascia a terra una pozza di raggio ~5.8, larga abbastanza da
  // sovrapporsi alla vicina senza che le due lampade si tocchino.
  // PESANTI: cosi' le stesse lampade valgono anche per la prova "colorate +
  // ombra", dove il caso limite e' proprio due colori ai lati di un muro.
  lampadaRossa: {
    nome: 'Lampada rossa', cima: 0xffb9ad, lato: 0xe8503c, fondo: 0xc93a28,
    solido: true, nav: 10, fam: 'mina', salute: 100,
    luce: { colore: 0xff2a1a, raggio: 8, intensita: 1.1, ombra: true },
  },
  lampadaVerde: {
    nome: 'Lampada verde', cima: 0xb6ffc4, lato: 0x3fd45f, fondo: 0x2fae49,
    solido: true, nav: 10, fam: 'mina', salute: 100,
    luce: { colore: 0x1aff3a, raggio: 8, intensita: 1.1, ombra: true },
  },
  lampadaBlu: {
    nome: 'Lampada blu', cima: 0xb0c4ff, lato: 0x4064e0, fondo: 0x2f4cbd,
    solido: true, nav: 10, fam: 'mina', salute: 100,
    luce: { colore: 0x2a4aff, raggio: 8, intensita: 1.1, ombra: true },
  },

  // ---- IL NIDO DEI FUOCHI FATUI -------------------------------------------
  // Il blocco NON fa i fuochi fatui da solo: DICHIARA `fuochiFatui` e chi tiene
  // il registro (main.js) li accende con fx/fuochiFatui.js. E' la stessa regola
  // delle luci e delle particelle per-blocco — la tabella dice COSA, il modulo fa.
  //
  // La sua luce propria e' LEGGERA apposta, e non e' una svista sulla regola
  // "un blocco fermo e' pesante": qui il blocco e' l'alone comune dei fatui, e
  // un mondo di stress test pieno di nidi non deve mangiarsi l'atlante delle
  // ombre (48 piastrelle) prima ancora di aver acceso un solo fuoco fatuo.
  fuochiFatui: {
    nome: 'Nido di fuochi fatui', cima: 0xcdf6ff, lato: 0x4d8fa8, fondo: 0x35697d,
    solido: true, nav: 10, fam: 'mina', salute: 100,
    luce: { colore: 0x8fe4ff, raggio: 3, intensita: 0.7, ombra: false },
    fuochiFatui: {
      numero: 7, raggio: 3.2, quota: 1.9,
      luce: { colore: 0x9fe0ff, raggio: 4.2, intensita: 1.0 },
    },
  },

  acqua:   { nome: 'Acqua',   cima: 0x4fc2ec, lato: 0x3dade0, fondo: 0x3096cc, solido: false, nav: null, acqua: true },
};

/** Categorie del menu creativa (stile Minecraft). */
export const CATEGORIE_BLOCCHI = [
  { id: 'naturali', nome: 'Naturali', emoji: '🌿', blocchi: ['erba', 'terra', 'sabbia', 'ghiaia', 'neve', 'roccia', 'lucciola', 'acqua'] },
  { id: 'costruzione', nome: 'Costruzione', emoji: '🧱', blocchi: ['legno', 'tronco', 'asse', 'pietra', 'mattoni'] },
  { id: 'lane', nome: 'Lane', emoji: '🎨', blocchi: ['lanaBianca', 'lanaRossa', 'lanaBlu', 'lanaGialla', 'lanaVerde'] },
  // Categoria a parte perche' qui la scelta NON e' estetica: prendendo una
  // "lampada pesante" invece di una "leggera" si sceglie se pagare una mappa
  // d'ombra. Tenerle in mezzo ai blocchi naturali nascondeva la decisione.
  { id: 'luci', nome: 'Luci', emoji: '💡', blocchi: ['lucciola', 'lampadaPesante', 'lampadaLeggera', 'lampadaRossa', 'lampadaVerde', 'lampadaBlu', 'fuochiFatui'] },
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
