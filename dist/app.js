const chapters = [
  { title: "", time: "", image: null, color: "#c8d1e7" },
  { title: "The Big Bang", time: "13.8 billion years ago", image: "01-big-bang.webp", color: "#e7cfa4" },
  { title: "Cosmic inflation", time: "The first instant", image: "02-inflation.webp", color: "#e6c4b7" },
  { title: "The first light", time: "380,000 years later", image: "03-first-light.webp", color: "#e8bfa2" },
  { title: "The first stars", time: "The early universe", image: "04-first-stars.webp", color: "#a9c6ff" },
  { title: "The first galaxies", time: "The early universe", image: "05-first-galaxies.webp", color: "#cfb9e7" },
  { title: "The Milky Way takes shape", time: "Over billions of years", image: "06-milky-way.webp", color: "#e3c5ad" },
  { title: "The solar system forms", time: "4.6 billion years ago", image: "07-solar-system.webp", color: "#f2ba81" },
  { title: "Earth forms", time: "4.54 billion years ago", image: "08-earth-forms.webp", color: "#f9ab83" },
  { title: "The first oceans", time: "Early Earth", image: "09-first-oceans.webp", color: "#f4c19e" },
  { title: "Deep-sea beginnings", time: "Ancient oceans", image: "10-deep-sea.webp", color: "#a5d1de" },
  { title: "Early life evolves", time: "Billions of years ago", image: "11-early-life.webp", color: "#9bc9c0" },
  { title: "Life transforms Earth", time: "The oxygen rise", image: "12-oxygen.webp", color: "#a7d1db" },
  { title: "The Cambrian explosion", time: "About 540 million years ago", image: "13-cambrian.webp", color: "#9cc9d6" },
  { title: "Life moves onto land", time: "Hundreds of millions of years ago", image: "14-land.webp", color: "#c3d6a4" },
  { title: "The age of dinosaurs", time: "230–66 million years ago", image: "15-dinosaurs.webp", color: "#dec49b" },
  { title: "Mammals rise", time: "After 66 million years ago", image: "16-mammals.webp", color: "#dbbea4" },
  { title: "Human origins", time: "Millions of years ago", image: "17-human-origins.webp", color: "#d4b6a1" },
  { title: "Humans spread", time: "Tens of thousands of years ago", image: "18-migration.webp", color: "#d4c1b2" },
  { title: "The first settlements", time: "About 12,000 years ago", image: "19-settlements.webp", color: "#ddc7a2" },
  { title: "Ancient civilizations", time: "The last several millennia", image: "20-civilizations.webp", color: "#d7bfa0" },
  { title: "The modern world", time: "2026", image: "21-present.webp", color: "#b8d1db" }
];

const canvas = document.querySelector("#scene");
const slider = document.querySelector("#timeline");
const era = document.querySelector("#era");
const year = document.querySelector("#year");
const instruction = document.querySelector("#instruction");
const counter = document.querySelector("#counter");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const max = chapters.length - 1;
slider.max = String(max);

let target = 0;
let position = 0;
let lastFrame = performance.now();
let velocity = 0;
let pointerX = 0;
let dragX = null;
let dragStart = 0;
let session = null;
let sessionFinished = false;
const sessionLength = 30 * 60 * 1000;
const generationInterval = 30 * 1000;

const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "high-performance" });
const fallback = gl ? null : canvas.getContext("2d", { alpha: false });
const images = new Map();
const textures = new Map();

function loadImage(index) {
  if (index < 1 || index > max || images.has(index)) return;
  const img = new Image();
  images.set(index, img);
  img.decoding = "async";
  img.src = "./assets/" + chapters[index].image;
  img.onload = () => {
    if (!gl) return;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    textures.set(index, { texture, ratio: img.naturalWidth / img.naturalHeight });
    pruneTextures(index);
  };
  img.onerror = () => { images.delete(index); };
}

function pruneTextures(keep) {
  if (textures.size <= 7) return;
  for (const [index, entry] of textures) {
    if (index === keep || Math.abs(index - Math.floor(position)) <= 2 ||
        (session && (index === session.a || index === session.b))) continue;
    gl.deleteTexture(entry.texture);
    textures.delete(index);
    images.delete(index);
    if (textures.size <= 7) break;
  }
}

let program, uniforms, blackTexture;
if (gl) {
  const vertexSource = `#version 300 es
    layout(location=0) in vec2 aPosition;
    out vec2 vUv;
    void main() {
      vUv = aPosition * .5 + .5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }`;
  const fragmentSource = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    uniform sampler2D uA, uB;
    uniform float uMix, uTime, uAspect, uRatioA, uRatioB, uVelocity, uPointer, uSeed, uMode, uDark;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i=floor(p), f=fract(p);
      f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                 mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
    }
    vec2 cover(vec2 uv, float ratio) {
      vec2 scale = uAspect > ratio ? vec2(1.0, ratio / uAspect) : vec2(uAspect / ratio, 1.0);
      return (uv - .5) * scale + .5;
    }
    void main() {
      vec2 uv = vUv;
      vec2 p = uv - .5;
      float t = clamp(uMix, 0.0, 1.0);
      float wave = sin(t * 3.14159265);
      float n = noise(uv * vec2(5.0, 3.0) + uSeed * 11.31);
      float tremor = (n-.5)*wave;
      vec2 camera = vec2(uVelocity * .028 + uPointer * .012, sin(uTime*.13)*.006);
      vec2 fromUv = .5 + p * (1.0 + .19*t + .055*wave) + camera*t + vec2(tremor*.026, -tremor*.014);
      vec2 toUv = .5 + p * (1.18 - .18*t) - camera*(1.0-t) - vec2(tremor*.045, tremor*.024);
      if (uMode > .5) {
        float fold = noise(p*vec2(3.0,2.0) + uSeed*17.0 + uTime*.004);
        fromUv += vec2((fold-.5)*.045, (n-.5)*.026);
        toUv += vec2((n-.5)*.055, (fold-.5)*.035);
      }
      vec3 a = texture(uA, cover(fromUv, uRatioA)).rgb;
      vec3 b = texture(uB, cover(toUv, uRatioB)).rgb;
      float depth = dot(a, vec3(.2126,.7152,.0722));
      a = texture(uA, cover(fromUv + p*(depth-.35)*.075*wave, uRatioA)).rgb;
      float edge = noise(uv*vec2(4.0,2.0) + uSeed*3.0);
      float blend = smoothstep(-.12, 1.12, t + (edge-.5)*.23*wave + (length(p)-.3)*.13*wave);
      if (t < .001) blend = 0.0;
      if (t > .999) blend = 1.0;
      vec3 color = mix(a,b,blend);
      float breathing = 1.0 - wave*.11;
      color *= breathing;
      if (uMode > .5) {
        float spectral = noise(uv*vec2(2.0,4.0)+uSeed*7.0);
        color = mix(color, color.brg, .10 + .17*spectral);
        color *= .88 + .22*spectral;
      }
      float grain = hash(gl_FragCoord.xy + fract(uTime*.37)*100.0) - .5;
      color += grain * .014;
      float vignette = 1.0 - .21 * smoothstep(.2, .79, length(p * vec2(uAspect*.58, 1.0)));
      color *= vignette * uDark;
      outColor = vec4(max(color, vec3(0.0)),1.0);
    }`;
  function shader(type, source) {
    const item = gl.createShader(type);
    gl.shaderSource(item, source);
    gl.compileShader(item);
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(item));
    return item;
  }
  program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const triangle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  blackTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, blackTexture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0]));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  uniforms = Object.fromEntries(["uA","uB","uMix","uTime","uAspect","uRatioA","uRatioB",
    "uVelocity","uPointer","uSeed","uMode","uDark"].map(key=>[key,gl.getUniformLocation(program,key)]));
  gl.uniform1i(uniforms.uA,0);
  gl.uniform1i(uniforms.uB,1);
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const width = Math.max(1,Math.round(innerWidth*dpr));
  const height = Math.max(1,Math.round(innerHeight*dpr));
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
  if (gl) gl.viewport(0,0,width,height);
}

function choosePair() {
  const b = 1 + Math.floor(Math.random()*max);
  const a = session?.b && session.b !== b ? session.b : 1 + Math.floor(Math.random()*max);
  return {a, b, seed: Math.random()*100, changed: performance.now()};
}

function startSession(now) {
  session = { start: now, frames: 1, ...choosePair() };
  sessionFinished = false;
  loadImage(session.a);
  loadImage(session.b);
}

function updateSession(now) {
  if (target < max-.02) { session = null; sessionFinished = false; return; }
  if (!session && !sessionFinished && position >= max-.02) startSession(now);
  if (!session) return;
  if (now - session.start >= sessionLength) {
    sessionFinished = true;
    session.ended = true;
  } else if (now - session.changed >= generationInterval) {
    Object.assign(session, choosePair());
    session.frames += 1;
    loadImage(session.a);
    loadImage(session.b);
  }
}

function drawGL(now) {
  let a, b, mix, seed = 0, mode = 0;
  if (session) {
    a = session.a; b = session.b;
    mix = session.ended ? 1 : Math.min(1,(now-session.changed)/1700);
    seed = session.seed;
    mode = 1;
  } else {
    a = Math.min(max-1,Math.floor(position));
    b = a+1;
    mix = Math.max(0,Math.min(1,position-a));
  }
  loadImage(a); loadImage(b);
  if (a > 1) loadImage(a-1);
  if (b < max) loadImage(b+1);
  const A = textures.get(a), B = textures.get(b);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D,A?.texture || blackTexture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D,B?.texture || blackTexture);
  gl.uniform1f(uniforms.uMix,reducedMotion && !session ? Math.round(mix) : mix);
  gl.uniform1f(uniforms.uTime,reducedMotion ? 0 : now*.001);
  gl.uniform1f(uniforms.uAspect,canvas.width/canvas.height);
  gl.uniform1f(uniforms.uRatioA,A?.ratio || 21/9);
  gl.uniform1f(uniforms.uRatioB,B?.ratio || 21/9);
  gl.uniform1f(uniforms.uVelocity,reducedMotion ? 0 : Math.max(-1,Math.min(1,velocity*.13)));
  gl.uniform1f(uniforms.uPointer,reducedMotion ? 0 : pointerX);
  gl.uniform1f(uniforms.uSeed,seed);
  gl.uniform1f(uniforms.uMode,mode);
  gl.uniform1f(uniforms.uDark,Math.min(1,position*.9));
  gl.drawArrays(gl.TRIANGLES,0,3);
}

function drawFallback() {
  const c=fallback;
  c.fillStyle="#020204"; c.fillRect(0,0,canvas.width,canvas.height);
  let i=session?.b || Math.round(position);
  const img=images.get(i);
  loadImage(i);
  if (!img?.complete || !img.naturalWidth) return;
  const scale=Math.max(canvas.width/img.width,canvas.height/img.height);
  const w=img.width*scale,h=img.height*scale;
  c.globalAlpha=Math.min(1,position);
  c.drawImage(img,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
  c.globalAlpha=1;
}

function updateLabels(now) {
  const index=Math.min(max,Math.max(0,Math.round(position)));
  const selected=chapters[index];
  const active=position>.08;
  era.textContent=session ? (session.ended ? "After the present" : "Beyond the present") : active ? selected.title : "";
  year.textContent=session ? (session.ended ? "30 minutes complete" : chapters[session.b].title) : active ? selected.time : "";
  if (session) {
    const remaining=Math.max(0,Math.ceil((sessionLength-(now-session.start))/1000));
    const mins=String(Math.floor(remaining/60)).padStart(2,"0");
    const secs=String(remaining%60).padStart(2,"0");
    instruction.textContent=session.ended ? "Journey complete · drag to return" : "New visual every 30 seconds";
    counter.textContent=session.ended ? "30:00" : `${mins}:${secs} remaining`;
  } else {
    instruction.textContent=active ? "Drag to travel" : "Drag to begin";
    counter.textContent=active ? `${String(index).padStart(2,"0")} / ${max}` : "";
  }
  slider.style.setProperty("--fill",`${target/max*100}%`);
  document.documentElement.style.setProperty("--accent",selected.color);
  slider.setAttribute("aria-valuetext",selected.title || "The beginning, darkness");
}

function frame(now) {
  const dt=Math.min(.06,(now-lastFrame)/1000 || .016);
  lastFrame=now;
  const before=position;
  position += (target-position)*(reducedMotion?1:1-Math.exp(-dt*7.4));
  if (Math.abs(position-target)<.0005) position=target;
  velocity=(position-before)/Math.max(dt,.001);
  resize();
  updateSession(now);
  if (gl) drawGL(now); else drawFallback();
  updateLabels(now);
  requestAnimationFrame(frame);
}

slider.addEventListener("input",()=>{
  target=Number(slider.value);
  if (target<max-.02) { session=null; sessionFinished=false; }
});

canvas.addEventListener("pointerdown",e=>{
  if (e.button!==0) return;
  dragX=e.clientX;
  dragStart=target;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove",e=>{
  pointerX=(e.clientX/innerWidth-.5)*2;
  if (dragX===null) return;
  target=Math.min(max,Math.max(0,dragStart+(e.clientX-dragX)/innerWidth*max));
  slider.value=String(target);
  if (target<max-.02) { session=null; sessionFinished=false; }
});
function release(){ dragX=null; }
canvas.addEventListener("pointerup",release);
canvas.addEventListener("pointercancel",release);
window.addEventListener("resize",resize);
loadImage(1);
requestAnimationFrame(frame);
