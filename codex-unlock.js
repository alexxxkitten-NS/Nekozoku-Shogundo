/* ============================================================
   Nekozoku Shōgundō — Codex unlock engine
   ------------------------------------------------------------
   Drop into a chapter page:
       <script src="codex-unlock.js" defer></script>

   Reading unlocks Codex entries at first appearance. Triggers,
   in order of how little work they take:

   1. EXISTING character links — any .char-link already in the
      prose is treated as a character trigger automatically.
      Resolution: data-codex attr, else the name passed to
      openCharCard(), else the visible text, slugified.

   2. Explicit markers — add data-unlock to anything (weapons,
      places, armor) at its first mention:
         <span class="gloss" data-term="yoganto"
               data-unlock="yoganto">Yōgantō</span>
      (data-term drives the glossary popup; data-unlock drives
      the codex unlock — one span can do both.)

   3. Lexicon terms — any .gloss element also records the term
      as "discovered" (data-term, else slug of its text).

   State persists in localStorage on the reader's device.
   Window API: NSCodex.{isEntry,isTerm,unlockEntry,unlockTerm,
   revealAll,reset,getState,onChange}.
   ============================================================ */
(function(){
  "use strict";

  var KEY = "ns_codex_v1";
  var REVEAL_KEY = "ns_codex_revealall";
  var CODEX_URL = "codex.json", GLOSS_URL = "glossary.json";

  var ENTRY_BY = {};   // id/alias -> {id, name, type}
  var TERM_BY  = {};   // slug -> {term}
  var listeners = [];
  var loaded = false, pendingScan = false;

  function slugify(s){ return (s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }

  /* ---------- state ---------- */
  function load(){
    try { var s = JSON.parse(localStorage.getItem(KEY)); if(s&&s.entries&&s.terms) return s; } catch(e){}
    return { entries:[], terms:[] };
  }
  function save(s){ try{ localStorage.setItem(KEY, JSON.stringify(s)); }catch(e){} }
  var state = load();
  function emit(kind, payload){ listeners.forEach(function(f){ try{f(kind,payload,state);}catch(e){} }); }

  /* ---------- public API ---------- */
  var API = {
    isEntry:  function(id){ return state.entries.indexOf(id) > -1; },
    isTerm:   function(slug){ return state.terms.indexOf(slug) > -1; },
    getState: function(){ return { entries: state.entries.slice(), terms: state.terms.slice() }; },
    onChange: function(fn){ if(typeof fn==="function") listeners.push(fn); },
    unlockEntry: function(id, opts){
      if(!id || state.entries.indexOf(id) > -1) return false;
      state.entries.push(id); save(state);
      var meta = ENTRY_BY[id];
      if(!(opts&&opts.silent)) toast((meta?meta.name:id), "codex entry");
      emit("entry", id); return true;
    },
    unlockTerm: function(slug, opts){
      if(!slug || state.terms.indexOf(slug) > -1) return false;
      state.terms.push(slug); save(state);
      var meta = TERM_BY[slug];
      if(!(opts&&opts.silent)) toast((meta?meta.term:slug), "word");
      emit("term", slug); return true;
    },
    revealAll: function(on){ try{ localStorage.setItem(REVEAL_KEY, on?"1":"0"); }catch(e){} emit("reveal", !!on); },
    isRevealAll: function(){ try{ return localStorage.getItem(REVEAL_KEY)==="1"; }catch(e){ return false; } },
    reset: function(){ state = {entries:[],terms:[]}; save(state); try{localStorage.removeItem(REVEAL_KEY);}catch(e){} emit("reset", null); }
  };
  window.NSCodex = API;

  /* ---------- toast ---------- */
  var toastWrap = null, toastCSSInjected = false;
  function injectToastCSS(){
    if(toastCSSInjected) return; toastCSSInjected = true;
    var css = [
      "#ns-toast-wrap{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);z-index:9998;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;}",
      ".ns-toast{background:#0d0d1a;border:1px solid rgba(200,171,106,.35);box-shadow:0 8px 30px rgba(0,0,0,.55);padding:10px 18px;font-family:'EB Garamond',Georgia,serif;color:#dfd5c2;font-size:14px;opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s;border-left:2px solid #c8ab6a;}",
      ".ns-toast.show{opacity:1;transform:translateY(0);}",
      ".ns-toast .k{font-family:'Cinzel',serif;font-size:8px;letter-spacing:.32em;text-transform:uppercase;color:#7a6535;display:block;margin-bottom:1px;}",
      ".ns-toast .n{color:#c8ab6a;}"
    ].join("");
    var s=document.createElement("style"); s.textContent=css; document.head.appendChild(s);
  }
  function toast(name, kind){
    injectToastCSS();
    if(!toastWrap){ toastWrap=document.createElement("div"); toastWrap.id="ns-toast-wrap"; document.body.appendChild(toastWrap); }
    var el=document.createElement("div"); el.className="ns-toast";
    el.innerHTML='<span class="k">discovered · '+ (kind||"") +'</span><span class="n">'+ name +'</span>';
    toastWrap.appendChild(el);
    requestAnimationFrame(function(){ el.classList.add("show"); });
    setTimeout(function(){ el.classList.remove("show"); setTimeout(function(){ el.remove(); }, 320); }, 2600);
  }

  /* ---------- trigger resolution ---------- */
  function entryIdFor(elem){
    if(elem.getAttribute("data-unlock")) return elem.getAttribute("data-unlock");
    if(elem.getAttribute("data-codex"))  return elem.getAttribute("data-codex");
    // try to read the name from an inline openCharCard('Name', ...)
    var oc = elem.getAttribute("onclick") || "";
    var m = oc.match(/openCharCard\(\s*['"]([^'"]+)['"]/);
    var raw = m ? m[1] : elem.textContent;
    var slug = slugify(raw);
    return ENTRY_BY[slug] ? ENTRY_BY[slug].id : slug;
  }
  function termSlugFor(elem){
    var s = elem.getAttribute("data-term") || slugify(elem.textContent);
    return s;
  }

  /* ---------- observer ---------- */
  var io = null;
  function ensureIO(){
    if(io || !("IntersectionObserver" in window)) return io;
    io = new IntersectionObserver(function(items){
      items.forEach(function(it){
        if(!it.isIntersecting) return;
        var el = it.target;
        io.unobserve(el);
        if(el.__nsEntry) API.unlockEntry(el.__nsEntry);
        if(el.__nsTerm)  API.unlockTerm(el.__nsTerm, {silent:true}); // words discover quietly; entries get the toast
      });
    }, { threshold: 0.6 });
    return io;
  }

  function scan(){
    if(!loaded){ pendingScan = true; return; }
    var obs = ensureIO();

    // 1+2: codex entry triggers — char-links and anything with data-unlock
    document.querySelectorAll(".char-link, [data-unlock]").forEach(function(el){
      if(el.__nsSeenE) return; el.__nsSeenE = true;
      var id = entryIdFor(el);
      if(!ENTRY_BY[id]) return;              // ignore things that aren't real codex entries
      if(API.isEntry(id)) return;            // already unlocked
      el.__nsEntry = id;
      if(obs){ obs.observe(el); } else { API.unlockEntry(id, {silent:true}); }
    });

    // 3: lexicon term discovery — any .gloss
    document.querySelectorAll(".gloss").forEach(function(el){
      if(el.__nsSeenT) return; el.__nsSeenT = true;
      var slug = termSlugFor(el);
      if(!TERM_BY[slug]) return;
      if(API.isTerm(slug)) return;
      el.__nsTerm = slug;
      if(obs){ obs.observe(el); } else { API.unlockTerm(slug, {silent:true}); }
    });
  }
  // re-scan if the page injects content later
  window.NSCodex.rescan = scan;

  /* ---------- boot ---------- */
  function boot(){
    Promise.all([
      fetch(CODEX_URL).then(function(r){return r.json();}).catch(function(){return null;}),
      fetch(GLOSS_URL).then(function(r){return r.json();}).catch(function(){return null;})
    ]).then(function(res){
      var codex=res[0], gloss=res[1];
      if(codex && codex.entries){
        codex.entries.forEach(function(e){
          var meta={id:e.id,name:(e.name||e.id),type:e.type};
          ENTRY_BY[e.id]=meta;
          (e.aliases||[]).forEach(function(a){ ENTRY_BY[slugify(a)]=meta; });
          ENTRY_BY[slugify(e.name||"")] = ENTRY_BY[slugify(e.name||"")] || meta;
        });
      }
      if(gloss && gloss.terms){
        gloss.terms.forEach(function(t){ TERM_BY[t.slug]={term:t.term}; });
      }
      loaded=true;
      if(pendingScan){ pendingScan=false; }
      scan();
    });
  }

  if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded", function(){ scan(); boot(); }); }
  else { scan(); boot(); }
})();
