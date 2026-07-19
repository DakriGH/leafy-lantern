// SALA PROVE: un mondo piatto dove OGNI cosa che l'Officina sa fare è piazzata
// separata, in file ordinate, così si controlla tutto a colpo d'occhio senza
// doverla ricreare a mano ogni volta.
//
// Disposizione (il gatto parte davanti alla fila 1, guarda verso z crescente):
//   fila 1  tutti i blocchi di base
//   fila 2  le forme            (cubo · bordino · lastra · pilastro · croce)
//   fila 3  i motivi            (liscio · chiazze · venature · sfumato)
//   fila 4  le reazioni         (fisso · stagione · quota, a torretta di 6)
//   fila 5  effetti             (luce · scintille · fumo · bolle · 6 facce)
// Fra un campione e l'altro c'è sempre una cella vuota: niente culling fra
// vicini, ogni pezzo si vede per intero da tutti i lati.

import { BLOCCHI, registraBlocco } from './blocks.js?v=mrs9orgs';

const PASSO = 3;          // distanza fra un campione e il successivo
const FILA = 4;           // distanza fra una fila e l'altra
const LATO = 26;          // mezzo lato del pavimento

/** I blocchi dimostrativi: esistono solo qui, prefisso mostra: per non
 *  confonderli con quelli dell'utente (prefisso off:). */
function registraCampioni() {
  const base = { solido: true, nav: 10, fam: 'mina', salute: 100, officina: true };
  const grigio = { cima: 0xb9c0cb, lato: 0xa3aab6, fondo: 0x8f96a2 };

  // forme
  registraBlocco('mostra:cubo',     { ...base, ...grigio, nome: 'Forma: cubo' });
  registraBlocco('mostra:bordino',  { ...base, cima: 0x64bb4f, lato: 0xc98f60, fondo: 0xb57e50, cappello: true, nome: 'Forma: bordino' });
  registraBlocco('mostra:lastra',   { ...base, ...grigio, forma: 'lastra',   nome: 'Forma: lastra' });
  registraBlocco('mostra:pilastro', { ...base, ...grigio, forma: 'pilastro', nome: 'Forma: pilastro' });
  registraBlocco('mostra:croce',    { ...base, cima: 0x4faa3e, lato: 0x3f8a32, fondo: 0x357528, forma: 'croce', solido: false, nome: 'Forma: croce' });

  // motivi
  registraBlocco('mostra:liscio',   { ...base, ...grigio, nome: 'Motivo: liscio' });
  registraBlocco('mostra:chiazze',  { ...base, ...grigio, motivo: 'chiazze',  motivoForza: 0.8, nome: 'Motivo: chiazze' });
  registraBlocco('mostra:venature', { ...base, cima: 0xb08650, lato: 0x9c7242, fondo: 0x8d6539, motivo: 'venature', motivoForza: 0.8, nome: 'Motivo: venature' });
  registraBlocco('mostra:sfumato',  { ...base, ...grigio, motivo: 'sfumato',  motivoForza: 0.9, nome: 'Motivo: sfumato' });

  // reazioni all'ambiente
  registraBlocco('mostra:fisso',     { ...base, ...grigio, nome: 'Reazione: nessuna' });
  registraBlocco('mostra:stagione',  { ...base, cima: 0x8ecf6a, lato: 0x79b657, fondo: 0x659c49, reagisce: 'stagione', reagisceForza: 1, nome: 'Reazione: stagioni' });
  registraBlocco('mostra:quota',     { ...base, ...grigio, reagisce: 'quota', reagisceForza: 1, nome: 'Reazione: altezza' });

  // effetti
  registraBlocco('mostra:luce', {
    ...base, cima: 0xa8ffb0, lato: 0x5fd66e, fondo: 0x46b957, nome: 'Effetto: luce',
    luce: { colore: 0x7dffa0, raggio: 5, intensita: 1.1 },
  });
  const part = (id, nome, tipo, colore, salita) => registraBlocco(id, {
    ...base, ...grigio, nome,
    particelle: { tipo, colore, ritmo: 0.6, salita, su: 1 },
  });
  part('mostra:scintille', 'Effetto: scintille', 'scintille', [1, 0.88, 0.45], 0.55);
  part('mostra:fumo',      'Effetto: fumo',      'fumo',      [0.8, 0.8, 0.85], 1.15);
  part('mostra:bolle',     'Effetto: bolle',     'bolle',     [0.55, 0.85, 1],  0.35);
  registraBlocco('mostra:facce', {
    ...base, ...grigio, nome: 'Effetto: 6 facce dipinte',
    // ordine: +X −X +Y(cima) −Y(fondo) +Z −Z
    facce: [0xe05a4e, 0x4a7fd4, 0xf2c94c, 0x58b368, 0xe07ad0, 0x4fc2ec],
  });
}

/** Le file della sala, in ordine. */
export function fileMostra() {
  const diBase = Object.keys(BLOCCHI).filter((id) => !id.startsWith('mostra:') && !BLOCCHI[id].officina);
  return [
    { nome: 'Blocchi di base', ids: diBase },
    { nome: 'Forme', ids: ['mostra:cubo', 'mostra:bordino', 'mostra:lastra', 'mostra:pilastro', 'mostra:croce'] },
    { nome: 'Motivi', ids: ['mostra:liscio', 'mostra:chiazze', 'mostra:venature', 'mostra:sfumato'] },
    { nome: 'Reazioni', ids: ['mostra:fisso', 'mostra:stagione', 'mostra:quota'], torretta: 6 },
    { nome: 'Effetti', ids: ['mostra:luce', 'mostra:scintille', 'mostra:fumo', 'mostra:bolle', 'mostra:facce'] },
  ];
}

/**
 * Costruisce la sala prove. Ritorna dove far comparire il gatto e un riassunto.
 * @param mondo il mondo da riempire (viene SVUOTATO)
 */
export function generaMostra(mondo) {
  mondo.chunks.clear();
  mondo.contaBlocchi = 0;
  mondo.furni?.clear?.();
  registraCampioni();

  // pavimento piatto: pietra liscia, con un bordo d'erba per orientarsi
  const Y = 0;
  for (let x = -LATO; x <= LATO; x++) {
    for (let z = -LATO; z <= LATO; z++) {
      const bordo = Math.abs(x) === LATO || Math.abs(z) === LATO;
      mondo.metti(x, Y, z, bordo ? 'erba' : 'pietra', true);   // silenzioso: niente eventi
    }
  }

  const file = fileMostra();
  let z = -8;
  let campioni = 0;
  for (const f of file) {
    // ogni fila parte centrata, così la sala resta simmetrica
    const larghezza = (f.ids.length - 1) * PASSO;
    let x = -Math.round(larghezza / 2);
    for (const id of f.ids) {
      if (!BLOCCHI[id]) continue;
      const alt = f.torretta || 1;
      for (let h = 0; h < alt; h++) mondo.metti(x, Y + 1 + h, z, id, true);
      x += PASSO;
      campioni++;
    }
    z += FILA;
  }

  return {
    // il gatto guarda verso −z di default: lo si mette OLTRE l'ultima fila,
    // così le vede tutte davanti a sé senza doversi girare
    spawn: { x: 0, y: Y + 1, z: z + 2 },
    file: file.length,
    campioni,
    blocchi: mondo.contaBlocchi,
  };
}
