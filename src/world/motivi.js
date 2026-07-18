// MOTIVI: la "texture" possibile in questo motore. Qui i blocchi sono colorati
// PER VERTICE, senza UV né atlas: una texture a immagine vorrebbe dire riscrivere
// il cuore del rendering. La resa equivalente — e coerente con lo stile piatto —
// è variare il colore CELLA PER CELLA in modo deterministico: due blocchi uguali
// affiancati non sono più identici, e il materiale "si legge".
//
// Modulo PURO: nessun three.js, nessuno stato. Testabile da solo.
//   tinta(colore, motivo, forza, x, y, z) → colore variato

export const MOTIVI = [
  { id: 'liscio',   nome: 'Liscio (nessuno)' },
  { id: 'chiazze',  nome: 'Chiazze (pietra, terra)' },
  { id: 'venature', nome: 'Venature (legno, strati)' },
  { id: 'sfumato',  nome: 'Sfumato in altezza' },
];

/** Hash intero deterministico da 3 coordinate → 0..1. Niente Math.random:
 *  lo stesso blocco deve avere SEMPRE la stessa sfumatura, anche dopo un
 *  ricaricamento o su un altro dispositivo (P2P). */
export function rumore(x, y, z) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 1000) / 1000;
}

/** Applica una variazione di luminosità a un colore intero 0xRRGGBB. */
function schiarisci(colore, k) {
  const r = (colore >> 16) & 255, g = (colore >> 8) & 255, b = colore & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/**
 * Colore della cella secondo il motivo.
 * @param colore tinta di base · @param forza 0..1 quanto si nota
 */
export function tinta(colore, motivo, forza, x, y, z) {
  if (!motivo || motivo === 'liscio' || !forza) return colore;
  let k = 0;
  if (motivo === 'chiazze') {
    k = (rumore(x, y, z) - 0.5) * 2;                       // sale e scende a caso
  } else if (motivo === 'venature') {
    // strisce orizzontali: stessa quota = stessa venatura, con un filo di rumore
    k = (rumore(0, y, 0) - 0.5) * 2 * 0.7 + (rumore(x, y, z) - 0.5) * 0.3;
  } else if (motivo === 'sfumato') {
    // più in alto = più chiaro, con periodo lungo così non si ripete a vista
    k = (((y % 16) + 16) % 16) / 16 - 0.5;
  }
  return schiarisci(colore, k * forza * 0.34);             // 0.34 = mai slavato
}

/** Palette intera variata in un colpo solo (cima/lato/fondo + le 6 facce). */
export function tintaPalette(pal, motivo, forza, x, y, z) {
  if (!motivo || motivo === 'liscio' || !forza) return pal;
  const t = (c) => tinta(c, motivo, forza, x, y, z);
  return {
    cima: t(pal.cima), lato: t(pal.lato), fondo: t(pal.fondo),
    facce: pal.facce ? pal.facce.map(t) : null,
  };
}
