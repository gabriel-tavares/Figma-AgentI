/** �xR� Carrega variáveis de ambiente do arquivo .env */
require("dotenv").config();

/**
 * =========================
 *  Dependências & Setup
 * =========================
 */
/** =========================
 * Dependências principais
 * - express: servidor web
 * - node-fetch: chamadas HTTP
 * - cors: habilitar CORS
 * - path/fs: manipulação de arquivos
 * - probe-image-size: extrair dimensões de imagens
 */
const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const probe = require("probe-image-size"); // npm i probe-image-size
const { summarizeContextEchoWithAI } = require("./summarize_context_echo");
const fsp = require('fs/promises');
const { performance } = require('perf_hooks');
const sec = (ms) => Number(ms/1000).toFixed(2);


// Config
/** =========================
 * Configurações globais
 * - OPENAI_API_KEY: chave da API
 * - ASSISTANT_ID: ID do Assistant heurístico
 * - modeloVision: modelo usado para Vision (imagem -> JSON)
 * - temp: temperatura usada no Vision
 */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID   = process.env.ASSISTANT_ID || "";
const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID || "";
const OPENAI_ORG = process.env.OPENAI_ORG || "";
const modeloVision   = "gpt-4.1-mini";
const temp = 0.1;

// �x� Toggles e modelos para etapa textual (Responses GPT�5 vs Assistants)
const USE_RESPONSES_DEFAULT = /^(1|true|on|yes)$/i.test(process.env.USE_RESPONSES || "");
const MODELO_TEXTO  = process.env.MODELO_TEXTO || "gpt-5";
const TEMP_TEXTO    = Number(process.env.TEMP_TEXTO || 0.2);
const MAXTOK_TEXTO  = Number(process.env.MAXTOK_TEXTO || 4000);

// RAG (File Search / Vector Store)
const USE_RAG_DEFAULT = /^(1|true|on|yes)$/i.test(process.env.USE_RAG || "");
const VECTOR_STORE_ID_ENV = process.env.VECTOR_STORE_ID || "";





/** =========================
 * Setup do servidor Express
 */
const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());
app.use(express.static(path.join(__dirname, "public"))); // servir /public

// Memória do último JSON do Vision (todas as imagens processadas na última chamada)
let LAST_VISION_RAW = [];

/** Retry/backoff para chamadas HTTP **/
function isRetryableError(err, res) {
  if (res) {
    // HTTP que valem retry
    if (res.status === 429) return true;
    if (res.status >= 500 && res.status < 600) return true;
  }
  const msg = (err?.message || "").toLowerCase();
  // Erros de rede/SSL/transientes
  return /sslv3|bad record mac|etimedout|timedout|timeout|econnreset|socket hang up|fetch failed|network/i.test(msg);
}

/** =========================
 * Função fetchWithRetry
 * - Executa requisições HTTP com tentativas automáticas
 * - Retenta em casos de erro 429/5xx/timeout
 */
async function fetchWithRetry(url, options = {}, retry = { retries: 4, baseDelay: 500, maxDelay: 5000 }) {
  let lastErr;
  for (let attempt = 0; attempt <= retry.retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;

      // Se não for erro que vale retry ou já esgotou tentativas, levanta
      if (!isRetryableError(null, res) || attempt === retry.retries) {
        const bodyText = await res.text().catch(() => "");
        const msg = `HTTP ${res.status} ${res.statusText} ${bodyText ? `� ${bodyText.slice(0, 200)}⬦` : ""}`;
        throw new Error(msg);
      }
    } catch (e) {
      lastErr = e;
      if (!isRetryableError(e) || attempt === retry.retries) throw e;
    }
    // Backoff exponencial com jitter
    const delay = Math.min(
      retry.maxDelay,
      Math.round(retry.baseDelay * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4))
    );
    const method = (options?.method || "GET").toUpperCase();
    try {
      const p = new URL(url).pathname;
      console.warn(`[retry] ${method} ${p} � tentativa ${attempt + 1}/${retry.retries + 1}; aguardando ${delay}ms`);
    } catch {
      console.warn(`[retry] ${method} ${url} � tentativa ${attempt + 1}/${retry.retries + 1}; aguardando ${delay}ms`);
    }
    await sleep(delay);
  }
  throw lastErr || new Error("fetchWithRetry: falha após todas as tentativas");
}


if (!OPENAI_API_KEY) {
  console.error("�R Variável OPENAI_API_KEY não definida.");
  process.exit(1);
}
      // �xa� Se não houver ASSISTANT_ID, devolve só o JSON do Vision/Figma (sem heurística)
if (!ASSISTANT_ID) {
  console.warn("�a�️ ASSISTANT_ID não definido � passo Assistants será ignorado (Vision apenas).");
}

    // Cabeçalhos (uso básico só com a Project API Key)
    // Se quiser voltar a forçar Project/Org, basta descomentar as linhas correspondentes.
    const HEADERS_VISION = {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      // ...(OPENAI_PROJECT_ID ? { "OpenAI-Project": OPENAI_PROJECT_ID } : {}),
      // ...(OPENAI_ORG ? { "OpenAI-Organization": OPENAI_ORG } : {}),
    };

    const HEADERS_ASSISTANTS = {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "assistants=v2",
      // ...(OPENAI_PROJECT_ID ? { "OpenAI-Project": OPENAI_PROJECT_ID } : {}),
      // ...(OPENAI_ORG ? { "OpenAI-Organization": OPENAI_ORG } : {}),
    };

    const HEADERS_RESPONSES = {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      // ...(OPENAI_PROJECT_ID ? { "OpenAI-Project": OPENAI_PROJECT_ID } : {}),
      // ...(OPENAI_ORG ? { "OpenAI-Organization": OPENAI_ORG } : {}),
    };
\n
  // LOG de roteamento (sem vazar a chave)
    (function debugRouting() {
      const mask = (s) => (s ? s.slice(0, 7) + "⬦" : "(vazio)");
      console.log("�x� ROUTING",
        "| project:", OPENAI_PROJECT_ID || "(sem header)",
        "| org:", OPENAI_ORG || "(sem header)",
        "| key:", process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(0, 10) + "⬦" : "(sem)"
      );
    })();

  /** Logger de status compacto */
  function status(group, msg, ok = true, extra) {
    const icon = ok ? "�S&" : "�a�️";
    console.log(`[${group}] ${icon} ${msg}${extra ? ` � ${extra}` : ""}`);
  }

  const logLine = (o) => fs.appendFileSync(path.join(__dirname, 'heuristica.ndjson'), JSON.stringify(o)+'\n');


  /**
   * =========================
   *  Helpers Assistants v2
   * =========================
   */
/** =========================
 * Função apiAssistants
 * - Wrapper para chamar API de Assistants v2
 * - Lida com erros e converte JSON
 */
  const apiAssistants = async (path, opts = {}) => {
    const url = `https://api.openai.com/v1${path}`;
    const r = await fetchWithRetry(url, { method: "GET", headers: HEADERS_ASSISTANTS, ...opts }, {
      retries: 4, baseDelay: 600, maxDelay: 6000
    });
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
    if (!r.ok) {
      console.error("�R Erro OpenAI Assistants:", j);
      const msg = j?.error?.message || j?.message || "Falha na chamada OpenAI (Assistants)";
      throw new Error(msg);
    }
    return j;
  };

  const stripCodeFence = (s) => {
  if (!s || typeof s !== "string") return s;
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
};

function buildHeurInstruction(metodo) {
  return `Você é um agente de análise heurística.
Responda SEMPRE no formato numerado EXATO:
1 - Título
2 - Problema
3 - Descrição do problema
4 - Sugestão de melhoria
5 - Descrição da melhoria
6 - Severidade (leve, moderada ou crítica)

Método: ${metodo}.
Priorize fatos geométricos (dx/dy, contraste, padding, gaps).
Se o centro visual do texto coincide com o centro do botão (|dx|<=2), considere centralizado mesmo que textAlign esteja "LEFT" e trate como observação de baixa severidade.`;
}


/** Extrai texto da Responses API (GPT�5 etc.) de forma robusta */
function extractResponsesText(j) {
  const texts = [];
  const pushIf = (s) => { if (typeof s === 'string' && s.trim()) texts.push(s.trim()); };

  if (!j || typeof j !== 'object') return '';

  // Atalho comum
  if (typeof j.output_text === 'string') pushIf(j.output_text);

  // Novo esquema: j.output[] -> cada item tem .content[]
  if (Array.isArray(j.output)) {
    for (const item of j.output) {
      const content = item && item.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c === 'string') pushIf(c);
          if (c && typeof c.text === 'string') pushIf(c.text);
          if (c && c.text && typeof c.text.value === 'string') pushIf(c.text.value);
          if (c && c.content && Array.isArray(c.content) && c.content[0]?.text?.value) {
            pushIf(String(c.content[0].text.value));
          }
        }
      }
    }
  }

  // Fallbacks conhecidos
  if (!texts.length && j?.choices?.[0]?.message?.content) {
    pushIf(j.choices[0].message.content);
  }
  if (!texts.length && j?.content) {
    if (Array.isArray(j.content)) {
      for (const c of j.content) {
        if (typeof c === 'string') pushIf(c);
        if (c?.text?.value) pushIf(c.text.value);
        if (typeof c?.text === 'string') pushIf(c.text);
      }
    } else if (typeof j.content === 'string') {
      pushIf(j.content);
    }
  }

  // Busca recursiva pela primeira string que pareça o seu formato 1�6
  if (!texts.length) {
    const found = (function findStringWithPattern(obj, regex) {
      const seen = new Set();
      const dfs = (o) => {
        if (o && typeof o === 'object') {
          if (seen.has(o)) return null;
          seen.add(o);
        }
        if (typeof o === 'string') return regex.test(o) ? o : null;
        if (Array.isArray(o)) {
          for (const v of o) { const r = dfs(v); if (r) return r; }
          return null;
        }
        if (o && typeof o === 'object') {
          for (const k of Object.keys(o)) { const r = dfs(o[k]); if (r) return r; }
        }
        return null;
      };
      return dfs(obj);
    })(j, /^\s*1\s*[-��]\s*/m);
    if (found) pushIf(found);
  }

  return texts.join("\n").trim();
}

const tryParseJSON = (s) => { try { return JSON.parse(s); } catch { return null; } };
const normalizeImageUrl = (u) =>
  (typeof u === "string" ? u.replace(/^https?:\/\/data:/i, "data:").trim() : u);


  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const pollRun = async (threadId, runId, intervalMs = 900, timeoutMs = 240000) => {
    const start = Date.now();
    while (true) {
      // ��️ Cria uma run do Assistant (executa a análise heurística)
      const run = await apiAssistants(`/threads/${threadId}/runs/${runId}`);
      if (["completed", "failed", "cancelled", "expired"].includes(run.status)) return run;
      if (Date.now() - start > timeoutMs) return { status: "expired" };
      await sleep(intervalMs);
    }
  };

  /**
   * =========================
   *  Helpers analisa imagem
   * =========================
   */
/** =========================
 * buildContextText
 * - Monta bloco [[CONTEXT]] com dicas adicionais para Vision
 * - Inclui: contexto global, canvas size, regras extras
 */
  function buildContextText(globalCtx, item, size) {
    const hints = [];
    if (globalCtx) hints.push(`Contexto global: ${globalCtx}`);
    if (item?.context) hints.push(`Contexto da imagem: ${item.context}`);
    if (item?.typeHint) hints.push(`Hint de tipo: ${item.typeHint} (ex.: photo vs icon)`);
    if (item?.componentHints?.length) {
      hints.push(`Componentes esperados: ${item.componentHints.join(', ')}`);
    }
    if (size?.W && size?.H) {
      hints.push(`Canvas estimado: ${size.W}x${size.H}px`);
    }
    // Regras úteis para o seu caso (foto x ícone e desconto tachado)
    hints.push(
      'Regra: se typeHint=photo, classifique como "image" (não "icon").',
      'Regra: se houver valor com tachado (strike), mapear como wasPrice (preço anterior) + price (preço atual).'
    );
    return hints.length ? `[[CONTEXT]]\n${hints.join('\n')}\n[[/CONTEXT]]\n` : '';
  }

  /**
   * =========================
   *  Tamanho real da imagem
   * =========================
   * - Suporta data URL (base64) e URLs http/https.
   */
/** =========================
 * getImageSize
 * - Detecta largura/altura real de imagens
 * - Suporta base64 (data:) e URLs http/https
 */
  async function getImageSize(src) {
    try {
      if (typeof src === "string" && /^data:/i.test(src)) {
        const m = src.match(/^data:([^;]+);base64,(.*)$/i);
        if (m) {
          const buf = Buffer.from(m[2], "base64");
          const info = (probe.sync ? probe.sync(buf) : null);
          if (info?.width && info?.height) return { width: info.width, height: info.height };
        }
        return null;
      }
      const info = await probe(src);
      if (info?.width && info?.height) return { width: info.width, height: info.height };
    } catch (e) {
      console.warn("�a�️ probe falhou:", e.message);
    }
    return null;
  }

  /**
   * ==========================================================
   *  Pós-processamento: injetar canvas px + boundspx (se tiver %)
   * ==========================================================
   * - Mantém ambos os formatos (pct e px)
   */
/** =========================
 * enrichWithCanvasPx
 * - Converte bounds de porcentagem -> pixels
 * - Anexa canvas width/heightPx no JSON
 */
  function enrichWithCanvasPx(visionObj, W, H) {
    if (!visionObj || !W || !H) return visionObj;
    visionObj.canvas = visionObj.canvas || {};
    visionObj.canvas.widthPx = W;
    visionObj.canvas.heightPx = H;
    visionObj.canvas.approx = false;

    if (Array.isArray(visionObj.components)) {
      for (const c of visionObj.components) {
        const p = c?.boundsPct;
        const hasPx = c?.bounds && ["xPx","yPx","widthPx","heightPx"].some(k => typeof c.bounds[k] === "number");
        if (p && !hasPx && [p.x0,p.y0,p.x1,p.y1].every(v => typeof v === "number")) {
          c.bounds = {
            xPx: Math.round(p.x0 * W),
            yPx: Math.round(p.y0 * H),
            widthPx: Math.round((p.x1 - p.x0) * W),
            heightPx: Math.round((p.y1 - p.y0) * H),
            approx: true
          };
        }
      }
    }
    return visionObj;
  }

  /**
   * ======================================================
   *  Heurística: preencher readingOrder se faltando
   * ======================================================
   */
/** =========================
 * addReadingOrderIfMissing
 * - Se não houver ordem de leitura, gera automaticamente
 * - Ordena por posição Y/X na tela
 */
  function addReadingOrderIfMissing(visionObj) {
    try {
      if (!visionObj || !Array.isArray(visionObj.components)) return visionObj;
      const comp = visionObj.components;
      const hasRO = comp.every(c => typeof c.readingOrder === "number");
      const canUse = comp.every(c => c && c.boundsPct && typeof c.boundsPct.y0 === "number" && typeof c.boundsPct.x0 === "number");
      if (hasRO || !canUse) return visionObj;
      const sorted = comp
        .map((c, idx) => ({ c, idx }))
        .sort((a, b) => {
          const dy = (a.c.boundsPct.y0 - b.c.boundsPct.y0);
          if (Math.abs(dy) > 0.01) return dy;
          return (a.c.boundsPct.x0 - b.c.boundsPct.x0);
        });
      sorted.forEach((item, i) => { item.c.readingOrder = i; });
    } catch {}
    return visionObj;
  }

  /**
   * ======================================================
   *  Heurística leve: ícone x imagem (corrige tipo / evidencia)
   * ======================================================
   */
/** =========================
 * mediaGuess / splitIconVsImage
 * - Heurística para corrigir elementos mal classificados (icon vs image)
 */
  function mediaGuess(node) {
    const m = node?.media || {};
    const label = (node?.label || node?.nameOrMeaning || "").toLowerCase();
    let scoreImage = 0, scoreIcon = 0;

    if (m.style === "photographic" || m.background === "photo" || m.isPhotograph) scoreImage += 2;
    if (m.edgeSimplicityScore >= 0.7) scoreIcon += 1;
    if (typeof m.colorCountApprox === "number" && m.colorCountApprox <= 8) scoreIcon += 0.6;
    if (m.textureScore >= 0.6) scoreImage += 1;

    const w = node?.bounds?.widthPx, h = node?.bounds?.heightPx;
    const maxSide = Math.max(w || 0, h || 0);
    if (maxSide >= 40 && ["rounded","circle","squircle"].includes(m.maskShape)) scoreImage += 0.5;

    if (/(foto|photo|imagem|image|coffee|latte|food|product)/i.test(label)) scoreImage += 0.5;
    if (/(icon|ícone)/i.test(label)) scoreIcon += 0.2;

    const final = scoreImage > scoreIcon ? "image" : "icon";
    const confidence = Math.min(1, Math.max(0.5, Math.abs(scoreImage - scoreIcon)));
    return { final, confidence, scoreImage, scoreIcon };
  }
  function splitIconVsImage(visionObj) {
    const misclassified = [];
    if (!visionObj) return { misclassified };

    if (Array.isArray(visionObj.components)) {
      for (const c of visionObj.components) {
        const t = (c.type || "").toLowerCase();
        if (["icon","image","other","card","section","link"].includes(t)) {
          const g = mediaGuess(c);
          if ((t === "icon" && g.final === "image") || (t === "image" && g.final === "icon")) {
            misclassified.push({
              where: "components",
              originalType: t,
              newType: g.final,
              label: c.label || c.nameOrMeaning || "(sem rótulo)",
              evidence: {
                style: c.media?.style, background: c.media?.background,
                textureScore: c.media?.textureScore, edgeSimplicityScore: c.media?.edgeSimplicityScore,
                colorCountApprox: c.media?.colorCountApprox, maskShape: c.media?.maskShape,
                bounds: c.bounds
              },
              confidence: g.confidence
            });
            c.type = g.final === "image" ? "image" : "icon";
            c.media = c.media || {};
            c.media.mediaType = c.type;
          }
        }
      }
    }
    if (Array.isArray(visionObj.iconography)) {
      for (const ic of visionObj.iconography) {
        const g = mediaGuess({
          media: {
            style: ic.style, background: ic.background, textureScore: ic.textureScore,
            edgeSimplicityScore: ic.edgeSimplicityScore, colorCountApprox: ic.colorCountApprox,
            maskShape: ic.maskShape, isPhotograph: ic.isPhotograph
          },
          label: ic.nameOrMeaning
        });
        if (g.final === "image") {
          misclassified.push({
            where: "iconography",
            originalType: "icon",
            newType: "image",
            label: ic.nameOrMeaning || "(sem rótulo)",
            evidence: {
              style: ic.style, background: ic.background,
              textureScore: ic.textureScore, edgeSimplicityScore: ic.edgeSimplicityScore,
              colorCountApprox: ic.colorCountApprox, maskShape: ic.maskShape
            },
            confidence: g.confidence
          });
          ic.style = ic.style || "photographic";
          ic.isPhotograph = true;
        }
      }
    }
    return { misclassified };
  }

  /**
   * =========================
   *  Rota principal: /analisar
   * =========================
   * Fluxo por imagem:
   *   1) Normaliza entrada e tenta obter W/H.
   *   2) Chama Vision para transcrição estruturada (JSON).
   *   3) Pós-processa (canvas px, bounds px, readingOrder, ícone vs imagem).
   *   4) (Opcional) Passa JSON para Assistants v2.
   *   5) Retorna respostas individuais.
   */
/** =========================
 * Rota principal: POST /analisar
 * Fluxo:
 * 1. Recebe imagens/figmaSpecs do front
 * 2. Se figmaSpec -> usa direto (sem Vision)
 * 3. Se imagem -> chama Vision para gerar JSON
 * 4. Pós-processa JSON
 * 5. Se ASSISTANT_ID -> envia JSON ao Assistant heurístico
 * 6. Retorna respostas individuais
 */
  app.post("/analisar", async (req, res) => {
  try {
    
    let { imagens, metodo, descricao, canvas, nomeLayout, layoutName, nome, figmaSpecs, temperature } = req.body;

    // Toggles por requisição (override de .env)
    const USE_RESPONSES = (typeof req.body?.useResponses === "boolean") ? req.body.useResponses : USE_RESPONSES_DEFAULT;
    const USE_RAG = (typeof req.body?.useRag === "boolean") ? req.body.useRag : USE_RAG_DEFAULT;
    const vectorStoreId = req.body?.vectorStoreId || VECTOR_STORE_ID_ENV;


    // também aceita "layout: XXX" dentro da descrição
    const extractFromDescricao = (txt) => {
      if (!txt || typeof txt !== "string") return "";
      const m = txt.match(/(?:^|\n)\s*layout\s*:\s*(.+)$/im);
      return m ? m[1].trim() : "";
    };

    const nomeLayoutUser =
      (nomeLayout && String(nomeLayout).trim()) ||
      (layoutName && String(layoutName).trim()) ||
      (nome && String(nome).trim()) ||
      extractFromDescricao(descricao);

    console.log("�x��️ Nome do layout (UI):", nomeLayoutUser || "(não enviado)");
    console.log("�x� Contexto recebido:", (descricao && descricao.trim()) ? descricao.trim().slice(0,200) + (descricao.length>200?"⬦":"") : "(vazio)");

    const defaultCanvas = (canvas && canvas.width && canvas.height) ? canvas : null;

    // Normalize arrays
    if (typeof imagens === "string") imagens = [imagens];
    if (!Array.isArray(imagens)) imagens = [];
    if (!Array.isArray(figmaSpecs)) figmaSpecs = [];

    // Converte para [{url, width?, height?}, ...] + normaliza data URLs
    const imgs = imagens.map((x) => {
      const obj = (typeof x === "string") ? { url: x } : { ...x };
      obj.url = normalizeImageUrl(obj.url);
      return obj;
    });

    // Determine iteration count: prefer figmaSpecs if provided
    const N = Math.max(figmaSpecs.length, imgs.length, 0);
    if (N === 0) {
      return res.status(400).json({ error: "Envie ao menos um figmaSpec ou uma imagem." });
    }

    const respostasIndividuais = [];
    LAST_VISION_RAW = []; // reinicia memória a cada requisição

    const DEBUG_DIR = path.resolve(__dirname, 'debug_vision');
    await fsp.rm(DEBUG_DIR, { recursive: true, force: true });
    await fsp.mkdir(DEBUG_DIR, { recursive: true }); 

    const job0 = performance.now(), batch_id = `batch_${Date.now()}`;

    for (let i = 0; i < N; i++) {
      const group = `ITEM ${i + 1}/${N}`;
      const hasSpec = !!figmaSpecs[i];
      const hasImg  = !!imgs[i];
      const itemImg = imgs[i];
      const s0 = performance.now();
      const tPrep0 = performance.now();      // início do prep
      const spec    = hasSpec ? figmaSpecs[i] : null;

      status(group, "Entrada", true, hasSpec ? "figmaSpec" : (hasImg ? "imagem" : "�"));

      // Descobrir W/H: usa canvas do spec, body (canvas) ou probe
      let W = null, H = null;
      if (hasSpec && spec?.canvas) {
        W = spec.canvas.widthPx || null;
        H = spec.canvas.heightPx || null;
      }
      if ((!W || !H) && defaultCanvas) {
        W = defaultCanvas.width; H = defaultCanvas.height;
      }
      if ((!W || !H) && hasImg) {
        const meta = await getImageSize(itemImg.url || itemImg);
        if (meta) { W = meta.width; H = meta.height; }
      }
      status(group, "Canvas px", !!(W && H), (W && H) ? `${W}�${H}` : "indefinido");

      // monta um bloco de contexto opcional (global + hints)
      const contextBlock = buildContextText(descricao, null, { W, H });
      status(group, "Vision: contexto", !!contextBlock, contextBlock ? "incluído" : "nenhum");

      let parsed = null;
      let raw = "";

      // �x� BYPASS VISION: usa diretamente o JSON vindo do Figma
      if (hasSpec) {
        // �x� BYPASS VISION: usa diretamente o JSON vindo do Figma
        parsed = spec;
        raw = JSON.stringify(parsed);
        status(group, "Modo", true, "usando figmaSpec (sem Vision)");
      // �xx� FALLBACK: usa Vision para converter imagem em JSON
      } else if (hasImg) {
        // �xx� FALLBACK: usa Vision para extrair do PNG
        const imagem = itemImg.url || itemImg;
        status(group, "Vision: chamada", true);
        
        const promptVision = `Você é um transcritor de UI. Converta a imagem de interface em JSON estruturado fiel ao que está visível. Retorne apenas JSON válido.`;
    const msgsVision = [
          { role: "system", content: promptVision },
          {
            role: "user",
            content: [
              { type: "text", text: nomeLayoutUser
                ? `NOME FIXO DO LAYOUT: "${nomeLayoutUser}". No JSON de saída, defina "layoutName" EXATAMENTE como "${nomeLayoutUser}". Não invente outro nome.`
                : `Se não houver nome fixo, escolha um "layoutName" curto e descritivo.` },
              ...(contextBlock ? [{ type: "text", text: contextBlock }] : []),
              { type: "image_url", image_url: { url: imagem, detail: "high" } },
            ],
          },
        ];

        const t0 = Date.now();
        const visionResponse = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: HEADERS_VISION,
          body: JSON.stringify({
            model: modeloVision,
            messages: msgsVision,
            response_format: { type: "json_object" },
            max_tokens: 20000,
            temperature: temp,
          }),
        }, { retries: 4, baseDelay: 600, maxDelay: 6000 });

        const rid = visionResponse.headers.get("x-request-id");
        console.log("�x:�️ Vision status:", visionResponse.status, visionResponse.statusText, "| reqId:", rid, "|", (Date.now() - t0) + "ms");
        const visionJson = await visionResponse.json().catch(() => ({}));
        if (!visionResponse.ok) {
          console.error("�R Vision body:", visionJson);
        }
        console.log("�x  chatcmpl.id:", visionJson?.id || "(sem id)");
        console.log("�x} Cole em Dashboard �  Logs �  Completions �  Enter id:", visionJson?.id || "(sem id)");

        const usageV = visionJson?.usage || {};
        status(group, "Vision: tokens", true, `prompt:${usageV.prompt_tokens ?? "-"} completion:${usageV.completion_tokens ?? "-"} total:${usageV.total_tokens ?? "-"}`);

        const visionText = (visionJson?.choices?.[0]?.message?.content || "").trim();
        const stripCodeFence = (s) => s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
        raw = stripCodeFence(visionText);
        try { parsed = JSON.parse(raw); } catch { parsed = null; }

        try { fs.mkdirSync(path.join(__dirname, "debug_vision"), { recursive: true }); } catch {}
        try { fs.writeFileSync(path.join(__dirname, "debug_vision", "last_raw_always.json"), raw, "utf8"); } catch {}
        if (!parsed) {
          console.warn("�a�️ JSON inválido detectado, salvando saída bruta em debug_vision/last_raw.json");
          try { fs.writeFileSync(path.join(__dirname, "debug_vision", "last_raw.json"), raw, "utf8"); } catch {}
        }
      }

      // Normalizações comuns
      if (parsed) {
        parsed.meta = parsed.meta || {};
        parsed.meta.modelLayoutName = parsed.layoutName || null;
        if (nomeLayoutUser) parsed.layoutName = String(nomeLayoutUser).slice(0, 80);
        else if (parsed.layoutName) parsed.layoutName = String(parsed.layoutName).slice(0, 80);
        else parsed.layoutName = "Untitled";

        const clamp = (s) => (s && s.length > 1000 ? s.slice(0, 1000) : s);
        const clean  = (s) => (s || "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
        const ctxUser = (descricao && descricao.trim()) ? clean(descricao) : "";

        if (parsed) {
          const ctxUser = (descricao && descricao.trim()) ? clean(descricao) : "";
          parsed.meta = parsed.meta || {};
          if (ctxUser) parsed.meta.contextUser = clamp(ctxUser, 3000);
          if (parsed.meta.contextEcho) {
            parsed.meta.contextEcho = clamp(clean(parsed.meta.contextEcho), 1000);
          }
          // �R sem fallback: contextEcho é SEMPRE da IA; contextUser é SEMPRE do usuário
        }

        if (parsed && (!parsed.meta || !parsed.meta.contextEcho || String(parsed.meta.contextEcho).trim().length < 60)) {
          const aiEcho = await summarizeContextEchoWithAI(parsed, HEADERS_VISION, modeloVision);
          if (aiEcho) parsed.meta = Object.assign({}, parsed.meta || {}, { contextEcho: aiEcho.trim().slice(0, 1000) });
        }

        if (parsed && (!parsed.meta || !parsed.meta.contextEcho)) {
          const t=(parsed.mainText||[]).filter(Boolean).slice(0,2).join(" ⬢ ");
          const size=(parsed.canvas?.widthPx&&parsed.canvas?.heightPx)?`${parsed.canvas.widthPx}x${parsed.canvas.heightPx}px`:"indefinido";
          parsed.meta={...(parsed.meta||{}),contextEcho:`Layout "${parsed.layoutName}" (${parsed.canvas?.device||"indefinido"}), canvas ${size}. Destaques: ${t||"�"}.`};
        }

        // Pós-processamento local
        if (W && H) parsed = enrichWithCanvasPx(parsed, W, H);
        parsed = addReadingOrderIfMissing(parsed);
        const mediaFix = splitIconVsImage(parsed);
        if (mediaFix.misclassified?.length) status(group, "Correções ícone/imagem", true, `aplicadas: ${mediaFix.misclassified.length}`);
        else status(group, "Correções ícone/imagem", true, "nenhuma");
      }

      // Persistir JSON bonito em disco + memória (sem poluir console)
      const visionPretty = parsed ? JSON.stringify(parsed, null, 2) : raw;
      LAST_VISION_RAW.push(visionPretty);
      try {
        const dir = path.join(__dirname, "debug_vision");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `last_item${i+1}.json`), visionPretty, "utf8");
        fs.writeFileSync(path.join(dir, "last.json"),
          JSON.stringify({ images: LAST_VISION_RAW, count: LAST_VISION_RAW.length }, null, 2),
          "utf8"
        );
        status(group, "Persistido", true, `debug_vision/last_item${i+1}.json`);

      // ===== Responses (GPT�5) opcional =====
      // Monta a mensagem mínima para a etapa textual
      const mensagemMinima = [
        `metodo: ${metodo}`,
        `contexto: ${descricao || "Nenhum."}`,
        `descricao_json:`,
        visionPretty || raw
      ].join("\n");

      // Log do agente ativo
      status(group, "Agente", true, `Vision=${modeloVision} | Heurística=${USE_RESPONSES ? `Responses(${MODELO_TEXTO})` : (ASSISTANT_ID ? "Assistants" : "OFF")}`);
      status(group, "RAG", true, USE_RAG ? `ON (${vectorStoreId || "sem ID"})` : "OFF");

      if (USE_RESPONSES) {
        // Usa o prompt do Assistant, se houver, como base. Se não, usa fallback.
        let instr = buildHeurInstruction(metodo);
        try {
          if (ASSISTANT_ID) {
            const a = await apiAssistants(`/assistants/${ASSISTANT_ID}`);
            if (a?.instructions) instr = String(a.instructions);
          }
        } catch {}

        const instr2 = `${instr}

        Regra de saída:
        - Responda SOMENTE texto simples (sem markdown, sem JSON).
        - Não retorne tool calls; entregue a resposta final em 1�6.`;

        const prompt = [instr2.replaceAll("${metodo}", metodo), "", "DADOS:", mensagemMinima].join("\n");

        const isGpt5 = /^gpt-5/i.test(String(MODELO_TEXTO || ""));

        const body = {
          model: MODELO_TEXTO,
          input: prompt,
          ...(isGpt5 ? {} : { temperature: TEMP_TEXTO }),
          max_output_tokens: MAXTOK_TEXTO,
          ...(USE_RAG && vectorStoreId ? { tools: [{ type: "file_search", vector_store_ids: [vectorStoreId] }] } : {})
        };

        const prep_ms = performance.now() - tPrep0;
        const tInfer = performance.now();

        const r = await fetchWithRetry("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: HEADERS_RESPONSES,
          body: JSON.stringify(body)
        }, { retries: 4, baseDelay: 600, maxDelay: 6000 });

        const jr = await r.json().catch(() => ({}));
        const tPost0 = performance.now(); // início do pós-processamento
        try { fs.mkdirSync(path.join(__dirname, "debug_responses"), { recursive: true }); fs.writeFileSync(path.join(__dirname, "debug_responses", "last.json"), JSON.stringify(jr, null, 2), "utf8"); } catch {}
        const ridR = r.headers.get("x-request-id");
        status(group, "Responses: reqId", !!ridR, ridR || "(sem id)");
        status(group, "Responses: status", true, String(jr?.status || r.status));

        if (!r.ok) {
          console.error("�R Responses body:", jr);
          respostasIndividuais.push("�a�️ Não foi possível analisar. [[[FIM_HEURISTICA]]]");
          continue;
        }

        let out = extractResponsesText(jr);
        if (!out) {
          const flat = (jr?.output || []).flatMap(i => (i?.content || []).map(c => c?.text?.value || c?.text || "")).filter(Boolean).join("\n").trim();
          out = flat || (jr?.output_text || "");
        }
        status(group, "Responses: ok", !!out, out ? "texto" : "vazio");
        respostasIndividuais.push(out || "�a�️ Resposta vazia. [[[FIM_HEURISTICA]]]");
        logLine({ ts:new Date().toISOString(), batch_id, screen_name: nomeLayoutUser || "(sem nome)", model_name: MODELO_TEXTO, screen_duration_ms: performance.now()-s0, prep_ms, rag_ms: null, infer_ms: performance.now()-tInfer, post_ms: performance.now()-tPost0 });
        console.log(
          `[${group}] ⏱️ Tela: ${sec(performance.now()-s0)}s | ` +
          `prep: ${sec(prep_ms)}s | inferência: ${sec(performance.now()-tInfer)}s | pós: ${sec(performance.now()-tPost0)}s`
        );

        continue;
      }
      } catch (e) {
        status(group, "Persistido", false, e.message);
      }

      // 2) Assistants v2 (opcional)
      // �xa� Se não houver ASSISTANT_ID, devolve só o JSON do Vision/Figma (sem heurística)
      if (!ASSISTANT_ID) {
        respostasIndividuais.push(visionPretty || raw);
        status(group, "Assistants: pulado (sem ASSISTANT_ID)", true);
        continue;
      }

      const evidenciasAgregadas = {};
      const mensagemMinima = [
        `metodo: ${metodo}`,
        `contexto: ${descricao || "Nenhum."}`,
        `descricao_json:`,
        visionPretty || raw
      ].join("\n");

      // �x Cria nova thread no Assistant v2
      const thread = await apiAssistants(`/threads`, { method: "POST", body: JSON.stringify({}) });
      status(group, "Assistants: thread", true, thread.id);

      // �S0️ Envia mensagem (JSON + contexto) para a thread
      await apiAssistants(`/threads/${thread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ role: "user", content: [{ type: "text", text: mensagemMinima }] }),
      });
      status(group, "Assistants: mensagem enviada", true);
      const prep_ms = performance.now() - tPrep0;  // fim do prep
      const tInfer  = performance.now();           // início inferência (run/poll)

      // ��️ Cria uma run do Assistant (executa a análise heurística)
      const run = await apiAssistants(`/threads/${thread.id}/runs`, {
        method: "POST",
        body: JSON.stringify({ assistant_id: ASSISTANT_ID }),
      });
      console.log("�x�� run.id:", run?.id || "(sem id)");
      console.log("�x} Cole em Dashboard �  Logs �  Assistants �  Enter id:", run?.id || "(sem id)");

      // ⏳ Espera até a run terminar (pollRun)
      const finished = await pollRun(thread.id, run.id);
      const tPost0 = performance.now(); // início do pós-processamento
const steps = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}/steps`, { method:"GET", headers: HEADERS_ASSISTANTS }).then(r=>r.json()).catch(()=>null);
      const ragStepTypes = Array.isArray(steps?.data) ? steps.data.map(s => s?.step_details?.type || s.type).filter(Boolean) : [];
      status(group, "Assistants: rag steps", ragStepTypes.length > 0, ragStepTypes.length ? ragStepTypes.join(', ') : "nenhum");
      const rag_ms = steps?.data?.filter(s => (s.type==="tool" || s.type==="message_creation") && s.step_details?.type==="file_search")
                  ?.reduce((acc,s)=> acc + Math.max(0, ((s.completed_at||0)-(s.created_at||0))*1000), 0) ?? 0;

      status(group, "Assistants: run", finished.status === "completed", finished.status);
      if (finished?.usage) {
        status(group, "Assistants: tokens", true, `input:${finished.usage.prompt_tokens ?? "-"} output:${finished.usage.completion_tokens ?? "-"}`);
      }

      if (finished.status !== "completed") {
        respostasIndividuais.push("�a�️ Não foi possível analisar. [[[FIM_HEURISTICA]]]");
        continue;
      }

      // �x� Recupera últimas mensagens da thread e pega a resposta do Assistant
      const msgs = await apiAssistants(`/threads/${thread.id}/messages?limit=10&order=desc`);
      const assistantMsg = (msgs.data || []).find(m => m.role === "assistant");
      const assistantText = assistantMsg?.content?.find(c => c.type === "text")?.text?.value || "";

      status(group, "Assistants: resposta", !!assistantText, assistantText ? "ok" : "vazia");
      respostasIndividuais.push((assistantText || "").trim() || "�a�️ Resposta vazia. [[[FIM_HEURISTICA]]]");
logLine({ ts:new Date().toISOString(), batch_id, run_id: run.id, screen_name: nomeLayoutUser || "(sem nome)", model_name: "Assistants", screen_duration_ms: performance.now()-s0, prep_ms, rag_ms, infer_ms: performance.now()-tInfer, post_ms: performance.now()-tPost0, tokens: finished?.usage });
const total_ms = performance.now()-s0;
console.log(`[${group}] ⏱️ Tela: ${sec(total_ms)}s | prep: ${sec(prep_ms)}s | RAG: ${sec(rag_ms)}s | inferência: ${sec(performance.now()-tInfer)}s | pós: ${sec(performance.now()-tPost0)}s`);


    }
    logLine({ ts:new Date().toISOString(), batch_id, screens_total: N, duration_ms: performance.now()-job0 });
    console.log(`�x�� Duração total do job: ${sec(performance.now()-job0)}s (screens: ${N})`);
    return res.json({ respostas: respostasIndividuais });
  } catch (err) {
    console.error("�R Erro geral:", err?.message || err);
    return res.status(500).json({ error: "Erro inesperado na análise.", details: err?.message || String(err) });
  }
});

/**
 * ============================================
 *  Utilidades: recuperar último JSON do Vision
 * ============================================
 */
/** =========================
 * Rotas utilitárias
 * - /last-vision: retorna último JSON como texto
 */
app.get("/last-vision", (req, res) => {
  if (LAST_VISION_RAW && LAST_VISION_RAW.length > 0) {
    if (LAST_VISION_RAW.length === 1) return res.type("text/plain").send(LAST_VISION_RAW[0]);
    return res.type("text/plain").send(LAST_VISION_RAW.join("\n\n--- IMG_BREAK ---\n\n"));
  }
  try {
    const fnameAll = path.join(__dirname, "debug_vision", "last.json");
    const s = fs.readFileSync(fnameAll, "utf8");
    const j = JSON.parse(s);
    if (j?.images?.length > 0) {
      if (j.images.length === 1) return res.type("text/plain").send(j.images[0]);
      return res.type("text/plain").send(j.images.join("\n\n--- IMG_BREAK ---\n\n"));
    }
  } catch {}
  return res.status(404).type("text/plain").send("Nenhum Vision JSON na memória ainda.");
});

/** - /last-vision.json: retorna último JSON como objeto */
app.get("/last-vision.json", (req, res) => {
  if (LAST_VISION_RAW && LAST_VISION_RAW.length > 0) {
    return res.json({ images: LAST_VISION_RAW, count: LAST_VISION_RAW.length });
  }
  try {
    const fnameAll = path.join(__dirname, "debug_vision", "last.json");
    const s = fs.readFileSync(fnameAll, "utf8");
    const j = JSON.parse(s);
    if (j?.images) return res.json({ images: j.images, count: j.images.length });
  } catch {}
  return res.status(404).json({ error: "Nenhum Vision JSON na memória ainda." });
});

app.get("/", (_req, res) => {
  res.send("�S& Backend rodando com Vision �~S Assistant (v2) + status logs.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`�xa� Servidor rodando na porta ${PORT}`));
console.log(`�x� NDJSON: ${path.join(__dirname,'heuristica.ndjson')}`);


/**
 * ============================================
 *  Rota de ping (gera um log mínimo no Dashboard)
 * ============================================
 */
/** - /ping-openai: faz uma chamada mínima ao modelo para testar conectividade */
app.get("/ping-openai", async (_req, res) => {
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: HEADERS_VISION,
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    const j = await r.json();
    console.log("�x  chatcmpl.id (ping):", j?.id);
    res.json({ ok: r.ok, id: j?.id, status: r.status });
  } catch (e) {
    console.error("�R Erro ping-openai:", e.message);
    res.status(500).json({ error: e.message });
  }
});


