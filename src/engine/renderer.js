// Renderer + camera orbitale da diorama (segue il player con dolcezza).
// Post-processing TILT-SHIFT: sfoca sopra e sotto la banda a fuoco (che segue
// il gatto) per l'effetto miniatura — due passate gaussiane direzionali.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CAMERA } from '../config.js?v=ms28fhvp';

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

// TILT-SHIFT IN UNA PASSATA SOLA.
//
// Prima erano tre quad a schermo intero: blur orizzontale, blur verticale e
// OutputPass (conversione sRGB). Su una GPU a piastrelle come la Mali-G68 del
// committente ogni passata è una lettura E una scrittura dell'intero schermo in
// mezza precisione: la banda di memoria, non i calcoli, è quello che costa —
// misurato sul suo telefono, il tilt-shift da solo vale 8 fps su 41 (diagnostica
// del 2026-07-26). Le due gaussiane separabili diventano un kernel 3×3 e la
// conversione sRGB si fa qui: da 3 passate a UNA, cioè un terzo del traffico.
//
// Perché 3×3 basta: il kernel separabile a 5 tap aveva varianza 2,68 (in unità
// di `passo`). Un 3 tap con pesi 0,264 / 0,472 / 0,264 e scarto ±2,253 ha la
// STESSA varianza, quindi la stessa quantità di sfocatura percepita — e col
// raggio massimo di 2,6 px la differenza di forma non è visibile (verificata a
// pixel contro la vecchia catena: vedi il commit).
const TS_OFF = 2.253;
const TS_W = [0.264, 0.472, 0.264];

const ShaderTiltShift = {
  name: 'TiltShiftLantern',
  uniforms: {
    tDiffuse: { value: null },
    risoluzione: { value: new THREE.Vector2(1, 1) },
    fuoco: { value: 0.45 },      // centro banda (0..1 in verticale schermo)
    banda: { value: 0.13 },      // semi-ampiezza nitida
    sfuma: { value: 0.32 },      // transizione
    quantita: { value: 2.2 },    // pixel di blur massimo
    versoSchermo: { value: 1 },  // 1 = scrive sul canvas (converte in sRGB), 0 = resta lineare
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 risoluzione;
    uniform float fuoco, banda, sfuma, quantita, versoSchermo;
    varying vec2 vUv;

    const float OFF = ${TS_OFF.toFixed(4)};
    const float W0 = ${TS_W[0].toFixed(4)};
    const float W1 = ${TS_W[1].toFixed(4)};

    void main() {
      float d = abs(vUv.y - fuoco);
      float f = smoothstep(banda, banda + sfuma, d) * quantita;
      vec2 passo = OFF * f / risoluzione;

      vec4 c;
      if (f < 0.02) {
        c = texture2D(tDiffuse, vUv);          // dentro la banda a fuoco: un solo tap
      } else {
        // 3×3 separabile srotolato: i pesi per riga/colonna si moltiplicano
        c  = (texture2D(tDiffuse, vUv + vec2(-passo.x, -passo.y))
            + texture2D(tDiffuse, vUv + vec2( passo.x, -passo.y))
            + texture2D(tDiffuse, vUv + vec2(-passo.x,  passo.y))
            + texture2D(tDiffuse, vUv + vec2( passo.x,  passo.y))) * (W0 * W0);
        c += (texture2D(tDiffuse, vUv + vec2(0.0, -passo.y))
            + texture2D(tDiffuse, vUv + vec2(0.0,  passo.y))) * (W1 * W0);
        c += (texture2D(tDiffuse, vUv + vec2(-passo.x, 0.0))
            + texture2D(tDiffuse, vUv + vec2( passo.x, 0.0))) * (W0 * W1);
        c += texture2D(tDiffuse, vUv) * (W1 * W1);
      }

      // era il lavoro dell'OutputPass, che così non serve più (niente tone
      // mapping in questo gioco: solo la curva sRGB)
      if (versoSchermo > 0.5) {
        vec3 v = max(c.rgb, vec3(0.0));
        c.rgb = mix(pow(v, vec3(0.4166666667)) * 1.055 - 0.055, v * 12.92, vec3(lessThanEqual(v, vec3(0.0031308))));
      }
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
    this.composer = null;
    this._tilt = null;
    this.tiltShift = false;
    this._tiltQ = 0;
    this._fuoco = 0.45;

    // collisione della camera coi muri (spenta col settaggio "camera fantasma")
    this.solido = null;          // (x,y,z) => bool, iniettato da main
    this.fantasma = false;

    this._ridimensiona = this._ridimensiona.bind(this);
    addEventListener('resize', this._ridimensiona);
    document.addEventListener('visibilitychange', this._ridimensiona);
    this._ridimensiona();
  }

  _ridimensiona() {
    // se la pagina parte in una tab nascosta la finestra può misurare 0×0
    this.dimensiona(Math.max(1, innerWidth), Math.max(1, innerHeight));
  }

  /** Dimensiona TUTTO (renderer, composer se esiste, uniform del blur, camera). */
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
      const dpr = this.renderer.getPixelRatio();
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
      this._tilt.uniforms.risoluzione.value.set(w * dpr, h * dpr);
      this._applicaTilt();
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _creaComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scena, this.camera));
    this._tilt = new ShaderPass(ShaderTiltShift);   // blur + sRGB: è anche l'output
    this.composer.addPass(this._tilt);
    this.dimensiona(Math.max(1, innerWidth), Math.max(1, innerHeight));
  }

  /** Intensità del tilt-shift (0 = spento). */
  impostaTiltShift(quantita) {
    this.tiltShift = quantita > 0;
    this._tiltQ = quantita;
    if (this.tiltShift && !this.composer) this._creaComposer();
    if (!this.composer) return;
    this._applicaTilt();
  }

  /** Il blur è espresso in PIXEL del bersaglio: se la scala di rendering scende,
   *  quegli stessi pixel valgono una fetta più grande di schermo e la sfocatura
   *  raddoppierebbe da sola. Si compensa, così abbassare la risoluzione cambia
   *  gli fps e non l'aspetto. */
  _applicaTilt() {
    const pieno = Math.min(devicePixelRatio, this.dprMax);
    const f = Math.max(0.1, this.renderer.getPixelRatio() / pieno);
    this._tilt.uniforms.quantita.value = (this._tiltQ || 0) * f;
  }

  /** Scala la risoluzione di rendering (qualità adattiva): 1 = nativa capata. */
  setScalaRender(f) {
    // pavimento a 0.4: la scala auto arriva a 0.45 sui telefoni più deboli, e un
    // clamp a 0.5 gliela mangiava proprio quando serviva di più. Sotto 0.4 il
    // gioco non si legge nemmeno, quindi non si scende oltre.
    const dpr = Math.max(0.4, Math.min(devicePixelRatio, this.dprMax) * f);
    if (Math.abs(dpr - this.renderer.getPixelRatio()) < 0.02) return;
    this.renderer.setPixelRatio(dpr);
    this.dimensiona(Math.max(1, innerWidth), Math.max(1, innerHeight));
  }

  /** La banda a fuoco insegue un punto del mondo (il gatto), con dolcezza. */
  fuocoSu(puntoMondo, dt) {
    if (!this.tiltShift || !this.composer) return;   // niente lavoro se il blur è spento
    const p = puntoMondo.clone().project(this.camera);
    if (p.z < 1) {
      const y = THREE.MathUtils.clamp((p.y + 1) / 2, 0.12, 0.88);
      this._fuoco += (y - this._fuoco) * Math.min(1, dt * 5);
    }
    this._tilt.uniforms.fuoco.value = this._fuoco;
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
    this.camera.position.set(
      this.bersaglio.x + this.distanza * cp * Math.sin(this.yaw),
      this.bersaglio.y + this.distanza * sp,
      this.bersaglio.z + this.distanza * cp * Math.cos(this.yaw),
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
    if (this.tiltShift && this.composer) this.composer.render();
    else this.renderer.render(this.scena, this.camera);
  }
}
