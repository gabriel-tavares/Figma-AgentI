
/**
 * summarize_context_echo.js (versão enriquecida)
 * Gera meta.contextEcho (5–8 frases, pt‑BR) a partir do JSON do layout.
 * - Continua descrevendo o que se vê
 * - INCLUI contexto provável da tela (tipo/objetivo/ações principais)
 * - Usa "pistas" extraídas do próprio JSON para orientar o modelo
 *
 * Patch rápido (≤ 4 linhas) no index.js:
 *   const { summarizeContextEchoWithAI } = require("./summarize_context_echo");
 *   if (parsed && (!parsed.meta || !parsed.meta.contextEcho || String(parsed.meta.contextEcho).trim().length < 60)) {
 *     const aiEcho = await summarizeContextEchoWithAI(parsed, HEADERS_VISION, modeloVision);
 *     if (aiEcho) parsed.meta = Object.assign({}, parsed.meta || {}, { contextEcho: aiEcho.trim().slice(0, 1000) });
 *   }
 */
const fetchFn = (typeof fetch === 'function') ? fetch : require('node-fetch');

// --- Heurísticas leves para extrair "pistas" do JSON (sem custar tokens)
function buildContextHints(layoutObj) {
  try {
    const comp = Array.isArray(layoutObj.components) ? layoutObj.components : [];
    const txt = (s) => (s || '').toString().toLowerCase();
    const has = (s, kw) => txt(s).includes(kw);

    let counts = {
      buttons: 0, inputs: 0, selects: 0, tables: 0, charts: 0, cards: 0,
      images: 0, icons: 0, links: 0, tabs: 0, formFields: 0,
    };
    let keywords = new Set();
    let ctas = [];
    let firstH1 = null;

    for (const c of comp) {
      const t = (c && c.type || "").toLowerCase();
      const label = txt(c && c.label);
      const hint = txt(c && c.placeholderOrValue);
      const role = (c && c.textStyle && c.textStyle.role) ? String(c.textStyle.role).toLowerCase() : "";

      if (t.includes('button')) { counts.buttons++; if (label) ctas.push(label); }
      if (t.includes('input') || t.includes('textfield')) { counts.inputs++; counts.formFields++; }
      if (t.includes('select') || t.includes('dropdown') || t.includes('combo')) { counts.selects++; counts.formFields++; }
      if (t.includes('table')) counts.tables++;
      if (t.includes('chart') || t.includes('graph')) counts.charts++;
      if (t.includes('card')) counts.cards++;
      if (t.includes('image') || (c.media && c.media.mediaType === 'image')) counts.images++;
      if (t.includes('icon') || (c.media && c.media.mediaType === 'icon')) counts.icons++;
      if (t.includes('link')) counts.links++;
      if (t.includes('tab')) counts.tabs++;
      if (role === 'h1' && !firstH1 && label) firstH1 = label;

      const scan = (label + ' ' + hint);
      ['login','entrar','cadastrar','cadastro','senha','email','e-mail','recuperar','otp','sair',
       'produto','produtos','preço','r$','usd','carrinho','pedido','checkout','endereço','frete','envio','pagamento','pix','boleto','cartão',
       'buscar','busca','pesquisa','resultado','filtrar','filtro',
       'dashboard','relatório','gráfico','tabela','métricas','kpi',
       'perfil','conta','configurações','notificações','preferências',
       '404','não encontrado','vazio','sem resultados','sucesso','erro','confirmado']
       .forEach(kw => { if (has(scan, kw)) keywords.add(kw); });
    }

    // Sinais fortes por clusters
    let clusters = [];
    const kw = Array.from(keywords);
    const hasAny = (arr) => arr.some(k => kw.includes(k));

    if (hasAny(['login','entrar','senha','email','e-mail','cadastrar','cadastro','recuperar','otp'])) clusters.push('auth');
    if (hasAny(['carrinho','checkout','pagamento','endereço','frete','pedido','pix','boleto','cartão'])) clusters.push('checkout');
    if (hasAny(['produto','produtos','preço','r$','usd'])) clusters.push('catalogo');
    if (hasAny(['buscar','busca','pesquisa','resultado','filtrar','filtro'])) clusters.push('busca');
    if (hasAny(['dashboard','relatório','gráfico','tabela','métricas','kpi'])) clusters.push('dashboard');
    if (hasAny(['perfil','conta','configurações','notificações','preferências'])) clusters.push('config');
    if (hasAny(['404','não encontrado'])) clusters.push('404');
    if (hasAny(['vazio','sem resultados'])) clusters.push('empty');
    if (hasAny(['sucesso','confirmado'])) clusters.push('success');
    if (hasAny(['erro'])) clusters.push('error');

    // Confiança simples
    let confidence = 'baixa';
    if (clusters.length >= 2 || (clusters.length === 1 && counts.buttons + counts.inputs + counts.selects >= 3)) confidence = 'média';
    if (clusters.includes('checkout') || clusters.includes('auth') || clusters.includes('dashboard')) confidence = 'alta';

    const device = (layoutObj && layoutObj.canvas && layoutObj.canvas.device) ? String(layoutObj.canvas.device) : null;
    const W = layoutObj && layoutObj.canvas && layoutObj.canvas.widthPx;
    const H = layoutObj && layoutObj.canvas && layoutObj.canvas.heightPx;

    return {
      counts, keywords: kw, clusters, confidence, device, W, H, firstH1,
      ctas: Array.from(new Set(ctas)).slice(0, 5)
    };
  } catch {
    return null;
  }
}

async function summarizeContextEchoWithAI(layoutObj, HEADERS_VISION, modeloVision) {
  try {
    const hints = buildContextHints(layoutObj);
    const jsonStr = JSON.stringify(layoutObj);

    const sysText = [
      "Você é um especialista em UX que analisa interfaces digitais. Sua função é descrever textualmente o que a tela está transmitindo para o usuário, enriquecendo a análise heurística.",
      "Descreva de forma rica e detalhada o que você vê na interface, focando no impacto visual e emocional que ela causa no usuário.",
      "Analise hierarquia visual, tom e personalidade, clareza de propósito, elementos visuais, estados emocionais e contexto de uso.",
      "Responda em texto corrido e fluido, como se estivesse descrevendo a experiência para um colega de design.",
      "Seja específico sobre cores, tamanhos, posicionamentos e descreva o impacto emocional da interface.",
      "Identifique problemas visuais óbvios (sobrecarga, confusão, falta de clareza) e mencione pontos positivos quando existirem.",
      "Use linguagem profissional mas acessível e foque no que o usuário sente ao ver a tela."
    ].join(' ');

    const userBlocks = [{ type: "text", text: "Use as PISTAS abaixo (extraídas do JSON) para inferir o contexto, depois descreva a tela sem listar o JSON." }];
    if (hints) {
      const h = [
        `device=${hints.device||'n/d'} W=${hints.W||'n/d'} H=${hints.H||'n/d'}`,
        `clusters=${(hints.clusters||[]).join(',')||'n/d'} conf=${hints.confidence||'n/d'}`,
        `counts=${JSON.stringify(hints.counts)}`,
        `ctas=${(hints.ctas||[]).join(' | ')||'n/d'}`,
        `h1=${hints.firstH1||'n/d'}`
      ].join(' | ');
      userBlocks.push({ type: "text", text: h });
    }
    // Anexar o JSON completo por último (modelo pode consultar detalhes específicos)
    userBlocks.push({ type: "text", text: "JSON completo (não inclua na resposta; apenas use como referência):" });
    userBlocks.push({ type: "text", text: jsonStr });

    const messages = [
      { role: "system", content: [{ type: "text", text: sysText }] },
      { role: "user", content: userBlocks }
    ];

    const r = await fetchFn("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: HEADERS_VISION,
      body: JSON.stringify({
        model: modeloVision || "gpt-4.1-mini",
        messages,
        max_tokens: 600,
        temperature: 0.2
      })
    });

    const j = await r.json().catch(() => ({}));
    const txt = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) ? String(j.choices[0].message.content).trim() : "";
    return txt || null;
  } catch (e) {
    return null;
  }
}

module.exports = { summarizeContextEchoWithAI, buildContextHints };
