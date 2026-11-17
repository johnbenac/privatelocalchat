// A real 3D padlock, drawn on a canvas with one WebGL shader (a signed-distance-field ray march: no model files, no library). Lit by a studio of soft lights, with a
// polished steel bar, an anodised case, reflections, shadows and ambient occlusion; it breathes while it waits, the bar springs shut with a thunk, swings open in
// green, and shakes red. createPadlock3d() returns null where WebGL is not available, so the caller falls back to the flat drawing in padlock.mjs.
const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
const FRAG = `precision highp float;
uniform vec2 uRes; uniform float uTime,uLift,uSwing,uOk,uBad,uWarm,uYaw,uPitch,uRoll,uPulse,uSquash,uDark;
mat3 gM;
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
mat3 rotZ(float a){float c=cos(a),s=sin(a);return mat3(c,s,0.,-s,c,0.,0.,0.,1.);}
float sdRoundBox(vec3 p,vec3 b,float r){vec3 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r;}
float sdBody(vec3 q){
  vec3 b=q-vec3(0.,-0.38,0.); b.y/=(1.-uSquash*.07); b.x/=(1.+uSquash*.035);
  float d=sdRoundBox(b,vec3(.62,.44,.27),.18);
  // the keyhole: a round hole and a slot cut into the front
  float hole=max(length(b.xy-vec2(0.,.0))-.095,abs(b.z-.27)-.14);
  float slot=max(max(abs(b.x)-.042,abs(b.y+.115)-.115),abs(b.z-.27)-.14);
  return max(d,-min(hole,slot));
}
float sdShackle(vec3 q){
  vec3 s=q; s.y-=uLift*.27;
  vec3 pv=vec3(.36,0.,0.); vec3 d=s-pv; d=rotY(-uSwing*1.5)*d; s=d+pv;
  float arc=length(vec2(length(s.xy-vec2(0.,.30))-.36,s.z))-.095;
  float leg=length(vec2(abs(s.x)-.36,s.z))-.095;
  float t=s.y>.30?arc:leg;
  float lower=s.x>0.?-.34:-.07;
  return max(t,lower-s.y);
}
vec2 mapS(vec3 p){vec3 q=gM*p;float a=sdBody(q),b=sdShackle(q);return a<b?vec2(a,1.):vec2(b,2.);}
vec3 nrm(vec3 p){vec2 e=vec2(.0016,0.);return normalize(vec3(mapS(p+e.xyy).x-mapS(p-e.xyy).x,mapS(p+e.yxy).x-mapS(p-e.yxy).x,mapS(p+e.yyx).x-mapS(p-e.yyx).x));}
float shadow(vec3 ro,vec3 rd){float res=1.,t=.03;for(int i=0;i<28;i++){float h=mapS(ro+rd*t).x;res=min(res,9.*h/t);t+=clamp(h,.02,.2);if(res<.002||t>2.5)break;}return clamp(res,0.,1.);}
float ao(vec3 p,vec3 n){float o=0.,sc=1.;for(int i=1;i<=5;i++){float h=.025+.11*float(i);o+=(h-mapS(p+n*h).x)*sc;sc*=.72;}return clamp(1.-1.5*o,0.,1.);}
vec3 env(vec3 r){
  float up=clamp(r.y*.5+.5,0.,1.);
  vec3 c=mix(vec3(.10,.12,.18),vec3(.62,.70,.86),smoothstep(0.,1.,up));
  c+=vec3(1.,.97,.92)*2.2*smoothstep(.55,.9,dot(r,normalize(vec3(-.55,.62,.55))))*smoothstep(.0,.2,r.y+.3);   // a large softbox, top left
  c+=vec3(.75,.85,1.)*1.1*smoothstep(.8,.97,dot(r,normalize(vec3(.8,.15,.5))));                                      // a strip light, right
  c+=vec3(1.)*.55*smoothstep(.9,.99,dot(r,normalize(vec3(.0,.9,-.4))));                                              // a rim light behind
  return mix(c,c*.55,uDark*.5);
}
vec3 bodyColor(){
  vec3 blue=vec3(.13,.31,.86),green=vec3(.12,.70,.42),red=vec3(.82,.22,.22),amber=vec3(.96,.60,.14);
  vec3 c=mix(blue,amber,uWarm); c=mix(c,green,uOk); return mix(c,red,uBad);
}
vec4 render(vec2 frag){
  vec2 uv=(frag-.5*uRes)/(.5*uRes.y); uv.x-=uRoll; // uRoll is a sideways shake, in picture units
  vec3 ro=vec3(0.,.04,4.),rd=normalize(vec3(uv*.285,-1.));
  float t=2.2,mat=0.;bool hit=false;
  for(int i=0;i<84;i++){vec3 p=ro+rd*t;vec2 h=mapS(p);if(h.x<.0012*t){hit=true;mat=h.y;break;}t+=h.x*.9;if(t>7.)break;}
  vec2 w=uv*1.18+vec2(0.,.04);
  vec3 base=bodyColor();
  if(!hit){
    // the halo behind it, and a soft shadow on the ground
    float rr=length((w-vec2(0.,-.1))/vec2(1.02,1.0));
    float g=pow(smoothstep(1.05,0.05,rr),2.2)*(.30+.5*uPulse);                       // a halo that fades to nothing before the edge of the picture
    float sh=exp(-(w.x*w.x)/.42-((w.y+.93)*(w.y+.93))/.010)*.34*smoothstep(1.1,.5,abs(w.x)); // a soft shadow on the ground
    vec3 halo=mix(base,vec3(1.),.15)*g;                                              // premultiplied
    float a=clamp(g+sh*(1.-g),0.,1.);
    return vec4(halo*(1.-sh),a);
  }
  vec3 p=ro+rd*t; vec3 n=nrm(p); vec3 v=-rd; vec3 r=reflect(rd,n);
  vec3 L=normalize(vec3(-.5,.8,.6)); vec3 Lf=normalize(vec3(.8,.1,.5));
  float sd=mix(1.,shadow(p+n*.012,L),.5), occ=ao(p,n);   // soft: the bar's shadow on the case is a hint, not a stain
  float dif=max(dot(n,L),0.)*sd, fil=max(dot(n,Lf),0.)*.35;
  float fres=pow(1.-max(dot(n,v),0.),4.);
  vec3 col;
  if(mat<1.5){ // the case: anodised coloured metal under a clear coat
    vec3 alb=base;
    vec3 spec=env(r)*(.22+.6*fres);
    float sp=pow(max(dot(normalize(L+v),n),0.),90.)*1.4*sd;
    col=alb*(.28*occ+dif*.95+fil*.6)+spec*occ+vec3(sp);
    col+=alb*fres*.5;
    // the keyhole glows softly from inside
    vec3 q=gM*p; float kd=length(vec2(q.x,q.y-(-.38)-.38))-.0; float hd=length((q.xy-vec2(0.,-.38))-vec2(0.,0.));
    float kglow=exp(-8.*max(length(q.xy-vec2(0.,-.38))-.09,0.))*smoothstep(.15,.3,q.z);
    col+=mix(vec3(.55,.75,1.),vec3(.7,1.,.85),uOk)*kglow*.35;
  } else {      // the bar: polished steel
    vec3 steel=vec3(.86,.89,.94);
    vec3 spec=env(r)*steel*(.62+.5*fres);
    col=steel*(.10*occ+dif*.45+fil*.25)+spec*occ;
    col+=pow(max(dot(normalize(L+v),n),0.),140.)*sd*1.6;
  }
  col=pow(col*1.08,vec3(.92)); col=col/(1.+.18*col);   // a gentle tone curve
  return vec4(col,1.);
}
void main(){
  gM=rotX(uPitch)*rotY(uYaw);
  vec4 s=vec4(0.);
  for(int i=0;i<2;i++)for(int j=0;j<2;j++){vec2 o=vec2(float(i),float(j))*.5-.25;s+=render(gl_FragCoord.xy+o);}
  s*=.25;
  gl_FragColor=s;
}`;

const spring = (s, target, k, c, dt) => { s.v += ((target - s.x) * k - s.v * c) * dt; s.x += s.v * dt; };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t;

/**
 * A canvas padlock, or null when WebGL cannot be had. `open` draws the "not locked" reminder's open lock in amber.
 * It is always seen head on and does not move on its own. The bar moves the way a real one does, one thing at a time, and never through the case:
 *   opening: the bar slides straight up out of the case, THEN swings round on its long leg
 *   closing: the bar swings fully back into line, THEN slides straight down into the case (and the case gives a small thunk)
 */
export function createPadlock3d({ open = false, cls = "" } = {}) {
  let gl = null;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "padlock padlock3d " + (open ? "open" : "closed") + (cls ? " " + cls : "");
  try { gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" }); } catch { gl = null; }
  if (!gl) return null;
  const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  let program;
  try {
    program = gl.createProgram(); gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) { console.warn("The 3D padlock could not start; the flat one is used.", error); return null; }
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "a"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; for (const n of ["uRes", "uTime", "uLift", "uSwing", "uOk", "uBad", "uWarm", "uYaw", "uPitch", "uRoll", "uPulse", "uSquash", "uDark"]) U[n] = gl.getUniformLocation(program, n);
  gl.clearColor(0, 0, 0, 0);

  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // lift: 0 = the bar is in the case, 1 = slid fully out. swing: 0 = in line with the case, 1 = swung fully open.
  const pose = { lift: open ? 1 : 0, swing: open ? 1 : 0 };
  const sp = { ok: { x: 0, v: 0 }, bad: { x: 0, v: 0 }, shake: { x: 0, v: 0 }, squash: { x: 0, v: 0 }, pulse: { x: 0, v: 0 } };
  const goal = { ok: 0, bad: 0, shake: 0, pulse: 0 };
  const warm = open ? 1 : 0;
  let tweens = [], timers = [];
  const later = (fn, ms) => { const id = window.setTimeout(() => { timers = timers.filter((x) => x !== id); fn(); wake(); }, ms); timers.push(id); };
  /** Move one part of the pose from where it is to `to`, starting `delay` ms from now. Tweens on the same part replace each other. */
  const tween = (key, to, delay, ms, ease) => { tweens = tweens.filter((t) => t.key !== key || t.started); tweens.push({ key, to, delay, ms, ease, at: performance.now() + delay, started: false, from: 0 }); };
  const clear = () => { tweens = []; timers.splice(0).forEach((t) => clearTimeout(t)); };

  const api = {
    /** Play one of the padlock's moves: "locking", "unlocking" or "denied". */
    play(move) {
      clear();
      if (move === "locking") {
        pose.lift = 1; pose.swing = 1; sp.ok.x = 0; sp.bad.x = 0; goal.ok = goal.bad = 0;       // it starts open, and waits a beat
        tween("swing", 0, 450, 520, easeInOut);                                               // 1. the bar swings fully round, still raised
        tween("lift", 0, 450 + 520 + 60, 260, easeIn);                                         // 2. then it slides straight down into the case
        later(() => { sp.squash.v = 4.5; sp.pulse.x = 0.8; goal.pulse = 0; }, 450 + 520 + 60 + 260);   // the thunk
      } else if (move === "unlocking") {
        goal.ok = 1; goal.bad = 0;
        tween("lift", 1, 0, 340, easeOut);                                                    // 1. the bar slides straight up out of the case
        tween("swing", 1, 340 + 60, 560, easeInOut);                                           // 2. then it swings round
        sp.pulse.x = 1; goal.pulse = 0;
      } else if (move === "denied") {
        goal.bad = 1; sp.shake.x = 0; sp.shake.v = 30; goal.shake = 0; later(() => { goal.bad = 0; }, 520); // a quick sideways shake and a red flush: no turning
      }
      wake();
    },
    get pose() { return { ...pose }; }, // (for tests)
    destroy() { running = false; clear(); try { gl.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* already gone */ } }
  };

  let running = false, last = 0;
  function frame(now) {
    if (!running) return;
    if (!canvas.isConnected) { running = false; return; }
    const dt = Math.min(0.033, (now - (last || now)) / 1000); last = now;
    for (const t of tweens) {
      if (now < t.at) continue;
      if (!t.started) { t.started = true; t.from = pose[t.key]; }
      const k = Math.min(1, (now - t.at) / t.ms); pose[t.key] = t.from + (t.to - t.from) * t.ease(reduce ? 1 : k);
    }
    tweens = tweens.filter((t) => !(t.started && now - t.at >= t.ms));
    const steps = Math.max(1, Math.round(dt / (1 / 120)));
    for (let i = 0; i < steps; i++) {
      const h = dt / steps;
      spring(sp.ok, goal.ok, 36, 11, h); spring(sp.bad, goal.bad, 60, 12, h); spring(sp.shake, goal.shake, 380, 7, h); spring(sp.pulse, goal.pulse, 14, 5, h); spring(sp.squash, 0, 420, 15, h);
    }
    const w = canvas.clientWidth, hgt = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(2, Math.round(w * dpr)), H = Math.max(2, Math.round(hgt * dpr));
    if (w > 0) {
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; gl.viewport(0, 0, W, H); }
      gl.uniform2f(U.uRes, W, H); gl.uniform1f(U.uTime, (now - 0) / 1000);
      gl.uniform1f(U.uLift, pose.lift); gl.uniform1f(U.uSwing, pose.swing);
      gl.uniform1f(U.uOk, Math.min(1, Math.max(0, sp.ok.x))); gl.uniform1f(U.uBad, Math.min(1, Math.max(0, sp.bad.x))); gl.uniform1f(U.uWarm, warm);
      gl.uniform1f(U.uYaw, 0); gl.uniform1f(U.uPitch, 0);                       // seen head on, and it stays that way
      gl.uniform1f(U.uRoll, reduce ? 0 : sp.shake.x * 0.05);                    // the only sideways movement is the shake after a wrong passphrase
      gl.uniform1f(U.uPulse, Math.max(0, sp.pulse.x)); gl.uniform1f(U.uSquash, sp.squash.x);
      gl.uniform1f(U.uDark, document.documentElement.dataset.theme === "dark" ? 1 : 0);
      gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // nothing is moving: keep the last picture and stop drawing (no idle animation, no battery spent)
    const moving = tweens.length || timers.length || Math.abs(sp.shake.x) > 0.002 || Math.abs(sp.shake.v) > 0.01 || sp.squash.x > 0.002 || Math.abs(sp.squash.v) > 0.01 || Math.abs(sp.ok.x - goal.ok) > 0.002 || Math.abs(sp.bad.x - goal.bad) > 0.002 || Math.abs(sp.pulse.x - goal.pulse) > 0.002 || w === 0;
    if (!moving) { running = false; return; }
    requestAnimationFrame(frame);
  }
  function wake() { if (!running) { running = true; last = 0; requestAnimationFrame(frame); } }
  canvas.__padlock = api;
  wake();
  // a lock drawn while it was hidden (zero size) is drawn again when it appears
  if (typeof ResizeObserver === "function") new ResizeObserver(() => wake()).observe(canvas);
  return canvas;
}
