// ============================
// === VISÃO GERAL DO PLUGIN ===
// Este arquivo code.ts controla a lógica do plugin Figma:
// - Exporta as imagens dos frames selecionados
// - Chama o backend (API_URL) para obter análises
// - Faz o parse do texto em campos 1–8
// - Monta os cards ao lado de cada frame, com gauge/selos/labels
// ============================
// ÍNDICE RÁPIDO: CONFIG • UI • EXPORT/UPLOAD • PARSER • SEVERIDADE • CARD • POSICIONAMENTO • HELPERS

// code.ts — Plugin Figma sem optional chaining e com tipagem completa

// Exibe a UI do plugin (janela direita) com largura/altura definidas
figma.showUI(__html__, { width: 380, height: 385 });

// Endpoint do backend que processa a imagem e retorna o texto no formato 1–8
// DESENVOLVIMENTO: usar localhost para testar mudanças no prompt
// DESENVOLVIMENTO: const API_URL = "http://localhost:3000/analisar";
const API_URL = "https://api.uxday.com.br/analisar";

// ===== Extração direta do Figma (bypass Vision quando for frame real) =====
type FigmaSpec = any;

function hexFromPaint(paint: Paint): string | null {
  if (!paint || (paint as any).type !== 'SOLID') return null;
  const c = (paint as any).color;
  if (!c) return null;
  const to255 = (v:number)=> Math.round(Math.min(Math.max(v*255,0),255));
  const r = to255(c.r||0), g = to255(c.g||0), b = to255(c.b||0);
  return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

function uint8ToBase64(u8: Uint8Array): string {
  let s = ""; const chunk = 0x8000;
  for (let i=0; i<u8.length; i+=chunk) s += String.fromCharCode.apply(null, Array.prototype.slice.call(u8, i, i+chunk));
  // @ts-ignore
  return typeof btoa === "function" ? btoa(s) : ((figma as any).base64Encode ? (figma as any).base64Encode(u8) : s);
}

function collectFonts(node: SceneNode, accFamilies: Set<string>, scale: {role:string,sizePx:number,weight:string,approx:boolean}[]) {
  try {
    if (node.type === 'TEXT') {
      const t = node as TextNode;
      // --- Tipografia: tratar nós de texto com estilos mistos (ranges)
      try {
        const fnAny: any = t.fontName as any;
        const isMixedSize = typeof t.fontSize !== 'number';
        const isMixedFont = !(fnAny && typeof fnAny==='object' && 'family' in fnAny && 'style' in fnAny);
        if (isMixedSize || isMixedFont) {
          const len = t.characters ? t.characters.length : 0;
          const norm = (s: string): string => {
            const l = (s||'Regular').toLowerCase();
            if (l.includes('extrabold')) return 'ExtraBold';
            if (l.includes('semibold')) return 'SemiBold';
            if (l.includes('black')) return 'Black';
            if (l.includes('bold')) return 'Bold';
            if (l.includes('medium')) return 'Medium';
            if (l.includes('light')) return 'Light';
            if (l.includes('thin')) return 'Thin';
            if (l.includes('regular')) return 'Regular';
            return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : 'Regular';
          };
          let i = 0;
          while (i < len) {
            const fs: any = t.getRangeFontSize(i, i+1);
            const fnr: any = t.getRangeFontName(i, i+1);
            let j = i + 1;
            while (j < len) {
              const fs2: any = t.getRangeFontSize(j, j+1);
              const fn2: any = t.getRangeFontName(j, j+1);
              const same = (fs2 === fs) && (fn2 === fnr);
              if (!same) break;
              j++;
            }
            if (fs !== 'mixed' && fnr !== 'mixed' && fnr && typeof fnr==='object') {
              const fam = fnr.family;
              const weight = norm(fnr.style);
              const size = typeof fs === 'number' ? fs : 0;
              if (fam) accFamilies.add(String(fam));
              let role = 'body';
              if (size >= 28) role = 'h1';
              else if (size >= 22) role = 'h2';
              else if (size >= 18) role = 'h3';
              scale.push({ role, sizePx: Math.round(size||0), weight: String(weight||'Regular'), approx: false });
            }
            i = j;
          }
          // Já tratamos este TEXT com estilos mistos
          return;
        }
      } catch (e) {}

      const fn = t.fontName as any;
      const fam = (fn && typeof fn==='object' && !Array.isArray(fn) && 'family' in fn) ? fn.family : null;
      // normaliza weight a partir do style
      const styleStr = (fn && typeof fn==='object' && !Array.isArray(fn) && 'style' in fn) ? String(fn.style) : 'Regular';
      const weight = (() => {
        const l = styleStr.toLowerCase();
        if (l.includes('extrabold')) return 'ExtraBold';
        if (l.includes('semibold')) return 'SemiBold';
        if (l.includes('black')) return 'Black';
        if (l.includes('bold')) return 'Bold';
        if (l.includes('medium')) return 'Medium';
        if (l.includes('light')) return 'Light';
        if (l.includes('thin')) return 'Thin';
        if (l.includes('regular')) return 'Regular';
        return styleStr.charAt(0).toUpperCase() + styleStr.slice(1);
      })();

      const size = (typeof t.fontSize === 'number') ? t.fontSize : 0;
      if (fam) accFamilies.add(String(fam));
      let role = 'body';
      if (size >= 28) role = 'h1';
      else if (size >= 22) role = 'h2';
      else if (size >= 18) role = 'h3';
      scale.push({ role, sizePx: Math.round(size||0), weight: String(weight||'Regular'), approx: false });
    }
  } catch (e) {}
  if ('children' in (node as any)) {
    const ch = ((node as any).children || []) as ReadonlyArray<SceneNode>;
    for (const c of ch) collectFonts(c, accFamilies, scale);
  }
}

function getAbsXY(n: SceneNode): {x:number,y:number} {
  const m: any = (n as any).absoluteTransform;
  const tx = Array.isArray(m) && m.length>0 ? (m[0][2]||0) : ((n as any).x||0);
  const ty = Array.isArray(m) && m.length>1 ? (m[1][2]||0) : ((n as any).y||0);
  return { x: tx, y: ty };
}

function boundsRelativeTo(frame: FrameNode | ComponentNode | InstanceNode | SectionNode, n: SceneNode) {
  const fp = getAbsXY(frame);
  const np = getAbsXY(n);
  const w = (n as any).width || 0;
  const h = (n as any).height || 0;
  const x = np.x - fp.x;
  const y = np.y - fp.y;
  const W = (frame as any).width || 0;
  const H = (frame as any).height || 0;
  const pct = (v:number, total:number)=> total>0 ? Math.max(0, Math.min(1, v/total)) : 0;
  return {
    bounds: { xPx: Math.round(x), yPx: Math.round(y), widthPx: Math.round(w), heightPx: Math.round(h), approx: true },
    boundsPct: { x0: pct(x, W), y0: pct(y, H), x1: pct(x + w, W), y1: pct(y + h, H) },
    centerPct: { cx: pct(x + w/2, W), cy: pct(y + h/2, H) },
  };
}

function detectType(n: SceneNode): string {
  const name = String((n as any).name || '').toLowerCase();
  if (name.includes('button') || name.includes('btn')) return 'button';
  if (n.type === 'TEXT') return 'text';
  if (n.type === 'ELLIPSE' || n.type === 'RECTANGLE') return 'section';
  if (n.type === 'VECTOR') return 'icon';
  if (n.type === 'LINE' || n.type === 'POLYGON' || n.type === 'STAR') return 'other';
  if (n.type === 'COMPONENT' || n.type === 'INSTANCE') return 'section';
  if (n.type === 'FRAME') return 'section';
  return 'other';
}

function detectMedia(n: SceneNode): any {
  let mediaType = 'none';
  let background = 'transparent';
  let isPhotograph = false;
  try {
    if ('fills' in (n as any)) {
      const fills = ((n as any).fills as Paint[]);
      if (Array.isArray(fills) && fills.length) {
        const hasImage = fills.some((f:any)=> (f && f.type === 'IMAGE'));
        if (hasImage) { mediaType = 'image'; background = 'photo'; isPhotograph = true; }
        else { background = 'solid'; }
      }
    }
  } catch (e) {}
  if ((n as any).type === 'VECTOR') mediaType = 'icon';
  return { mediaType, style: mediaType==='icon' ? 'outline' : (isPhotograph ? 'photographic' : 'glyph'), maskShape: 'none', background, textureScore: 0.5, edgeSimplicityScore: mediaType==='icon'?0.8:0.3, colorCountApprox: mediaType==='icon'?3:16, isPhotograph, confidence: 0.6 };
}

function extractPalette(frame: any): any {
  const bg: string[] = [];
  const txt: string[] = [];
  const prim: string[] = [];
  try {
    if ('fills' in frame) {
      const fills = (frame.fills as Paint[]);
      if (Array.isArray(fills)) {
        for (const p of fills) { const h = hexFromPaint(p); if (h && bg.indexOf(h)<0) bg.push(h); }
      }
    }
    const nodes = (frame as any).findAll ? (frame as any).findAll(()=>true) as SceneNode[] : [];
    for (const n of nodes) {
      if ((n as any).type === 'TEXT' && 'fills' in (n as any)) {
        const fills = ((n as any).fills as Paint[]); 
        if (Array.isArray(fills)) { for (const p of fills) { const h = hexFromPaint(p); if (h && txt.indexOf(h)<0) txt.push(h); } }
      }
      if (((n as any).type === 'RECTANGLE' || (n as any).type === 'ELLIPSE') && 'fills' in (n as any)) {
        const fills = ((n as any).fills as Paint[]);
        if (Array.isArray(fills)) { for (const p of fills) { const h = hexFromPaint(p); if (h && prim.indexOf(h)<0) prim.push(h); } }
      }
      if (bg.length>2 && txt.length>2 && prim.length>1) break;
    }
  } catch (e) {}
  return { background: bg.slice(0,2), text: txt.slice(0,2), primary: prim.slice(0,1), secondary: [], accent: [], other: [], approx: true };
}

function textStyleOf(t: TextNode){ 
  try {
    const fn:any = (t as any).fontName;
    const fam = (fn && typeof fn==='object' && !Array.isArray(fn) && 'family' in fn) ? fn.family : null;
    const weight = (fn && typeof fn==='object' && !Array.isArray(fn) && 'style' in fn) ? String(fn.style) : 'Regular';
      // (removido weight antigo)

    const sizePx = typeof (t as any).fontSize === 'number' ? Math.round((t as any).fontSize) : null;
    const lhObj:any = (t as any).lineHeight;
    const lh = (lhObj && typeof lhObj==='object' && lhObj.unit==='PIXELS') ? Math.round(Number(lhObj.value||0)) : null;
    const lsObj:any = (t as any).letterSpacing;
    const ls = (lsObj && typeof lsObj==='object') ? Number(lsObj.value||0) : null;
    const align = String((t as any).textAlignHorizontal || '').toLowerCase();
    const decoration = String((t as any).textDecoration || 'NONE').toLowerCase();
    return { family:fam, weight, sizePx, lineHeightPx: lh, letterSpacing: ls, align, decoration };
  } catch(e) { return { family:null, weight:null, sizePx:null, lineHeightPx:null, letterSpacing:null, align:'', decoration:'' }; }
}

async function buildFigmaSpecFromFrame(frame: FrameNode | InstanceNode | ComponentNode | SectionNode, nomeLayoutOverride?: string): Promise<FigmaSpec> {
  const W = (frame as any).width || 0;
  const H = (frame as any).height || 0;
  const accFamilies = new Set<string>();
  const scale: any[] = [];
  collectFonts(frame as any, accFamilies, scale);
  // --- Tipografia: agrega contagens e separa bruto vs. agregado
    // --- Tipografia: agrega contagens e separa bruto vs. agregado (sem spread para compatibilidade)
  const __typoMap = new Map<string, any>();
  for (const t of scale) {
    const key = `${t.role}|${t.sizePx}|${t.weight}|${t.approx}`;
    let cur = __typoMap.get(key);
    if (!cur) {
      cur = {
        role: t.role,
        sizePx: t.sizePx,
        weight: t.weight,
        approx: t.approx,
        quantidade: 0,
        approxCount: 0,
        exactCount: 0
      };
    }
    cur.quantidade++;
    if (t.approx) cur.approxCount++; else cur.exactCount++;
    __typoMap.set(key, cur);
  }
  const scaleAgg = Array.from(__typoMap.values());
let headers: string[] = [];
  try {
    const texts = (frame as any).findAll((n: SceneNode)=>n.type==='TEXT') as TextNode[];
    const sorted = texts.map(t=>{ const fs = (typeof (t as any).fontSize === 'number') ? (t as any).fontSize : 0; return { t, sz: fs }; }).sort((a,b)=>b.sz-a.sz).slice(0,5);
    headers = sorted.map(x=> String(((x.t as any).characters || '')).slice(0,120)).filter(Boolean);
  } catch (e) {}

  const iconMap = new Map<string, number>();
  try {
    const all = (frame as any).findAll(()=>true) as SceneNode[];
    for (const n of all) {
      const name = String((n as any).name||'').toLowerCase();
      if ((n as any).type==='VECTOR' || name.indexOf('icon')>=0) {
        const key = name || 'icon';
        iconMap.set(key, (iconMap.get(key)||0)+1);
      }
    }
  } catch (e) {}
  const iconography = Array.from(iconMap.entries()).slice(0,12).map(function (p){ return { nameOrMeaning: p[0], style: 'outline', approxSizePx: 20, occurrences: p[1] }; });

  const comps: any[] = [];
  try {
    const all = (frame as any).findAll(()=>true) as SceneNode[];
    let ro = 0;
    for (const n of all) {
      if (n === (frame as any)) continue;
      const w = (n as any).width || 0; const h = (n as any).height || 0;
      if (w < 6 || h < 6) continue;
      const typ = detectType(n);
      const label = ((n as any).type==='TEXT') ? ((n as any).characters || 'sem rotulo') : (String((n as any).name||'sem rotulo'));
      const geo = boundsRelativeTo(frame as any, n);
      // --- Auto Layout do pai: padding e itemSpacing (se houver)
      let __parentPad = { paddingTopPx: null as any, paddingRightPx: null as any, paddingBottomPx: null as any, paddingLeftPx: null as any,
                          itemSpacingPx: null as any, layoutMode: null as any, primaryAxisAlignItems: null as any, counterAxisAlignItems: null as any };
      try {
        const __p: any = (n as any).parent;
        if (__p && ('layoutMode' in __p)) {
          __parentPad.paddingTopPx = (typeof __p.paddingTop === 'number') ? Math.round(__p.paddingTop) : null;
          __parentPad.paddingRightPx = (typeof __p.paddingRight === 'number') ? Math.round(__p.paddingRight) : null;
          __parentPad.paddingBottomPx = (typeof __p.paddingBottom === 'number') ? Math.round(__p.paddingBottom) : null;
          __parentPad.paddingLeftPx = (typeof __p.paddingLeft === 'number') ? Math.round(__p.paddingLeft) : null;
          __parentPad.itemSpacingPx = (typeof __p.itemSpacing === 'number') ? Math.round(__p.itemSpacing) : null;
          __parentPad.layoutMode = String(__p.layoutMode || '');
          __parentPad.primaryAxisAlignItems = String(__p.primaryAxisAlignItems || '');
          __parentPad.counterAxisAlignItems = String(__p.counterAxisAlignItems || '');
        }
      } catch (e) {}

      // Não extrair imagens para benchmark (usar só dados estruturados)
      const media = detectMedia(n);

      comps.push({
        type: typ,
        label: String(label||'sem rotulo'),
        placeholderOrValue: ((n as any).type==='TEXT') ? (((n as any).characters || '—')) : '—',
        state: ['default'],
        count: 1,
        boundsHint: '',
        colorRefs: { bg: '', fg: '', border: '' },
        sizeHints: { fontPx: ((n as any).type==='TEXT') ? Math.round(((n as any).fontSize as any)||0) : null, iconPx: null },
        media: detectMedia(n),
        textStyle: ((n as any).type==='TEXT') ? textStyleOf(n as any) : null,
        bounds: geo.bounds,
        boundsPct: geo.boundsPct,
        centerPct: geo.centerPct,
        anchorHint: 'center',
        readingOrder: ro++,
        spacing: { marginTopPx: Math.round(geo.bounds.yPx), marginBottomPx: Math.round((H - (geo.bounds.yPx + geo.bounds.heightPx))), marginLeftPx: Math.round(geo.bounds.xPx), marginRightPx: Math.round((W - (geo.bounds.xPx + geo.bounds.widthPx))), distanceToPrevComponentPx: null, distanceToNextComponentPx: null, approx: false , parent: __parentPad }
      });
      if (comps.length >= 300) break;
    }
  } catch (e) {}
  // --- Calcula distância vertical entre componentes adjacentes no reading order
  try {
    const byRO = comps.slice().sort((a,b)=> (a.readingOrder||0) - (b.readingOrder||0));
    for (let i=0;i<byRO.length;i++){
      const cur = byRO[i], prev = byRO[i-1], next = byRO[i+1];
      if (prev) cur.spacing.distanceToPrevComponentPx = Math.max(0, Math.round(cur.bounds.yPx - (prev.bounds.yPx + prev.bounds.heightPx)));
      if (next) cur.spacing.distanceToNextComponentPx = Math.max(0, Math.round(next.bounds.yPx - (cur.bounds.yPx + cur.bounds.heightPx)));
    }
  } catch (e) {}


  let device = 'indefinido';
  if (W >= 1200) device = 'desktop';
  else if (W >= 600) device = 'tablet';
  else if (W > 0) device = 'mobile';

  // --- Canvas: padding do frame raiz (Auto Layout) + gapX/gapY
  let __canvasPad = {
    paddingTopPx: null as any,
    paddingRightPx: null as any,
    paddingBottomPx: null as any,
    paddingLeftPx: null as any,
    gapX: null as any,
    gapY: null as any,
    itemSpacingPx: null as any,
    layoutMode: null as any,
    primaryAxisAlignItems: null as any,
    counterAxisAlignItems: null as any
  };
  try {
    const __f: any = (frame as any);
    if (__f && ('layoutMode' in __f)) {
      __canvasPad.paddingTopPx = (typeof __f.paddingTop === 'number') ? Math.round(__f.paddingTop) : null;
      __canvasPad.paddingRightPx = (typeof __f.paddingRight === 'number') ? Math.round(__f.paddingRight) : null;
      __canvasPad.paddingBottomPx = (typeof __f.paddingBottom === 'number') ? Math.round(__f.paddingBottom) : null;
      __canvasPad.paddingLeftPx = (typeof __f.paddingLeft === 'number') ? Math.round(__f.paddingLeft) : null;
      __canvasPad.itemSpacingPx = (typeof __f.itemSpacing === 'number') ? Math.round(__f.itemSpacing) : null;
      __canvasPad.layoutMode = String(__f.layoutMode || '');
      if (__canvasPad.layoutMode === 'HORIZONTAL') {
        __canvasPad.gapX = __canvasPad.itemSpacingPx;
        __canvasPad.gapY = null;
      } else if (__canvasPad.layoutMode === 'VERTICAL') {
        __canvasPad.gapY = __canvasPad.itemSpacingPx;
        __canvasPad.gapX = null;
      }
      __canvasPad.primaryAxisAlignItems = String(__f.primaryAxisAlignItems || '');
      __canvasPad.counterAxisAlignItems = String(__f.counterAxisAlignItems || '');
    }
  } catch (e) {}


  return {
    layoutName: String(nomeLayoutOverride || (frame as any).name || 'Untitled').slice(0,80),
    canvas: { widthPx: Math.round(W), heightPx: Math.round(H), approx: false, device, deviceHeuristic: "desktop >= 1200px, tablet 600–1199px, mobile < 600px" , padding: __canvasPad },
    meta: { contextEcho: null },
    palette: extractPalette(frame),
    contrastPairs: [],
    typography: { families: Array.from(accFamilies), scaleRaw: scale, scale: scaleAgg, totals: { textNodes: (frame as any).findAll((n: SceneNode)=>n.type==='TEXT').length, uniqueCombos: scaleAgg.length } },
    iconography,
    mainText: headers,
    components: comps
  };
}

// --- Envia contagem inicial ao abrir o plugin
function contarLayoutsSelecionados() {
  // Se quiser contar só frames/instances, use este filtro:
  const selecionados = figma.currentPage.selection.filter(n =>
    n.type === "FRAME" ||
    n.type === "INSTANCE" ||
    n.type === "COMPONENT" ||
    n.type === "COMPONENT_SET" ||
    n.type === "SECTION"
  );
  return selecionados.length;
}

// Anti-spam (debounce) para eventos de seleção
let __selTimer: number | undefined;
function notificarSelecao() {
  const count = contarLayoutsSelecionados();
  figma.ui.postMessage({ type: "selectionCount", count });
}

// Sempre que a seleção mudar, atualiza a UI
figma.on("selectionchange", () => {
  if (__selTimer) clearTimeout(__selTimer as unknown as number);
  __selTimer = setTimeout(notificarSelecao, 80) as unknown as number;
});

// Logo que abrir, manda a contagem atual
figma.on("currentpagechange", notificarSelecao);
figma.on("run", notificarSelecao);
notificarSelecao();

// Função para criar cards de benchmark no Figma
async function createBenchmarkCards(results: any[], node: SceneNode) {
  try {
    // Carregar fontes
    await Promise.all([
      figma.loadFontAsync({ family: "Inter", style: "Regular" }),
      figma.loadFontAsync({ family: "Inter", style: "Bold" })
    ]);

    const OFFSET_X = 80;
    let currentY = node.y;
    
    // Filtrar apenas resultados bem-sucedidos e ordenar por score
    const successfulResults = results.filter(r => !r.error).sort((a, b) => b.evaluation.score - a.evaluation.score);
    
    for (let i = 0; i < successfulResults.length; i++) {
      const result = successfulResults[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      
      // Criar card
      const card = figma.createFrame();
      card.name = `[Bench AI] ${medal} ${result.model}`;
      card.layoutMode = "VERTICAL";
      card.primaryAxisSizingMode = "AUTO";
      card.counterAxisSizingMode = "FIXED";
      card.resize(400, card.height);
      card.itemSpacing = 12;
      card.paddingLeft = 20;
      card.paddingRight = 20;
      card.paddingTop = 20;
      card.paddingBottom = 20;
      card.cornerRadius = 12;
      card.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.9, b: 0.93 }, opacity: 1 }];
      card.strokeWeight = 1;
      card.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

      // Título
      const title = figma.createText();
      title.characters = `${medal} ${result.model}`;
      title.fontName = { family: "Inter", style: "Bold" };
      title.fontSize = 18;
      title.fills = [{ type: "SOLID", color: { r: 0.13, g: 0.13, b: 0.13 } }];
      card.appendChild(title);

      // Badges
      const badges = figma.createFrame();
      badges.layoutMode = "HORIZONTAL";
      badges.primaryAxisSizingMode = "AUTO";
      badges.counterAxisSizingMode = "AUTO";
      badges.itemSpacing = 8;
      badges.fills = [];

      // Provider badge
      const providerBadge = figma.createFrame();
      providerBadge.layoutMode = "HORIZONTAL";
      providerBadge.primaryAxisSizingMode = "AUTO";
      providerBadge.counterAxisSizingMode = "AUTO";
      providerBadge.paddingLeft = 8;
      providerBadge.paddingRight = 8;
      providerBadge.paddingTop = 4;
      providerBadge.paddingBottom = 4;
      providerBadge.cornerRadius = 4;
      providerBadge.fills = [{ type: "SOLID", color: { r: 0.16, g: 0.53, b: 0.84 } }];

      const providerText = figma.createText();
      providerText.characters = result.provider;
      providerText.fontName = { family: "Inter", style: "Regular" };
      providerText.fontSize = 12;
      providerText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      providerBadge.appendChild(providerText);
      badges.appendChild(providerBadge);

      // Score badge
      const scoreBadge = figma.createFrame();
      scoreBadge.layoutMode = "HORIZONTAL";
      scoreBadge.primaryAxisSizingMode = "AUTO";
      scoreBadge.counterAxisSizingMode = "AUTO";
      scoreBadge.paddingLeft = 8;
      scoreBadge.paddingRight = 8;
      scoreBadge.paddingTop = 4;
      scoreBadge.paddingBottom = 4;
      scoreBadge.cornerRadius = 4;
      scoreBadge.fills = [{ type: "SOLID", color: { r: 0.16, g: 0.69, b: 0.36 } }];

      const scoreText = figma.createText();
      scoreText.characters = `${result.evaluation.score}/100`;
      scoreText.fontName = { family: "Inter", style: "Bold" };
      scoreText.fontSize = 12;
      scoreText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      scoreBadge.appendChild(scoreText);
      badges.appendChild(scoreBadge);

      card.appendChild(badges);

      // Métricas
      const metrics = figma.createFrame();
      metrics.layoutMode = "HORIZONTAL";
      metrics.primaryAxisSizingMode = "FIXED";
      metrics.counterAxisSizingMode = "AUTO";
      metrics.itemSpacing = 16;
      metrics.fills = [];

      // Latência
      const latencyFrame = figma.createFrame();
      latencyFrame.layoutMode = "VERTICAL";
      latencyFrame.primaryAxisSizingMode = "AUTO";
      latencyFrame.counterAxisSizingMode = "AUTO";
      latencyFrame.fills = [];

      const latencyLabel = figma.createText();
      latencyLabel.characters = "⚡ Latência";
      latencyLabel.fontName = { family: "Inter", style: "Regular" };
      latencyLabel.fontSize = 12;
      latencyLabel.fills = [{ type: "SOLID", color: { r: 0.42, g: 0.45, b: 0.5 } }];
      latencyFrame.appendChild(latencyLabel);

      const latencyValue = figma.createText();
      latencyValue.characters = `${result.latency}ms`;
      latencyValue.fontName = { family: "Inter", style: "Bold" };
      latencyValue.fontSize = 14;
      latencyValue.fills = [{ type: "SOLID", color: { r: 0.13, g: 0.13, b: 0.13 } }];
      latencyFrame.appendChild(latencyValue);

      metrics.appendChild(latencyFrame);

      // Palavras
      const wordsFrame = figma.createFrame();
      wordsFrame.layoutMode = "VERTICAL";
      wordsFrame.primaryAxisSizingMode = "AUTO";
      wordsFrame.counterAxisSizingMode = "AUTO";
      wordsFrame.fills = [];

      const wordsLabel = figma.createText();
      wordsLabel.characters = "📝 Palavras";
      wordsLabel.fontName = { family: "Inter", style: "Regular" };
      wordsLabel.fontSize = 12;
      wordsLabel.fills = [{ type: "SOLID", color: { r: 0.42, g: 0.45, b: 0.5 } }];
      wordsFrame.appendChild(wordsLabel);

      const wordsValue = figma.createText();
      wordsValue.characters = `${result.evaluation.wordCount}`;
      wordsValue.fontName = { family: "Inter", style: "Bold" };
      wordsValue.fontSize = 14;
      wordsValue.fills = [{ type: "SOLID", color: { r: 0.13, g: 0.13, b: 0.13 } }];
      wordsFrame.appendChild(wordsValue);

      metrics.appendChild(wordsFrame);

      card.appendChild(metrics);

      // Resposta (truncada)
      const responseFrame = figma.createFrame();
      responseFrame.layoutMode = "VERTICAL";
      responseFrame.primaryAxisSizingMode = "AUTO";
      responseFrame.counterAxisSizingMode = "AUTO";
      responseFrame.fills = [];

      const responseLabel = figma.createText();
      responseLabel.characters = "📄 Análise:";
      responseLabel.fontName = { family: "Inter", style: "Bold" };
      responseLabel.fontSize = 14;
      responseLabel.fills = [{ type: "SOLID", color: { r: 0.13, g: 0.13, b: 0.13 } }];
      responseFrame.appendChild(responseLabel);

      const responseText = figma.createText();
      responseText.characters = result.response.substring(0, 200) + (result.response.length > 200 ? "..." : "");
      responseText.fontName = { family: "Inter", style: "Regular" };
      responseText.fontSize = 12;
      responseText.fills = [{ type: "SOLID", color: { r: 0.42, g: 0.45, b: 0.5 } }];
      responseText.textAutoResize = "HEIGHT";
      responseText.resize(360, responseText.height);
      responseFrame.appendChild(responseText);

      card.appendChild(responseFrame);

      // Posicionar card
      card.x = node.x + node.width + OFFSET_X;
      card.y = currentY;

      figma.currentPage.appendChild(card);
      currentY += card.height + 20;
    }

    figma.notify(`✅ ${successfulResults.length} cards de benchmark criados!`, { timeout: 2000 });
  } catch (error) {
    console.error("Erro ao criar cards de benchmark:", error);
    figma.notify("❌ Erro ao criar cards de benchmark", { timeout: 2000 });
  }
}

// removePrefix: limpa rótulos redundantes ("Descrição:", "Justificativa:", "Referências:")
function removePrefix(text: string) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/^Descrição:\s*/i, "")
    .replace(/^Justificativa:\s*/i, "")
    .replace(/^Refer(ê|e)ncias?:\s*/i, "")
    .trim();
}

// Mapeia severidades (alto/médio/baixo/positiva) para cores, chips e gauge
// ====== SEVERIDADE: cores, labels e gauges ======
const SEVERITY_COLORS = {
  baixo: "#01CE34",
  medio: "#FECA2A",
  alto:  "#F50000",
  positivo: "#23D2EF",
};

// /SVG do gauge (cole exatamente como recebeu)
const gaugeBaixo    = `<svg width="240" height="122" viewBox="0 0 240 122" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M120 9.5C133.198 9.5 146.267 12.0998 158.46 17.1504C170.653 22.201 181.732 29.6033 191.064 38.9355C200.397 48.2678 207.799 59.347 212.85 71.54C217.644 83.1139 220.229 95.477 220.479 107.99C220.507 109.381 219.378 110.5 218 110.5H192C190.616 110.5 189.511 109.38 189.472 108.015C189.23 99.5647 187.449 91.2235 184.21 83.4033C180.717 74.9712 175.597 67.3101 169.144 60.8564C162.69 54.4028 155.029 49.2827 146.597 45.79C138.165 42.2973 129.127 40.5 120 40.5C110.873 40.5 101.835 42.2973 93.4033 45.79C84.9712 49.2827 77.3101 54.4028 70.8564 60.8564C64.4028 67.3101 59.2827 74.9712 55.79 83.4033C52.5508 91.2235 50.7698 99.5647 50.5283 108.015C50.4892 109.38 49.3842 110.5 48 110.5H22C20.622 110.5 19.4928 109.381 19.5205 107.99C19.7708 95.477 22.3563 83.1139 27.1504 71.54C32.201 59.347 39.6033 48.2677 48.9355 38.9355C58.2677 29.6033 69.3469 22.201 81.54 17.1504C93.7333 12.0998 106.802 9.5 120 9.5Z" fill="#01CE34" fill-opacity="0.4" stroke="#03B22E"/>
<path d="M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3488 33.387 60.0182C41.6568 45.6876 53.3449 33.6467 67.3891 24.9583C68.7981 24.0867 70.6358 24.5814 71.4648 26.0159L83.4735 46.7955C84.3026 48.23 83.8077 50.0596 82.41 50.9493C72.9182 56.9914 65.0095 65.2418 59.3709 75.0127C53.7323 84.7837 50.5463 95.7594 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z" fill="#01CE34"/>
<path d="M126.711 107.118C130.368 103.429 130.387 97.518 126.754 93.9157C123.121 90.3134 117.21 90.3839 113.553 94.0731C109.895 97.7623 109.876 103.673 113.509 107.275C117.143 110.878 123.053 110.807 126.711 107.118Z" fill="#5C5C5C"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M111.935 81.5528L97.1815 77.8427L101.019 92.5635C97.712 100.214 99.1496 109.365 105.346 115.509C113.458 123.551 126.654 123.394 134.819 115.157C142.985 106.921 143.029 93.7247 134.917 85.6824C128.72 79.5388 119.556 78.1802 111.935 81.5528ZM131.606 111.972C137.986 105.537 138.02 95.2277 131.682 88.9447C125.345 82.6616 115.036 82.7845 108.657 89.2191C102.277 95.6537 102.243 105.963 108.581 112.246C114.918 118.529 125.227 118.407 131.606 111.972Z" fill="#5C5C5C"/>
</svg>
`;
const gaugeMedio    = `<svg width="240" height="122" viewBox="0 0 240 122" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M120 9.5C133.198 9.5 146.267 12.0998 158.46 17.1504C170.653 22.201 181.732 29.6033 191.064 38.9355C200.397 48.2678 207.799 59.347 212.85 71.54C217.644 83.1139 220.229 95.477 220.479 107.99C220.507 109.381 219.378 110.5 218 110.5H192C190.616 110.5 189.511 109.38 189.472 108.015C189.23 99.5647 187.449 91.2235 184.21 83.4033C180.717 74.9712 175.597 67.3101 169.144 60.8564C162.69 54.4028 155.029 49.2827 146.597 45.79C138.165 42.2973 129.127 40.5 120 40.5C110.873 40.5 101.835 42.2973 93.4033 45.79C84.9712 49.2827 77.3101 54.4028 70.8564 60.8564C64.4028 67.3101 59.2827 74.9712 55.79 83.4033C52.5508 91.2235 50.7698 99.5647 50.5283 108.015C50.4892 109.38 49.3842 110.5 48 110.5H22C20.622 110.5 19.4928 109.381 19.5205 107.99C19.7708 95.477 22.3563 83.1139 27.1504 71.54C32.201 59.347 39.6033 48.2677 48.9355 38.9355C58.2677 29.6033 69.3469 22.201 81.54 17.1504C93.7333 12.0998 106.802 9.5 120 9.5Z" fill="#FECA2A" fill-opacity="0.4" stroke="#DDAF24"/>
<path d="M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3487 33.387 60.0181C42.1571 44.8205 54.7716 32.198 69.9637 23.4184C85.1558 14.6388 102.391 10.011 119.937 10C136.483 9.98963 152.756 14.0845 167.306 21.8969C168.766 22.6807 169.257 24.5194 168.43 25.955L156.447 46.7496C155.62 48.1852 153.788 48.6721 152.318 47.9072C142.338 42.7123 131.237 39.9929 119.956 40C107.673 40.0077 95.6091 43.2471 84.9746 49.3929C74.3402 55.5386 65.51 64.3744 59.3709 75.0127C53.7323 84.7837 50.5463 95.7593 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z" fill="#FECA2A"/>
<path d="M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3488 33.387 60.0182C41.6568 45.6876 53.3449 33.6467 67.3891 24.9583C68.7981 24.0867 70.6358 24.5814 71.4648 26.0159L83.4735 46.7955C84.3026 48.23 83.8077 50.0596 82.41 50.9493C72.9182 56.9914 65.0095 65.2418 59.3709 75.0127C53.7323 84.7837 50.5463 95.7594 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z" fill="#FECA2A"/>
<path d="M114.861 108.196C119.235 111 125.018 109.781 127.78 105.474C130.541 101.166 129.234 95.4017 124.861 92.598C120.487 89.7944 114.704 91.0134 111.942 95.3208C109.181 99.6282 110.488 105.393 114.861 108.196Z" fill="#5C5C5C"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M136.765 88.3938L137.302 73.1906L123.712 80.0261C115.538 78.3951 106.891 81.7176 102.182 89.0638C96.0171 98.6803 98.9347 111.55 108.699 117.809C118.463 124.069 131.375 121.347 137.54 111.731C142.25 104.385 141.659 95.1398 136.765 88.3938ZM111.14 114.001C118.769 118.891 128.857 116.764 133.673 109.252C138.489 101.739 136.21 91.684 128.582 86.7939C120.954 81.9039 110.865 84.0301 106.049 91.543C101.233 99.0559 103.512 109.11 111.14 114.001Z" fill="#5C5C5C"/>
</svg>
`;
const gaugeAlto     = `<svg width="240" height="122" viewBox="0 0 240 122" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M120 9.5C133.198 9.5 146.267 12.0998 158.46 17.1504C170.653 22.201 181.732 29.6033 191.064 38.9355C200.397 48.2678 207.799 59.347 212.85 71.54C217.644 83.1139 220.229 95.477 220.479 107.99C220.507 109.381 219.378 110.5 218 110.5H192C190.616 110.5 189.511 109.38 189.472 108.015C189.23 99.5647 187.449 91.2235 184.21 83.4033C180.717 74.9712 175.597 67.3101 169.144 60.8564C162.69 54.4028 155.029 49.2827 146.597 45.79C138.165 42.2973 129.127 40.5 120 40.5C110.873 40.5 101.835 42.2973 93.4033 45.79C84.9712 49.2827 77.3101 54.4028 70.8564 60.8564C64.4028 67.3101 59.2827 74.9712 55.79 83.4033C52.5508 91.2235 50.7698 99.5647 50.5283 108.015C50.4892 109.38 49.3842 110.5 48 110.5H22C20.622 110.5 19.4928 109.381 19.5205 107.99C19.7708 95.477 22.3563 83.1139 27.1504 71.54C32.201 59.347 39.6033 48.2677 48.9355 38.9355C58.2677 29.6033 69.3469 22.201 81.54 17.1504C93.7333 12.0998 106.802 9.5 120 9.5Z" fill="#F50000" fill-opacity="0.4" stroke="#B20101"/>
<path d="M23 110C21.3431 110 19.9953 108.656 20.045 107C20.4084 94.891 22.9695 82.9396 27.6121 71.7316C32.6375 59.5991 40.0035 48.5752 49.2893 39.2893C58.5752 30.0035 69.5991 22.6375 81.7317 17.612C93.8642 12.5866 106.868 10 120 10C133.132 10 146.136 12.5866 158.268 17.6121C170.401 22.6375 181.425 30.0035 190.711 39.2893C199.997 48.5752 207.362 59.5991 212.388 71.7317C217.03 82.9397 219.592 94.891 219.955 107C220.005 108.656 218.657 110 217 110H193C191.343 110 190.007 108.656 189.936 107.001C189.585 98.8323 187.806 90.7802 184.672 83.2122C181.154 74.7194 175.998 67.0026 169.497 60.5025C162.997 54.0024 155.281 48.8463 146.788 45.3284C138.295 41.8106 129.193 40 120 40C110.807 40 101.705 41.8106 93.2122 45.3284C84.7194 48.8463 77.0026 54.0024 70.5025 60.5025C64.0024 67.0026 58.8463 74.7194 55.3284 83.2122C52.1937 90.7801 50.4146 98.8323 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z" fill="#F50000"/>
<path d="M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3487 33.387 60.0181C42.1571 44.8205 54.7716 32.198 69.9637 23.4184C85.1558 14.6388 102.391 10.011 119.937 10C136.483 9.98963 152.756 14.0845 167.306 21.8969C168.766 22.6807 169.257 24.5194 168.43 25.955L156.447 46.7496C155.62 48.1852 153.788 48.6721 152.318 47.9072C142.338 42.7123 131.237 39.9929 119.956 40C107.673 40.0077 95.6091 43.2471 84.9746 49.3929C74.3402 55.5386 65.51 64.3744 59.3709 75.0127C53.7323 84.7837 50.5463 95.7593 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z" fill="#F50000"/>
<path d="M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3488 33.387 60.0182C41.6568 45.6876 53.3449 33.6467 67.3891 24.9583C68.7981 24.0867 70.6358 24.5814 71.4648 26.0159L83.4735 46.7955C84.3026 48.23 83.8077 50.0596 82.41 50.9493C72.9182 56.9914 65.0095 65.2418 59.3709 75.0127C53.7323 84.7837 50.5463 95.7594 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z" fill="#F50000"/>
<path d="M110.919 100.433C110.896 105.628 115.026 109.858 120.142 109.88C125.258 109.903 129.425 105.71 129.448 100.515C129.47 95.3203 125.341 91.0907 120.225 91.0682C115.108 91.0456 110.942 95.2386 110.919 100.433Z" fill="#5C5C5C"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M139.377 108.311L152.5 100.617L139.445 92.8067C136.442 85.0325 129.002 79.513 120.276 79.4745C108.853 79.4242 99.5519 88.7853 99.5007 100.383C99.4496 111.981 108.668 121.424 120.091 121.474C128.817 121.513 136.305 116.059 139.377 108.311ZM104.025 100.403C103.985 109.464 111.187 116.841 120.111 116.88C129.035 116.92 136.302 109.606 136.342 100.546C136.382 91.4847 129.18 84.1076 120.256 84.0682C111.332 84.0289 104.065 91.3423 104.025 100.403Z" fill="#5C5C5C"/>
</svg>
`;
const gaugePositivo = ` <svg width="240" height="121" viewBox="0 0 240 121" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M120 9.5C133.198 9.5 146.267 12.0998 158.46 17.1504C170.653 22.201 181.732 29.6033 191.064 38.9355C200.397 48.2677 207.799 59.3469 212.85 71.54C217.644 83.1139 220.229 95.477 220.479 107.99C220.507 109.381 219.378 110.5 218 110.5H192C190.616 110.5 189.511 109.38 189.472 108.015C189.23 99.5647 187.449 91.2235 184.21 83.4033C180.717 74.9712 175.597 67.3101 169.144 60.8564C162.69 54.4028 155.029 49.2827 146.597 45.79C138.165 42.2973 129.127 40.5 120 40.5C110.873 40.5 101.835 42.2973 93.4033 45.79C84.9712 49.2827 77.3101 54.4028 70.8564 60.8564C64.4028 67.3101 59.2827 74.9712 55.79 83.4033C52.5508 91.2235 50.7698 99.5647 50.5283 108.015C50.4892 109.38 49.3842 110.5 48 110.5H22C20.622 110.5 19.4928 109.381 19.5205 107.99C19.7708 95.477 22.3563 83.1139 27.1504 71.54C32.201 59.347 39.6033 48.2677 48.9355 38.9355C58.2677 29.6033 69.3469 22.201 81.54 17.1504C93.7333 12.0998 106.802 9.5 120 9.5Z" fill="#23D2EF" fill-opacity="0.4" stroke="#23D2EF"/>
<path d="M129.581 100C129.581 94.8051 125.434 90.5937 120.317 90.5937C115.201 90.5937 111.053 94.8051 111.053 100C111.053 105.195 115.201 109.406 120.317 109.406C125.434 109.406 129.581 105.195 129.581 100Z" fill="#5C5C5C"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M101.089 92.2476L88 100L101.089 107.752C104.127 115.513 111.591 121 120.317 121C131.74 121 141 111.598 141 100C141 88.402 131.74 79 120.317 79C111.591 79 104.127 84.4867 101.089 92.2476ZM136.476 100C136.476 90.9391 129.241 83.5937 120.317 83.5937C111.393 83.5937 104.159 90.9391 104.159 100C104.159 109.061 111.393 116.406 120.317 116.406C129.241 116.406 136.476 109.061 136.476 100Z" fill="#5C5C5C"/>
</svg>
`;

function hexToPaint(hex: string): Paint[] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)!;
  const r = parseInt(m[1],16)/255, g = parseInt(m[2],16)/255, b = parseInt(m[3],16)/255;
  return [{ type: 'SOLID', color: { r, g, b } }];
}


// makeSeverityChip: cria o selo (chip) visual da severidade —
// a severidade NÃO é renderizada em texto no corpo, apenas no chip/gauge
// [HELPER] makeSeverityChip: chip de severidade com label e cor (Baixa/Média/Alta/Positivo).
async function makeSeverityChip(meta: {label:string, color:string}) {
  const chip = figma.createFrame();
  chip.name = "Tag/Severidade";
  chip.layoutMode = "HORIZONTAL";
  chip.primaryAxisSizingMode = "AUTO";
  chip.counterAxisSizingMode = "AUTO";
  chip.paddingLeft = 12; chip.paddingRight = 12;
  chip.paddingTop = 6; chip.paddingBottom = 6;
  chip.cornerRadius = 999;
  chip.itemSpacing = 8;
  chip.fills = hexToPaint(meta.color);
  chip.strokes = [];

  const txt = figma.createText();
  txt.characters = removePrefix(meta.label);
  txt.fontSize = 14;
  txt.fills = [{ type:'SOLID', color:{ r:1, g:1, b:1 } }];

  chip.appendChild(txt);
  return chip;
}

// runtime type-guard: checa se o node tem 'opacity'
function hasOpacity(n: SceneNode): n is SceneNode & { opacity: number } {
  return n && typeof (n as any).opacity === "number";
}

// tween seguro: só usa 'opacity' quando disponível
function tweenOpacitySafe(node: SceneNode, from: number, to: number, duration = 180, onDone?: () => void) {
  if (!hasOpacity(node)) { // fallback sem animação
    try { (node as SceneNode).visible = to > 0; } catch (e) {}
    if (onDone) onDone();
    return;
  }
  const steps = 10;
  const dt = Math.max(10, Math.round(duration / steps));
  let i = 0;
  function step() {
    i++;
    const t = i / steps;
    (node as any).opacity = from + (to - from) * t;
    if (i < steps) setTimeout(step, dt);
    else { (node as any).opacity = to; if (onDone) onDone(); }
  }
  (node as any).opacity = from;
  setTimeout(step, 0);
}


// [UI] Mensagens vindas da interface do plugin (botões/inputs). Inicia fluxo de análise.
figma.ui.onmessage = async (msg: any) => {
  
  if (msg.type === "focusNode" && msg.nodeId) {
    const n = figma.getNodeById(msg.nodeId);
    if (n) figma.viewport.scrollAndZoomIntoView([n]);
  }
  
  // ↕ verificar estado de visibilidade dos cards "[AI]" na página atual
  if (msg.type === "getCardsVisibilityState") {
    try {
      const cards = figma.currentPage.findAll(n =>
        typeof (n as any).name === "string" && (n as any).name.trim().startsWith("[AI]")
      );
      
      if (cards.length === 0) {
        figma.ui.postMessage({ type: "cardsVisibilityState", allVisible: true, count: 0 });
        return;
      }
      
      // Verifica se todos os cards estão visíveis
      const allVisible = cards.every(card => card.visible);
      figma.ui.postMessage({ type: "cardsVisibilityState", allVisible, count: cards.length });
    } catch (e) {
      figma.ui.postMessage({ type: "cardsVisibilityState", allVisible: true, count: 0 });
    }
    return;
  }
    // --- TOGGLE VISIBILIDADE COM FADE QUANDO POSSÍVEL ---
  if (msg && msg.type === "setHeuristicaVisibility") {
    const visible = !!msg.visible;

    const nodes = figma.currentPage.findAll(n =>
      typeof (n as any).name === "string" &&
      (n as any).name.indexOf("[AI]") === 0
    ) as SceneNode[];

    let count = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      try {
        if (visible) {
          // mostrar com fade-in (se suportar)
          const saved = parseFloat(n.getPluginData("origOpacity") || "");
          const target = isFinite(saved) ? Math.min(Math.max(saved, 0), 1) : 1;
          n.visible = true;
          tweenOpacitySafe(n, hasOpacity(n) ? 0 : 1, target, 180);
        } else {
          // esconder com fade-out (se suportar)
          if (!n.getPluginData("origOpacity") && hasOpacity(n)) {
            n.setPluginData("origOpacity", String((n as any).opacity));
          }
          const from = hasOpacity(n) ? (n as any).opacity : 1;
          tweenOpacitySafe(n, from, 0, 180, function () {
            try { n.visible = false; } catch (e) {}
          });
        }
        count++;
      } catch (e) {}
    }

    figma.notify(
      count
        ? `${count} card(s) ${visible ? "aparecendo" : "sumindo"}`
        : "Nenhum card [AI] nesta página",
      { timeout: 1200 }
    );
    return;
  }

// --- APAGAR TODOS OS CARDS "[AI]" (página atual) ---
if (msg && msg.type === "deleteAllHeuristicaCards") {
  const nodes = figma.currentPage.findAll(n =>
    typeof (n as any).name === "string" && (n as any).name.trim().startsWith("[AI]")
  ) as SceneNode[];

  var removed = 0;
  for (var i = 0; i < nodes.length; i++) {
    try { nodes[i].remove(); removed++; } catch (e) {}
  }

  // atualiza UI e dá feedback
  figma.ui.postMessage({ type: "cardsCount", count: 0 });
  figma.notify(removed ? ("Removidos " + removed + " card(s) de análise.") : "Nenhum card [AI] nesta página", { timeout: 1500 });
  return;
}


  
  // Benchmark Multi-IA
  if (msg && msg.type === "benchmark-multi-ai") {
    const categoria: string = msg.categoria || "free";
    const testType: string = msg.testType || "layout-analysis";
    
    const selection = figma.currentPage.selection;
    if (!selection.length) {
      figma.ui.postMessage({
        carregando: false,
        resultado: "⚠️ Selecione ao menos um frame para benchmark."
      });
      return;
    }

    figma.ui.postMessage({ carregando: true });

    try {
      // Gerar FigmaSpec da primeira seleção (como na análise normal)
      const firstNode = selection[0] as SceneNode;
      let figmaSpec: any = null;
      
      if (firstNode.type === "FRAME" || firstNode.type === "COMPONENT" || firstNode.type === "INSTANCE" || firstNode.type === "SECTION") {
        figmaSpec = await buildFigmaSpecFromFrame(firstNode as any);
      }

      // Chamada para benchmark multi-IA
      // DESENVOLVIMENTO: const response = await fetch("http://localhost:3000/benchmark-multi-ai", {
      const response = await fetch("https://api.uxday.com.br/benchmark-multi-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          figmaSpecs: figmaSpec ? [figmaSpec] : [],
          categoria: categoria,
          testType: testType
        })
      });

      const data = await response.json();

      if (data.success) {
        figma.ui.postMessage({ 
          carregando: false, 
          benchmarkResults: data,
          tipo: "benchmark-multi-ai"
        });
        
        // Criar cards no Figma (como na análise normal)
        if (data.results && data.results.length > 0) {
          await createBenchmarkCards(data.results, firstNode);
        }
      } else {
        figma.ui.postMessage({ 
          carregando: false, 
          resultado: `❌ Erro no benchmark: ${data.error || 'Erro desconhecido'}` 
        });
      }
    } catch (e) {
      console.error("Erro no benchmark:", e);
      figma.ui.postMessage({ 
        carregando: false, 
        resultado: "❌ Erro no benchmark multi-IA." 
      });
    }
    return;
  }

  if (!msg || msg.type !== "analisar") return;  

  const metodo: string = msg.metodo || "";
  const descricao: string = msg.descricao || "";

  const selection = figma.currentPage.selection;
  if (!selection.length) {
    figma.ui.postMessage({
      carregando: false,
      resultado: "⚠️ Selecione ao menos um frame para análise."
    });
    return;
  }
  
  const orderedSelection = selection
    .slice()
    .sort((a: SceneNode & { x: number }, b: SceneNode & { x: number }) => a.x - b.x);

  const delay = (ms:number) => new Promise(r => setTimeout(r, ms));

  
  // Modo híbrido: se a seleção contiver FRAMES "reais", usa FigmaSpec; caso contrário, exporta imagens para Vision
  const imagensBase64: (string | null)[] = [];
  const figmaSpecs: any[] = [];

  function isFrameLike(n: SceneNode): boolean {
    return n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE" || n.type === "SECTION";
  }
  function frameLooksLikeScreenshot(frame: any): boolean {
    try {
      const hasText = !!frame.findOne((n: SceneNode)=> n.type === 'TEXT');
      const hasImg  = !!frame.findOne((n: any)=> ('fills' in n) && Array.isArray(n.fills) && n.fills.some((f:any)=> f && f.type === 'IMAGE'));
      return (!hasText && hasImg);
    } catch (e) { return false; }
  }

  // Decide o modo por item (mas envia um único payload no final)
  let layoutNameFromFigma: string | undefined;
  if (orderedSelection.length === 1) {
    const n = orderedSelection[0] as any;
    layoutNameFromFigma = String((n && n.name) || "Untitled").trim() || undefined;
  }

  for (let i = 0; i < orderedSelection.length; i++) {
    const node = orderedSelection[i] as SceneNode;
    
    // 🔄 NOVA LÓGICA: Sempre capturar FIGMASPEC + IMAGEM para orquestrador completo
    if (isFrameLike(node)) {
      // ➜ 1. FigmaSpec (para Agente A - JSON Analyst)
      const spec = await buildFigmaSpecFromFrame(
        node as any,
        orderedSelection.length === 1 ? layoutNameFromFigma : undefined
      );
      if (descricao && String(descricao).trim()) {
        spec.meta = spec.meta || {};
        spec.meta.source = "figma";
        spec.meta.contextUser = String(descricao).trim();
      }
      figmaSpecs.push(spec);
      
      // ➜ 2. Imagem (para Agente B - Vision Reviewer)
      if ("exportAsync" in (node as any)) {
        try {
          const bytes = await (node as any as ExportMixin).exportAsync({ 
            format: "PNG", 
            constraint: { type: "SCALE", value: 1 } 
          });
          const b64 = uint8ToBase64(bytes);
          imagensBase64.push("data:image/png;base64," + b64);
        } catch (e) { 
          console.warn(`Erro ao exportar imagem do frame ${node.name}:`, e);
          imagensBase64.push(null); 
        }
      } else { 
        imagensBase64.push(null); 
      }
    } else {
      // ➜ Não é frame: apenas imagem (fallback para compatibilidade)
      figmaSpecs.push(null);
      if ("exportAsync" in (node as any)) {
        try {
          const bytes = await (node as any as ExportMixin).exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
          const b64 = uint8ToBase64(bytes);
          imagensBase64.push("data:image/png;base64," + b64);
        } catch (e) { imagensBase64.push(null); }
      } else { imagensBase64.push(null); }
    }
    await delay(120);
  }

  figma.ui.postMessage({ carregando: true });
  figma.ui.postMessage({ carregando: true });

  try {
    console.log("🚀 [DEBUG] Iniciando análise...");
    console.log("🚀 [DEBUG] API_URL:", API_URL);
    console.log("🚀 [DEBUG] Dados enviados:", {
      imagensCount: imagensBase64.filter(Boolean).length,
      figmaSpecsCount: figmaSpecs.length,
      metodo,
      descricao,
      nomeLayout: layoutNameFromFigma
    });
    
    // [API] Chamada ao backend com imagens base64 + metadados. Espera texto formatado em 1–8.
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imagens: imagensBase64.filter(Boolean),
        figmaSpecs,
        metodo,
        descricao,
        nomeLayout: layoutNameFromFigma
      })
    });
    
    console.log("🚀 [DEBUG] Response status:", response.status);
    console.log("🚀 [DEBUG] Response ok:", response.ok);

    const data = await response.json();

    let blocos: string[] = [];
    if (data && Array.isArray(data.respostas)) {
      // Verificar se é JSON formatado
      const primeiraResposta = data.respostas[0];
      if (typeof primeiraResposta === 'string' && primeiraResposta.includes('```json')) {
        try {
          // Extrair JSON do markdown
          const jsonMatch = primeiraResposta.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            const jsonData = JSON.parse(jsonMatch[1]);
            
            if (jsonData.achados && Array.isArray(jsonData.achados)) {
              // Converter cada achado para formato esperado pelo parser
              blocos = jsonData.achados.map((achado: any) => {
                // Lógica para constatacao_hipotese: só exibir se for "Hipótese"
                let constatacaoTexto = '';
                const constatacao = achado.constatacao_hipotese || '';
                if (constatacao.toLowerCase().includes('hipótese') || constatacao.toLowerCase().includes('hipotese')) {
                  constatacaoTexto = 'Hipótese';
                }
                
                return `1 - ${constatacaoTexto}
2 - ${achado.titulo_card || 'Sem título'}
3 - ${achado.heuristica_metodo || ''}
4 - ${achado.descricao || ''}
5 - ${achado.sugestao_melhoria || ''}
6 - ${achado.justificativa || ''}
7 - ${achado.severidade || 'médio'}
8 - ${Array.isArray(achado.referencias) ? achado.referencias.join(', ') : achado.referencias || ''}`;
              });
            } else {
              blocos = data.respostas;
            }
          } else {
            blocos = data.respostas;
          }
        } catch (e) {
          console.error("❌ [DEBUG] Erro ao processar JSON:", e);
          blocos = data.respostas;
        }
      } else {
        blocos = data.respostas;
      }
    } else {
      console.error("❌ [DEBUG] Erro: respostas não é um array ou está vazio");
    }

    // 🔧 anti-split: une "Sem título" + próximo que começa com "Hipótese Título do Card:"
    if (blocos.length >= 2 && /^Sem título/i.test(blocos[0]) && /^Hipótese Título do Card:/i.test(blocos[1])) {
      blocos[0] = blocos[0] + "\n\n" + blocos[1];
      blocos.splice(1, 1);
    }

    try {
      await Promise.all([
        figma.loadFontAsync({ family: "Inter", style: "Regular" }),
        figma.loadFontAsync({ family: "Inter", style: "Bold" }),
        figma.loadFontAsync({ family: "Inter", style: "Italic" })
      ]);
    } catch (e) {
      console.warn("Alguma fonte não foi carregada:", e);
    }

    // Tenta carregar SemiBold separadamente, se falhar usa Bold como fallback
    let semiBoldAvailable = false;
    try {
      await figma.loadFontAsync({ family: "Inter", style: "SemiBold" });
      semiBoldAvailable = true;
    } catch (e) {
      console.warn("Inter SemiBold não disponível, usando Bold como fallback:", e);
    }

    const layoutsPayload: any[] = [];
    const node = orderedSelection[0]; // Usar o primeiro frame selecionado para todos os cards
    const OFFSET_X = 80; // declara fora do loop
    let currentY: number = node.y; // Posição Y base para o primeiro card

    // Processar todos os blocos como partes individuais
    const todasPartes: string[] = [];
    
    for (let i = 0; i < blocos.length; i++) {
      const blocoOriginal: string = blocos[i] || "";
      
      // Suporte a múltiplas heurísticas no mesmo bloco, separadas por [[[FIM_HEURISTICA]]]
      const partes: string[] = blocoOriginal.split("[[[FIM_HEURISTICA]]]").map((p: string) => p.trim()).filter((p: string) => p.length > 0);
      // Fallback para marcador antigo [[FIM_HEURISTICA]]
      if (partes.length === 0 && blocoOriginal.includes("[[FIM_HEURISTICA]]")) {
        partes.push(blocoOriginal.split("[[FIM_HEURISTICA]]")[0].trim());
      }
      
      todasPartes.push(...partes);
    }

    // === PRIORIZAÇÃO: problemas primeiro, positivos por último ===
    const MAX_POSITIVE_CARDS = 1; // 0 = ocultar positivos; 1 = mostrar apenas 1; ajuste como quiser.

    function extrairSeveridade(p: string): string {
      const m = p.match(/\n?\s*7\s*[-–—]?\s*(?:Severidade\s*:)?\s*([^\n]+)/i);
      return m ? m[1].trim().toLowerCase() : "";
    }
    function rankSeveridade(s: string): number {
      const t = (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
      if (/alto|alta|critica|crítica|critico|crítico/.test(t)) return 0; // mais crítico primeiro
      if (/medio|médio|moderad[oa]|media|média/.test(t)) return 1;
      if (/baixo|baixa|leve/.test(t)) return 2;
      if (/positiv/.test(t)) return 3; // positivos por último
      return 2; // default ~ baixo
    }

    const partesNegativas = todasPartes
      .filter(p => !/positiv/i.test(extrairSeveridade(p)))
      .sort((a,b) => rankSeveridade(extrairSeveridade(a)) - rankSeveridade(extrairSeveridade(b)));

    const partesPositivas = todasPartes
      .filter(p => /positiv/i.test(extrairSeveridade(p)))
      .slice(0, MAX_POSITIVE_CARDS);

    const partesOrdenadas = [...partesNegativas, ...partesPositivas];

    const cardsPayload: any[] = [];
    
    try {
      for (const parte of partesOrdenadas) {
        // Quebra o bloco em linhas e remove espaços
let parteSan: string = parte
          
const linhas: string[] = parteSan
          .split("\n")
          .map((l: string) => l.trim())
          .filter(Boolean);

        // pegar(n): devolve o conteúdo entre o marcador n e o próximo marcador (n+1..8)
// [PARSER] pegar(n): retorna o conteúdo do item numerado n (1–8), respeitando o próximo marcador.
        function pegar(n: number): string {
          const idx: number = linhas.findIndex((l: string) =>
            new RegExp("^" + n + "\\s*[-–—]\\s*").test(l)
          );
          if (idx === -1) return "";
          const end: number = linhas.findIndex((l: string, index: number) =>
            index > idx && /^[1-8]\s*[-–—]\s*/.test(l)
          );
          const slice: string[] = linhas.slice(idx, end === -1 ? undefined : end);
          if (slice.length > 0) {
            slice[0] = slice[0].replace(/^[1-8]\s*[-–—]\s*/, "").trim();
          }
          return slice.join(" ").trim();
        }
	  // Extrai campos 1–8 do bloco
      const prefixo: string = (pegar(1) || "").trim();
      const titulo: string = ((pegar(2) || "Sem título").trim());
      const metodo: string = pegar(3);
      const descricaoProb: string = pegar(4);
      const sugestao: string = pegar(5);
      const justificativa: string = pegar(6);
      const referencias: string = pegar(8);
// [SEVERIDADE] severidadeRaw: lê o item 7 com ou sem rótulo 'Severidade:'.
      const severidadeRaw = (pegar(7) || "").trim();

      const norm = (s: string) =>
      (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

// [SEVERIDADE] getSeverityMeta: mapeia texto normalizado -> cores/labels/gauge.
    function getSeverityMeta(raw: string) {
      const s = norm(raw);
      if (/positiv/.test(s)) return { key:"positivo", label:"Positiva", color: SEVERITY_COLORS.positivo, gauge: gaugePositivo };
      if (/(alto|alta|critica|critico|crítica|crítico)/.test(s)) return { key:"alto", label:"Alto", color: SEVERITY_COLORS.alto, gauge: gaugeAlto };
      if (/(medio|médio|moderad[oa]|media|média)/.test(s)) return { key:"medio", label:"Médio", color: SEVERITY_COLORS.medio, gauge: gaugeMedio };
      if (/(baixo|baixa|leve)/.test(s)) return { key:"baixo", label:"Baixo", color: SEVERITY_COLORS.baixo, gauge: gaugeBaixo };
      return { key:"medio", label:"Médio", color: SEVERITY_COLORS.medio, gauge: gaugeMedio };
    }

    function toSevKey(raw: string): "alto"|"medio"|"baixo"|"positivo" {
      const s = (raw || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
      if (/\bpositiv/.test(s))                        return "positivo";
      if (/\b(alt[ao]|critic[oa])\b/.test(s))        return "alto";
      if (/\b(medi[oa]|moderad[oa])\b/.test(s))      return "medio";
      if (/\b(baix[oa]|lev[ea])\b/.test(s))          return "baixo";
      return "medio"; // <- fallback seguro
    }

      const isPositiva = (severidadeRaw || "").includes("positivo");
      const sevMeta = getSeverityMeta(severidadeRaw);
      const sevKey = toSevKey(severidadeRaw);
      // (adiado) cardsPayload.push — só após o card ser criado e inserido

      const palette = {
        border: { r: 0.88, g: 0.9, b: 0.93 },
        text: { r: 0.13, g: 0.13, b: 0.13 },
        subtle: { r: 0.42, g: 0.45, b: 0.5 },
        divider: { r: 0.75, g: 0.77, b: 0.8 },
        white: { r: 1, g: 1, b: 1 }
      };

      // SVG do gauge (cole exatamente como recebeu)
      const gaugeSvg = `
      <svg width="240" height="122" viewBox="0 0 240 122" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M120 9.5C133.198 9.5 146.267 12.0998 158.46 17.1504C170.653 22.201 181.732 29.6033 191.064 38.9355C200.397 48.2677 207.799 59.3469 212.85 71.54C217.644 83.1139 220.229 95.477 220.479 107.99C220.507 109.381 219.378 110.5 218 110.5H192C190.616 110.5 189.511 109.38 189.472 108.015C189.23 99.5647 187.449 91.2235 184.21 83.4033C180.717 74.9712 175.597 67.3101 169.144 60.8564C162.69 54.4028 155.029 49.2827 146.597 45.79C138.165 42.2973 129.127 40.5 120 40.5C110.873 40.5 101.835 42.2973 93.4033 45.79C84.9712 49.2827 77.3101 54.4028 70.8564 60.8564C64.4028 67.3101 59.2827 74.9712 55.79 83.4033C52.5508 91.2235 50.7698 99.5647 50.5283 108.015C50.4892 109.38 49.3842 110.5 48 110.5H22C20.622 110.5 19.4928 109.381 19.5205 107.99C19.7708 95.477 22.3563 83.1139 27.1504 71.54C32.201 59.347 39.6033 48.2677 48.9355 38.9355C58.2677 29.6033 69.3469 22.201 81.54 17.1504C93.7333 12.0998 106.802 9.5 120 9.5Z" fill="#FECA2A" fill-opacity="0.4" stroke="#DDAF24"/>
      <path d="M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3487 33.387 60.0181C42.1571 44.8205 54.7716 32.198 69.9637 23.4184C85.1558 14.6388 102.391 10.011 119.937 10C136.483 9.98963 152.756 14.0845 167.306 21.8969C168.766 22.6807 169.257 24.5194 168.43 25.955L156.447 46.7496C155.62 48.1852 153.788 48.6721 152.318 47.9072C142.338 42.7123 131.237 39.9929 119.956 40C107.673 40.0077 95.6091 43.2471 84.9746 49.3929C74.3402 55.5386 65.51 64.3744 59.3709 75.0127C53.7323 84.7837 50.5463 95.7593 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z" fill="#FECA2A"/>
      <path d="M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3488 33.387 60.0182C41.6568 45.6876 53.3449 33.6467 67.3891 24.9583C68.7981 24.0867 70.6358 24.5814 71.4648 26.0159L83.4735 46.7955C84.3026 48.23 83.8077 50.0596 82.41 50.9493C72.9182 56.9914 65.0095 65.2418 59.3709 75.0127C53.7323 84.7837 50.5463 95.7594 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z" fill="#FECA2A"/>
      <path d="M114.861 108.196C119.235 111 125.018 109.781 127.78 105.474C130.541 101.166 129.234 95.4017 124.861 92.598C120.487 89.7944 114.704 91.0134 111.942 95.3208C109.181 99.6282 110.488 105.393 114.861 108.196Z" fill="#5C5C5C"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M136.765 88.3938L137.302 73.1906L123.712 80.0261C115.538 78.3951 106.891 81.7176 102.182 89.0638C96.0171 98.6803 98.9347 111.55 108.699 117.809C118.463 124.069 131.375 121.347 137.54 111.731C142.25 104.385 141.659 95.1398 136.765 88.3938ZM111.14 114.001C118.769 118.891 128.857 116.764 133.673 109.252C138.489 101.739 136.21 91.684 128.582 86.7939C120.954 81.9039 110.865 84.0301 106.049 91.543C101.233 99.0559 103.512 109.11 111.14 114.001Z" fill="#5C5C5C"/>
      </svg>`;

      const gaugeSvgToUse = (sevMeta.gauge && sevMeta.gauge.trim()) ? sevMeta.gauge : gaugeSvg;


      // Cria o node e redimensiona
      const gaugeNode = figma.createNodeFromSvg(gaugeSvgToUse);
      gaugeNode.resize(68, 34);

      const sevMap: Record<string, { barraLateral: RGB; chip: RGB; label: string }> = {
        "crítica": { barraLateral: { r: 0.97, g: 0.42, b: 0.36 }, chip: { r: 0.94, g: 0.29, b: 0.23 }, label: "Crítica" },
        "critica": { barraLateral: { r: 0.97, g: 0.42, b: 0.36 }, chip: { r: 0.94, g: 0.29, b: 0.23 }, label: "Crítica" },
        "moderada": { barraLateral: { r: 1.0, g: 0.84, b: 0.2 }, chip: { r: 1.0, g: 0.8, b: 0.16 }, label: "Moderada" },
        "leve": { barraLateral: { r: 0.22, g: 0.78, b: 0.42 }, chip: { r: 0.16, g: 0.69, b: 0.36 }, label: "Leve" },
        "positivo": { barraLateral: { r: 0.16, g: 0.53, b: 0.84 }, chip: { r: 0.16, g: 0.53, b: 0.84 }, label: "Positivo" }
      };

	  const sevColorObj = (hexToPaint(sevMeta.color)[0] as SolidPaint).color;
      const sev = { barraLateral: sevColorObj, chip: sevColorObj, label: sevMeta.label };

      function makeText(text: string, style: "Regular" | "Bold" | "Italic", size: number, color: RGB) {
        const t = figma.createText();
        t.fontName = { family: "Inter", style };
        t.fontSize = size;
        t.characters = removePrefix(text);
        t.fills = [{ type: "SOLID", color }];
        t.textAutoResize = "WIDTH_AND_HEIGHT";
        return t;
      }

// [HELPER] makeSection: cria um bloco (label + valor) com espaçamento e estilos.
      function makeSection(label: string, value: string, italic?: boolean) {
        if (!value) return null;
        const wrap = figma.createFrame();
        wrap.layoutMode = "VERTICAL";
        wrap.primaryAxisSizingMode = "AUTO";
        wrap.counterAxisSizingMode = "AUTO";
        wrap.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
        wrap.resize(516, wrap.height);
        wrap.itemSpacing = 6;
        wrap.fills = [];
        //wrap.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 1 } }]; // borda azul
        wrap.strokeWeight = 1;
        const l = makeText(label, "Bold", 16, palette.text);
        const v = makeText(value, italic ? "Italic" : "Regular", 16, palette.text);

        //Configura quebra de linha automática no valor
        v.textAutoResize = "HEIGHT";  // altura se ajusta ao conteúdo
        v.resize(516, v.height);      // largura máxima para quebrar linha
        wrap.appendChild(l);
        wrap.appendChild(v);
        return wrap;
      }

      // Cria o card principal com layout vertical, largura fixa e altura adaptável
// [CARD] Cria o card principal (layout horizontal: barra lateral + coluna de conteúdo).
	    const card = figma.createFrame();
      //card.name = "Heurística – " + titulo;
      card.name = `[AI] ${titulo} :: ${severidadeRaw}`;
      card.layoutMode = "HORIZONTAL";
      card.primaryAxisSizingMode = "FIXED";
      card.counterAxisSizingMode = "AUTO";
      card.resize(590, card.height);
      card.itemSpacing = 0;
      card.paddingLeft = 24;
      card.paddingRight = 24;
      card.paddingTop = 24;
      card.paddingBottom = 24;
      card.cornerRadius = 20;
      card.strokes = [{ type: "SOLID", color: palette.border, opacity: 1 }];
      card.strokeWeight = 1;
      card.fills = [{ type: "SOLID", color: palette.white }];
      //card.effects = [{
      //  type: "DROP_SHADOW",
      //  radius: 12,
      //  color: { r: 0, g: 0, b: 0, a: 0.08 },
      //  offset: { x: 0, y: 4 },
      //  visible: true,
      //  blendMode: "NORMAL"
      //}];



      const barraLateral = figma.createFrame();
      barraLateral.layoutMode = "VERTICAL";
	    barraLateral.cornerRadius = 20;
      barraLateral.primaryAxisSizingMode = "AUTO";
      barraLateral.counterAxisSizingMode = "FIXED";
      barraLateral.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
      barraLateral.resize(8, 1);
      barraLateral.fills = [{ type: "SOLID", color: sev.barraLateral }];

      // Cria o container vertical para os textos do card (título, problema, sugestão, etc.)
	    const contentCol = figma.createFrame();
      contentCol.layoutMode = "VERTICAL";
	    contentCol.primaryAxisSizingMode = "AUTO";
      contentCol.counterAxisSizingMode = "AUTO";
      contentCol.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
      contentCol.itemSpacing = 16;
      contentCol.paddingLeft = 18;
      contentCol.paddingRight = 0;
      contentCol.paddingTop = 0;
      contentCol.paddingBottom = 0;
      contentCol.layoutGrow = 1;          // <- ESSENCIAL
      contentCol.fills = [];


        const headerRow = figma.createFrame();
        headerRow.layoutMode = "HORIZONTAL";
        headerRow.primaryAxisSizingMode = "AUTO"; // Permite expansão automática
        headerRow.counterAxisSizingMode = "AUTO"; // altura = maior filho (71px do right)
        headerRow.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
        headerRow.itemSpacing = 16;
        headerRow.fills = [];
        // headerRow.resize(510, card.height); // Remover resize fixo

      const headerLeft = figma.createFrame();
      headerLeft.layoutMode = "VERTICAL";
      headerLeft.primaryAxisSizingMode = "AUTO"; // Permite expansão automática
      headerLeft.counterAxisSizingMode = "AUTO";
      headerLeft.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
      headerLeft.itemSpacing = 8;
      headerLeft.fills = [];
      // headerLeft.resize(410, card.height); // Remover resize fixo
      
      // 1ª linha: Prefixo (ex.: [Hipótese]) – só exibir tag roxa para hipótese
      if (prefixo && prefixo.trim() && prefixo.toLowerCase().includes('hipótese')) {
        // Criar container horizontal para tag roxa
        const tagContainer = figma.createFrame();
        tagContainer.layoutMode = "HORIZONTAL";
        tagContainer.primaryAxisSizingMode = "AUTO";
        tagContainer.counterAxisSizingMode = "AUTO";
        tagContainer.itemSpacing = 0;
        tagContainer.fills = [];
        
        // Criar tag roxa para "Hipótese"
        const tagBadge = figma.createFrame();
        tagBadge.layoutMode = "HORIZONTAL";
        tagBadge.primaryAxisSizingMode = "AUTO";
        tagBadge.counterAxisSizingMode = "AUTO";
        tagBadge.paddingLeft = 8;
        tagBadge.paddingRight = 8;
        tagBadge.paddingTop = 4;
        tagBadge.paddingBottom = 4;
        tagBadge.cornerRadius = 6;
        tagBadge.fills = [{ type: "SOLID", color: { r: 0.58, g: 0.35, b: 0.85 } }]; // Roxo
        
        const tagText = figma.createText();
        tagText.characters = "Hipótese";
        tagText.fontName = { family: "Inter", style: "Bold" };
        tagText.fontSize = 12;
        tagText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }]; // Texto branco
        tagText.textAutoResize = "WIDTH_AND_HEIGHT";
        
        tagBadge.appendChild(tagText);
        tagContainer.appendChild(tagBadge);
        headerLeft.appendChild(tagContainer);
      }

      // 2ª linha: Título (campo 2) – sem prefixo
      const titleT = makeText(titulo, "Bold", 20, palette.text);
      titleT.textAutoResize = "HEIGHT";
      titleT.resize(410, titleT.height);

      const divider = figma.createRectangle();
      divider.strokes = [];
      divider.fills = [{ type: "SOLID", color: palette.divider }];
      divider.layoutAlign = "STRETCH";
      divider.resize(1, 1);

      const metodoDisplayNames: Record<string, string> = {
  nielsen: "Heurísticas de Nielsen",
  heuristicas_nielsen: "Heurísticas de Nielsen",

  shneiderman: "Regras de Ouro (Shneiderman)",
  regras_ouro: "Regras de Ouro (Shneiderman)",

  powals: "Usabilidade Cognitiva de Gerhardt-Powals",
  gerhardt_powals: "Usabilidade Cognitiva de Gerhardt-Powals",

  vieses: "Vieses Cognitivos",
  vieses_cognitivos: "Vieses Cognitivos",
  
};

      // supondo que você tem a variável `metodo` disponível neste escopo.
// se o nome estiver diferente (ex.: metodoAtual/metodoGlobal), use-o aqui.
const metodoNome =
  metodoDisplayNames[String(metodo || "").toLowerCase()] || String(metodo || "Heurísticas");

// cor correta é `subtle` (não existe `subtitle` no palette)
const subtitleT = makeText(metodoNome, "Regular", 16, palette.subtle);
subtitleT.textAutoResize = "HEIGHT"; // Só altura, largura fixa
subtitleT.resize(410, subtitleT.height); // Definir largura máxima

// append no node certo
      const isConstatacao = norm(prefixo) === "constatacao";
      if (!isConstatacao && prefixo) {
        const tipoTxt = figma.createText();
        tipoTxt.characters = prefixo;
        tipoTxt.fontSize = 16;
        tipoTxt.fontName = { family: "Inter", style: "Bold" };
        tipoTxt.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
        headerLeft.appendChild(tipoTxt);
      }
      headerLeft.appendChild(titleT);
      headerLeft.appendChild(divider);
      headerLeft.appendChild(subtitleT);

      const headerRight = figma.createFrame();
      headerRight.layoutMode = "VERTICAL";
      headerRight.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
      headerRight.primaryAxisSizingMode = "FIXED";
      headerRight.counterAxisSizingMode = "FIXED";
      headerRight.resize(84, 71); 
            headerRight.itemSpacing = 16;

      headerRight.primaryAxisAlignItems  = "CENTER";   // alinha no eixo principal (vertical)
      headerRight.counterAxisAlignItems  = "CENTER";   // alinha no eixo cruzado (horizontal)
      headerRight.paddingTop = headerRight.paddingBottom = 0;
      headerRight.paddingLeft = headerRight.paddingRight = 0;
      headerRight.fills = [];

      // Adiciona no headerRight
      headerRight.appendChild(gaugeNode);
 
      // Criaçao da TAG de severidade
      const chip = figma.createFrame();
      chip.layoutMode = "HORIZONTAL";
      chip.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
      chip.primaryAxisSizingMode = "AUTO";
      chip.counterAxisSizingMode = "AUTO";
      chip.paddingLeft = 12;
      chip.paddingRight = 12;
      chip.paddingTop = 6;
      chip.paddingBottom = 6;
      chip.cornerRadius = 999;
      chip.fills = [{ type: "SOLID", color: sev.chip }];

      const chipText = makeText(sev.label, "Bold", 12, palette.white);
      chip.appendChild(chipText);

      headerRight.appendChild(chip);

      headerRow.appendChild(headerLeft);
      headerRow.appendChild(headerRight);

      contentCol.appendChild(headerRow);

      function stripMarkerSpill(s: string): string {
        if (!s) return s;
        s = s;
        s = s.replace(/\b8\s*[-–—]?\s*Refer(ê|e)ncias?\s*:\s*/gi, "");
        return s.trim();
      }

      // Limpezas básicas dos campos
      let justRaw = removePrefix(justificativa || "");
      let refsRaw = removePrefix(referencias || "");

      // Remover qualquer sobra explícita de “7 - …” / “8 - …”
      justRaw = stripMarkerSpill(justRaw);
      refsRaw = stripMarkerSpill(refsRaw);

      // 4 - Descrição
      const secDescricao = makeSection("Descrição", removePrefix(descricaoProb));
      if (secDescricao) contentCol.appendChild(secDescricao as SceneNode);

      // 5 - Sugestão de melhoria  (só se NÃO for positiva)
      const textoSugestao = removePrefix(sugestao || "").trim();
      if (sevKey !== "positivo" && textoSugestao) {
        const secSugestao = makeSection("Sugestão de melhoria", textoSugestao);
        if (secSugestao) contentCol.appendChild(secSugestao as SceneNode);
      }

      // 6 - Justificativa (texto já limpo e sem refs coladas)
      const secJust = makeSection("Justificativa", justRaw);
      if (secJust) contentCol.appendChild(secJust as SceneNode);

      // 8 - Referências (sempre seu próprio bloco; true = monoespaçado/multilinha)
      const secRef = makeSection("Referências", refsRaw, true);
if (secRef) contentCol.appendChild(secRef as SceneNode);

      card.appendChild(barraLateral);
      card.appendChild(contentCol);

// [POSICIONAMENTO] Posiciona o card ao lado do layout de origem (um card por frame).
      card.x = node.x + node.width + OFFSET_X;
		  card.y = currentY;

      // Adiciona o card finalizado à página atual do Figma

      card.x = node.x + node.width + OFFSET_X;
	    card.y = currentY;

      figma.currentPage.appendChild(card);
      // Agora que o card foi realmente criado, refletimos no resumo
      cardsPayload.push({ analise: parte, severidade: sevMeta.label, sevKey, severidadeRaw, nodeId: node.id });

  currentY += card.height + 24;
      } // fim do for (const parte of partesOrdenadas)

      //barraLateral.resize(8, contentCol.height);
// Nome do layout sem optional chaining
// Nome do layout formatado para o cabeçalho do container
const nodeName = (node && (node as any).name) ? (node as any).name : (`Layout`);
// Empilha o resumo desta tela para enviar à UI
layoutsPayload.push({ nome: `[AI] ${nodeName}`, cards: cardsPayload });
    } catch (error) {
      console.error(`[DEBUG] Erro ao processar análise:`, error);
      // Continua mesmo se houver erro
      layoutsPayload.push({ nome: `[AI] Layout (Erro)`, cards: [] });
    }

// Envia resultados para a UI
figma.ui.postMessage({ carregando: false, analises: layoutsPayload });
} catch (e) {
  console.error("❌ [DEBUG] Erro completo na análise:", e);
  console.error("❌ [DEBUG] Tipo do erro:", typeof e);
  console.error("❌ [DEBUG] Mensagem do erro:", (e as any) && (e as any).message ? (e as any).message : e);
  figma.ui.postMessage({ carregando: false, resultado: "❌ Erro na análise." });
}
};
