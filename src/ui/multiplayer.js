// IL PANNELLO «INSIEME» — la faccia del multiplayer.
//
// PERCHÉ È UN MODULO A SÉ E COSTRUISCE IL PROPRIO DOM invece di stare in
// index.html: questo pannello mostra, in ogni sua riga, testo che arriva da
// ALTRE PERSONE — nomi, nomi di stanze, messaggi. Tenerlo qui vuol dire che c'è
// UN posto solo dove si decide come quel testo finisce sullo schermo, e la
// regola è una: `textContent`, mai `innerHTML`. In questo file non c'è una sola
// stringa di markup costruita con dati altrui, e si vede a colpo d'occhio.
// (Era una falla vera: bastava chiamarsi `<img src=x onerror=…>` per far
// eseguire codice nella pagina di chi ospitava.)
//
// COSA MOSTRA, in quest'ordine — che è l'ordine in cui uno ci pensa:
//   1. chi sono (nome e colore, cambiabili al volo)
//   2. la mia stanza: aprirla, il codice da dire agli amici, chi c'è dentro e
//      con che permessi, e chi sta bussando
//   3. le stanze aperte degli altri
//   4. la chat
//   5. moderazione, se si ha la password
//
// SI AGGIORNA SOLO QUANDO SERVE. La lista delle stanze si chiede al server
// mentre il pannello è APERTO e non un attimo di più: un pannello chiuso che
// interroga il server ogni cinque secondi è, su cento giocatori, un migliaio di
// richieste al minuto per disegnare qualcosa che nessuno sta guardando.

import { RUOLI, DESCRIZIONE } from '../net/permessi.js?v=mtau1x4q';
import { leggiProfilo, salvaProfilo, COLORI } from '../net/profilo.js?v=mtau1x4q';

const OGNI_STANZE_MS = 6000;

/** Un elemento con testo. L'unico modo in cui in questo file nasce del contenuto. */
function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
}
function bottone(testo, classe, alClic) {
  const b = el('button', classe || 'mp-b', testo);
  b.addEventListener('click', alClic);
  return b;
}

export class PannelloInsieme {
  /**
   * @param api il ponte col gioco. Il pannello non conosce main: chiede e basta.
   *   { urlServer, versione, apri(opz), entra(code, pw), chiudi(), stato(),
   *     membri(), ammetti(gid, ruolo), rifiuta(gid), cambiaRuolo(gid, ruolo),
   *     mandaChat(testo), esci(gid) }
   */
  constructor(api) {
    this.api = api;
    this.aperto = false;
    this.bussate = new Map();      // gid → { nome, colore }
    this.gettoneAdmin = null;
    this._timer = null;
    this._costruisci();
  }

  // ---- COSTRUZIONE ---------------------------------------------------------
  _costruisci() {
    const p = el('div', 'hud pannello mp');
    p.id = 'mp';
    this.el = p;

    const testa = el('div', 'mp-testa');
    testa.append(el('b', null, '👥 Insieme'));
    this.stato = el('span', 'mp-stato', 'da soli');
    testa.append(this.stato, bottone('✕', 'mp-x', () => this.apri(false)));
    p.append(testa);

    // ⚠ SCHEDE, NON UNA COLONNA UNICA. La prima versione metteva le cinque
    // sezioni una sotto l'altra e il committente l'ha bocciata in una parola:
    // «confusionaria». Aveva ragione, e la ragione e' che quelle cinque cose non
    // si guardano MAI insieme — o stai cercando dove giocare, o sei in una stanza
    // e guardi chi c'e', o stai chattando. Metterle tutte a schermo insieme
    // costringe a leggerle tutte per trovarne una.
    const barra = el('div', 'mp-schede');
    this.schede = {};
    this.pagine = {};
    const definisci = (chiave, etichetta, contenuto) => {
      const b = bottone(etichetta, 'mp-scheda', () => this.mostra(chiave));
      barra.append(b);
      this.schede[chiave] = b;
      this.pagine[chiave] = contenuto;
      contenuto.classList.add('mp-pagina');
      p.append(contenuto);
    };
    p.append(barra);
    definisci('gioca', '🚪 Entra', this._paginaGioca());
    definisci('stanza', '🏠 La tua stanza', this._paginaMiaStanza());
    definisci('chat', '💬 Chat', this._sezioneChat());
    definisci('admin', '🛡', this._sezioneAdmin());

    document.body.appendChild(p);
    this.mostra('gioca');
  }

  _titolo(t) { return el('div', 'mp-tit', t); }

  /** Mostra una scheda sola. */
  mostra(chiave) {
    this.scheda = chiave;
    for (const k of Object.keys(this.pagine)) {
      this.pagine[k].style.display = k === chiave ? 'block' : 'none';
      this.schede[k].classList.toggle('attiva', k === chiave);
    }
    if (chiave === 'gioca') this._chiediStanze();
    if (chiave === 'admin' && this.gettoneAdmin) this._adminAggiorna();
    if (chiave === 'stanza') this.aggiorna();
  }

  /** «Entra»: il profilo e le stanze dove andare. Le due cose che servono PRIMA. */
  _paginaGioca() {
    const d = el('div');
    d.append(this._sezioneProfilo(), this._sezioneStanzeAperte());
    return d;
  }

  _paginaMiaStanza() { return this._sezioneMiaStanza(); }

  _sezioneProfilo() {
    const s = el('div', 'mp-sez');
    s.append(this._titolo('Chi sei'));
    const io = leggiProfilo();

    this.nomeIn = el('input', 'mp-input');
    this.nomeIn.type = 'text';
    this.nomeIn.maxLength = 20;
    this.nomeIn.value = io.nome;
    this.nomeIn.placeholder = 'il tuo nome';
    this.nomeIn.addEventListener('change', () => this._salvaProfilo());

    const colori = el('div', 'mp-colori');
    this.pastiglie = COLORI.map((c) => {
      const b = el('button', 'mp-col');
      b.style.background = c;
      b.title = 'colore ' + c;
      b.addEventListener('click', () => { this.colore = c; this._salvaProfilo(); });
      colori.append(b);
      return { c, b };
    });
    this.colore = io.colore;

    s.append(this.nomeIn, colori,
      el('div', 'mp-nota', 'Nome e colore ti distinguono sopra la testa. Restano sul tuo dispositivo.'));
    this._dipingiColori();
    return s;
  }

  _dipingiColori() {
    for (const { c, b } of this.pastiglie) b.classList.toggle('scelto', c === this.colore);
  }

  _salvaProfilo() {
    const p = salvaProfilo({ nome: this.nomeIn.value, colore: this.colore });
    this.nomeIn.value = p.nome;      // rimesso PULITO: chi ha scritto spazi lo vede
    this.colore = p.colore;
    this._dipingiColori();
    if (this.api.profiloCambiato) this.api.profiloCambiato(p);
  }

  _sezioneMiaStanza() {
    const s = el('div', 'mp-sez');
    s.append(this._titolo('La tua stanza'));

    this.nomeStanza = el('input', 'mp-input');
    this.nomeStanza.type = 'text';
    this.nomeStanza.maxLength = 32;
    this.nomeStanza.placeholder = 'come si chiama il tuo mondo';

    this.pubblica = el('input');
    this.pubblica.type = 'checkbox';
    this.bussare = el('input');
    this.bussare.type = 'checkbox';
    this.bussare.checked = true;
    this.pw = el('input', 'mp-input');
    this.pw.type = 'text';
    this.pw.placeholder = 'password (facoltativa)';
    this.pw.maxLength = 40;

    const riga = (etichetta, campo, spiega) => {
      const l = el('label', 'mp-check');
      l.append(campo, el('span', null, etichetta));
      if (spiega) l.title = spiega;
      return l;
    };

    this.apriB = bottone('🏠 Apri la stanza', 'mp-big', () => this._apri());
    this.chiudiB = bottone('⭘ Chiudi la stanza', 'mp-big', () => this.api.chiudi());
    this.chiudiB.style.display = 'none';

    this.codiceBox = el('div', 'mp-codice');
    this.codiceBox.style.display = 'none';

    this.bussateBox = el('div', 'mp-bussate');
    this.membriBox = el('div', 'mp-membri');

    s.append(this.nomeStanza,
      riga('Elencala fra le stanze aperte', this.pubblica, 'Se spento, la trovi solo chi ha il codice'),
      riga('Fammi accettare chi arriva', this.bussare, 'Se spento, chi ha il codice entra dritto'),
      this.pw, this.apriB, this.chiudiB, this.codiceBox, this.bussateBox, this.membriBox);
    return s;
  }

  _sezioneStanzeAperte() {
    const s = el('div', 'mp-sez');
    s.append(this._titolo('Stanze aperte'));
    this.listaStanze = el('div', 'mp-lista');
    this.listaStanze.append(el('div', 'mp-nota', 'Cerco…'));

    const conCodice = el('div', 'mp-riga');
    this.codiceIn = el('input', 'mp-input');
    this.codiceIn.type = 'text';
    this.codiceIn.maxLength = 6;
    this.codiceIn.placeholder = 'codice';
    this.codiceIn.style.textTransform = 'uppercase';
    conCodice.append(this.codiceIn, bottone('Entra', 'mp-b', () => this._entra(this.codiceIn.value)));

    s.append(this.listaStanze, conCodice);
    return s;
  }

  _sezioneChat() {
    const s = el('div', 'mp-sez');
    s.append(this._titolo('Chat'));
    this.chatBox = el('div', 'mp-chat');
    const riga = el('div', 'mp-riga');
    this.chatIn = el('input', 'mp-input');
    this.chatIn.type = 'text';
    this.chatIn.maxLength = 200;
    this.chatIn.placeholder = 'scrivi…';
    this.chatIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._manda(); });
    riga.append(this.chatIn, bottone('Invia', 'mp-b', () => this._manda()));
    s.append(this.chatBox, riga);
    return s;
  }

  _sezioneAdmin() {
    const s = el('div', 'mp-sez mp-admin');
    s.append(this._titolo('Moderazione'));
    this.adminPw = el('input', 'mp-input');
    this.adminPw.type = 'password';
    this.adminPw.placeholder = 'password di moderazione';
    this.adminEntra = bottone('Entra', 'mp-b', () => this._adminEntra());
    const riga = el('div', 'mp-riga');
    riga.append(this.adminPw, this.adminEntra);
    this.adminBox = el('div', 'mp-lista');
    this.adminRiga = riga;
    // ⚠ QUANDO SEI DENTRO, LA PORTA NON SI MOSTRA PIU'. Lasciare il campo della
    // password sopra un cruscotto gia' pieno di dati fa dubitare di essere
    // entrati davvero: si vede la serratura e si pensa di essere ancora fuori.
    this.adminEsci = bottone('Esci dalla moderazione', 'mp-b mp-no', () => {
      this.gettoneAdmin = null;
      this.adminBox.replaceChildren();
      this._adminMostraPorta(true);
    });
    this.adminEsci.style.display = 'none';
    s.append(riga, this.adminEsci, this.adminBox);
    return s;
  }

  _adminMostraPorta(si) {
    if (this.adminRiga) this.adminRiga.style.display = si ? 'flex' : 'none';
    if (this.adminEsci) this.adminEsci.style.display = si ? 'none' : 'block';
  }

  // ---- AZIONI --------------------------------------------------------------
  _apri() {
    this.api.apri({
      nome: this.nomeStanza.value.trim() || (leggiProfilo().nome + ' — casa'),
      pubblica: this.pubblica.checked,
      bussare: this.bussare.checked,
      pw: this.pw.value.trim(),
    });
  }

  /**
   * ⚠ LA LISTA DELLE STANZE ARRIVA A PEZZI. Ogni copia del server conosce le
   * stanze aperte su di se': una domanda sola rende una lista PARZIALE, e la
   * stessa domanda ripetuta rende liste diverse — che e' il motivo per cui la
   * lista sembrava svuotarsi e riempirsi da sola. Si chiede tre volte e si
   * uniscono le risposte: non e' elegante, ma e' quello che si puo' fare da
   * questa parte del filo, e la differenza si vede.
   */
  async _chiediPiuVolte(via, quante = 3) {
    const per = new Map();
    let aVuoto = 0;
    for (let i = 0; i < quante; i++) {
      try {
        const r = await fetch(via);
        if (!r.ok) continue;
        const d = await r.json();
        const prima = per.size;
        for (const st of (d.stanze || [])) if (!per.has(st.code)) per.set(st.code, st);
        if (i === 0) this._ultimoCorpo = d;
        // ⚠ E SI SMETTE APPENA NON ARRIVA PIU' NIENTE DI NUOVO. Questo giro di
        // domande e' un ripiego: se il server tiene il suo registro condiviso
        // (`/diag` → `copieCheRispondono` maggiore di zero) la PRIMA risposta e'
        // gia' completa, e le altre due sono richieste buttate — moltiplicate per
        // ogni giocatore col pannello aperto, su un piano gratuito dove le
        // richieste sono la cosa contata. Un giro a vuoto non prova niente (le
        // copie sono poche e ci si ricapita); due di fila vogliono dire che la
        // lista e' quella.
        if (per.size === prima && ++aVuoto >= 2) break;
        else if (per.size > prima) aVuoto = 0;
      } catch { /* una copia che non risponde non ferma le altre */ }
    }
    return [...per.values()];
  }

  _entra(code, pw, spia) {
    const c = String(code || '').trim().toUpperCase();
    if (c.length < 3) return;
    this.api.entra(c, pw !== undefined ? pw : '', spia || '');
  }

  _manda() {
    const t = this.chatIn.value.trim();
    if (!t) return;
    this.chatIn.value = '';
    this.api.mandaChat(t.slice(0, 200));
  }

  // ---- DALLA RETE ----------------------------------------------------------
  /** Qualcuno bussa. Si mostra chi è e le due risposte possibili. */
  bussano(gid, chi) {
    this.bussate.set(gid, chi || {});
    this._dipingiBussate();
    this.apri(true);
  }

  _dipingiBussate() {
    const b = this.bussateBox;
    b.replaceChildren();
    for (const [gid, chi] of this.bussate) {
      const r = el('div', 'mp-bussa');
      const punto = el('span', 'mp-punto');
      punto.style.background = chi.colore || '#8ab';
      // ⚠ textContent: il nome viene da una persona che non conosco
      r.append(punto, el('b', null, chi.nome || 'qualcuno'), el('span', 'mp-nota', ' vuole entrare'));

      const scelte = el('div', 'mp-riga');
      const sel = el('select', 'mp-input');
      for (const ru of RUOLI) {
        const o = el('option', null, `${DESCRIZIONE[ru].icona} ${DESCRIZIONE[ru].titolo}`);
        o.value = ru;
        if (ru === 'visitatore') o.selected = true;
        sel.append(o);
      }
      scelte.append(sel,
        bottone('Fallo entrare', 'mp-b mp-si', () => { this.api.ammetti(gid, sel.value); this.bussate.delete(gid); this._dipingiBussate(); }),
        bottone('No', 'mp-b mp-no', () => { this.api.rifiuta(gid); this.bussate.delete(gid); this._dipingiBussate(); }));
      r.append(scelte);
      b.append(r);
    }
  }

  chatArrivata(nome, testo, mio = false) {
    const r = el('div', 'mp-msg' + (mio ? ' mio' : ''));
    r.append(el('b', null, nome), ' ', document.createTextNode(testo));
    this.chatBox.append(r);
    while (this.chatBox.children.length > 80) this.chatBox.removeChild(this.chatBox.firstChild);
    this.chatBox.scrollTop = this.chatBox.scrollHeight;
  }

  /**
   * Il momento piu' delicato di tutto il multiplayer: hai chiesto di entrare e
   * non sta succedendo niente. Senza una riga che lo dica, un'attesa di tre
   * secondi e un rifiuto silenzioso si assomigliano — e il committente ha
   * passato una prova intera senza capire perche' non entrava.
   */
  attesa(msg) {
    this.avviso(msg || 'Ho bussato: aspetto che ti facciano entrare…', 'attesa');
    this.mostra('stanza');
    this.apri(true);
  }

  /** Un rifiuto, o un errore che ha un perche'. Si dice, non si tace. */
  respinto(codice, dati = {}) {
    const testi = {
      versione: `Quella stanza gira una versione diversa del gioco (${dati.stanza || '?'}, tu hai ${dati.tuo || '?'}). Ricarica la pagina per aggiornarti.`,
      password: 'Password sbagliata.',
      piena: 'La stanza è piena.',
      rifiutato: 'Non ti hanno fatto entrare.',
      'gia-dentro': 'Sei già in una stanza: esci prima di entrarne in un\u2019altra.',
      'gia-aperta': 'Hai già una stanza aperta.',
    };
    this.avviso(testi[codice] || dati.msg || 'Non si è potuto entrare.', 'no');
    this.mostra('stanza');
    this.apri(true);
  }

  /** La riga di avviso in cima al pannello: una sola, sempre nello stesso posto. */
  avviso(testo, tipo) {
    if (!this.avvisoEl) {
      this.avvisoEl = el('div', 'mp-avviso');
      this.el.querySelector('.mp-schede').after(this.avvisoEl);
    }
    this.avvisoEl.className = 'mp-avviso ' + (tipo || '');
    this.avvisoEl.textContent = testo || '';
    this.avvisoEl.style.display = testo ? 'block' : 'none';
  }

  /** Lo stato della stanza: codice, testo in cima, elenco membri coi ruoli. */
  aggiorna() {
    const st = this.api.stato();
    this.stato.textContent = st.testo || 'da soli';
    const ospito = st.ruolo === 'host';
    this.apriB.style.display = st.dentro ? 'none' : '';
    this.chiudiB.style.display = st.dentro ? '' : 'none';
    this.codiceBox.style.display = st.codice ? '' : 'none';
    if (st.codice) {
      this.codiceBox.replaceChildren(el('span', 'mp-nota', 'Codice da dire agli amici: '), el('b', 'mp-cod', st.codice));
    }

    const m = this.membriBox;
    m.replaceChildren();
    const membri = this.api.membri();
    if (!membri.length) { m.append(el('div', 'mp-nota', st.dentro ? 'Ancora nessuno.' : '')); return; }
    for (const x of membri) {
      const r = el('div', 'mp-membro');
      const punto = el('span', 'mp-punto');
      punto.style.background = x.colore || '#8ab';
      r.append(punto, el('b', null, x.nome));
      if (ospito) {
        const sel = el('select', 'mp-input mp-mini');
        for (const ru of RUOLI) {
          const o = el('option', null, `${DESCRIZIONE[ru].icona} ${DESCRIZIONE[ru].titolo}`);
          o.value = ru;
          if (ru === x.ruolo) o.selected = true;
          sel.append(o);
        }
        sel.addEventListener('change', () => this.api.cambiaRuolo(x.gid, sel.value));
        r.append(sel, bottone('Fuori', 'mp-b mp-no', () => this.api.esci(x.gid)));
      } else if (x.ruolo) {
        const d = DESCRIZIONE[x.ruolo];
        r.append(el('span', 'mp-nota', d ? ` ${d.icona} ${d.titolo}` : ''));
      }
      m.append(r);
    }
  }

  // ---- LE STANZE APERTE ----------------------------------------------------
  async _chiediStanze() {
    if (!this.api.urlServer) { this.listaStanze.replaceChildren(el('div', 'mp-nota', 'Nessun server configurato.')); return; }
    try {
      const lista = await this._chiediPiuVolte(this.api.urlServer.replace(/\/+$/, '') + '/stanze');
      this._dipingiStanze(lista);
    } catch {
      this.listaStanze.replaceChildren(el('div', 'mp-nota', 'Server non raggiungibile.'));
    }
  }

  _dipingiStanze(lista) {
    const box = this.listaStanze;
    box.replaceChildren();
    if (!lista.length) { box.append(el('div', 'mp-nota', 'Nessuna stanza aperta in questo momento.')); return; }
    for (const s of lista) {
      const r = el('div', 'mp-stanza');
      const su = el('div', 'mp-stanza-su');
      su.append(el('b', null, s.nome));                       // testo altrui: textContent
      su.append(el('span', 'mp-nota', ` ${s.dentro}/${s.max}`));
      if (s.conPassword) su.append(el('span', 'mp-tag', '🔒'));
      if (s.bussare) su.append(el('span', 'mp-tag', '🚪'));
      r.append(su);

      // ⚠ LA VERSIONE SI DICE PRIMA DI PROVARE, non dopo il rifiuto: un bottone
      // che si puo' premere e poi dice «no» e' peggio di uno che spiega perche'.
      const diversa = s.build && this.api.versione && s.build !== this.api.versione;
      if (diversa) {
        r.append(el('div', 'mp-nota', `Gira una versione diversa (${s.build}) — ricarica la pagina per aggiornarti.`));
      } else {
        const giu = el('div', 'mp-riga');
        let campoPw = null;
        if (s.conPassword) {
          campoPw = el('input', 'mp-input mp-mini');
          campoPw.type = 'password';
          campoPw.placeholder = 'password';
          giu.append(campoPw);
        }
        giu.append(bottone(s.bussare ? 'Bussa' : 'Entra', 'mp-b', () => this._entra(s.code, campoPw ? campoPw.value : '')));
        r.append(giu);
      }
      box.append(r);
    }
  }

  // ---- IL CRUSCOTTO --------------------------------------------------------
  //
  // ⚠ TRE ORIZZONTI DIVERSI, E NON VANNO MESCOLATI. «Chi c'e' adesso» si misura
  // in questo istante ed e' esatto. «Quanto abbiamo consumato» e' un totale che
  // riparte quando Deno spegne una copia inattiva, quindi e' un PARZIALE e va
  // detto. «Quanto consumeremo nel mese» e' una proiezione al ritmo attuale,
  // cioe' un'ipotesi. Presentarli con la stessa faccia sarebbe il modo piu'
  // rapido per far prendere una decisione sbagliata a chi guarda.

  /** Numeri con l'unita' giusta: 900 B, 12 kB, 3,4 MB, 1,2 GB. */
  _peso(n) {
    n = Number(n) || 0;
    if (n < 1000) return Math.round(n) + ' B';
    if (n < 1e6) return (n / 1e3).toFixed(1).replace('.', ',') + ' kB';
    if (n < 1e9) return (n / 1e6).toFixed(1).replace('.', ',') + ' MB';
    return (n / 1e9).toFixed(2).replace('.', ',') + ' GB';
  }
  _numero(n) { return Math.round(Number(n) || 0).toLocaleString('it-IT'); }

  /** Una barra che si riempie. Sopra il 75% ingiallisce, sopra il 90% diventa rossa. */
  _barra(etichetta, quanto, tetto, testo) {
    const f = tetto > 0 ? Math.min(1, quanto / tetto) : 0;
    const d = el('div', 'mp-barra');
    const cima = el('div', 'mp-barra-cima');
    cima.append(el('span', null, etichetta), el('span', 'mp-nota', testo));
    const guscio = el('div', 'mp-barra-guscio');
    const dentro = el('div', 'mp-barra-dentro' + (f > 0.9 ? ' male' : f > 0.75 ? ' attenta' : ''));
    dentro.style.width = (f * 100).toFixed(1) + '%';
    guscio.append(dentro);
    d.append(cima, guscio);
    return d;
  }

  _riga(chiave, valore) {
    const r = el('div', 'mp-dato');
    r.append(el('span', 'mp-dato-k', chiave), el('span', 'mp-dato-v', String(valore)));
    return r;
  }

  /** ADESSO: quello che si misura in questo istante, ed e' esatto. */
  _quadroAdesso(s) {
    const d = el('div', 'mp-quadro');
    d.append(this._titolo('👥 Adesso'));
    const grande = el('div', 'mp-grosso');
    grande.textContent = String(s.connessiOra || 0);
    const sotto = el('div', 'mp-nota');
    sotto.textContent = `in gioco · ${s.diCuiTelefono || 0} da telefono · ${s.stanzeAperte || 0} stanze · picco ${s.picco || 0}`;
    d.append(grande, sotto);
    const reg = Object.entries(s.perRegione || {});
    if (reg.length) d.append(this._riga('🌍 da dove', reg.map(([k, n]) => `${k}: ${n}`).join(' · ')));
    const ver = Object.entries(s.perBuild || {});
    if (ver.length) d.append(this._riga('📦 versioni', ver.map(([k, n]) => `${k}: ${n}`).join(' · ')));
    return d;
  }

  /** BANDA: il TURN e' l'unica cosa col tetto stretto, quindi viene per prima. */
  _quadroBanda(c) {
    const t = c.tetti || {};
    const d = el('div', 'mp-quadro');
    d.append(this._titolo('📡 Banda del relay (TURN)'));
    const tettoByte = (t.turnGB || 0.5) * 1e9;
    d.append(this._barra('passato dal relay', c.turnByte || 0, tettoByte,
      `${this._peso(c.turnByte || 0)} su ${String(t.turnGB || 0.5).replace('.', ',')} GB al mese`));
    d.append(this._riga('connessioni dal relay', `${c.turnSess || 0} (a consumo)`));
    d.append(this._riga('connessioni dirette', `${c.direttoSess || 0} · ${this._peso(c.direttoByte || 0)} (gratis)`));
    // la stima c'e' solo quando il server ha abbastanza storia per farla
    d.append(this._riga('a questo ritmo', c.stima
      ? `~${c.stima.turnGB.toFixed(2).replace('.', ',')} GB al mese`
      : 'ancora presto per dirlo'));
    const nota = el('div', 'mp-nota mp-avvertenza');
    nota.textContent = 'La partita non passa dal server: questi byte li riferiscono i giocatori,'
      + ' leggendoli da WebRTC. Sono attendibili, non certificati.';
    d.append(nota);
    return d;
  }

  /** SERVER: richieste e banda in uscita di Deno, con il loro tetto. */
  _quadroServer(c, sal) {
    const t = c.tetti || {};
    const d = el('div', 'mp-quadro');
    d.append(this._titolo('⚙️ Server'));
    d.append(this._barra('richieste', c.http || 0, t.denoRichieste || 1e6,
      `${this._numero(c.http)} su ${this._numero(t.denoRichieste || 1e6)} al mese`));
    if (c.stima) d.append(this._riga('a questo ritmo', `~${this._numero(c.stima.richieste)} richieste · ${c.stima.uscitaGB.toFixed(2).replace('.', ',')} GB al mese`));
    d.append(this._barra('banda in uscita', c.httpByte || 0, (t.denoGB || 100) * 1e9,
      `${this._peso(c.httpByte || 0)} su ${t.denoGB || 100} GB al mese`));
    d.append(this._riga('segnalazione', `${this._numero(c.wsMsg)} messaggi · ${this._peso(c.wsByte)} · ${this._numero(c.ws)} collegamenti`));
    const ore = c.ore || 0;
    d.append(this._riga('copie accese', `${c.copie || 1} · sveglie da ${ore < 1 ? Math.round(ore * 60) + ' min' : String(ore).replace('.', ',') + ' h'}`));
    const rotte = Object.entries(c.perRotta || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (rotte.length) d.append(this._riga('rotte piu\u2019 usate', rotte.map(([k, n]) => `${k} ${this._numero(n)}`).join(' · ')));

    d.append(this._titolo('🩺 Salute'));
    d.append(this._riga('relay TURN', sal.turn || '?'));
    d.append(this._riga('amministrazione', sal.admin || '?'));
    d.append(this._riga('firma dei lasciapassare', sal.segretoFirme || '?'));
    d.append(this._riga('archivio', sal.archivio || '?'));
    const nota = el('div', 'mp-nota mp-avvertenza');
    nota.textContent = 'I conteggi ripartono quando Deno spegne una copia inattiva:'
      + ' sono «da quando il server è sveglio», non il totale del mese.';
    d.append(nota);
    return d;
  }

  // ---- MODERAZIONE ---------------------------------------------------------
  async _adminEntra() {
    const base = (this.api.urlServer || '').replace(/\/+$/, '');
    if (!base) return;
    try {
      const r = await fetch(base + '/admin/entra', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pw: this.adminPw.value }),
      });
      const d = await r.json();
      this.adminPw.value = '';
      if (!r.ok || !d.gettone) {
        this.adminBox.replaceChildren(el('div', 'mp-nota', d.errore || 'non autorizzato'));
        return;
      }
      this.gettoneAdmin = d.gettone;
      this._adminMostraPorta(false);
      this._adminAggiorna();
    } catch {
      this.adminBox.replaceChildren(el('div', 'mp-nota', 'Server non raggiungibile.'));
    }
  }

  async _adminAggiorna() {
    if (!this.gettoneAdmin) return;
    const base = (this.api.urlServer || '').replace(/\/+$/, '');
    try {
      const r = await fetch(`${base}/admin/tutto?g=${encodeURIComponent(this.gettoneAdmin)}`);
      if (!r.ok) {
        this.gettoneAdmin = null;
        this._adminMostraPorta(true);
        this.adminBox.replaceChildren(el('div', 'mp-nota', 'sessione scaduta'));
        return;
      }
      const d = await r.json();
      // le stanze si raccolgono da piu' copie, come nella lista pubblica — ma la
      // prima risposta e' gia' in mano, quindi si fanno solo i giri MANCANTI
      const per = new Map();
      for (const st of (d.stanze || [])) per.set(st.code, st);
      for (const st of await this._chiediPiuVolte(`${base}/admin/tutto?g=${encodeURIComponent(this.gettoneAdmin)}`, 2)) {
        if (!per.has(st.code)) per.set(st.code, st);
      }
      d.stanze = [...per.values()];
      const box = this.adminBox;
      box.replaceChildren();

      const s = d.stato || {};
      box.append(this._quadroAdesso(s));
      box.append(this._quadroBanda(d.consumi || {}));
      box.append(this._quadroServer(d.consumi || {}, d.salute || {}));
      box.append(this._titolo('🚪 Stanze aperte'));

      for (const st of d.stanze || []) {
        const r2 = el('div', 'mp-stanza');
        const su = el('div', 'mp-stanza-su');
        su.append(el('b', null, st.nome), el('span', 'mp-nota', ` ${st.code} · ${st.dentro}/${st.max} · ${st.build}`));
        if (!st.pubblica) su.append(el('span', 'mp-tag', 'privata'));
        if (st.conPassword) su.append(el('span', 'mp-tag', '🔒'));
        r2.append(su);
        const giu = el('div', 'mp-riga');
        // in incognito: il gettone viaggia col `join` e il server apre la porta
        // senza avvisare nessuno. Senza gettone sarebbe un ingresso qualsiasi.
        giu.append(bottone('Entra a guardare', 'mp-b', () => {
          this._entra(st.code, '', this.gettoneAdmin);
          this.apri(false);
        }));
        giu.append(bottone('Chiudi', 'mp-b mp-no', async () => {
          await fetch(`${base}/admin/chiudi?g=${encodeURIComponent(this.gettoneAdmin)}`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: st.code, motivo: 'chiusa da un moderatore' }),
          });
          this._adminAggiorna();
        }));
        r2.append(giu);
        box.append(r2);
      }
      if (!(d.stanze || []).length) box.append(el('div', 'mp-nota', 'Nessuna stanza aperta.'));
    } catch { /* rete: si riprova al prossimo giro */ }
  }

  // ---- APRI / CHIUDI -------------------------------------------------------
  apri(si = true) {
    this.aperto = si;
    this.el.style.display = si ? 'block' : 'none';
    clearInterval(this._timer);
    if (!si) return;
    this.aggiorna();
    this._chiediStanze();
    if (this.gettoneAdmin) this._adminAggiorna();
    // ⚠ SI INTERROGA IL SERVER SOLO CON IL PANNELLO APERTO. Un pannello chiuso
    // che chiede la lista ogni sei secondi, moltiplicato per i giocatori, e' un
    // fiume di richieste per disegnare qualcosa che nessuno sta guardando — e le
    // richieste sono la risorsa contata dal piano gratuito.
    this._timer = setInterval(() => {
      this._chiediStanze();
      if (this.gettoneAdmin) this._adminAggiorna();
    }, OGNI_STANZE_MS);
  }
}
