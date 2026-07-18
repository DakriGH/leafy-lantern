// Lobby P2P (M8): WebRTC DataChannel, TOPOLOGIA A STELLA — l'host tiene un
// canale per OGNI ospite e fa da relay (pose, eventi, chat). Il canale è
// CIFRATO di serie (DTLS/SCTP); lo scambio dei codici resta manuale
// (copia/incolla): nessun server nel mezzo. STUN pubblico solo per scoprire
// il proprio indirizzo. I messaggi in arrivo passano da una whitelist.

const TIPI_VALIDI = new Set(['benvenuto', 'benvPezzo', 'evento', 'posa', 'tempo', 'chat', 'ciao']);

// ---- codici COMPATTI: il SDP è molto ripetitivo, gzip lo dimezza abbondante,
// così su mobile il codice da incollare è molto più corto. Prefisso 'Z' =
// compresso, 'B' = base64 semplice (fallback dove manca CompressionStream).
function _b64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function _deB64(str) {
  const s = atob(str);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
async function codifica(oggetto) {
  const json = JSON.stringify(oggetto);
  if (typeof CompressionStream === 'function') {
    try {
      const cs = new CompressionStream('gzip');
      const w = cs.writable.getWriter();
      w.write(new TextEncoder().encode(json)); w.close();
      const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      return 'Z' + _b64(buf);
    } catch { /* fallback sotto */ }
  }
  return 'B' + btoa(unescape(encodeURIComponent(json)));
}
async function decodifica(codice) {
  const c = codice.trim();
  const tipo = c[0], dati = c.slice(1);
  if (tipo === 'Z') {
    const ds = new DecompressionStream('gzip');
    const w = ds.writable.getWriter();
    w.write(_deB64(dati)); w.close();
    const json = await new Response(ds.readable).text();
    return JSON.parse(json);
  }
  if (tipo === 'B') return JSON.parse(decodeURIComponent(escape(atob(dati))));
  return JSON.parse(atob(c));   // vecchi codici senza prefisso
}

function attesaIce(pc, timeoutMs = 3500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((risolvi) => {
    const timer = setTimeout(risolvi, timeoutMs);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') { clearTimeout(timer); risolvi(); }
    });
  });
}

export class Lobby {
  // Server TURN aggiuntivi (per connessioni affidabili su rete mobile). Si
  // riempie da main con le credenziali gratuite incollate dall'utente:
  // [{ urls:'turn:...', username:'...', credential:'...' }]
  static turn = [];

  constructor() {
    this.ruolo = null;            // 'host' | 'ospite'
    this.canali = new Map();      // id → { pc, dc, aperto } (host: N · ospite: 1 con id 0)
    this._prossimoId = 1;
    this._inAttesa = null;        // {id, pc} dell'offerta host non ancora completata
    this.onMessaggio = null;      // (m, daId)
    this.onStato = null;          // ('creazione'|'in-attesa'|'aperta'|'chiusa'|'errore', id)
    this.onMembri = null;         // () → la lista è cambiata
  }

  get connessa() {
    for (const c of this.canali.values()) if (c.aperto) return true;
    return false;
  }

  /** Gli id dei canali APERTI (per l'elenco membri dell'host). */
  get membri() {
    return [...this.canali.entries()].filter(([, c]) => c.aperto).map(([id]) => id);
  }

  _nuovaPc() {
    // Più STUN pubblici = più chance di attraversare il NAT gratis. Su rete
    // mobile (NAT simmetrico) serve un TURN: se l'utente ha incollato le sue
    // credenziali gratuite (Impostazioni → vedi Lobby.turn), le usiamo.
    const ice = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];
    for (const t of Lobby.turn) if (t && t.urls) ice.push(t);
    return new RTCPeerConnection({ iceServers: ice });
  }

  _registra(id, pc, dc) {
    const voce = { pc, dc, aperto: false };
    this.canali.set(id, voce);
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'disconnected' || s === 'closed') this._caduto(id);
    };
    dc.onopen = () => {
      voce.aperto = true;
      if (this.onStato) this.onStato('aperta', id);
      if (this.onMembri) this.onMembri();
    };
    dc.onclose = () => this._caduto(id);
    dc.onmessage = (e) => {
      let m = null;
      try { m = JSON.parse(e.data); } catch { return; }
      if (!m || typeof m.t !== 'string' || !TIPI_VALIDI.has(m.t)) return;
      if (this.onMessaggio) this.onMessaggio(m, id);
    };
  }

  _caduto(id) {
    const voce = this.canali.get(id);
    if (!voce) return;
    this.canali.delete(id);
    try { voce.dc && voce.dc.close(); } catch { /* pazienza */ }
    try { voce.pc && voce.pc.close(); } catch { /* pazienza */ }
    if (this.onStato) this.onStato(this.connessa ? 'aperta' : 'chiusa', id);
    if (this.onMembri) this.onMembri();
  }

  /** HOST: prepara il codice per UN ospite (ripetibile per invitarne altri). */
  async creaOfferta() {
    this.ruolo = 'host';
    const id = this._prossimoId++;
    const pc = this._nuovaPc();
    const dc = pc.createDataChannel('lantern', { ordered: true });
    this._registra(id, pc, dc);
    this._inAttesa = { id, pc };
    await pc.setLocalDescription(await pc.createOffer());
    await attesaIce(pc);
    if (this.onStato) this.onStato('in-attesa', id);
    return await codifica(pc.localDescription);
  }

  /** OSPITE: incolla il codice offerta, ritorna la risposta per l'host. */
  async rispondi(codiceOfferta) {
    this.chiudi();
    this.ruolo = 'ospite';
    const pc = this._nuovaPc();
    pc.ondatachannel = (e) => this._registra(0, pc, e.channel);
    await pc.setRemoteDescription(new RTCSessionDescription(await decodifica(codiceOfferta)));
    await pc.setLocalDescription(await pc.createAnswer());
    await attesaIce(pc);
    if (this.onStato) this.onStato('in-attesa', 0);
    return await codifica(pc.localDescription);
  }

  /** HOST: incolla la risposta dell'ULTIMO invito creato. */
  async completa(codiceRisposta) {
    if (!this._inAttesa) throw new Error('nessun invito in attesa');
    await this._inAttesa.pc.setRemoteDescription(
      new RTCSessionDescription(await decodifica(codiceRisposta)));
    this._inAttesa = null;
  }

  _mandaSu(voce, m) {
    if (!voce || !voce.aperto) return;
    try { voce.dc.send(typeof m === 'string' ? m : JSON.stringify(m)); }
    catch (e) { console.warn('[lantern] invio P2P fallito', e); }
  }

  /** A TUTTI i canali aperti (host: broadcast · ospite: al solo host). */
  invia(m, tranneId = null) {
    const json = JSON.stringify(m);
    for (const [id, voce] of this.canali) if (id !== tranneId) this._mandaSu(voce, json);
  }

  /** A UN canale preciso (host). */
  inviaA(id, m) { this._mandaSu(this.canali.get(id), m); }

  /** Messaggi GRANDI (snapshot) a pezzi da 60KB, a UN canale. */
  inviaGrandeA(id, tipo, oggetto) {
    const json = JSON.stringify(oggetto);
    const PEZZO = 60000;
    const tot = Math.ceil(json.length / PEZZO) || 1;
    for (let i = 0; i < tot; i++) {
      this.inviaA(id, { t: 'benvPezzo', tipo, i, tot, s: json.slice(i * PEZZO, (i + 1) * PEZZO) });
    }
  }

  /** Butta fuori UN membro (host) o chiudi tutto (senza argomento). */
  chiudi(id = null) {
    if (id !== null) { this._caduto(id); return; }
    for (const chiave of [...this.canali.keys()]) this._caduto(chiave);
    this._inAttesa = null;
    this.ruolo = null;
  }
}
