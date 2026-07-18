// Client di SEGNALAZIONE: usa il server room-code (server/signaling.mjs) per
// scambiare offerta/risposta WebRTC in automatico — niente più codici da
// copiare. Il gioco resta P2P: qui passa solo l'handshake.
// L'URL del server lo imposta l'utente (Impostazioni della stanza).

export class Segnalatore {
  constructor(lobby) {
    this.lobby = lobby;
    this.ws = null;
    this.onCode = null;      // (code) l'host riceve il codice stanza
    this.onStato = null;     // (testo)
    this._coda = [];         // gid degli ospiti da servire, uno alla volta
    this._occupato = false;
  }

  _apri(url) {
    return new Promise((ok, no) => {
      try {
        const ws = this.ws = new WebSocket(url);
        ws.onerror = () => no(new Error('server non raggiungibile'));
        ws.onopen = () => ok(ws);
        ws.onclose = () => { if (this.onStato) this.onStato('⭘ segnalazione chiusa'); };
      } catch (e) { no(e); }
    });
  }

  /** HOST: crea la stanza, riceve il codice, poi serve gli ospiti in automatico. */
  async creaStanza(url) {
    const ws = await this._apri(url);
    ws.onmessage = async (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'code') { if (this.onCode) this.onCode(m.code); }
      else if (m.t === 'join') { this._coda.push(m.gid); this._servi(); }
      else if (m.t === 'answer') { try { await this.lobby.completa(m.sdp); } catch (err) { console.warn(err); } this._occupato = false; this._servi(); }
      else if (m.t === 'left') { /* l'ospite se n'è andato: la lobby lo rileva da sé */ }
    };
    ws.send(JSON.stringify({ t: 'host' }));
  }

  async _servi() {
    if (this._occupato || this._coda.length === 0 || !this.ws) return;
    this._occupato = true;
    const gid = this._coda.shift();
    try {
      const sdp = await this.lobby.creaOfferta();
      this.ws.send(JSON.stringify({ t: 'offer', gid, sdp }));
    } catch (e) { console.warn('[lantern] offerta fallita', e); this._occupato = false; }
  }

  /** OSPITE: entra con un codice; risponde all'offerta in automatico. */
  async entra(url, code) {
    const ws = await this._apri(url);
    ws.onmessage = async (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'err') { if (this.onStato) this.onStato('🔴 ' + (m.msg || 'errore')); }
      else if (m.t === 'joined') { if (this.onStato) this.onStato('🟡 nella stanza, mi collego…'); }
      else if (m.t === 'offer') {
        try { const risp = await this.lobby.rispondi(m.sdp); ws.send(JSON.stringify({ t: 'answer', sdp: risp })); }
        catch (err) { console.warn(err); }
      } else if (m.t === 'hostgone') { if (this.onStato) this.onStato('🔴 l’host ha chiuso la stanza'); }
    };
    ws.send(JSON.stringify({ t: 'join', code: (code || '').trim().toUpperCase() }));
  }

  chiudi() { try { if (this.ws) this.ws.close(); } catch { /* ok */ } this.ws = null; this._coda = []; this._occupato = false; }
}
