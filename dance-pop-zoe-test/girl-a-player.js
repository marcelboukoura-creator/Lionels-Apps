/* Dance-Pop-Zoe TEST — hand-drawn Girl A.
   Frames stay 512×768, feet at y=753. Recolor matches preview.html (CIELAB + masks)
   and runs in a worker. Only idle + the next move are decoded. */
(function () {
  const BASE = new URL("girl-a/", document.currentScript.src);
  const ASSET_V = "2";
  function assetUrl(rel) {
    const u = new URL(rel, BASE);
    u.searchParams.set("v", ASSET_V);
    return u;
  }
  const W = 512, H = 768, FEET_Y = 753, BODY_PX = 740, BODY_UNITS = 215;
  const CACHE_MAX = 64;

  const HAIR = [
    { name: "Honigblond", hex: "#C99F85" },
    { name: "Platin", hex: "#F3E6D4" },
    { name: "Schwarz", hex: "#1B1B1F" },
    { name: "Schokobraun", hex: "#5A3318" },
    { name: "Rotbraun", hex: "#8E3B22" },
    { name: "Pink", hex: "#FF6FB5" },
    { name: "Lavendel", hex: "#C9A0FF" },
    { name: "Silber", hex: "#C9CED6" },
    { name: "Aqua", hex: "#5ED0C9" }
  ];
  const CLOTH = [
    { name: "Pink", hex: "#FF8CC6", swatch: "#FF8CC6" },
    { name: "Navy", hex: "#2E3D7A", swatch: "#2E3D7A" },
    { name: "Mint", hex: "#7DDEBE", swatch: "#7DDEBE" },
    { name: "Gelb", hex: "#FFE14A", swatch: "#FFE14A" },
    { name: "Wei\u00df", hex: "#F7F4EE", swatch: "#F7F4EE" },
    { name: "Schwarz", hex: "#1B1B1F", swatch: "#1B1B1F" },
    { name: "Koralle", hex: "#FF7A6A", swatch: "#FF7A6A" },
    { name: "Himmelblau", hex: "#7EC8FF", swatch: "#7EC8FF" }
  ];
  HAIR.forEach(function (c) { c.swatch = c.hex; });
  const SKIN = [
    { name: "Ganz hell", swatch: "#F6D3C2", hex: "#F6D3C2" },
    { name: "Normal", swatch: "#EFB89A", hex: "#EFB89A", base: true },
    { name: "Leicht braun", swatch: "#C4926E", hex: "#C4926E" },
    { name: "Mittel", swatch: "#8D5E45", hex: "#8D5E45" },
    { name: "Dunkel", swatch: "#5C3B32", hex: "#5C3B32" }
  ];

  const look = {
    hair: 0, top: 2, skirt: 0, skin: 1,
    acc: { crown: false, sunglasses: false, pendant: false, bow: false, earrings: false }
  };

  let manifest = null;
  let gen = 1;
  let ready = false;
  let mode = "idle";
  let idleI = 0;
  let accMs = 0;
  let seq = [];
  let pos = 0;
  let playing = null;
  let lastMove = null;
  let upcoming = null;
  let wantHit = false;
  let wantSpecific = false;
  let bag = [];
  let history = [];
  let idleSince = 0;
  let sparseMin = 5000;
  let lastBeatFloor = -1;
  let justLabel = "";
  let forceReady = false;
  let simNow = null;
  const BIG = { jump: 1, spin: 1, splits: 1, kick: 1, robot: 1 };
  const CYCLE_MS = 8 * 120;
  let nextAt = 0;
  let lastBpm = 0;
  let freeze = null;
  const cache = new Map();
  const blobP = Object.create(null);
  const fetchQ = [];
  let fetchActive = 0;
  const recolorQ = [];
  const queued = new Set();
  let busy = false;
  let worker = null;
  let recolorSync = null;
  const accImg = Object.create(null);
  let refLabs = null;
  const raster = document.createElement("canvas");
  raster.width = W; raster.height = H;
  const rctx = raster.getContext("2d", { willReadFrequently: true });

  let perfPrev = 0, perfWorst = 0, perfOver = 0, perfN = 0;

  function clamp(i, n) {
    i = i | 0;
    return i >= 0 && i < n ? i : 0;
  }
  function loadLook() {
    try {
      const s = localStorage.getItem("dpztest_ga_look_v1");
      if (!s) return;
      const o = JSON.parse(s);
      if (o && typeof o === "object") {
        if (o.hair != null) look.hair = clamp(o.hair, HAIR.length);
        if (o.top != null) look.top = clamp(o.top, CLOTH.length);
        if (o.skirt != null) look.skirt = clamp(o.skirt, CLOTH.length);
        if (o.skin != null) look.skin = clamp(o.skin, SKIN.length);
        if (o.acc) {
          ["crown", "sunglasses", "pendant", "bow", "earrings"].forEach(function (k) {
            if (typeof o.acc[k] === "boolean") look.acc[k] = o.acc[k];
          });
        }
      }
    } catch (e) {}
  }
  function saveLook() {
    try { localStorage.setItem("dpztest_ga_look_v1", JSON.stringify(look)); } catch (e) {}
  }
  loadLook();

  function setStatus(t, p) {
    const s = document.getElementById("ga-status");
    const b = document.getElementById("ga-bar-in");
    if (s && t) s.textContent = t;
    if (b && p != null) b.style.width = Math.max(0, Math.min(1, p)) * 100 + "%";
  }
  function hideLoad() {
    const el = document.getElementById("ga-load");
    if (!el) return;
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 450);
  }
  function showError(msg) {
    setStatus(msg || "Das hat nicht geklappt.", 0);
    const el = document.getElementById("ga-load");
    if (!el || document.getElementById("ga-retry")) return;
    const btn = document.createElement("button");
    btn.id = "ga-retry";
    btn.type = "button";
    btn.textContent = "Nochmal versuchen";
    btn.onclick = function () { location.reload(); };
    el.querySelector(".ga-card").appendChild(btn);
  }

  const RECOLOR_SRC = [
    "function sstep(a,b,x){x=Math.max(0,Math.min(1,(x-a)/(b-a)));return x*x*(3-2*x);}",
    "var LIN=new Float64Array(256);",
    "for(var i=0;i<256;i++){var c=i/255;LIN[i]=c>0.04045?Math.pow((c+0.055)/1.055,2.4):c/12.92;}",
    "function fLab(t){return t>0.008856?Math.cbrt(t):7.787*t+16/116;}",
    "function rgb2lab(r,g,b){",
    "  var R=LIN[r],G=LIN[g],B=LIN[b];",
    "  var x=fLab((R*0.4124+G*0.3576+B*0.1805)/0.95047);",
    "  var y=fLab(R*0.2126+G*0.7152+B*0.0722);",
    "  var z=fLab((R*0.0193+G*0.1192+B*0.9505)/1.08883);",
    "  return [116*y-16,500*(x-y),200*(y-z)];",
    "}",
    "function lab2rgb(L,a,b){",
    "  var y=(L+16)/116,x=a/500+y,z=y-b/200;",
    "  var f=function(t){var t3=t*t*t;return t3>0.008856?t3:(t-16/116)/7.787;};",
    "  x=f(x)*0.95047;y=f(y);z=f(z)*1.08883;",
    "  var R=x*3.2406-y*1.5372-z*0.4986,G=-x*0.9689+y*1.8758+z*0.0415,B=x*0.0557-y*0.2040+z*1.0570;",
    "  var gm=function(t){return t>0.0031308?1.055*Math.pow(t,1/2.4)-0.055:12.92*t;};",
    "  R=gm(R);G=gm(G);B=gm(B);",
    "  if(R<0)R=0;else if(R>1)R=1;",
    "  if(G<0)G=0;else if(G>1)G=1;",
    "  if(B<0)B=0;else if(B>1)B=1;",
    "  return [R*255,G*255,B*255];",
    "}",
    "function hex2rgb(h){return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}",
    "function target(hex,ref,kc){",
    "  var t=rgb2lab.apply(null,hex2rgb(hex));",
    "  var kL=Math.max(0.35,Math.min(1,(t[0]+25*100/255)/Math.max(ref[0],1)));",
    "  return {t:t,ref:ref,kL:kL,kc:kc};",
    "}",
    "function blend(L,A,B,lab,tg,c,lk,lkC){",
    "  var wv=c/255*lk, wvC=c/255*(lkC==null?lk:lkC);",
    "  var nL=tg.t[0]+(lab[0]-tg.ref[0])*tg.kL;",
    "  var nA=tg.t[1]+(lab[1]-tg.ref[1])*tg.kc;",
    "  var nB=tg.t[2]+(lab[2]-tg.ref[2])*tg.kc;",
    "  return [L*(1-wv)+nL*wv, A*(1-wvC)+nA*wvC, B*(1-wvC)+nB*wvC];",
    "}",
    "function recolorInPlace(px,mk,p){",
    "  var H=target(p.hair,p.refHair,0.32),T=target(p.top,p.refTop,0.5),S=target(p.skirt,p.refSkirt,0.5);",
    "  var K=p.skinOff?null:target(p.skin,p.refSkin,0.55);",
    "  var n=px.length,o,shade;",
    "  for(var i=0;i<n;i+=4){",
    "    if(px[i+3]<8)continue;",
    "    var mh=mk[i],mt=mk[i+1],ms=mk[i+2],mskin=mk[i+3];",
    "    if(!(mh|mt|ms)&&(!K||!mskin))continue;",
    "    var lab=rgb2lab(px[i],px[i+1],px[i+2]);",
    "    shade=sstep(0,1,(lab[0]*2.55-55)/45);",
    "    var lk=0.35+0.65*shade, lkHair=0.62+0.38*shade, lkSkin=0.78+0.22*shade;",
    "    var L=lab[0],A=lab[1],B=lab[2];",
    "    if(mh){o=blend(L,A,B,lab,H,mh,lkHair,0.94);L=o[0];A=o[1];B=o[2];}",
    "    if(mt){o=blend(L,A,B,lab,T,mt,lk);L=o[0];A=o[1];B=o[2];}",
    "    if(ms){o=blend(L,A,B,lab,S,ms,lk);L=o[0];A=o[1];B=o[2];}",
    "    if(K&&mskin){o=blend(L,A,B,lab,K,mskin,lkSkin,0.92);L=o[0];A=o[1];B=o[2];}",
    "    o=lab2rgb(L,A,B);px[i]=o[0];px[i+1]=o[1];px[i+2]=o[2];",
    "  }",
    "  return px;",
    "}"
  ].join("\n");

  try {
    recolorSync = new Function(RECOLOR_SRC + "\nreturn recolorInPlace;")();
    const blob = new Blob([
      RECOLOR_SRC,
      "\nself.onmessage=function(e){",
      "try{",
      "if(typeof OffscreenCanvas!=='function') throw new Error('no-offscreen');",
      "var c=new OffscreenCanvas(512,768);",
      "var x=c.getContext('2d',{willReadFrequently:true});",
      "x.drawImage(e.data.artB,0,0);var art=x.getImageData(0,0,512,768).data;",
      "x.clearRect(0,0,512,768);x.drawImage(e.data.maskB,0,0);var mask=x.getImageData(0,0,512,768).data;",
      "x.clearRect(0,0,512,768);x.drawImage(e.data.skinB,0,0);var skin=x.getImageData(0,0,512,768).data;",
      "if(e.data.artB.close)e.data.artB.close();",
      "if(e.data.maskB.close)e.data.maskB.close();",
      "if(e.data.skinB.close)e.data.skinB.close();",
      "var mk=new Uint8Array(art.length);",
      "for(var i=0;i<mask.length;i+=4){mk[i]=mask[i];mk[i+1]=mask[i+1];mk[i+2]=mask[i+2];mk[i+3]=skin[i];}",
      "recolorInPlace(art,mk,e.data);",
      "self.postMessage({id:e.data.id,gen:e.data.gen,buf:art.buffer},[art.buffer]);",
      "}catch(err){self.postMessage({id:e.data.id,gen:e.data.gen,err:String(err&&err.message||err)});}",
      "};"
    ], { type: "application/javascript" });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = function (e) {
      busy = false;
      const d = e.data;
      if (d.err) {
        worker = null;
        if (d.id) prioritize(d.id);
        pumpRecolor();
        return;
      }
      if (d.gen === gen && d.buf) {
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(d.buf), W, H), 0, 0);
        const prev = cache.get(d.id);
        if (prev && prev.canvas !== c) { prev.canvas.width = 0; prev.canvas.height = 0; }
        cache.delete(d.id);
        cache.set(d.id, { gen: gen, canvas: c });
        evict();
      }
      pumpRecolor();
    };
    worker.onerror = function () {
      worker = null;
      busy = false;
    };
  } catch (e) {
    worker = null;
  }

  function rasterBitmap(bmp) {
    rctx.clearRect(0, 0, W, H);
    rctx.drawImage(bmp, 0, 0);
    return rctx.getImageData(0, 0, W, H).data;
  }
  function packMask(maskPx, skinPx) {
    const out = new Uint8Array(maskPx.length);
    for (let i = 0; i < maskPx.length; i += 4) {
      out[i] = maskPx[i];
      out[i + 1] = maskPx[i + 1];
      out[i + 2] = maskPx[i + 2];
      out[i + 3] = skinPx[i];
    }
    return out;
  }
  function params() {
    return {
      hair: HAIR[look.hair].hex,
      top: CLOTH[look.top].hex,
      skirt: CLOTH[look.skirt].hex,
      skin: SKIN[look.skin].hex,
      skinOff: !!SKIN[look.skin].base,
      refHair: refLabs.hair,
      refTop: refLabs.top,
      refSkirt: refLabs.skirt,
      refSkin: refLabs.skin
    };
  }
  function isFresh(id) {
    const e = cache.get(id);
    return !!(e && e.gen === gen);
  }
  function canvasFor(id) {
    const e = cache.get(id);
    return e ? e.canvas : null;
  }
  function idleIds() {
    return manifest.idle.loop.slice();
  }
  function moveFrames(name) {
    const m = manifest.moves[name];
    if (!m) return [];
    return m.in.concat(m.hold, m.out);
  }
  function unique(arr) {
    const s = new Set();
    const o = [];
    for (let i = 0; i < arr.length; i++) if (arr[i] && !s.has(arr[i])) { s.add(arr[i]); o.push(arr[i]); }
    return o;
  }
  function keepNames() {
    const names = [];
    function add(n) { if (n && names.indexOf(n) < 0) names.push(n); }
    add(playing);
    add(upcoming);
    for (let i = 0; i < bag.length && i < 3; i++) add(bag[i]);
    return names;
  }
  function pinned(id) {
    if (!manifest) return false;
    if (manifest.idle.loop.indexOf(id) >= 0) return true;
    if (freeze === id) return true;
    const names = keepNames();
    for (let n = 0; n < names.length; n++) {
      const frames = moveFrames(names[n]);
      for (let i = 0; i < frames.length; i++) if (frames[i] === id) return true;
    }
    return false;
  }
  function evict() {
    if (cache.size <= CACHE_MAX) return;
    for (const id of cache.keys()) {
      if (cache.size <= CACHE_MAX) break;
      if (pinned(id)) continue;
      const e = cache.get(id);
      if (e) { e.canvas.width = 0; e.canvas.height = 0; }
      cache.delete(id);
    }
  }
  function enqueueBlob(id, pri) {
    if (blobP[id]) {
      if (pri) {
        const i = fetchQ.findIndex(function (j) { return j.id === id; });
        if (i > 0) { const j = fetchQ.splice(i, 1)[0]; fetchQ.unshift(j); }
      }
      return blobP[id];
    }
    let resolve, reject;
    const p = new Promise(function (res, rej) { resolve = res; reject = rej; });
    blobP[id] = p;
    const job = { id: id, resolve: resolve, reject: reject };
    if (pri) fetchQ.unshift(job); else fetchQ.push(job);
    pumpFetch();
    return p;
  }
  function pumpFetch() {
    while (fetchActive < 4 && fetchQ.length) {
      const job = fetchQ.shift();
      fetchActive++;
      const f = manifest.frames[job.id];
      Promise.all([
        fetch(assetUrl(f.file)).then(function (r) { if (!r.ok) throw new Error(f.file); return r.blob(); }),
        fetch(assetUrl(f.mask)).then(function (r) { if (!r.ok) throw new Error(f.mask); return r.blob(); }),
        fetch(assetUrl(f.skin)).then(function (r) { if (!r.ok) throw new Error(f.skin); return r.blob(); })
      ]).then(function (ab) {
        job.resolve({ a: ab[0], m: ab[1], s: ab[2] });
      }, function (err) { job.reject(err); }).then(function () {
        fetchActive--;
        pumpFetch();
      });
    }
  }
  function queueRecolor(ids) {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (!id || queued.has(id) || isFresh(id)) continue;
      recolorQ.push(id);
      queued.add(id);
    }
    pumpRecolor();
  }
  function prioritize(id) {
    if (!id || isFresh(id)) return;
    const i = recolorQ.indexOf(id);
    if (i > 0) recolorQ.splice(i, 1);
    if (i !== 0) recolorQ.unshift(id);
    queued.add(id);
    pumpRecolor();
  }
  function pumpRecolor() {
    if (busy || !recolorQ.length || !refLabs) return;
    const id = recolorQ.shift();
    queued.delete(id);
    if (isFresh(id)) { pumpRecolor(); return; }
    if (!blobP[id]) { enqueueBlob(id, true); blobP[id].then(function () { prioritize(id); }); return; }
    busy = true;
    const myGen = gen;
    blobP[id].then(function (b) {
      return Promise.all([createImageBitmap(b.a), createImageBitmap(b.m), createImageBitmap(b.s)]);
    }).then(function (bmps) {
      if (myGen !== gen) {
        bmps.forEach(function (b) { if (b.close) b.close(); });
        busy = false; pumpRecolor(); return;
      }
      const p = params();
      p.id = id;
      p.gen = myGen;
      if (worker) {
        try {
          p.artB = bmps[0]; p.maskB = bmps[1]; p.skinB = bmps[2];
          worker.postMessage(p, bmps);
          return;
        } catch (e) {
          worker = null;
        }
      }
      const artPx = rasterBitmap(bmps[0]);
      const maskPx = rasterBitmap(bmps[1]);
      const skinPx = rasterBitmap(bmps[2]);
      bmps.forEach(function (b) { if (b.close) b.close(); });
      const out = recolorSync(artPx, packMask(maskPx, skinPx), p);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      c.getContext("2d").putImageData(new ImageData(out, W, H), 0, 0);
      const prev = cache.get(id);
      if (prev) { prev.canvas.width = 0; prev.canvas.height = 0; }
      cache.delete(id);
      cache.set(id, { gen: myGen, canvas: c });
      evict();
      busy = false;
      pumpRecolor();
    }).catch(function () {
      busy = false;
      pumpRecolor();
    });
  }
  function whenFresh(ids) {
    return new Promise(function (resolve, reject) {
      const t0 = performance.now();
      (function check() {
        if (ids.every(isFresh)) resolve();
        else if (performance.now() - t0 > 25000) reject(new Error("recolor timeout"));
        else setTimeout(check, 40);
      })();
    });
  }
  function moveReady(name) {
    if (!manifest || !manifest.moves[name]) return false;
    if (forceReady) return true;
    const frames = unique(moveFrames(name));
    for (let i = 0; i < frames.length; i++) if (!isFresh(frames[i])) return false;
    return frames.length > 0;
  }
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function buildBag() {
    const all = Object.keys(manifest.moves);
    const recent = history.slice(-4);
    function defer(arr) {
      const early = [], late = [];
      arr.forEach(function (n) { (recent.indexOf(n) >= 0 ? late : early).push(n); });
      return early.concat(late);
    }
    const big = defer(shuffle(all.filter(function (k) { return BIG[k]; })));
    const small = defer(shuffle(all.filter(function (k) { return !BIG[k]; })));
    const out = [];
    let bi = 0, si = 0;
    while (si < small.length || bi < big.length) {
      if (si < small.length) out.push(small[si++]);
      if (bi < big.length) out.push(big[bi++]);
    }
    bag = out;
  }
  function takeNext() {
    if (!bag.length) buildBag();
    const last = history.length ? history[history.length - 1] : null;
    let name = bag.shift();
    let guard = 0;
    while (name === last && guard++ < 16) {
      bag.push(name);
      if (!bag.length) buildBag();
      name = bag.shift();
    }
    return name;
  }
  function keepMove(name) {
    if (!name) return false;
    if (name === upcoming || name === playing) return true;
    for (let i = 0; i < bag.length && i < 3; i++) if (bag[i] === name) return true;
    return false;
  }
  function prepareMove(name) {
    if (!name || !manifest || !manifest.moves[name]) return;
    const ids = unique(moveFrames(name));
    ids.forEach(function (id) { enqueueBlob(id, true); });
    Promise.all(ids.map(function (id) { return blobP[id]; })).then(function () {
      if (keepMove(name)) queueRecolor(ids);
    }).catch(function () {});
  }
  function preloadAhead() {
    const names = [];
    function add(n) { if (n && names.indexOf(n) < 0) names.push(n); }
    add(upcoming);
    for (let i = 0; i < bag.length && names.length < 4; i++) add(bag[i]);
    names.forEach(prepareMove);
  }
  function now() { return simNow == null ? performance.now() : simNow; }
  function enterIdle() {
    mode = "idle";
    playing = null;
    idleI = 0;
    accMs = 0;
    idleSince = now();
    sparseMin = 4000 + Math.random() * 1600;
    lastBeatFloor = -1;
  }
  function buildSeq(name) {
    const m = manifest.moves[name];
    const s = [];
    m.in.forEach(function (f, i) { s.push([f, m.in_ms[i] || 100]); });
    m.hold.forEach(function (f, i) { s.push([f, m.hold_ms[i] || 400]); });
    m.out.forEach(function (f, i) { s.push([f, m.out_ms[i] || 100]); });
    return s;
  }
  function tryStart() {
    if (!ready || !upcoming) return false;
    if (!moveReady(upcoming)) {
      prepareMove(upcoming);
      preloadAhead();
      return false;
    }
    const name = upcoming;
    mode = "move";
    playing = name;
    seq = buildSeq(name);
    pos = 0;
    accMs = 0;
    lastMove = name;
    history.push(name);
    if (history.length > 16) history.shift();
    wantHit = false;
    wantSpecific = false;
    justLabel = manifest.moves[name].label_de || name;
    upcoming = takeNext();
    preloadAhead();
    return true;
  }
  function canStart(info) {
    const near = !!(info && info.notesNear);
    const need = near ? 2.5 * CYCLE_MS : sparseMin;
    if (now() - idleSince < need) return false;
    if (!near) return true;
    if (wantHit) return true;
    if (info && typeof info.beat === "number" && isFinite(info.beat)) {
      const fl = Math.floor(info.beat + 1e-4);
      if (fl !== lastBeatFloor) {
        lastBeatFloor = fl;
        return true;
      }
    }
    return false;
  }
  function currentId() {
    if (freeze) return freeze;
    if (mode === "move" && seq[pos]) return seq[pos][0];
    if (!manifest) return null;
    return manifest.idle.loop[idleI] || manifest.neutral;
  }
  function tick(dt, info) {
    justLabel = "";
    if (!ready || !manifest || freeze) return "";
    dt = Math.max(0, Math.min(0.05, dt || 0));
    if (info && info.bpm) lastBpm = info.bpm;
    const id = currentId();
    if (id && !isFresh(id) && !forceReady) prioritize(id);
    const ms = dt * 1000;
    if (mode === "move") {
      accMs += ms;
      let guard = 0;
      while (pos < seq.length && accMs >= seq[pos][1] && guard++ < 8) {
        accMs -= seq[pos][1];
        pos++;
      }
      if (pos >= seq.length) enterIdle();
      else return "";
    }
    if (!idleSince) idleSince = now();
    const frameDur = manifest.idle.ms || 120;
    const loopLen = manifest.idle.loop.length;
    accMs += ms;
    let guard2 = 0;
    while (accMs >= frameDur && guard2++ < 8) {
      const endOfCycle = idleI === loopLen - 1;
      if (endOfCycle && canStart(info)) {
        if (tryStart()) return justLabel;
      }
      accMs -= frameDur;
      idleI = (idleI + 1) % loopLen;
    }
    return "";
  }
  function hit() { wantHit = true; }
  function simulate(totalMs) {
    forceReady = true;
    simNow = 0;
    freeze = null;
    history = [];
    bag = [];
    lastMove = null;
    wantHit = false;
    wantSpecific = false;
    playing = null;
    mode = "idle";
    idleI = 0;
    accMs = 0;
    sparseMin = 4800;
    lastBeatFloor = -1;
    buildBag();
    upcoming = takeNext();
    enterIdle();
    const played = [];
    const gaps = [];
    const kinds = [];
    let lastEnd = 0;
    const step = 40;
    for (let t = 0; t < totalMs; t += step) {
      simNow = t;
      const phase = t % 90000;
      const near = phase >= 25000 && phase < 70000;
      if (near && Math.floor(t / 350) !== Math.floor((t - step) / 350)) wantHit = true;
      const before = playing;
      const label = tick(step / 1000, { notesNear: near, beat: near ? t / 480 : null, mode: near ? "play" : "menu" });
      if (label) {
        played.push(playing);
        kinds.push(BIG[playing] ? "big" : "small");
        gaps.push(Math.round(t - lastEnd));
      }
      if (before && !playing) lastEnd = t;
    }
    const counts = {};
    played.forEach(function (n) { counts[n] = (counts[n] || 0) + 1; });
    let repeats = 0, bigPairs = 0, recentHits = 0;
    for (let i = 1; i < played.length; i++) {
      if (played[i] === played[i - 1]) repeats++;
      if (BIG[played[i]] && BIG[played[i - 1]]) bigPairs++;
      const window = played.slice(Math.max(0, i - 4), i);
      if (window.indexOf(played[i]) >= 0) recentHits++;
    }
    const result = {
      n: played.length,
      unique: Object.keys(counts).sort(),
      missing: Object.keys(manifest.moves).filter(function (k) { return !counts[k]; }),
      counts: counts,
      repeats: repeats,
      bigPairs: bigPairs,
      recentHits: recentHits,
      gaps: gaps.slice(0, 12),
      minGap: gaps.length ? Math.min.apply(null, gaps) : 0,
      sample: played.slice(0, 24)
    };
    simNow = null;
    forceReady = false;
    enterIdle();
    if (!bag.length) buildBag();
    upcoming = takeNext();
    preloadAhead();
    return result;
  }
  function requestMove(name) {
    if (!manifest || !manifest.moves[name]) return;
    upcoming = name;
    wantSpecific = true;
    wantHit = true;
    prepareMove(name);
  }
  function setLook(p) {
    if (!p) return;
    let color = false;
    if (p.hair != null && clamp(p.hair, HAIR.length) !== look.hair) { look.hair = clamp(p.hair, HAIR.length); color = true; }
    if (p.top != null && clamp(p.top, CLOTH.length) !== look.top) { look.top = clamp(p.top, CLOTH.length); color = true; }
    if (p.skirt != null && clamp(p.skirt, CLOTH.length) !== look.skirt) { look.skirt = clamp(p.skirt, CLOTH.length); color = true; }
    if (p.skin != null && clamp(p.skin, SKIN.length) !== look.skin) { look.skin = clamp(p.skin, SKIN.length); color = true; }
    if (p.acc) {
      ["crown", "sunglasses", "pendant", "bow", "earrings"].forEach(function (k) {
        if (typeof p.acc[k] === "boolean") look.acc[k] = p.acc[k];
      });
    }
    saveLook();
    if (color) {
      gen++;
      recolorQ.length = 0;
      queued.clear();
      const ids = [];
      const cur = currentId();
      if (cur) ids.push(cur);
      if (manifest) {
        if (mode === "move") seq.forEach(function (s) { ids.push(s[0]); });
        manifest.idle.loop.forEach(function (id) { ids.push(id); });
        if (upcoming) moveFrames(upcoming).forEach(function (id) { ids.push(id); });
      }
      queueRecolor(ids);
    }
  }
  function randomize() {
    setLook({
      hair: Math.floor(Math.random() * HAIR.length),
      top: Math.floor(Math.random() * CLOTH.length),
      skirt: Math.floor(Math.random() * CLOTH.length),
      skin: Math.floor(Math.random() * SKIN.length),
      acc: {
        crown: Math.random() < 0.55,
        sunglasses: Math.random() < 0.35,
        pendant: Math.random() < 0.45,
        bow: Math.random() < 0.4,
        earrings: Math.random() < 0.2
      }
    });
  }
  function seek(id) {
    freeze = id;
    if (manifest && manifest.frames[id]) {
      enqueueBlob(id, true);
      blobP[id].then(function () { queueRecolor([id]); prioritize(id); }).catch(function () {});
    }
  }
  function release() { freeze = null; }
  function draw(ctx, footX, footY, gameScale) {
    if (!manifest) return;
    const id = currentId();
    const c = id && canvasFor(id);
    if (!c) return;
    const s = (gameScale * BODY_UNITS) / BODY_PX;
    const ox = footX - (W / 2) * s;
    const oy = footY - FEET_Y * s;
    ctx.drawImage(c, ox, oy, W * s, H * s);
    drawAcc(ctx, id, ox, oy, s);
  }
  function drawAcc(ctx, id, ox, oy, sc) {
    const f = manifest.frames[id];
    if (!f || !f.anchors) return;
    const A = f.anchors;
    const V = f.accessoryVisible || {};
    const want = {
      crown: !!look.acc.crown,
      earL: !!look.acc.earrings,
      earR: !!look.acc.earrings,
      sunglasses: !!look.acc.sunglasses,
      pendant: !!look.acc.pendant,
      bow: !!look.acc.bow
    };
    const order = manifest.accessoryDrawOrder || [];
    for (let i = 0; i < order.length; i++) {
      const k = order[i];
      if (!want[k]) continue;
      const a = manifest.accessories[k];
      if (!a || !accImg[k]) continue;
      if (a.visibleFlag && !V[a.visibleFlag]) continue;
      const p = A[a.anchorFrame];
      if (!p || !A.ed) continue;
      const scA = (k === "crown" ? (2.7 * A.ed / a.w) : (A.ed / a.refEyeDistance)) * sc;
      ctx.save();
      ctx.translate(ox + p[0] * sc, oy + p[1] * sc);
      ctx.rotate((A.angleDeg || 0) * Math.PI / 180);
      ctx.scale(scA, scA);
      ctx.drawImage(accImg[k], -a.anchor[0], -a.anchor[1]);
      ctx.restore();
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function badge(ctx, e) {
    if (!e || !e.W) return;
    const u = (e.L && e.L.u) || 1;
    const label = "TEST";
    ctx.save();
    ctx.font = "900 " + Math.round(13 * u) + "px -apple-system,system-ui,sans-serif";
    const tw = ctx.measureText(label).width;
    const w = tw + 16 * u;
    const h = 22 * u;
    const x = (e.safeL || 0) + 10 * u;
    const y = e.H - (e.safeB || 0) - 12 * u - h;
    ctx.fillStyle = "#ff4fa3";
    roundRect(ctx, x, y, w, h, 8 * u);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
    ctx.restore();
  }
  function rgb2labBoot(r, g, b) {
    function lin(c) { c /= 255; return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92; }
    const R = lin(r), G = lin(g), B = lin(b);
    const f = function (t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; };
    const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
    const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
    const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  function prepRef() {
    const b = manifest.recolor.baseColorsRGB;
    refLabs = {
      hair: rgb2labBoot(b.hair[0], b.hair[1], b.hair[2]),
      top: rgb2labBoot(b.top[0], b.top[1], b.top[2]),
      skirt: rgb2labBoot(b.skirt[0], b.skirt[1], b.skirt[2]),
      skin: rgb2labBoot(b.skin[0], b.skin[1], b.skin[2])
    };
  }
  function loadAcc(k) {
    return new Promise(function (res) {
      const im = new Image();
      im.onload = function () { accImg[k] = im; res(); };
      im.onerror = function () { res(); };
      im.src = assetUrl(manifest.accessories[k].file).href;
    });
  }
  function stats() {
    let fresh = 0;
    cache.forEach(function (v) { if (v.gen === gen) fresh++; });
    return {
      ready: ready,
      mode: mode,
      frame: currentId(),
      idleI: idleI,
      playing: playing,
      upcoming: upcoming,
      lastMove: lastMove,
      gen: gen,
      cache: cache.size,
      fresh: fresh,
      blobs: Object.keys(blobP).length,
      queue: recolorQ.length,
      busy: busy,
      look: { hair: look.hair, top: look.top, skirt: look.skirt, skin: look.skin, acc: Object.assign({}, look.acc) },
      perf: { worst: perfWorst, over32: perfOver, n: perfN },
      warm: !!(upcoming && moveReady(upcoming)),
      history: history.slice(),
      bag: bag.slice(0, 6),
      label: justLabel
    };
  }
  function resetPerf() { perfWorst = 0; perfOver = 0; perfN = 0; perfPrev = 0; }
  function frameCanvas(id) { return canvasFor(id || currentId()); }

  function boot() {
    setStatus("Zoe zieht ihre Tanzschuhe an \u2026", 0.04);
    fetch(assetUrl("girl-a.json"))
      .then(function (r) { if (!r.ok) throw new Error("json"); return r.json(); })
      .then(function (m) {
        manifest = m;
        prepRef();
        const accKeys = Object.keys(m.accessories);
        return Promise.all(accKeys.map(loadAcc));
      })
      .then(function () {
        const ids = idleIds();
        ids.forEach(function (id) { enqueueBlob(id, true); });
        let done = 0;
        return Promise.all(ids.map(function (id) {
          return blobP[id].then(function () {
            done++;
            setStatus("Zoe zieht ihre Tanzschuhe an \u2026", 0.08 + 0.45 * (done / ids.length));
          });
        })).then(function () { return ids; });
      })
      .then(function (ids) {
        setStatus("Farben werden gemischt \u2026", 0.6);
        queueRecolor(ids);
        return whenFresh(ids);
      })
      .then(function () {
        ready = true;
        enterIdle();
        buildBag();
        upcoming = takeNext();
        preloadAhead();
        setStatus("Los geht's!", 1);
        hideLoad();
        const all = Object.keys(manifest.frames);
        all.forEach(function (id) { if (!blobP[id]) enqueueBlob(id, false); });
      })
      .catch(function () {
        showError("Die T\u00e4nzerin konnte nicht geladen werden.");
      });
  }

  function perfLoop(t) {
    if (perfPrev) {
      const d = t - perfPrev;
      perfN++;
      if (d > perfWorst) perfWorst = d;
      if (d > 34) perfOver++;
    }
    perfPrev = t;
    requestAnimationFrame(perfLoop);
  }
  requestAnimationFrame(perfLoop);

  window.GirlA = {
    HAIR: HAIR,
    CLOTH: CLOTH,
    SKIN: SKIN,
    get look() { return look; },
    get ready() { return ready; },
    tick: tick,
    draw: draw,
    hit: hit,
    setLook: setLook,
    randomize: randomize,
    requestMove: requestMove,
    seek: seek,
    release: release,
    badge: badge,
    stats: stats,
    resetPerf: resetPerf,
    frameCanvas: frameCanvas,
    currentFrame: currentId,
    fresh: function (id) { return isFresh(id || currentId()); },
    simulate: simulate
  };
  boot();
})();
