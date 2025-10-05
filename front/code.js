// ============================
// === VISÃO GERAL DO PLUGIN ===
// Este arquivo code.ts controla a lógica do plugin Figma:
// - Exporta as imagens dos frames selecionados
// - Chama o backend (API_URL) para obter análises
// - Faz o parse do texto em campos 1–8
// - Monta os cards ao lado de cada frame, com gauge/selos/labels
// ============================
// ÍNDICE RÁPIDO: CONFIG • UI • EXPORT/UPLOAD • PARSER • SEVERIDADE • CARD • POSICIONAMENTO • HELPERS
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _this = this;
// code.ts — Plugin Figma sem optional chaining e com tipagem completa
// Exibe a UI do plugin (janela direita) com largura/altura definidas
figma.showUI(__html__, { width: 380, height: 385 });
// Endpoint do backend que processa a imagem e retorna o texto no formato 1–8
// DESENVOLVIMENTO: usar localhost para testar mudanças no prompt
var API_URL = "http://localhost:3000/analisar";
function hexFromPaint(paint) {
    if (!paint || paint.type !== 'SOLID')
        return null;
    var c = paint.color;
    if (!c)
        return null;
    var to255 = function (v) { return Math.round(Math.min(Math.max(v * 255, 0), 255)); };
    var r = to255(c.r || 0), g = to255(c.g || 0), b = to255(c.b || 0);
    return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
}
function uint8ToBase64(u8) {
    var s = "";
    var chunk = 0x8000;
    for (var i = 0; i < u8.length; i += chunk)
        s += String.fromCharCode.apply(null, Array.prototype.slice.call(u8, i, i + chunk));
    // @ts-ignore
    return typeof btoa === "function" ? btoa(s) : (figma.base64Encode ? figma.base64Encode(u8) : s);
}
function collectFonts(node, accFamilies, scale) {
    try {
        if (node.type === 'TEXT') {
            var t = node;
            // --- Tipografia: tratar nós de texto com estilos mistos (ranges)
            try {
                var fnAny = t.fontName;
                var isMixedSize = typeof t.fontSize !== 'number';
                var isMixedFont = !(fnAny && typeof fnAny === 'object' && 'family' in fnAny && 'style' in fnAny);
                if (isMixedSize || isMixedFont) {
                    var len = t.characters ? t.characters.length : 0;
                    var norm = function (s) {
                        var l = (s || 'Regular').toLowerCase();
                        if (l.includes('extrabold'))
                            return 'ExtraBold';
                        if (l.includes('semibold'))
                            return 'SemiBold';
                        if (l.includes('black'))
                            return 'Black';
                        if (l.includes('bold'))
                            return 'Bold';
                        if (l.includes('medium'))
                            return 'Medium';
                        if (l.includes('light'))
                            return 'Light';
                        if (l.includes('thin'))
                            return 'Thin';
                        if (l.includes('regular'))
                            return 'Regular';
                        return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : 'Regular';
                    };
                    var i = 0;
                    while (i < len) {
                        var fs = t.getRangeFontSize(i, i + 1);
                        var fnr = t.getRangeFontName(i, i + 1);
                        var j = i + 1;
                        while (j < len) {
                            var fs2 = t.getRangeFontSize(j, j + 1);
                            var fn2 = t.getRangeFontName(j, j + 1);
                            var same = (fs2 === fs) && (fn2 === fnr);
                            if (!same)
                                break;
                            j++;
                        }
                        if (fs !== 'mixed' && fnr !== 'mixed' && fnr && typeof fnr === 'object') {
                            var fam_1 = fnr.family;
                            var weight_1 = norm(fnr.style);
                            var size_1 = typeof fs === 'number' ? fs : 0;
                            if (fam_1)
                                accFamilies.add(String(fam_1));
                            var role_1 = 'body';
                            if (size_1 >= 28)
                                role_1 = 'h1';
                            else if (size_1 >= 22)
                                role_1 = 'h2';
                            else if (size_1 >= 18)
                                role_1 = 'h3';
                            scale.push({ role: role_1, sizePx: Math.round(size_1 || 0), weight: String(weight_1 || 'Regular'), approx: false });
                        }
                        i = j;
                    }
                    // Já tratamos este TEXT com estilos mistos
                    return;
                }
            }
            catch (e) { }
            var fn = t.fontName;
            var fam = (fn && typeof fn === 'object' && !Array.isArray(fn) && 'family' in fn) ? fn.family : null;
            // normaliza weight a partir do style
            var styleStr_1 = (fn && typeof fn === 'object' && !Array.isArray(fn) && 'style' in fn) ? String(fn.style) : 'Regular';
            var weight = (function () {
                var l = styleStr_1.toLowerCase();
                if (l.includes('extrabold'))
                    return 'ExtraBold';
                if (l.includes('semibold'))
                    return 'SemiBold';
                if (l.includes('black'))
                    return 'Black';
                if (l.includes('bold'))
                    return 'Bold';
                if (l.includes('medium'))
                    return 'Medium';
                if (l.includes('light'))
                    return 'Light';
                if (l.includes('thin'))
                    return 'Thin';
                if (l.includes('regular'))
                    return 'Regular';
                return styleStr_1.charAt(0).toUpperCase() + styleStr_1.slice(1);
            })();
            var size = (typeof t.fontSize === 'number') ? t.fontSize : 0;
            if (fam)
                accFamilies.add(String(fam));
            var role = 'body';
            if (size >= 28)
                role = 'h1';
            else if (size >= 22)
                role = 'h2';
            else if (size >= 18)
                role = 'h3';
            scale.push({ role: role, sizePx: Math.round(size || 0), weight: String(weight || 'Regular'), approx: false });
        }
    }
    catch (e) { }
    if ('children' in node) {
        var ch = (node.children || []);
        for (var _i = 0, ch_1 = ch; _i < ch_1.length; _i++) {
            var c = ch_1[_i];
            collectFonts(c, accFamilies, scale);
        }
    }
}
function getAbsXY(n) {
    var m = n.absoluteTransform;
    var tx = Array.isArray(m) && m.length > 0 ? (m[0][2] || 0) : (n.x || 0);
    var ty = Array.isArray(m) && m.length > 1 ? (m[1][2] || 0) : (n.y || 0);
    return { x: tx, y: ty };
}
function boundsRelativeTo(frame, n) {
    var fp = getAbsXY(frame);
    var np = getAbsXY(n);
    var w = n.width || 0;
    var h = n.height || 0;
    var x = np.x - fp.x;
    var y = np.y - fp.y;
    var W = frame.width || 0;
    var H = frame.height || 0;
    var pct = function (v, total) { return total > 0 ? Math.max(0, Math.min(1, v / total)) : 0; };
    return {
        bounds: { xPx: Math.round(x), yPx: Math.round(y), widthPx: Math.round(w), heightPx: Math.round(h), approx: true },
        boundsPct: { x0: pct(x, W), y0: pct(y, H), x1: pct(x + w, W), y1: pct(y + h, H) },
        centerPct: { cx: pct(x + w / 2, W), cy: pct(y + h / 2, H) },
    };
}
function detectType(n) {
    var name = String(n.name || '').toLowerCase();
    if (name.includes('button') || name.includes('btn'))
        return 'button';
    if (n.type === 'TEXT')
        return 'text';
    if (n.type === 'ELLIPSE' || n.type === 'RECTANGLE')
        return 'section';
    if (n.type === 'VECTOR')
        return 'icon';
    if (n.type === 'LINE' || n.type === 'POLYGON' || n.type === 'STAR')
        return 'other';
    if (n.type === 'COMPONENT' || n.type === 'INSTANCE')
        return 'section';
    if (n.type === 'FRAME')
        return 'section';
    return 'other';
}
function detectMedia(n) {
    var mediaType = 'none';
    var background = 'transparent';
    var isPhotograph = false;
    try {
        if ('fills' in n) {
            var fills = n.fills;
            if (Array.isArray(fills) && fills.length) {
                var hasImage = fills.some(function (f) { return (f && f.type === 'IMAGE'); });
                if (hasImage) {
                    mediaType = 'image';
                    background = 'photo';
                    isPhotograph = true;
                }
                else {
                    background = 'solid';
                }
            }
        }
    }
    catch (e) { }
    if (n.type === 'VECTOR')
        mediaType = 'icon';
    return { mediaType: mediaType, style: mediaType === 'icon' ? 'outline' : (isPhotograph ? 'photographic' : 'glyph'), maskShape: 'none', background: background, textureScore: 0.5, edgeSimplicityScore: mediaType === 'icon' ? 0.8 : 0.3, colorCountApprox: mediaType === 'icon' ? 3 : 16, isPhotograph: isPhotograph, confidence: 0.6 };
}
function extractPalette(frame) {
    var bg = [];
    var txt = [];
    var prim = [];
    try {
        if ('fills' in frame) {
            var fills = frame.fills;
            if (Array.isArray(fills)) {
                for (var _i = 0, fills_1 = fills; _i < fills_1.length; _i++) {
                    var p = fills_1[_i];
                    var h = hexFromPaint(p);
                    if (h && bg.indexOf(h) < 0)
                        bg.push(h);
                }
            }
        }
        var nodes = frame.findAll ? frame.findAll(function () { return true; }) : [];
        for (var _a = 0, nodes_1 = nodes; _a < nodes_1.length; _a++) {
            var n = nodes_1[_a];
            if (n.type === 'TEXT' && 'fills' in n) {
                var fills = n.fills;
                if (Array.isArray(fills)) {
                    for (var _b = 0, fills_2 = fills; _b < fills_2.length; _b++) {
                        var p = fills_2[_b];
                        var h = hexFromPaint(p);
                        if (h && txt.indexOf(h) < 0)
                            txt.push(h);
                    }
                }
            }
            if ((n.type === 'RECTANGLE' || n.type === 'ELLIPSE') && 'fills' in n) {
                var fills = n.fills;
                if (Array.isArray(fills)) {
                    for (var _c = 0, fills_3 = fills; _c < fills_3.length; _c++) {
                        var p = fills_3[_c];
                        var h = hexFromPaint(p);
                        if (h && prim.indexOf(h) < 0)
                            prim.push(h);
                    }
                }
            }
            if (bg.length > 2 && txt.length > 2 && prim.length > 1)
                break;
        }
    }
    catch (e) { }
    return { background: bg.slice(0, 2), text: txt.slice(0, 2), primary: prim.slice(0, 1), secondary: [], accent: [], other: [], approx: true };
}
function textStyleOf(t) {
    try {
        var fn = t.fontName;
        var fam = (fn && typeof fn === 'object' && !Array.isArray(fn) && 'family' in fn) ? fn.family : null;
        var weight = (fn && typeof fn === 'object' && !Array.isArray(fn) && 'style' in fn) ? String(fn.style) : 'Regular';
        // (removido weight antigo)
        var sizePx = typeof t.fontSize === 'number' ? Math.round(t.fontSize) : null;
        var lhObj = t.lineHeight;
        var lh = (lhObj && typeof lhObj === 'object' && lhObj.unit === 'PIXELS') ? Math.round(Number(lhObj.value || 0)) : null;
        var lsObj = t.letterSpacing;
        var ls = (lsObj && typeof lsObj === 'object') ? Number(lsObj.value || 0) : null;
        var align = String(t.textAlignHorizontal || '').toLowerCase();
        var decoration = String(t.textDecoration || 'NONE').toLowerCase();
        return { family: fam, weight: weight, sizePx: sizePx, lineHeightPx: lh, letterSpacing: ls, align: align, decoration: decoration };
    }
    catch (e) {
        return { family: null, weight: null, sizePx: null, lineHeightPx: null, letterSpacing: null, align: '', decoration: '' };
    }
}
function buildFigmaSpecFromFrame(frame, nomeLayoutOverride) {
    return __awaiter(this, void 0, void 0, function () {
        var W, H, accFamilies, scale, __typoMap, _i, scale_1, t, key, cur, scaleAgg, headers, texts, sorted, iconMap, all, _a, all_1, n, name_1, key, iconography, comps, all, ro, _b, all_2, n, w, h, typ, label, geo, __parentPad, __p, media, byRO, i, cur, prev, next, device, __canvasPad, __f;
        return __generator(this, function (_c) {
            W = frame.width || 0;
            H = frame.height || 0;
            accFamilies = new Set();
            scale = [];
            collectFonts(frame, accFamilies, scale);
            __typoMap = new Map();
            for (_i = 0, scale_1 = scale; _i < scale_1.length; _i++) {
                t = scale_1[_i];
                key = "".concat(t.role, "|").concat(t.sizePx, "|").concat(t.weight, "|").concat(t.approx);
                cur = __typoMap.get(key);
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
                if (t.approx)
                    cur.approxCount++;
                else
                    cur.exactCount++;
                __typoMap.set(key, cur);
            }
            scaleAgg = Array.from(__typoMap.values());
            headers = [];
            try {
                texts = frame.findAll(function (n) { return n.type === 'TEXT'; });
                sorted = texts.map(function (t) { var fs = (typeof t.fontSize === 'number') ? t.fontSize : 0; return { t: t, sz: fs }; }).sort(function (a, b) { return b.sz - a.sz; }).slice(0, 5);
                headers = sorted.map(function (x) { return String((x.t.characters || '')).slice(0, 120); }).filter(Boolean);
            }
            catch (e) { }
            iconMap = new Map();
            try {
                all = frame.findAll(function () { return true; });
                for (_a = 0, all_1 = all; _a < all_1.length; _a++) {
                    n = all_1[_a];
                    name_1 = String(n.name || '').toLowerCase();
                    if (n.type === 'VECTOR' || name_1.indexOf('icon') >= 0) {
                        key = name_1 || 'icon';
                        iconMap.set(key, (iconMap.get(key) || 0) + 1);
                    }
                }
            }
            catch (e) { }
            iconography = Array.from(iconMap.entries()).slice(0, 12).map(function (p) { return { nameOrMeaning: p[0], style: 'outline', approxSizePx: 20, occurrences: p[1] }; });
            comps = [];
            try {
                all = frame.findAll(function () { return true; });
                ro = 0;
                for (_b = 0, all_2 = all; _b < all_2.length; _b++) {
                    n = all_2[_b];
                    if (n === frame)
                        continue;
                    w = n.width || 0;
                    h = n.height || 0;
                    if (w < 6 || h < 6)
                        continue;
                    typ = detectType(n);
                    label = (n.type === 'TEXT') ? (n.characters || 'sem rotulo') : (String(n.name || 'sem rotulo'));
                    geo = boundsRelativeTo(frame, n);
                    __parentPad = { paddingTopPx: null, paddingRightPx: null, paddingBottomPx: null, paddingLeftPx: null,
                        itemSpacingPx: null, layoutMode: null, primaryAxisAlignItems: null, counterAxisAlignItems: null };
                    try {
                        __p = n.parent;
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
                    }
                    catch (e) { }
                    media = detectMedia(n);
                    comps.push({
                        type: typ,
                        label: String(label || 'sem rotulo'),
                        placeholderOrValue: (n.type === 'TEXT') ? ((n.characters || '—')) : '—',
                        state: ['default'],
                        count: 1,
                        boundsHint: '',
                        colorRefs: { bg: '', fg: '', border: '' },
                        sizeHints: { fontPx: (n.type === 'TEXT') ? Math.round(n.fontSize || 0) : null, iconPx: null },
                        media: detectMedia(n),
                        textStyle: (n.type === 'TEXT') ? textStyleOf(n) : null,
                        bounds: geo.bounds,
                        boundsPct: geo.boundsPct,
                        centerPct: geo.centerPct,
                        anchorHint: 'center',
                        readingOrder: ro++,
                        spacing: { marginTopPx: Math.round(geo.bounds.yPx), marginBottomPx: Math.round((H - (geo.bounds.yPx + geo.bounds.heightPx))), marginLeftPx: Math.round(geo.bounds.xPx), marginRightPx: Math.round((W - (geo.bounds.xPx + geo.bounds.widthPx))), distanceToPrevComponentPx: null, distanceToNextComponentPx: null, approx: false, parent: __parentPad }
                    });
                    if (comps.length >= 300)
                        break;
                }
            }
            catch (e) { }
            // --- Calcula distância vertical entre componentes adjacentes no reading order
            try {
                byRO = comps.slice().sort(function (a, b) { return (a.readingOrder || 0) - (b.readingOrder || 0); });
                for (i = 0; i < byRO.length; i++) {
                    cur = byRO[i], prev = byRO[i - 1], next = byRO[i + 1];
                    if (prev)
                        cur.spacing.distanceToPrevComponentPx = Math.max(0, Math.round(cur.bounds.yPx - (prev.bounds.yPx + prev.bounds.heightPx)));
                    if (next)
                        cur.spacing.distanceToNextComponentPx = Math.max(0, Math.round(next.bounds.yPx - (cur.bounds.yPx + cur.bounds.heightPx)));
                }
            }
            catch (e) { }
            device = 'indefinido';
            if (W >= 1200)
                device = 'desktop';
            else if (W >= 600)
                device = 'tablet';
            else if (W > 0)
                device = 'mobile';
            __canvasPad = {
                paddingTopPx: null,
                paddingRightPx: null,
                paddingBottomPx: null,
                paddingLeftPx: null,
                gapX: null,
                gapY: null,
                itemSpacingPx: null,
                layoutMode: null,
                primaryAxisAlignItems: null,
                counterAxisAlignItems: null
            };
            try {
                __f = frame;
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
                    }
                    else if (__canvasPad.layoutMode === 'VERTICAL') {
                        __canvasPad.gapY = __canvasPad.itemSpacingPx;
                        __canvasPad.gapX = null;
                    }
                    __canvasPad.primaryAxisAlignItems = String(__f.primaryAxisAlignItems || '');
                    __canvasPad.counterAxisAlignItems = String(__f.counterAxisAlignItems || '');
                }
            }
            catch (e) { }
            return [2 /*return*/, {
                    layoutName: String(nomeLayoutOverride || frame.name || 'Untitled').slice(0, 80),
                    canvas: { widthPx: Math.round(W), heightPx: Math.round(H), approx: false, device: device, deviceHeuristic: "desktop >= 1200px, tablet 600–1199px, mobile < 600px", padding: __canvasPad },
                    meta: { contextEcho: null },
                    palette: extractPalette(frame),
                    contrastPairs: [],
                    typography: { families: Array.from(accFamilies), scaleRaw: scale, scale: scaleAgg, totals: { textNodes: frame.findAll(function (n) { return n.type === 'TEXT'; }).length, uniqueCombos: scaleAgg.length } },
                    iconography: iconography,
                    mainText: headers,
                    components: comps
                }];
        });
    });
}
// --- Envia contagem inicial ao abrir o plugin
function contarLayoutsSelecionados() {
    // Se quiser contar só frames/instances, use este filtro:
    var selecionados = figma.currentPage.selection.filter(function (n) {
        return n.type === "FRAME" ||
            n.type === "INSTANCE" ||
            n.type === "COMPONENT" ||
            n.type === "COMPONENT_SET" ||
            n.type === "SECTION";
    });
    return selecionados.length;
}
// Anti-spam (debounce) para eventos de seleção
var __selTimer;
function notificarSelecao() {
    var count = contarLayoutsSelecionados();
    figma.ui.postMessage({ type: "selectionCount", count: count });
}
// Sempre que a seleção mudar, atualiza a UI
figma.on("selectionchange", function () {
    if (__selTimer)
        clearTimeout(__selTimer);
    __selTimer = setTimeout(notificarSelecao, 80);
});
// Logo que abrir, manda a contagem atual
figma.on("currentpagechange", notificarSelecao);
figma.on("run", notificarSelecao);
notificarSelecao();
// Função para criar cards de benchmark no Figma
function createBenchmarkCards(results, node) {
    return __awaiter(this, void 0, void 0, function () {
        var OFFSET_X, currentY, successfulResults, i, result, medal, card, title, badges, providerBadge, providerText, scoreBadge, scoreText, metrics, latencyFrame, latencyLabel, latencyValue, wordsFrame, wordsLabel, wordsValue, responseFrame, responseLabel, responseText, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    // Carregar fontes
                    return [4 /*yield*/, Promise.all([
                            figma.loadFontAsync({ family: "Inter", style: "Regular" }),
                            figma.loadFontAsync({ family: "Inter", style: "Bold" })
                        ])];
                case 1:
                    // Carregar fontes
                    _a.sent();
                    OFFSET_X = 80;
                    currentY = node.y;
                    successfulResults = results.filter(function (r) { return !r.error; }).sort(function (a, b) { return b.evaluation.score - a.evaluation.score; });
                    for (i = 0; i < successfulResults.length; i++) {
                        result = successfulResults[i];
                        medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : "".concat(i + 1, ".");
                        card = figma.createFrame();
                        card.name = "[Bench AI] ".concat(medal, " ").concat(result.model);
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
                        title = figma.createText();
                        title.characters = "".concat(medal, " ").concat(result.model);
                        title.fontName = { family: "Inter", style: "Bold" };
                        title.fontSize = 18;
                        title.fills = [{ type: "SOLID", color: { r: 0.13, g: 0.13, b: 0.13 } }];
                        card.appendChild(title);
                        badges = figma.createFrame();
                        badges.layoutMode = "HORIZONTAL";
                        badges.primaryAxisSizingMode = "AUTO";
                        badges.counterAxisSizingMode = "AUTO";
                        badges.itemSpacing = 8;
                        badges.fills = [];
                        providerBadge = figma.createFrame();
                        providerBadge.layoutMode = "HORIZONTAL";
                        providerBadge.primaryAxisSizingMode = "AUTO";
                        providerBadge.counterAxisSizingMode = "AUTO";
                        providerBadge.paddingLeft = 8;
                        providerBadge.paddingRight = 8;
                        providerBadge.paddingTop = 4;
                        providerBadge.paddingBottom = 4;
                        providerBadge.cornerRadius = 4;
                        providerBadge.fills = [{ type: "SOLID", color: { r: 0.16, g: 0.53, b: 0.84 } }];
                        providerText = figma.createText();
                        providerText.characters = result.provider;
                        providerText.fontName = { family: "Inter", style: "Regular" };
                        providerText.fontSize = 12;
                        providerText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
                        providerBadge.appendChild(providerText);
                        badges.appendChild(providerBadge);
                        scoreBadge = figma.createFrame();
                        scoreBadge.layoutMode = "HORIZONTAL";
                        scoreBadge.primaryAxisSizingMode = "AUTO";
                        scoreBadge.counterAxisSizingMode = "AUTO";
                        scoreBadge.paddingLeft = 8;
                        scoreBadge.paddingRight = 8;
                        scoreBadge.paddingTop = 4;
                        scoreBadge.paddingBottom = 4;
                        scoreBadge.cornerRadius = 4;
                        scoreBadge.fills = [{ type: "SOLID", color: { r: 0.16, g: 0.69, b: 0.36 } }];
                        scoreText = figma.createText();
                        scoreText.characters = "".concat(result.evaluation.score, "/100");
                        scoreText.fontName = { family: "Inter", style: "Bold" };
                        scoreText.fontSize = 12;
                        scoreText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
                        scoreBadge.appendChild(scoreText);
                        badges.appendChild(scoreBadge);
                        card.appendChild(badges);
                        metrics = figma.createFrame();
                        metrics.layoutMode = "HORIZONTAL";
                        metrics.primaryAxisSizingMode = "FIXED";
                        metrics.counterAxisSizingMode = "AUTO";
                        metrics.itemSpacing = 16;
                        metrics.fills = [];
                        latencyFrame = figma.createFrame();
                        latencyFrame.layoutMode = "VERTICAL";
                        latencyFrame.primaryAxisSizingMode = "AUTO";
                        latencyFrame.counterAxisSizingMode = "AUTO";
                        latencyFrame.fills = [];
                        latencyLabel = figma.createText();
                        latencyLabel.characters = "⚡ Latência";
                        latencyLabel.fontName = { family: "Inter", style: "Regular" };
                        latencyLabel.fontSize = 12;
                        latencyLabel.fills = [{ type: "SOLID", color: { r: 0.42, g: 0.45, b: 0.5 } }];
                        latencyFrame.appendChild(latencyLabel);
                        latencyValue = figma.createText();
                        latencyValue.characters = "".concat(result.latency, "ms");
                        latencyValue.fontName = { family: "Inter", style: "Bold" };
                        latencyValue.fontSize = 14;
                        latencyValue.fills = [{ type: "SOLID", color: { r: 0.13, g: 0.13, b: 0.13 } }];
                        latencyFrame.appendChild(latencyValue);
                        metrics.appendChild(latencyFrame);
                        wordsFrame = figma.createFrame();
                        wordsFrame.layoutMode = "VERTICAL";
                        wordsFrame.primaryAxisSizingMode = "AUTO";
                        wordsFrame.counterAxisSizingMode = "AUTO";
                        wordsFrame.fills = [];
                        wordsLabel = figma.createText();
                        wordsLabel.characters = "📝 Palavras";
                        wordsLabel.fontName = { family: "Inter", style: "Regular" };
                        wordsLabel.fontSize = 12;
                        wordsLabel.fills = [{ type: "SOLID", color: { r: 0.42, g: 0.45, b: 0.5 } }];
                        wordsFrame.appendChild(wordsLabel);
                        wordsValue = figma.createText();
                        wordsValue.characters = "".concat(result.evaluation.wordCount);
                        wordsValue.fontName = { family: "Inter", style: "Bold" };
                        wordsValue.fontSize = 14;
                        wordsValue.fills = [{ type: "SOLID", color: { r: 0.13, g: 0.13, b: 0.13 } }];
                        wordsFrame.appendChild(wordsValue);
                        metrics.appendChild(wordsFrame);
                        card.appendChild(metrics);
                        responseFrame = figma.createFrame();
                        responseFrame.layoutMode = "VERTICAL";
                        responseFrame.primaryAxisSizingMode = "AUTO";
                        responseFrame.counterAxisSizingMode = "AUTO";
                        responseFrame.fills = [];
                        responseLabel = figma.createText();
                        responseLabel.characters = "📄 Análise:";
                        responseLabel.fontName = { family: "Inter", style: "Bold" };
                        responseLabel.fontSize = 14;
                        responseLabel.fills = [{ type: "SOLID", color: { r: 0.13, g: 0.13, b: 0.13 } }];
                        responseFrame.appendChild(responseLabel);
                        responseText = figma.createText();
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
                    figma.notify("\u2705 ".concat(successfulResults.length, " cards de benchmark criados!"), { timeout: 2000 });
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    console.error("Erro ao criar cards de benchmark:", error_1);
                    figma.notify("❌ Erro ao criar cards de benchmark", { timeout: 2000 });
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// removePrefix: limpa rótulos redundantes ("Descrição:", "Justificativa:", "Referências:")
function removePrefix(text) {
    if (typeof text !== 'string')
        return text;
    return text
        .replace(/^Descrição:\s*/i, "")
        .replace(/^Justificativa:\s*/i, "")
        .replace(/^Refer(ê|e)ncias?:\s*/i, "")
        .trim();
}
// Mapeia severidades (alto/médio/baixo/positiva) para cores, chips e gauge
// ====== SEVERIDADE: cores, labels e gauges ======
var SEVERITY_COLORS = {
    baixo: "#01CE34",
    medio: "#FECA2A",
    alto: "#F50000",
    positivo: "#23D2EF",
};
// /SVG do gauge (cole exatamente como recebeu)
var gaugeBaixo = "<svg width=\"240\" height=\"122\" viewBox=\"0 0 240 122\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path d=\"M120 9.5C133.198 9.5 146.267 12.0998 158.46 17.1504C170.653 22.201 181.732 29.6033 191.064 38.9355C200.397 48.2678 207.799 59.347 212.85 71.54C217.644 83.1139 220.229 95.477 220.479 107.99C220.507 109.381 219.378 110.5 218 110.5H192C190.616 110.5 189.511 109.38 189.472 108.015C189.23 99.5647 187.449 91.2235 184.21 83.4033C180.717 74.9712 175.597 67.3101 169.144 60.8564C162.69 54.4028 155.029 49.2827 146.597 45.79C138.165 42.2973 129.127 40.5 120 40.5C110.873 40.5 101.835 42.2973 93.4033 45.79C84.9712 49.2827 77.3101 54.4028 70.8564 60.8564C64.4028 67.3101 59.2827 74.9712 55.79 83.4033C52.5508 91.2235 50.7698 99.5647 50.5283 108.015C50.4892 109.38 49.3842 110.5 48 110.5H22C20.622 110.5 19.4928 109.381 19.5205 107.99C19.7708 95.477 22.3563 83.1139 27.1504 71.54C32.201 59.347 39.6033 48.2677 48.9355 38.9355C58.2677 29.6033 69.3469 22.201 81.54 17.1504C93.7333 12.0998 106.802 9.5 120 9.5Z\" fill=\"#01CE34\" fill-opacity=\"0.4\" stroke=\"#03B22E\"/>\n<path d=\"M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3488 33.387 60.0182C41.6568 45.6876 53.3449 33.6467 67.3891 24.9583C68.7981 24.0867 70.6358 24.5814 71.4648 26.0159L83.4735 46.7955C84.3026 48.23 83.8077 50.0596 82.41 50.9493C72.9182 56.9914 65.0095 65.2418 59.3709 75.0127C53.7323 84.7837 50.5463 95.7594 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z\" fill=\"#01CE34\"/>\n<path d=\"M126.711 107.118C130.368 103.429 130.387 97.518 126.754 93.9157C123.121 90.3134 117.21 90.3839 113.553 94.0731C109.895 97.7623 109.876 103.673 113.509 107.275C117.143 110.878 123.053 110.807 126.711 107.118Z\" fill=\"#5C5C5C\"/>\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M111.935 81.5528L97.1815 77.8427L101.019 92.5635C97.712 100.214 99.1496 109.365 105.346 115.509C113.458 123.551 126.654 123.394 134.819 115.157C142.985 106.921 143.029 93.7247 134.917 85.6824C128.72 79.5388 119.556 78.1802 111.935 81.5528ZM131.606 111.972C137.986 105.537 138.02 95.2277 131.682 88.9447C125.345 82.6616 115.036 82.7845 108.657 89.2191C102.277 95.6537 102.243 105.963 108.581 112.246C114.918 118.529 125.227 118.407 131.606 111.972Z\" fill=\"#5C5C5C\"/>\n</svg>\n";
var gaugeMedio = "<svg width=\"240\" height=\"122\" viewBox=\"0 0 240 122\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path d=\"M120 9.5C133.198 9.5 146.267 12.0998 158.46 17.1504C170.653 22.201 181.732 29.6033 191.064 38.9355C200.397 48.2678 207.799 59.347 212.85 71.54C217.644 83.1139 220.229 95.477 220.479 107.99C220.507 109.381 219.378 110.5 218 110.5H192C190.616 110.5 189.511 109.38 189.472 108.015C189.23 99.5647 187.449 91.2235 184.21 83.4033C180.717 74.9712 175.597 67.3101 169.144 60.8564C162.69 54.4028 155.029 49.2827 146.597 45.79C138.165 42.2973 129.127 40.5 120 40.5C110.873 40.5 101.835 42.2973 93.4033 45.79C84.9712 49.2827 77.3101 54.4028 70.8564 60.8564C64.4028 67.3101 59.2827 74.9712 55.79 83.4033C52.5508 91.2235 50.7698 99.5647 50.5283 108.015C50.4892 109.38 49.3842 110.5 48 110.5H22C20.622 110.5 19.4928 109.381 19.5205 107.99C19.7708 95.477 22.3563 83.1139 27.1504 71.54C32.201 59.347 39.6033 48.2677 48.9355 38.9355C58.2677 29.6033 69.3469 22.201 81.54 17.1504C93.7333 12.0998 106.802 9.5 120 9.5Z\" fill=\"#FECA2A\" fill-opacity=\"0.4\" stroke=\"#DDAF24\"/>\n<path d=\"M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3487 33.387 60.0181C42.1571 44.8205 54.7716 32.198 69.9637 23.4184C85.1558 14.6388 102.391 10.011 119.937 10C136.483 9.98963 152.756 14.0845 167.306 21.8969C168.766 22.6807 169.257 24.5194 168.43 25.955L156.447 46.7496C155.62 48.1852 153.788 48.6721 152.318 47.9072C142.338 42.7123 131.237 39.9929 119.956 40C107.673 40.0077 95.6091 43.2471 84.9746 49.3929C74.3402 55.5386 65.51 64.3744 59.3709 75.0127C53.7323 84.7837 50.5463 95.7593 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z\" fill=\"#FECA2A\"/>\n<path d=\"M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3488 33.387 60.0182C41.6568 45.6876 53.3449 33.6467 67.3891 24.9583C68.7981 24.0867 70.6358 24.5814 71.4648 26.0159L83.4735 46.7955C84.3026 48.23 83.8077 50.0596 82.41 50.9493C72.9182 56.9914 65.0095 65.2418 59.3709 75.0127C53.7323 84.7837 50.5463 95.7594 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z\" fill=\"#FECA2A\"/>\n<path d=\"M114.861 108.196C119.235 111 125.018 109.781 127.78 105.474C130.541 101.166 129.234 95.4017 124.861 92.598C120.487 89.7944 114.704 91.0134 111.942 95.3208C109.181 99.6282 110.488 105.393 114.861 108.196Z\" fill=\"#5C5C5C\"/>\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M136.765 88.3938L137.302 73.1906L123.712 80.0261C115.538 78.3951 106.891 81.7176 102.182 89.0638C96.0171 98.6803 98.9347 111.55 108.699 117.809C118.463 124.069 131.375 121.347 137.54 111.731C142.25 104.385 141.659 95.1398 136.765 88.3938ZM111.14 114.001C118.769 118.891 128.857 116.764 133.673 109.252C138.489 101.739 136.21 91.684 128.582 86.7939C120.954 81.9039 110.865 84.0301 106.049 91.543C101.233 99.0559 103.512 109.11 111.14 114.001Z\" fill=\"#5C5C5C\"/>\n</svg>\n";
var gaugeAlto = "<svg width=\"240\" height=\"122\" viewBox=\"0 0 240 122\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path d=\"M120 9.5C133.198 9.5 146.267 12.0998 158.46 17.1504C170.653 22.201 181.732 29.6033 191.064 38.9355C200.397 48.2678 207.799 59.347 212.85 71.54C217.644 83.1139 220.229 95.477 220.479 107.99C220.507 109.381 219.378 110.5 218 110.5H192C190.616 110.5 189.511 109.38 189.472 108.015C189.23 99.5647 187.449 91.2235 184.21 83.4033C180.717 74.9712 175.597 67.3101 169.144 60.8564C162.69 54.4028 155.029 49.2827 146.597 45.79C138.165 42.2973 129.127 40.5 120 40.5C110.873 40.5 101.835 42.2973 93.4033 45.79C84.9712 49.2827 77.3101 54.4028 70.8564 60.8564C64.4028 67.3101 59.2827 74.9712 55.79 83.4033C52.5508 91.2235 50.7698 99.5647 50.5283 108.015C50.4892 109.38 49.3842 110.5 48 110.5H22C20.622 110.5 19.4928 109.381 19.5205 107.99C19.7708 95.477 22.3563 83.1139 27.1504 71.54C32.201 59.347 39.6033 48.2677 48.9355 38.9355C58.2677 29.6033 69.3469 22.201 81.54 17.1504C93.7333 12.0998 106.802 9.5 120 9.5Z\" fill=\"#F50000\" fill-opacity=\"0.4\" stroke=\"#B20101\"/>\n<path d=\"M23 110C21.3431 110 19.9953 108.656 20.045 107C20.4084 94.891 22.9695 82.9396 27.6121 71.7316C32.6375 59.5991 40.0035 48.5752 49.2893 39.2893C58.5752 30.0035 69.5991 22.6375 81.7317 17.612C93.8642 12.5866 106.868 10 120 10C133.132 10 146.136 12.5866 158.268 17.6121C170.401 22.6375 181.425 30.0035 190.711 39.2893C199.997 48.5752 207.362 59.5991 212.388 71.7317C217.03 82.9397 219.592 94.891 219.955 107C220.005 108.656 218.657 110 217 110H193C191.343 110 190.007 108.656 189.936 107.001C189.585 98.8323 187.806 90.7802 184.672 83.2122C181.154 74.7194 175.998 67.0026 169.497 60.5025C162.997 54.0024 155.281 48.8463 146.788 45.3284C138.295 41.8106 129.193 40 120 40C110.807 40 101.705 41.8106 93.2122 45.3284C84.7194 48.8463 77.0026 54.0024 70.5025 60.5025C64.0024 67.0026 58.8463 74.7194 55.3284 83.2122C52.1937 90.7801 50.4146 98.8323 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z\" fill=\"#F50000\"/>\n<path d=\"M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3487 33.387 60.0181C42.1571 44.8205 54.7716 32.198 69.9637 23.4184C85.1558 14.6388 102.391 10.011 119.937 10C136.483 9.98963 152.756 14.0845 167.306 21.8969C168.766 22.6807 169.257 24.5194 168.43 25.955L156.447 46.7496C155.62 48.1852 153.788 48.6721 152.318 47.9072C142.338 42.7123 131.237 39.9929 119.956 40C107.673 40.0077 95.6091 43.2471 84.9746 49.3929C74.3402 55.5386 65.51 64.3744 59.3709 75.0127C53.7323 84.7837 50.5463 95.7593 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z\" fill=\"#F50000\"/>\n<path d=\"M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3488 33.387 60.0182C41.6568 45.6876 53.3449 33.6467 67.3891 24.9583C68.7981 24.0867 70.6358 24.5814 71.4648 26.0159L83.4735 46.7955C84.3026 48.23 83.8077 50.0596 82.41 50.9493C72.9182 56.9914 65.0095 65.2418 59.3709 75.0127C53.7323 84.7837 50.5463 95.7594 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z\" fill=\"#F50000\"/>\n<path d=\"M110.919 100.433C110.896 105.628 115.026 109.858 120.142 109.88C125.258 109.903 129.425 105.71 129.448 100.515C129.47 95.3203 125.341 91.0907 120.225 91.0682C115.108 91.0456 110.942 95.2386 110.919 100.433Z\" fill=\"#5C5C5C\"/>\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M139.377 108.311L152.5 100.617L139.445 92.8067C136.442 85.0325 129.002 79.513 120.276 79.4745C108.853 79.4242 99.5519 88.7853 99.5007 100.383C99.4496 111.981 108.668 121.424 120.091 121.474C128.817 121.513 136.305 116.059 139.377 108.311ZM104.025 100.403C103.985 109.464 111.187 116.841 120.111 116.88C129.035 116.92 136.302 109.606 136.342 100.546C136.382 91.4847 129.18 84.1076 120.256 84.0682C111.332 84.0289 104.065 91.3423 104.025 100.403Z\" fill=\"#5C5C5C\"/>\n</svg>\n";
var gaugePositivo = " <svg width=\"240\" height=\"121\" viewBox=\"0 0 240 121\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n<path d=\"M120 9.5C133.198 9.5 146.267 12.0998 158.46 17.1504C170.653 22.201 181.732 29.6033 191.064 38.9355C200.397 48.2677 207.799 59.3469 212.85 71.54C217.644 83.1139 220.229 95.477 220.479 107.99C220.507 109.381 219.378 110.5 218 110.5H192C190.616 110.5 189.511 109.38 189.472 108.015C189.23 99.5647 187.449 91.2235 184.21 83.4033C180.717 74.9712 175.597 67.3101 169.144 60.8564C162.69 54.4028 155.029 49.2827 146.597 45.79C138.165 42.2973 129.127 40.5 120 40.5C110.873 40.5 101.835 42.2973 93.4033 45.79C84.9712 49.2827 77.3101 54.4028 70.8564 60.8564C64.4028 67.3101 59.2827 74.9712 55.79 83.4033C52.5508 91.2235 50.7698 99.5647 50.5283 108.015C50.4892 109.38 49.3842 110.5 48 110.5H22C20.622 110.5 19.4928 109.381 19.5205 107.99C19.7708 95.477 22.3563 83.1139 27.1504 71.54C32.201 59.347 39.6033 48.2677 48.9355 38.9355C58.2677 29.6033 69.3469 22.201 81.54 17.1504C93.7333 12.0998 106.802 9.5 120 9.5Z\" fill=\"#23D2EF\" fill-opacity=\"0.4\" stroke=\"#23D2EF\"/>\n<path d=\"M129.581 100C129.581 94.8051 125.434 90.5937 120.317 90.5937C115.201 90.5937 111.053 94.8051 111.053 100C111.053 105.195 115.201 109.406 120.317 109.406C125.434 109.406 129.581 105.195 129.581 100Z\" fill=\"#5C5C5C\"/>\n<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M101.089 92.2476L88 100L101.089 107.752C104.127 115.513 111.591 121 120.317 121C131.74 121 141 111.598 141 100C141 88.402 131.74 79 120.317 79C111.591 79 104.127 84.4867 101.089 92.2476ZM136.476 100C136.476 90.9391 129.241 83.5937 120.317 83.5937C111.393 83.5937 104.159 90.9391 104.159 100C104.159 109.061 111.393 116.406 120.317 116.406C129.241 116.406 136.476 109.061 136.476 100Z\" fill=\"#5C5C5C\"/>\n</svg>\n";
function hexToPaint(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
    return [{ type: 'SOLID', color: { r: r, g: g, b: b } }];
}
// makeSeverityChip: cria o selo (chip) visual da severidade —
// a severidade NÃO é renderizada em texto no corpo, apenas no chip/gauge
// [HELPER] makeSeverityChip: chip de severidade com label e cor (Baixa/Média/Alta/Positivo).
function makeSeverityChip(meta) {
    return __awaiter(this, void 0, void 0, function () {
        var chip, txt;
        return __generator(this, function (_a) {
            chip = figma.createFrame();
            chip.name = "Tag/Severidade";
            chip.layoutMode = "HORIZONTAL";
            chip.primaryAxisSizingMode = "AUTO";
            chip.counterAxisSizingMode = "AUTO";
            chip.paddingLeft = 12;
            chip.paddingRight = 12;
            chip.paddingTop = 6;
            chip.paddingBottom = 6;
            chip.cornerRadius = 999;
            chip.itemSpacing = 8;
            chip.fills = hexToPaint(meta.color);
            chip.strokes = [];
            txt = figma.createText();
            txt.characters = removePrefix(meta.label);
            txt.fontSize = 14;
            txt.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
            chip.appendChild(txt);
            return [2 /*return*/, chip];
        });
    });
}
// runtime type-guard: checa se o node tem 'opacity'
function hasOpacity(n) {
    return n && typeof n.opacity === "number";
}
// tween seguro: só usa 'opacity' quando disponível
function tweenOpacitySafe(node, from, to, duration, onDone) {
    if (duration === void 0) { duration = 180; }
    if (!hasOpacity(node)) { // fallback sem animação
        try {
            node.visible = to > 0;
        }
        catch (e) { }
        if (onDone)
            onDone();
        return;
    }
    var steps = 10;
    var dt = Math.max(10, Math.round(duration / steps));
    var i = 0;
    function step() {
        i++;
        var t = i / steps;
        node.opacity = from + (to - from) * t;
        if (i < steps)
            setTimeout(step, dt);
        else {
            node.opacity = to;
            if (onDone)
                onDone();
        }
    }
    node.opacity = from;
    setTimeout(step, 0);
}
// [UI] Mensagens vindas da interface do plugin (botões/inputs). Inicia fluxo de análise.
figma.ui.onmessage = function (msg) { return __awaiter(_this, void 0, void 0, function () {
    function isFrameLike(n) {
        return n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE" || n.type === "SECTION";
    }
    function frameLooksLikeScreenshot(frame) {
        try {
            var hasText = !!frame.findOne(function (n) { return n.type === 'TEXT'; });
            var hasImg = !!frame.findOne(function (n) { return ('fills' in n) && Array.isArray(n.fills) && n.fills.some(function (f) { return f && f.type === 'IMAGE'; }); });
            return (!hasText && hasImg);
        }
        catch (e) {
            return false;
        }
    }
    function extrairSeveridade(p) {
        var m = p.match(/\n?\s*7\s*[-–—]?\s*(?:Severidade\s*:)?\s*([^\n]+)/i);
        return m ? m[1].trim().toLowerCase() : "";
    }
    function rankSeveridade(s) {
        var t = (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (/alto|alta|critica|crítica|critico|crítico/.test(t))
            return 0; // mais crítico primeiro
        if (/medio|médio|moderad[oa]|media|média/.test(t))
            return 1;
        if (/baixo|baixa|leve/.test(t))
            return 2;
        if (/positiv/.test(t))
            return 3; // positivos por último
        return 2; // default ~ baixo
    }
    var n, cards, allVisible, visible, nodes, count, _loop_1, i_1, nodes, removed, i, categoria, testType, selection_1, firstNode, figmaSpec, response, data, e_1, metodo, descricao, selection, orderedSelection, delay, imagensBase64, figmaSpecs, layoutNameFromFigma, n, i_2, node, spec, bytes, b64, e_2, response, data, blocos, primeiraResposta, jsonMatch, jsonData, e_3, semiBoldAvailable, e_4, layoutsPayload, node, OFFSET_X, currentY, todasPartes, i_3, blocoOriginal, partes, MAX_POSITIVE_CARDS, partesNegativas, partesPositivas, partesOrdenadas, cardsPayload, _loop_2, _i, partesOrdenadas_1, parte, nodeName, e_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (msg.type === "focusNode" && msg.nodeId) {
                    n = figma.getNodeById(msg.nodeId);
                    if (n)
                        figma.viewport.scrollAndZoomIntoView([n]);
                }
                // ↕ verificar estado de visibilidade dos cards "[AI]" na página atual
                if (msg.type === "getCardsVisibilityState") {
                    try {
                        cards = figma.currentPage.findAll(function (n) {
                            return typeof n.name === "string" && n.name.trim().startsWith("[AI]");
                        });
                        if (cards.length === 0) {
                            figma.ui.postMessage({ type: "cardsVisibilityState", allVisible: true, count: 0 });
                            return [2 /*return*/];
                        }
                        allVisible = cards.every(function (card) { return card.visible; });
                        figma.ui.postMessage({ type: "cardsVisibilityState", allVisible: allVisible, count: cards.length });
                    }
                    catch (e) {
                        figma.ui.postMessage({ type: "cardsVisibilityState", allVisible: true, count: 0 });
                    }
                    return [2 /*return*/];
                }
                // --- TOGGLE VISIBILIDADE COM FADE QUANDO POSSÍVEL ---
                if (msg && msg.type === "setHeuristicaVisibility") {
                    visible = !!msg.visible;
                    nodes = figma.currentPage.findAll(function (n) {
                        return typeof n.name === "string" &&
                            n.name.indexOf("[AI]") === 0;
                    });
                    count = 0;
                    _loop_1 = function (i_1) {
                        var n = nodes[i_1];
                        try {
                            if (visible) {
                                // mostrar com fade-in (se suportar)
                                var saved = parseFloat(n.getPluginData("origOpacity") || "");
                                var target = isFinite(saved) ? Math.min(Math.max(saved, 0), 1) : 1;
                                n.visible = true;
                                tweenOpacitySafe(n, hasOpacity(n) ? 0 : 1, target, 180);
                            }
                            else {
                                // esconder com fade-out (se suportar)
                                if (!n.getPluginData("origOpacity") && hasOpacity(n)) {
                                    n.setPluginData("origOpacity", String(n.opacity));
                                }
                                var from = hasOpacity(n) ? n.opacity : 1;
                                tweenOpacitySafe(n, from, 0, 180, function () {
                                    try {
                                        n.visible = false;
                                    }
                                    catch (e) { }
                                });
                            }
                            count++;
                        }
                        catch (e) { }
                    };
                    for (i_1 = 0; i_1 < nodes.length; i_1++) {
                        _loop_1(i_1);
                    }
                    figma.notify(count
                        ? "".concat(count, " card(s) ").concat(visible ? "aparecendo" : "sumindo")
                        : "Nenhum card [AI] nesta página", { timeout: 1200 });
                    return [2 /*return*/];
                }
                // --- APAGAR TODOS OS CARDS "[AI]" (página atual) ---
                if (msg && msg.type === "deleteAllHeuristicaCards") {
                    nodes = figma.currentPage.findAll(function (n) {
                        return typeof n.name === "string" && n.name.trim().startsWith("[AI]");
                    });
                    removed = 0;
                    for (i = 0; i < nodes.length; i++) {
                        try {
                            nodes[i].remove();
                            removed++;
                        }
                        catch (e) { }
                    }
                    // atualiza UI e dá feedback
                    figma.ui.postMessage({ type: "cardsCount", count: 0 });
                    figma.notify(removed ? ("Removidos " + removed + " card(s) de análise.") : "Nenhum card [AI] nesta página", { timeout: 1500 });
                    return [2 /*return*/];
                }
                if (!(msg && msg.type === "benchmark-multi-ai")) return [3 /*break*/, 12];
                categoria = msg.categoria || "free";
                testType = msg.testType || "layout-analysis";
                selection_1 = figma.currentPage.selection;
                if (!selection_1.length) {
                    figma.ui.postMessage({
                        carregando: false,
                        resultado: "⚠️ Selecione ao menos um frame para benchmark."
                    });
                    return [2 /*return*/];
                }
                figma.ui.postMessage({ carregando: true });
                _a.label = 1;
            case 1:
                _a.trys.push([1, 10, , 11]);
                firstNode = selection_1[0];
                figmaSpec = null;
                if (!(firstNode.type === "FRAME" || firstNode.type === "COMPONENT" || firstNode.type === "INSTANCE" || firstNode.type === "SECTION")) return [3 /*break*/, 3];
                return [4 /*yield*/, buildFigmaSpecFromFrame(firstNode)];
            case 2:
                figmaSpec = _a.sent();
                _a.label = 3;
            case 3: return [4 /*yield*/, fetch("http://localhost:3000/benchmark-multi-ai", {
                    // PRODUÇÃO: const response = await fetch("https://api.uxday.com.br/benchmark-multi-ai", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        figmaSpecs: figmaSpec ? [figmaSpec] : [],
                        categoria: categoria,
                        testType: testType
                    })
                })];
            case 4:
                response = _a.sent();
                return [4 /*yield*/, response.json()];
            case 5:
                data = _a.sent();
                if (!data.success) return [3 /*break*/, 8];
                figma.ui.postMessage({
                    carregando: false,
                    benchmarkResults: data,
                    tipo: "benchmark-multi-ai"
                });
                if (!(data.results && data.results.length > 0)) return [3 /*break*/, 7];
                return [4 /*yield*/, createBenchmarkCards(data.results, firstNode)];
            case 6:
                _a.sent();
                _a.label = 7;
            case 7: return [3 /*break*/, 9];
            case 8:
                figma.ui.postMessage({
                    carregando: false,
                    resultado: "\u274C Erro no benchmark: ".concat(data.error || 'Erro desconhecido')
                });
                _a.label = 9;
            case 9: return [3 /*break*/, 11];
            case 10:
                e_1 = _a.sent();
                console.error("Erro no benchmark:", e_1);
                figma.ui.postMessage({
                    carregando: false,
                    resultado: "❌ Erro no benchmark multi-IA."
                });
                return [3 /*break*/, 11];
            case 11: return [2 /*return*/];
            case 12:
                if (!msg || msg.type !== "analisar")
                    return [2 /*return*/];
                metodo = msg.metodo || "";
                descricao = msg.descricao || "";
                selection = figma.currentPage.selection;
                if (!selection.length) {
                    figma.ui.postMessage({
                        carregando: false,
                        resultado: "⚠️ Selecione ao menos um frame para análise."
                    });
                    return [2 /*return*/];
                }
                orderedSelection = selection
                    .slice()
                    .sort(function (a, b) { return a.x - b.x; });
                delay = function (ms) { return new Promise(function (r) { return setTimeout(r, ms); }); };
                imagensBase64 = [];
                figmaSpecs = [];
                if (orderedSelection.length === 1) {
                    n = orderedSelection[0];
                    layoutNameFromFigma = String((n && n.name) || "Untitled").trim() || undefined;
                }
                i_2 = 0;
                _a.label = 13;
            case 13:
                if (!(i_2 < orderedSelection.length)) return [3 /*break*/, 24];
                node = orderedSelection[i_2];
                if (!(isFrameLike(node) && !frameLooksLikeScreenshot(node))) return [3 /*break*/, 15];
                return [4 /*yield*/, buildFigmaSpecFromFrame(node, orderedSelection.length === 1 ? layoutNameFromFigma : undefined)];
            case 14:
                spec = _a.sent();
                if (descricao && String(descricao).trim()) {
                    spec.meta = spec.meta || {};
                    spec.meta.source = "figma";
                    spec.meta.contextUser = String(descricao).trim();
                }
                figmaSpecs.push(spec);
                return [3 /*break*/, 21];
            case 15:
                if (!("exportAsync" in node)) return [3 /*break*/, 20];
                _a.label = 16;
            case 16:
                _a.trys.push([16, 18, , 19]);
                return [4 /*yield*/, node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } })];
            case 17:
                bytes = _a.sent();
                b64 = uint8ToBase64(bytes);
                imagensBase64.push("data:image/png;base64," + b64);
                return [3 /*break*/, 19];
            case 18:
                e_2 = _a.sent();
                imagensBase64.push(null);
                return [3 /*break*/, 19];
            case 19: return [3 /*break*/, 21];
            case 20:
                imagensBase64.push(null);
                _a.label = 21;
            case 21: return [4 /*yield*/, delay(120)];
            case 22:
                _a.sent();
                _a.label = 23;
            case 23:
                i_2++;
                return [3 /*break*/, 13];
            case 24:
                figma.ui.postMessage({ carregando: true });
                figma.ui.postMessage({ carregando: true });
                _a.label = 25;
            case 25:
                _a.trys.push([25, 36, , 37]);
                return [4 /*yield*/, fetch(API_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            imagens: imagensBase64.filter(Boolean),
                            figmaSpecs: figmaSpecs,
                            metodo: metodo,
                            descricao: descricao,
                            nomeLayout: layoutNameFromFigma
                        })
                    })];
            case 26:
                response = _a.sent();
                return [4 /*yield*/, response.json()];
            case 27:
                data = _a.sent();
                blocos = [];
                if (data && Array.isArray(data.respostas)) {
                    primeiraResposta = data.respostas[0];
                    if (typeof primeiraResposta === 'string' && primeiraResposta.includes('```json')) {
                        try {
                            jsonMatch = primeiraResposta.match(/```json\n([\s\S]*?)\n```/);
                            if (jsonMatch) {
                                jsonData = JSON.parse(jsonMatch[1]);
                                if (jsonData.achados && Array.isArray(jsonData.achados)) {
                                    // Converter cada achado para formato esperado pelo parser
                                    blocos = jsonData.achados.map(function (achado) {
                                        return "1 - ".concat(achado.constatacao_hipotese || 'Constatação', "\n2 - ").concat(achado.titulo_card || 'Sem título', "\n3 - ").concat(achado.heuristica_metodo || '', "\n4 - ").concat(achado.descricao || '', "\n5 - ").concat(achado.sugestao_melhoria || '', "\n6 - ").concat(achado.justificativa || '', "\n7 - ").concat(achado.severidade || 'médio', "\n8 - ").concat(Array.isArray(achado.referencias) ? achado.referencias.join(', ') : achado.referencias || '');
                                    });
                                }
                                else {
                                    blocos = data.respostas;
                                }
                            }
                            else {
                                blocos = data.respostas;
                            }
                        }
                        catch (e) {
                            console.error("❌ [DEBUG] Erro ao processar JSON:", e);
                            blocos = data.respostas;
                        }
                    }
                    else {
                        blocos = data.respostas;
                    }
                }
                else {
                    console.error("❌ [DEBUG] Erro: respostas não é um array ou está vazio");
                }
                // 🔧 anti-split: une "Sem título" + próximo que começa com "Hipótese Título do Card:"
                if (blocos.length >= 2 && /^Sem título/i.test(blocos[0]) && /^Hipótese Título do Card:/i.test(blocos[1])) {
                    blocos[0] = blocos[0] + "\n\n" + blocos[1];
                    blocos.splice(1, 1);
                }
                _a.label = 28;
            case 28:
                _a.trys.push([28, 30, , 31]);
                return [4 /*yield*/, Promise.all([
                        figma.loadFontAsync({ family: "Inter", style: "Regular" }),
                        figma.loadFontAsync({ family: "Inter", style: "Bold" }),
                        figma.loadFontAsync({ family: "Inter", style: "Italic" })
                    ])];
            case 29:
                _a.sent();
                return [3 /*break*/, 31];
            case 30:
                e_3 = _a.sent();
                console.warn("Alguma fonte não foi carregada:", e_3);
                return [3 /*break*/, 31];
            case 31:
                semiBoldAvailable = false;
                _a.label = 32;
            case 32:
                _a.trys.push([32, 34, , 35]);
                return [4 /*yield*/, figma.loadFontAsync({ family: "Inter", style: "SemiBold" })];
            case 33:
                _a.sent();
                semiBoldAvailable = true;
                return [3 /*break*/, 35];
            case 34:
                e_4 = _a.sent();
                console.warn("Inter SemiBold não disponível, usando Bold como fallback:", e_4);
                return [3 /*break*/, 35];
            case 35:
                layoutsPayload = [];
                node = orderedSelection[0];
                OFFSET_X = 80;
                currentY = node.y;
                todasPartes = [];
                for (i_3 = 0; i_3 < blocos.length; i_3++) {
                    blocoOriginal = blocos[i_3] || "";
                    partes = blocoOriginal.split("[[[FIM_HEURISTICA]]]").map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 0; });
                    // Fallback para marcador antigo [[FIM_HEURISTICA]]
                    if (partes.length === 0 && blocoOriginal.includes("[[FIM_HEURISTICA]]")) {
                        partes.push(blocoOriginal.split("[[FIM_HEURISTICA]]")[0].trim());
                    }
                    todasPartes.push.apply(todasPartes, partes);
                }
                MAX_POSITIVE_CARDS = 1;
                partesNegativas = todasPartes
                    .filter(function (p) { return !/positiv/i.test(extrairSeveridade(p)); })
                    .sort(function (a, b) { return rankSeveridade(extrairSeveridade(a)) - rankSeveridade(extrairSeveridade(b)); });
                partesPositivas = todasPartes
                    .filter(function (p) { return /positiv/i.test(extrairSeveridade(p)); })
                    .slice(0, MAX_POSITIVE_CARDS);
                partesOrdenadas = __spreadArray(__spreadArray([], partesNegativas, true), partesPositivas, true);
                cardsPayload = [];
                try {
                    _loop_2 = function (parte) {
                        // Quebra o bloco em linhas e remove espaços
                        var parteSan = parte;
                        var linhas = parteSan
                            .split("\n")
                            .map(function (l) { return l.trim(); })
                            .filter(Boolean);
                        // pegar(n): devolve o conteúdo entre o marcador n e o próximo marcador (n+1..8)
                        // [PARSER] pegar(n): retorna o conteúdo do item numerado n (1–8), respeitando o próximo marcador.
                        function pegar(n) {
                            var idx = linhas.findIndex(function (l) {
                                return new RegExp("^" + n + "\\s*[-–—]\\s*").test(l);
                            });
                            if (idx === -1)
                                return "";
                            var end = linhas.findIndex(function (l, index) {
                                return index > idx && /^[1-8]\s*[-–—]\s*/.test(l);
                            });
                            var slice = linhas.slice(idx, end === -1 ? undefined : end);
                            if (slice.length > 0) {
                                slice[0] = slice[0].replace(/^[1-8]\s*[-–—]\s*/, "").trim();
                            }
                            return slice.join(" ").trim();
                        }
                        // Extrai campos 1–8 do bloco
                        var prefixo = (pegar(1) || "").trim();
                        var titulo = ((pegar(2) || "Sem título").trim());
                        var metodo_1 = pegar(3);
                        var descricaoProb = pegar(4);
                        var sugestao = pegar(5);
                        var justificativa = pegar(6);
                        var referencias = pegar(8);
                        // [SEVERIDADE] severidadeRaw: lê o item 7 com ou sem rótulo 'Severidade:'.
                        var severidadeRaw = (pegar(7) || "").trim();
                        var norm = function (s) {
                            return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                        };
                        // [SEVERIDADE] getSeverityMeta: mapeia texto normalizado -> cores/labels/gauge.
                        function getSeverityMeta(raw) {
                            var s = norm(raw);
                            if (/positiv/.test(s))
                                return { key: "positivo", label: "Positiva", color: SEVERITY_COLORS.positivo, gauge: gaugePositivo };
                            if (/(alto|alta|critica|critico|crítica|crítico)/.test(s))
                                return { key: "alto", label: "Alto", color: SEVERITY_COLORS.alto, gauge: gaugeAlto };
                            if (/(medio|médio|moderad[oa]|media|média)/.test(s))
                                return { key: "medio", label: "Médio", color: SEVERITY_COLORS.medio, gauge: gaugeMedio };
                            if (/(baixo|baixa|leve)/.test(s))
                                return { key: "baixo", label: "Baixo", color: SEVERITY_COLORS.baixo, gauge: gaugeBaixo };
                            return { key: "medio", label: "Médio", color: SEVERITY_COLORS.medio, gauge: gaugeMedio };
                        }
                        function toSevKey(raw) {
                            var s = (raw || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
                            if (/\bpositiv/.test(s))
                                return "positivo";
                            if (/\b(alt[ao]|critic[oa])\b/.test(s))
                                return "alto";
                            if (/\b(medi[oa]|moderad[oa])\b/.test(s))
                                return "medio";
                            if (/\b(baix[oa]|lev[ea])\b/.test(s))
                                return "baixo";
                            return "medio"; // <- fallback seguro
                        }
                        var isPositiva = (severidadeRaw || "").includes("positivo");
                        var sevMeta = getSeverityMeta(severidadeRaw);
                        var sevKey = toSevKey(severidadeRaw);
                        // (adiado) cardsPayload.push — só após o card ser criado e inserido
                        var palette = {
                            border: { r: 0.88, g: 0.9, b: 0.93 },
                            text: { r: 0.13, g: 0.13, b: 0.13 },
                            subtle: { r: 0.42, g: 0.45, b: 0.5 },
                            divider: { r: 0.75, g: 0.77, b: 0.8 },
                            white: { r: 1, g: 1, b: 1 }
                        };
                        // SVG do gauge (cole exatamente como recebeu)
                        var gaugeSvg = "\n      <svg width=\"240\" height=\"122\" viewBox=\"0 0 240 122\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n      <path d=\"M120 9.5C133.198 9.5 146.267 12.0998 158.46 17.1504C170.653 22.201 181.732 29.6033 191.064 38.9355C200.397 48.2677 207.799 59.3469 212.85 71.54C217.644 83.1139 220.229 95.477 220.479 107.99C220.507 109.381 219.378 110.5 218 110.5H192C190.616 110.5 189.511 109.38 189.472 108.015C189.23 99.5647 187.449 91.2235 184.21 83.4033C180.717 74.9712 175.597 67.3101 169.144 60.8564C162.69 54.4028 155.029 49.2827 146.597 45.79C138.165 42.2973 129.127 40.5 120 40.5C110.873 40.5 101.835 42.2973 93.4033 45.79C84.9712 49.2827 77.3101 54.4028 70.8564 60.8564C64.4028 67.3101 59.2827 74.9712 55.79 83.4033C52.5508 91.2235 50.7698 99.5647 50.5283 108.015C50.4892 109.38 49.3842 110.5 48 110.5H22C20.622 110.5 19.4928 109.381 19.5205 107.99C19.7708 95.477 22.3563 83.1139 27.1504 71.54C32.201 59.347 39.6033 48.2677 48.9355 38.9355C58.2677 29.6033 69.3469 22.201 81.54 17.1504C93.7333 12.0998 106.802 9.5 120 9.5Z\" fill=\"#FECA2A\" fill-opacity=\"0.4\" stroke=\"#DDAF24\"/>\n      <path d=\"M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3487 33.387 60.0181C42.1571 44.8205 54.7716 32.198 69.9637 23.4184C85.1558 14.6388 102.391 10.011 119.937 10C136.483 9.98963 152.756 14.0845 167.306 21.8969C168.766 22.6807 169.257 24.5194 168.43 25.955L156.447 46.7496C155.62 48.1852 153.788 48.6721 152.318 47.9072C142.338 42.7123 131.237 39.9929 119.956 40C107.673 40.0077 95.6091 43.2471 84.9746 49.3929C74.3402 55.5386 65.51 64.3744 59.3709 75.0127C53.7323 84.7837 50.5463 95.7593 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z\" fill=\"#FECA2A\"/>\n      <path d=\"M23 110C21.3431 110 19.9953 108.656 20.045 107C20.5403 90.4933 25.1172 74.3488 33.387 60.0182C41.6568 45.6876 53.3449 33.6467 67.3891 24.9583C68.7981 24.0867 70.6358 24.5814 71.4648 26.0159L83.4735 46.7955C84.3026 48.23 83.8077 50.0596 82.41 50.9493C72.9182 56.9914 65.0095 65.2418 59.3709 75.0127C53.7323 84.7837 50.5463 95.7594 50.0643 107.001C49.9933 108.656 48.6569 110 47 110H23Z\" fill=\"#FECA2A\"/>\n      <path d=\"M114.861 108.196C119.235 111 125.018 109.781 127.78 105.474C130.541 101.166 129.234 95.4017 124.861 92.598C120.487 89.7944 114.704 91.0134 111.942 95.3208C109.181 99.6282 110.488 105.393 114.861 108.196Z\" fill=\"#5C5C5C\"/>\n      <path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M136.765 88.3938L137.302 73.1906L123.712 80.0261C115.538 78.3951 106.891 81.7176 102.182 89.0638C96.0171 98.6803 98.9347 111.55 108.699 117.809C118.463 124.069 131.375 121.347 137.54 111.731C142.25 104.385 141.659 95.1398 136.765 88.3938ZM111.14 114.001C118.769 118.891 128.857 116.764 133.673 109.252C138.489 101.739 136.21 91.684 128.582 86.7939C120.954 81.9039 110.865 84.0301 106.049 91.543C101.233 99.0559 103.512 109.11 111.14 114.001Z\" fill=\"#5C5C5C\"/>\n      </svg>";
                        var gaugeSvgToUse = (sevMeta.gauge && sevMeta.gauge.trim()) ? sevMeta.gauge : gaugeSvg;
                        // Cria o node e redimensiona
                        var gaugeNode = figma.createNodeFromSvg(gaugeSvgToUse);
                        gaugeNode.resize(68, 34);
                        var sevMap = {
                            "crítica": { barraLateral: { r: 0.97, g: 0.42, b: 0.36 }, chip: { r: 0.94, g: 0.29, b: 0.23 }, label: "Crítica" },
                            "critica": { barraLateral: { r: 0.97, g: 0.42, b: 0.36 }, chip: { r: 0.94, g: 0.29, b: 0.23 }, label: "Crítica" },
                            "moderada": { barraLateral: { r: 1.0, g: 0.84, b: 0.2 }, chip: { r: 1.0, g: 0.8, b: 0.16 }, label: "Moderada" },
                            "leve": { barraLateral: { r: 0.22, g: 0.78, b: 0.42 }, chip: { r: 0.16, g: 0.69, b: 0.36 }, label: "Leve" },
                            "positivo": { barraLateral: { r: 0.16, g: 0.53, b: 0.84 }, chip: { r: 0.16, g: 0.53, b: 0.84 }, label: "Positivo" }
                        };
                        var sevColorObj = hexToPaint(sevMeta.color)[0].color;
                        var sev = { barraLateral: sevColorObj, chip: sevColorObj, label: sevMeta.label };
                        function makeText(text, style, size, color) {
                            var t = figma.createText();
                            t.fontName = { family: "Inter", style: style };
                            t.fontSize = size;
                            t.characters = removePrefix(text);
                            t.fills = [{ type: "SOLID", color: color }];
                            t.textAutoResize = "WIDTH_AND_HEIGHT";
                            return t;
                        }
                        // [HELPER] makeSection: cria um bloco (label + valor) com espaçamento e estilos.
                        function makeSection(label, value, italic) {
                            if (!value)
                                return null;
                            var wrap = figma.createFrame();
                            wrap.layoutMode = "VERTICAL";
                            wrap.primaryAxisSizingMode = "AUTO";
                            wrap.counterAxisSizingMode = "AUTO";
                            wrap.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
                            wrap.resize(516, wrap.height);
                            wrap.itemSpacing = 6;
                            wrap.fills = [];
                            //wrap.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 1 } }]; // borda azul
                            wrap.strokeWeight = 1;
                            var l = makeText(label, "Bold", 16, palette.text);
                            var v = makeText(value, italic ? "Italic" : "Regular", 16, palette.text);
                            //Configura quebra de linha automática no valor
                            v.textAutoResize = "HEIGHT"; // altura se ajusta ao conteúdo
                            v.resize(516, v.height); // largura máxima para quebrar linha
                            wrap.appendChild(l);
                            wrap.appendChild(v);
                            return wrap;
                        }
                        // Cria o card principal com layout vertical, largura fixa e altura adaptável
                        // [CARD] Cria o card principal (layout horizontal: barra lateral + coluna de conteúdo).
                        var card = figma.createFrame();
                        //card.name = "Heurística – " + titulo;
                        card.name = "[AI] ".concat(titulo, " :: ").concat(severidadeRaw);
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
                        var barraLateral = figma.createFrame();
                        barraLateral.layoutMode = "VERTICAL";
                        barraLateral.cornerRadius = 20;
                        barraLateral.primaryAxisSizingMode = "AUTO";
                        barraLateral.counterAxisSizingMode = "FIXED";
                        barraLateral.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
                        barraLateral.resize(8, 1);
                        barraLateral.fills = [{ type: "SOLID", color: sev.barraLateral }];
                        // Cria o container vertical para os textos do card (título, problema, sugestão, etc.)
                        var contentCol = figma.createFrame();
                        contentCol.layoutMode = "VERTICAL";
                        contentCol.primaryAxisSizingMode = "AUTO";
                        contentCol.counterAxisSizingMode = "AUTO";
                        contentCol.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
                        contentCol.itemSpacing = 16;
                        contentCol.paddingLeft = 18;
                        contentCol.paddingRight = 0;
                        contentCol.paddingTop = 0;
                        contentCol.paddingBottom = 0;
                        contentCol.layoutGrow = 1; // <- ESSENCIAL
                        contentCol.fills = [];
                        var headerRow = figma.createFrame();
                        headerRow.layoutMode = "HORIZONTAL";
                        headerRow.primaryAxisSizingMode = "FIXED"; // largura definida pelos filhos, mas...
                        headerRow.counterAxisSizingMode = "AUTO"; // altura = maior filho (71px do right)
                        headerRow.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
                        headerRow.itemSpacing = 16;
                        headerRow.fills = [];
                        headerRow.resize(510, card.height);
                        var headerLeft = figma.createFrame();
                        headerLeft.layoutMode = "VERTICAL";
                        headerLeft.primaryAxisSizingMode = "FIXED";
                        headerLeft.counterAxisSizingMode = "AUTO";
                        headerLeft.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
                        headerLeft.itemSpacing = 8;
                        headerLeft.fills = [];
                        headerLeft.resize(410, card.height);
                        // 1ª linha: Prefixo (ex.: [Constatação]) – sozinho
                        var tagPrefixo = makeText(prefixo || "", "Bold", 20, palette.text);
                        tagPrefixo.textAutoResize = "HEIGHT";
                        tagPrefixo.resize(410, tagPrefixo.height); // usa a própria altura
                        // 2ª linha: Título (campo 2) – sem prefixo
                        var titleT = makeText(titulo, "Bold", 20, palette.text);
                        titleT.textAutoResize = "HEIGHT";
                        titleT.resize(410, titleT.height);
                        var divider = figma.createRectangle();
                        divider.strokes = [];
                        divider.fills = [{ type: "SOLID", color: palette.divider }];
                        divider.layoutAlign = "STRETCH";
                        divider.resize(1, 1);
                        var metodoDisplayNames = {
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
                        var metodoNome = metodoDisplayNames[String(metodo_1 || "").toLowerCase()] || String(metodo_1 || "Heurísticas");
                        // cor correta é `subtle` (não existe `subtitle` no palette)
                        var subtitleT = makeText(metodoNome, "Regular", 16, palette.subtle);
                        subtitleT.textAutoResize = "HEIGHT"; // Só altura, largura fixa
                        subtitleT.resize(410, subtitleT.height); // Definir largura máxima
                        // append no node certo
                        var isConstatacao = norm(prefixo) === "constatacao";
                        if (!isConstatacao && prefixo) {
                            var tipoTxt = figma.createText();
                            tipoTxt.characters = prefixo;
                            tipoTxt.fontSize = 16;
                            tipoTxt.fontName = { family: "Inter", style: "Bold" };
                            tipoTxt.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
                            headerLeft.appendChild(tipoTxt);
                        }
                        headerLeft.appendChild(titleT);
                        headerLeft.appendChild(divider);
                        headerLeft.appendChild(subtitleT);
                        var headerRight = figma.createFrame();
                        headerRight.layoutMode = "VERTICAL";
                        headerRight.layoutAlign = "STRETCH"; // ocupa toda a largura ou altura disponível
                        headerRight.primaryAxisSizingMode = "FIXED";
                        headerRight.counterAxisSizingMode = "FIXED";
                        headerRight.resize(84, 71);
                        headerRight.itemSpacing = 16;
                        headerRight.primaryAxisAlignItems = "CENTER"; // alinha no eixo principal (vertical)
                        headerRight.counterAxisAlignItems = "CENTER"; // alinha no eixo cruzado (horizontal)
                        headerRight.paddingTop = headerRight.paddingBottom = 0;
                        headerRight.paddingLeft = headerRight.paddingRight = 0;
                        headerRight.fills = [];
                        // Adiciona no headerRight
                        headerRight.appendChild(gaugeNode);
                        // Criaçao da TAG de severidade
                        var chip = figma.createFrame();
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
                        var chipText = makeText(sev.label, "Bold", 12, palette.white);
                        chip.appendChild(chipText);
                        headerRight.appendChild(chip);
                        headerRow.appendChild(headerLeft);
                        headerRow.appendChild(headerRight);
                        contentCol.appendChild(headerRow);
                        function stripMarkerSpill(s) {
                            if (!s)
                                return s;
                            s = s;
                            s = s.replace(/\b8\s*[-–—]?\s*Refer(ê|e)ncias?\s*:\s*/gi, "");
                            return s.trim();
                        }
                        // Limpezas básicas dos campos
                        var justRaw = removePrefix(justificativa || "");
                        var refsRaw = removePrefix(referencias || "");
                        // Remover qualquer sobra explícita de “7 - …” / “8 - …”
                        justRaw = stripMarkerSpill(justRaw);
                        refsRaw = stripMarkerSpill(refsRaw);
                        // 4 - Descrição
                        var secDescricao = makeSection("Descrição", removePrefix(descricaoProb));
                        if (secDescricao)
                            contentCol.appendChild(secDescricao);
                        // 5 - Sugestão de melhoria  (só se NÃO for positiva)
                        var textoSugestao = removePrefix(sugestao || "").trim();
                        if (sevKey !== "positivo" && textoSugestao) {
                            var secSugestao = makeSection("Sugestão de melhoria", textoSugestao);
                            if (secSugestao)
                                contentCol.appendChild(secSugestao);
                        }
                        // 6 - Justificativa (texto já limpo e sem refs coladas)
                        var secJust = makeSection("Justificativa", justRaw);
                        if (secJust)
                            contentCol.appendChild(secJust);
                        // 8 - Referências (sempre seu próprio bloco; true = monoespaçado/multilinha)
                        var secRef = makeSection("Referências", refsRaw, true);
                        if (secRef)
                            contentCol.appendChild(secRef);
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
                        cardsPayload.push({ analise: parte, severidade: sevMeta.label, sevKey: sevKey, severidadeRaw: severidadeRaw, nodeId: node.id });
                        currentY += card.height + 24;
                    };
                    for (_i = 0, partesOrdenadas_1 = partesOrdenadas; _i < partesOrdenadas_1.length; _i++) {
                        parte = partesOrdenadas_1[_i];
                        _loop_2(parte);
                    } // fim do for (const parte of partesOrdenadas)
                    nodeName = (node && node.name) ? node.name : ("Layout");
                    // Empilha o resumo desta tela para enviar à UI
                    layoutsPayload.push({ nome: "[AI] ".concat(nodeName), cards: cardsPayload });
                }
                catch (error) {
                    console.error("[DEBUG] Erro ao processar an\u00E1lise:", error);
                    // Continua mesmo se houver erro
                    layoutsPayload.push({ nome: "[AI] Layout (Erro)", cards: [] });
                }
                // Envia resultados para a UI
                figma.ui.postMessage({ carregando: false, analises: layoutsPayload });
                return [3 /*break*/, 37];
            case 36:
                e_5 = _a.sent();
                console.error(e_5);
                figma.ui.postMessage({ carregando: false, resultado: "❌ Erro na análise." });
                return [3 /*break*/, 37];
            case 37: return [2 /*return*/];
        }
    });
}); };
