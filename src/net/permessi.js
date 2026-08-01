// I RUOLI DI UNA STANZA — chi può fare cosa a casa d'altri.
//
// ⚠ LA REGOLA CHE TIENE IN PIEDI TUTTO: decide l'HOST, non l'interfaccia.
// Nascondere un pulsante non è un permesso, è un suggerimento: chiunque apra la
// console del browser può mandare lo stesso messaggio a mano, e a quel punto un
// «visitatore» rade al suolo il diorama di chi l'ha invitato. Quindi l'host
// CONTROLLA OGNI EVENTO che gli arriva prima di applicarlo, e se non è permesso
// lo butta — senza nemmeno rimbalzarlo agli altri. Il gioco nasconde comunque i
// comandi che non servono, ma quello è garbo: la sicurezza sta di là.
//
// I QUATTRO RUOLI, e sono pensati sul gioco vero, non su una scaletta astratta:
//   · spettatore — guarda e vola. Non tocca niente, non sposta niente. È il
//     ruolo per far vedere il proprio mondo a qualcuno senza rischi.
//   · visitatore — cammina, si siede, PESCA, accende e spegne le cose (una
//     lampada, una porta). Vive il posto. Ma non rompe e non costruisce: il
//     diorama che trova è il diorama che lascia.
//   · costruttore — tutto quello del visitatore, più mettere e togliere. È
//     l'amico con cui si costruisce insieme.
//   · completo — come essere a casa propria.
//
// L'ospite riceve il ruolo entrando e può vederselo cambiare in corsa (l'host
// promuove o retrocede): il messaggio `ruolo` viaggia sul canale di segnalazione.

/** I ruoli in ordine di fiducia crescente. L'ordine CONTA: si confronta con >=. */
export const RUOLI = ['spettatore', 'visitatore', 'costruttore', 'completo'];

export const DESCRIZIONE = {
  spettatore: { icona: '👁', titolo: 'Spettatore', dice: 'guarda e vola, non tocca niente' },
  visitatore: { icona: '🚶', titolo: 'Visitatore', dice: 'cammina, si siede, pesca, accende e spegne' },
  costruttore: { icona: '🔨', titolo: 'Costruttore', dice: 'come il visitatore, e può anche costruire' },
  completo: { icona: '⭐', titolo: 'Completo', dice: 'può fare tutto, come a casa sua' },
};

/** Quanto è alto un ruolo nella scala. Sconosciuto = il più basso, mai il più alto. */
export function livello(ruolo) {
  const i = RUOLI.indexOf(ruolo);
  return i < 0 ? 0 : i;
}

// A ogni tipo di evento il ruolo MINIMO che lo consente. Chi non è in elenco è
// vietato per tutti tranne il padrone di casa: un evento nuovo che nessuno ha
// classificato non deve passare per distrazione — meglio che non funzioni e si
// noti, piuttosto che passi e non se ne accorga nessuno.
const MINIMO = {
  furniStato: 'visitatore',    // accendere una lampada, aprire una porta, pescare
  metti: 'costruttore',
  togli: 'costruttore',
  furniPiazza: 'costruttore',
  furniRimuovi: 'costruttore',
};

/**
 * L'evento `e` è permesso a chi ha questo `ruolo`?
 * @param ruolo il ruolo dell'ospite che l'ha mandato
 * @param e     l'evento, come arriva dalla rete
 */
export function puo(ruolo, e) {
  if (!e || typeof e.tipo !== 'string') return false;
  if (livello(ruolo) >= livello('completo')) return true;
  const min = MINIMO[e.tipo];
  if (!min) return false;                       // tipo sconosciuto: si nega
  return livello(ruolo) >= livello(min);
}

/** Può muoversi liberamente in volo? Solo lo spettatore — è il suo mestiere. */
export function vola(ruolo) { return ruolo === 'spettatore'; }

/** Può COSTRUIRE? Serve al gioco per nascondere i comandi che non userebbe. */
export function costruisce(ruolo) { return livello(ruolo) >= livello('costruttore'); }

/** Può interagire con le cose (pescare, accendere)? */
export function interagisce(ruolo) { return livello(ruolo) >= livello('visitatore'); }
