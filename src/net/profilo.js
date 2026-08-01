// IL PROFILO — chi sei, per gli altri. Modulo a sé, e resterà a sé: oggi tiene
// un nome e un colore, domani terrà l'aspetto del gatto, i vestiti, i titoli. La
// ragione per separarlo adesso, che costa poco e più tardi costerebbe molto:
// tutto il resto del multiplayer (la bussata, l'elenco membri, la chat, la
// targhetta sopra la testa) lo CHIEDE già. Se il profilo fosse tre variabili
// sparse in main, aggiungerci qualcosa vorrebbe dire toccare cinque punti.
//
// STA SUL DISPOSITIVO, non su un server: non c'è registrazione, non c'è
// password, non c'è niente da rubare. È un biglietto da visita, non un account —
// e per un gioco rilassante è la scelta giusta: si entra e si gioca.

const CHIAVE = 'lantern.profilo';

// Colori scelti per essere DISTINGUIBILI FRA LORO a colpo d'occhio su un prato
// verde e di notte: niente verdi (si perdono nell'erba), niente scuri (di notte
// spariscono). Sono i sei che restano leggibili in tutte e due le condizioni.
export const COLORI = [
  '#5bd1ff', '#ff8fb1', '#ffd166', '#c792ff', '#ff9f5b', '#7cffb0',
];

const NOMI = ['Gatto', 'Micio', 'Nuvola', 'Lanterna', 'Foglia', 'Riva', 'Fiocco', 'Brezza'];

function aCaso(a) { return a[Math.floor(Math.random() * a.length)]; }

/** Il profilo di adesso. Se non c'è, ne inventa uno decente invece di lasciarlo vuoto. */
export function leggiProfilo() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch { p = null; }
  if (!p || typeof p !== 'object') p = {};
  const nome = tagliaNome(p.nome) || (aCaso(NOMI) + ' ' + (100 + Math.floor(Math.random() * 900)));
  const colore = COLORI.includes(p.colore) ? p.colore : aCaso(COLORI);
  return { nome, colore };
}

export function salvaProfilo(p) {
  const pulito = { nome: tagliaNome(p.nome) || leggiProfilo().nome, colore: COLORI.includes(p.colore) ? p.colore : leggiProfilo().colore };
  try { localStorage.setItem(CHIAVE, JSON.stringify(pulito)); } catch { /* pieno */ }
  return pulito;
}

/**
 * Il nome, ripulito. Non è pignoleria: questo testo finisce sopra la testa di un
 * avatar e dentro l'elenco dei membri di casa d'altri. Via i caratteri di
 * controllo (che possono spezzare il layout), via gli spazi doppi, e un tetto di
 * venti caratteri — oltre non ci sta nella targhetta e diventa una striscia.
 */
export function tagliaNome(n) {
  if (typeof n !== 'string') return '';
  // DUE PASSATE, e la differenza fra le due conta.
  //  1. gli invisibili si CANCELLANO: uno spazio a larghezza zero serve solo a
  //     fabbricare un nome identico a quello di un altro, e due «Dakri» nella
  //     stessa stanza sono un problema, non un dettaglio;
  //  2. i caratteri di controllo diventano uno SPAZIO, non spariscono: un a capo
  //     fra nome e cognome deve restare una separazione, se no «Mario\nRossi»
  //     esce «MarioRossi» — sbagliato in un modo che si legge male e basta.
  // Scritti per codice e non incollati: un byte invisibile dentro il sorgente e'
  // un errore che nessuno vede rileggendo il file.
  return n.replace(/[\u200b-\u200f\u2028\u2029\ufeff]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 20);
}
