// CRAFTING (M6): trasforma materiali in altri blocchi. La TABELLA è l'unica
// fonte di verità — aggiungere una ricetta = una riga qui, niente altro.
// Ogni ricetta: { out, n, in:[{id,q}], nome }. Gli id sono quelli di blocks.js.

export const RICETTE = [
  { out: 'asse', n: 4, in: [{ id: 'tronco', q: 1 }], nome: 'Assi chiare' },
  { out: 'legno', n: 2, in: [{ id: 'asse', q: 3 }], nome: 'Legno' },
  { out: 'pietra', n: 4, in: [{ id: 'roccia', q: 2 }], nome: 'Pietra liscia' },
  { out: 'mattoni', n: 4, in: [{ id: 'pietra', q: 2 }], nome: 'Mattoni' },
  { out: 'lucciola', n: 1, in: [{ id: 'lanaGialla', q: 2 }, { id: 'tronco', q: 1 }], nome: 'Lucciola verde' },
  { out: 'ghiaia', n: 2, in: [{ id: 'roccia', q: 1 }], nome: 'Ghiaia' },
];

/** Hai i materiali per questa ricetta? `conta(id)` → numero (o Infinity). */
export function puoiCraftare(ricetta, conta) {
  return ricetta.in.every((m) => {
    const n = conta(m.id);
    return n === Infinity || n >= m.q;
  });
}

/** Applica la ricetta: consuma gli input, aggiunge l'output. Ritorna true. */
export function crafta(ricetta, inventario) {
  if (!puoiCraftare(ricetta, (id) => inventario.quanti(id))) return false;
  for (const m of ricetta.in) inventario.togli(m.id, m.q);
  inventario.aggiungi(ricetta.out, ricetta.n);
  return true;
}
