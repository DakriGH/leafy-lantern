// Renderer + camera orbitale da diorama (segue il player con dolcezza).
// Post-processing TILT-SHIFT: sfoca sopra e sotto la banda a fuoco (che segue
// il gatto) per l'effetto miniatura — due passate gaussiane direzionali.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CAMERA } from '../config.js?v=ms9b0zbn';

/**
 * Il browser sta disegnando via SOFTWARE (niente GPU)?
 *
 * ATTENZIONE a "mesa": Mesa è il DRIVER open source di quasi tutte le GPU
 * Intel/AMD su Linux e ChromeOS — cercarlo qui dentro segnalava come "software"
 * dei Chromebook con GPU vera ("Mesa DRI Intel(R) HD Graphics 400"). I renderer
 * software veri sono SwiftShader (Chrome), llvmpipe/softpipe/swrast (Mesa) e i
 * "basic/software adapter" di Windows.
 */
export function disegnaInSoftware(gpu) {
  const s = String(gpu || '');
  if (/llvmpipe|softpipe|swrast|swiftshader/i.test(s)) return true;
  // "software"/"basic render" solo come parole a sé: mai dentro un nome di GPU
  return /\bsoftware\b|basic render/i.test(s);
}

// LA PASSATA D'USCITA: una sola, e fa DUE cose che devono stare insieme.
//
// (1) LA CURVA sRGB. Il gioco disegna in luce LINEARE — sommare due luci vuol
//     dire sommare due numeri, e questo funziona solo in lineare — ma un monitor
//     vuole sRGB. La conversione va fatta UNA volta, alla fine, su tutto.
//
// (2) L'INGRANDIMENTO quando la scala di rendering è sotto 1: la scena si
//     disegna in un bersaglio più piccolo e questa passata lo stira sul canvas
//     pieno col filtro scelto (`nitido` = NearestFilter, pixel a bordo vivo).
//
// ⚠ ED È SEMPRE NELLA CATENA, sempre, anche a scala piena. Prima ci si entrava
// solo col tilt-shift acceso o a scala ridotta, e a seconda del caso la scena
// finiva in due spazi colore DIVERSI. Il motivo è che i materiali scritti a mano
// (erba, foglie, nuvole, pioggia, cielo, particelle) sono ShaderMaterial grezzi:
// three non ci infila la conversione d'uscita, quindi scrivono lineare e basta.
//   · senza composer  → il valore lineare finiva tale e quale sul canvas, che lo
//                       legge come se fosse già sRGB: erba e foglie SPENTE;
//   · con il composer → questa passata converte, e tornavano giuste.
// Cioè accendere il tilt-shift (o abbassare la risoluzione!) cambiava il colore
// della vegetazione. È il «bug grave che rende l'erba e le foglie scure» — non
// c'entrava il blur, c'entrava quale delle due strade prendeva il frame.
// Adesso la strada è una sola e i materiali grezzi vivono tutti in lineare, come
// il resto della scena.
//
// (QUI C'ERA IL TILT-SHIFT: kernel 3×3 separabile, banda a fuoco che inseguiva
// il gatto, intensità nelle Impostazioni. Tolto su richiesta del committente —
// «per adesso toglierei totalmente il tilt shift» — insieme alle sue opzioni.
// Con lui se ne va anche l'unico motivo per cui questa passata aveva bisogno di
// sapere dove guardava la camera.)
const ShaderUscita = {
  name: 'UscitaLantern',
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 v = max(c.rgb, vec3(0.0));
      // era il lavoro dell'OutputPass di three, che cosi' non serve
      c.rgb = mix(pow(v, vec3(0.4166666667)) * 1.055 - 0.055, v * 12.92, vec3(lessThanEqual(v, vec3(0.0031308))));
      gl_FragColor = c;
    }`,
};

export class Rig {
  constructor(contenitore) {
    // mobile = touch primario: i telefoni hanno DPR 2.5–3.5 → un canvas full-screen
    // WebGL costa 6–12× i pixel di un desktop. Il cap del pixel ratio è il singolo
    // fattore che pesa di più sui fps (niente antialias MSAA su mobile).
    this.mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.mobile, stencil: false, powerPreference: 'high-performance' });
    this.dprMax = this.mobile ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.dprMax));
    contenitore.appendChild(this.renderer.domElement);

    // PERDITA DEL CONTESTO WebGL: su GPU deboli o in software il browser può
    // resettare la grafica. Senza gestirlo il canvas resta NERO per sempre e
    // non si capisce perché (segnalati "flash neri" su Chromebook). Chiamare
    // preventDefault() è ciò che permette al browser di ripristinarlo.
    this.contestoPerso = false;
    this.onContesto = null;              // (perso: boolean) → lo mostra la GUI
    const tela = this.renderer.domElement;
    tela.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();                // senza questo il contesto NON torna
      this.contestoPerso = true;
      console.warn('[lantern] contesto WebGL perso');
      if (this.onContesto) this.onContesto(true);
    });
    tela.addEventListener('webglcontextrestored', () => {
      this.contestoPerso = false;
      console.warn('[lantern] contesto WebGL ripristinato');
      if (this.onContesto) this.onContesto(false);
    });

    // ACCELERAZIONE HARDWARE: se il WebView è caduto sul renderer SOFTWARE
    // gli fps crollano — lo si sa subito invece di indagare a caso
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      this.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'sconosciuta';
      this.software = disegnaInSoftware(this.gpu);
    } catch { this.gpu = 'sconosciuta'; this.software = false; }

    this.scena = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, CAMERA.lontano);

    this.bersaglio = new THREE.Vector3(0, 4, 0);  // dove guarda (insegue il player)
    this.yaw = CAMERA.yaw;
    this.pitch = CAMERA.pitch;
    this.distanza = CAMERA.distanza;

    // la catena tilt-shift si costruisce SOLO alla prima attivazione: su mobile
    // (dove parte spento) non si allocano nemmeno i 2 render target full-res
    // IL COMPOSER C'E' SEMPRE (vedi ShaderUscita): la sua unica passata fa la
    // curva sRGB e l'ingrandimento. Costa un quad a schermo intero — misurato
    // sul Chromebook del committente, spegnerlo non risparmiava niente — e in
    // cambio TUTTA la scena vive in un solo spazio colore.
    this.composer = null;
    this._uscita = null;
    // risoluzione INTERNA (0.4…1) e come la si ingrandisce sul canvas pieno
    this.scalaInterna = 1;
    this.nitido = true;

    // collisione della camera coi muri (spenta col settaggio "camera fantasma")
    this.solido = null;          // (x,y,z) => bool, iniettato da main
    this.fantasma = false;

    this._creaComposer();          // prima del primo dimensionamento
    this._ridimensiona = this._ridimensiona.bind(this);
    addEventListener('resize', this._ridimensiona);
    document.addEventListener('visibilitychange', this._ridimensiona);
    this._ridimensiona();
  }

  _ridimensiona() {
    // se la pagina parte in una tab nascosta la finestra può misurare 0×0
    this.dimensiona(Math.max(1, innerWidth), Math.max(1, innerHeight));
  }

  /** Dimensiona TUTTO (renderer, composer se esiste, uniform del blur, camera).
   *
   *  IL CANVAS RESTA SEMPRE ALLA RISOLUZIONE DELLO SCHERMO. A rimpicciolirsi è
   *  solo il bersaglio INTERNO dove si disegna la scena: l'ultima passata legge
   *  quel bersaglio e scrive sul canvas pieno, cioè è lei a fare l'ingrandimento
   *  e possiamo scegliere COME. Prima si rimpiccioliva il canvas e l'ingrandimento
   *  lo faceva il browser, sempre in bilineare: ecco perché abbassare la
   *  risoluzione impastava tutto. */
  dimensiona(w, h) {
    this.renderer.setSize(w, h, w === innerWidth && h === innerHeight);
    if (this.composer) {
      // IL COMPOSER NON SEGUE DA SOLO LA SCALA DI RENDERING. EffectComposer si
      // fotografa il pixel ratio alla COSTRUZIONE e `setSize` continua a usare
      // quello: abbassare la scala rimpiccioliva soltanto il canvas finale,
      // mentre scena e due passate di blur restavano alla risoluzione piena.
      // Risultato misurato sul telefono dell'utente (Mali-G68, diagnostica del
      // 2026-07-26): col tilt-shift acceso la scala non spostava NIENTE — 53 fps
      // a 1.00 e 55 a 0.50 — cioè la leva principale della qualità adattiva era
      // scollegata. Va risincronizzato a ogni ridimensionamento.
      const dpr = this.renderer.getPixelRatio() * this.scalaInterna;
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
      this._filtroInterno();
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _creaComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scena, this.camera));
    this._uscita = new ShaderPass(ShaderUscita);   // sRGB + ingrandimento: è l'output
    this.composer.addPass(this._uscita);
    this.dimensiona(Math.max(1, innerWidth), Math.max(1, innerHeight));
  }

  /**
   * COME SI INGRANDISCE il bersaglio interno quando è più piccolo del canvas.
   * `nitido` = NearestFilter: i pixel restano quadrati e a bordo vivo, come in un
   * gioco a pixel-art — che è esattamente lo stile di questo (blocchi, colori
   * piatti, bande nette). `morbido` = LinearFilter, l'impasto di prima.
   * A scala piena non cambia niente: il filtro non entra mai in gioco.
   */
  _filtroInterno() {
    const f = (this.scalaInterna < 0.995 && this.nitido) ? THREE.NearestFilter : THREE.LinearFilter;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.texture.magFilter !== f) { rt.texture.magFilter = f; rt.texture.minFilter = f; rt.texture.needsUpdate = true; }
    }
  }

  /**
   * Scala la risoluzione INTERNA (qualità adattiva): 1 = nativa capata.
   *
   * NON tocca più il canvas. Prima rimpiccioliva `renderer.setPixelRatio`, cioè
   * il canvas stesso, e a stirarlo sullo schermo ci pensava il browser in
   * bilineare: da lì il «quando abbasso la risoluzione è tutto blurrato». Adesso
   * il canvas resta nativo e a rimpicciolirsi è solo il bersaglio dove si disegna
   * la scena; l'ultima passata lo legge e lo scrive a schermo pieno, col filtro
   * scelto da `nitido`. Stessi pixel risparmiati, immagine a bordo vivo.
   */
  setScalaRender(f) {
    // pavimento a 0.4: la scala auto arriva a 0.45 sui telefoni più deboli, e un
    // clamp a 0.5 gliela mangiava proprio quando serviva di più. Sotto 0.4 il
    // gioco non si legge nemmeno, quindi non si scende oltre.
    const s = Math.max(0.4, Math.min(1, f));
    if (Math.abs(s - this.scalaInterna) < 0.02) return;
    this.scalaInterna = s;
    this.dimensiona(Math.max(1, innerWidth), Math.max(1, innerHeight));
  }

  orbita(dx, dy) {
    this.yaw -= dx * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, CAMERA.pitchMin, CAMERA.pitchMax);
  }

  zoom(fattore) {
    this.distanza = THREE.MathUtils.clamp(this.distanza * fattore, CAMERA.distMin, CAMERA.distMax);
  }

  segui(punto, dt) {
    const k = 1 - Math.exp(-CAMERA.inseguimento * dt);
    this.bersaglio.lerp(punto, k);
  }

  aggiorna() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // ⚠ GUARDANDO IN SU LA CAMERA SI AVVICINA, e senza questo la funzione «vedi
    // il cielo» non sta in piedi. Un'orbita di trenta blocchi con l'inclinazione
    // sotto lo zero mette l'occhio venti blocchi PIÙ IN BASSO del gatto, cioè
    // dentro la collina: si finiva a guardare la pancia dei blocchi. La distanza
    // si comprime man mano che si scende sotto l'orizzonte — a picco verso l'alto
    // resta un terzo — quindi l'occhio sta vicino al gatto, dove c'è aria, e la
    // collisione dei muri (qui sotto) ha poco da correggere.
    const sotto = Math.max(0, -this.pitch / 0.55);
    const dist = this.distanza * (1 - 0.66 * Math.min(1, sotto));
    this.camera.position.set(
      this.bersaglio.x + dist * cp * Math.sin(this.yaw),
      this.bersaglio.y + dist * sp,
      this.bersaglio.z + dist * cp * Math.cos(this.yaw),
    );
    // la camera NON attraversa i muri (solo BLOCCHI: i furni non contano, sono
    // esili — e col clamp secco facevano VIBRARE la camera). La distanza è
    // AMMORTIZZATA: rientra svelta davanti a un muro, si riallunga piano.
    if (this.solido && !this.fantasma) {
      const b = this.bersaglio, c = this.camera.position;
      const dx = c.x - b.x, dy = c.y - b.y, dz = c.z - b.z;
      const dist = Math.hypot(dx, dy, dz);
      const passi = Math.ceil(dist / 0.4);
      let voluta = dist;
      for (let i = 3; i <= passi; i++) {
        const t = i / passi;
        if (this.solido(Math.floor(b.x + dx * t), Math.floor(b.y + dy * t), Math.floor(b.z + dz * t))) {
          voluta = Math.max(2, dist * (i - 1.2) / passi);
          break;
        }
      }
      if (this._distCam === undefined || this._distCam === null) this._distCam = voluta;
      this._distCam += (voluta - this._distCam) * (voluta < this._distCam ? 0.55 : 0.07);
      const f = this._distCam / dist;
      this.camera.position.set(b.x + dx * f, b.y + dy * f, b.z + dz * f);
    }
    this.camera.lookAt(this.bersaglio);
  }

  // (qui viveva passProfondita(): rendeva la profondità della scena senza
  // trasparenti per una schiuma di bordo calcolata per confronto. Il consumatore
  // — impostaProfondita/uProfondita nello shader dell'acqua — è stato sostituito
  // dal gradiente aRiva del mesher, che conosce la geometria vera invece di
  // indovinarla dai pixel. Restava solo il PRODUTTORE: un metodo senza chiamanti
  // in tutto src/, più un render target ridimensionato a metà canvas a ogni
  // resize. Via anche quello.)

  render() {
    // SEMPRE dal composer: e' lui a fare la curva sRGB, quindi saltarlo
    // cambierebbe il colore di tutti i materiali scritti a mano
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scena, this.camera);
  }
}
