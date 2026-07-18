// DROP: cosa lascia un blocco quando si rompe, in base all'ATTREZZO usato.
// Filosofia delle BlockDefinition Unity dell'utente: l'attrezzo GIUSTO estrae
// il blocco vero, le mani nude una versione "povera" (o niente).
// PRESET di partenza, pensati per essere ritoccati qui senza toccare altro:
// la tabella è l'unica fonte di verità, main la interroga e basta.

const POVERO = {
  erba: 'terra',        // senza vanga la zolla si sbriciola
  roccia: 'ghiaia',     // senza piccone restano sassi
  pietra: 'ghiaia',
  mattoni: 'ghiaia',
  neve: null,           // a mani nude si scioglie: niente
  lucciola: null,       // la luce si spegne se non la stacchi col piccone
};

/** Ritorna [{ id, quanti }] per un blocco rotto. `giusto` = attrezzo della
 *  famiglia corretta in mano. */
export function dropDi(tipoBase, def, giusto) {
  if (giusto) return [{ id: tipoBase, quanti: 1 }];
  if (tipoBase in POVERO) {
    const p = POVERO[tipoBase];
    return p ? [{ id: p, quanti: 1 }] : [];
  }
  return [{ id: tipoBase, quanti: 1 }];   // legni e lane si raccolgono comunque
}
