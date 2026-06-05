/* ============================================================
   Nekozoku Shōgundō — inline glossary popups
   ------------------------------------------------------------
   Drop into any page:   <script src="glossary-popup.js" defer></script>
   Reads the SAME glossary.json the Lexicon page uses (single
   source of truth). Tag a term in the prose like:

       <span class="gloss">turn</span>
       <span class="gloss" data-term="rip-gate">Rip-Gate</span>

   If data-term is omitted, the visible text is slugified and
   matched against the lexicon (so "turn" -> "turn", "Fold-Gate"
   -> "fold-gate"). Convention: tag FIRST USE per page only.
   ============================================================ */
(function(){
  "use strict";

  var JSON_URL = "glossary.json";   // same-origin; sits beside the page
  var GLOSSARY_PAGE = "glossary.html";
  var MAP = null;                   // slug -> entry
  var pending = [];                 // spans found before data arrives
  var isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
  var tip = null, tipFor = null;

  function slugify(s){ return (s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }

  /* ---- styles (palette matches the site tokens) ---- */
  function injectCSS(){
    var css = [
      ".gloss{ border-bottom:1px dotted rgba(200,171,106,.55); cursor:help; color:inherit; text-decoration:none; }",
      ".gloss:hover,.gloss:focus{ color:#c8ab6a; border-bottom-color:#c8ab6a; outline:none; }",
      ".gloss[data-unknown='1']{ border-bottom-style:none; cursor:inherit; }",
      ".gloss-tip{ position:absolute; z-index:9999; max-width:320px; background:#0d0d1a;",
      "  border:1px solid rgba(200,171,106,.30); box-shadow:0 10px 34px rgba(0,0,0,.6);",
      "  padding:13px 15px 14px; font-family:'EB Garamond',Georgia,serif; color:#dfd5c2;",
      "  font-size:15px; line-height:1.55; opacity:0; transform:translateY(4px);",
      "  transition:opacity .14s, transform .14s; pointer-events:none; }",
      ".gloss-tip.show{ opacity:1; transform:translateY(0); pointer-events:auto; }",
      ".gloss-tip .gt-term{ font-family:'Cinzel',serif; font-size:13px; letter-spacing:.05em; color:#c8ab6a; }",
      ".gloss-tip .gt-lit{ display:block; font-style:italic; color:#8955be; opacity:.9; font-size:13px; margin-top:2px; }",
      ".gloss-tip .gt-def{ margin-top:7px; }",
      ".gloss-tip .gt-more{ display:inline-block; margin-top:9px; font-family:'Cinzel',serif; font-size:9px;",
      "  letter-spacing:.3em; text-transform:uppercase; color:#7a6535; text-decoration:none; }",
      ".gloss-tip .gt-more:hover{ color:#c8ab6a; }"
    ].join("\n");
    var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  }

  function ensureTip(){
    if(tip) return tip;
    tip = document.createElement("div");
    tip.className = "gloss-tip";
    tip.setAttribute("role","tooltip");
    document.body.appendChild(tip);
    return tip;
  }

  function fill(entry){
    var t = ensureTip();
    t.innerHTML =
      '<span class="gt-term">'+entry.term+'</span>'
      + (entry.lit ? '<span class="gt-lit">'+entry.lit+'</span>' : '')
      + '<div class="gt-def">'+entry.def+'</div>'
      + '<a class="gt-more" href="'+GLOSSARY_PAGE+'#'+entry.slug+'">Full entry &rsaquo;</a>';
  }

  function place(span){
    var t = ensureTip();
    var r = span.getBoundingClientRect();
    var sx = window.pageXOffset, sy = window.pageYOffset;
    t.style.left = "0px"; t.style.top = "0px";   // reset to measure
    var tw = t.offsetWidth, th = t.offsetHeight;
    var left = sx + r.left + (r.width/2) - (tw/2);
    left = Math.max(sx+8, Math.min(left, sx + document.documentElement.clientWidth - tw - 8));
    var top = sy + r.top - th - 9;               // prefer above
    if(r.top - th - 9 < 0){ top = sy + r.bottom + 9; } // flip below if no room
    t.style.left = left+"px"; t.style.top = top+"px";
  }

  function show(span){
    var entry = span.__entry; if(!entry) return;
    tipFor = span; fill(entry); place(span);
    var t = ensureTip(); requestAnimationFrame(function(){ t.classList.add("show"); });
  }
  function hide(){ if(tip){ tip.classList.remove("show"); } tipFor = null; }

  function wire(span){
    var entry = span.__entry;
    if(!entry){ span.setAttribute("data-unknown","1"); return; }
    span.setAttribute("tabindex","0");
    span.setAttribute("aria-label", entry.term + ": " + entry.def);
    if(isTouch){
      span.addEventListener("click", function(e){
        e.preventDefault();
        if(tipFor===span){ hide(); } else { show(span); }
      });
    } else {
      span.addEventListener("mouseenter", function(){ show(span); });
      span.addEventListener("mouseleave", hide);
      span.addEventListener("focus", function(){ show(span); });
      span.addEventListener("blur", hide);
    }
  }

  function resolve(span){
    var slug = span.getAttribute("data-term") || slugify(span.textContent);
    span.__entry = MAP[slug] || null;
    wire(span);
  }

  function scanAll(){
    var spans = document.querySelectorAll(".gloss");
    Array.prototype.forEach.call(spans, function(s){
      if(s.__seen) return; s.__seen = true;
      if(MAP){ resolve(s); } else { pending.push(s); }
    });
  }

  // dismiss on outside tap / scroll / escape
  document.addEventListener("click", function(e){
    if(!isTouch) return;
    if(tipFor && e.target!==tipFor && !tipFor.contains(e.target) && tip && !tip.contains(e.target)) hide();
  });
  window.addEventListener("scroll", function(){ if(tipFor) hide(); }, {passive:true});
  document.addEventListener("keydown", function(e){ if(e.key==="Escape") hide(); });

  function init(){
    injectCSS();
    scanAll();
    fetch(JSON_URL).then(function(r){ return r.json(); }).then(function(d){
      MAP = {};
      d.terms.forEach(function(t){ MAP[t.slug] = t; });
      pending.forEach(resolve); pending = [];
      scanAll(); // catch any added late
    }).catch(function(){ /* leave terms as plain text on failure */ });
  }

  if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded", init); }
  else { init(); }
})();
