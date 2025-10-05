/** 🌱 Carrega variáveis de ambiente do arquivo .env */
require("dotenv").config();

// Sistema de logging padronizado
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const logger = {
  error: (msg, ...args) => {
    if (LOG_LEVELS[LOG_LEVEL] >= LOG_LEVELS.error) {
      console.error(`❌ [ERROR]`, msg, ...args);
    }
  },
  warn: (msg, ...args) => {
    if (LOG_LEVELS[LOG_LEVEL] >= LOG_LEVELS.warn) {
      console.warn(`⚠️ [WARN]`, msg, ...args);
    }
  },
  info: (msg, ...args) => {
    if (LOG_LEVELS[LOG_LEVEL] >= LOG_LEVELS.info) {
      console.log(`ℹ️ [INFO]`, msg, ...args);
    }
  },
  debug: (msg, ...args) => {
    if (LOG_LEVELS[LOG_LEVEL] >= LOG_LEVELS.debug) {
      console.log(`🔍 [DEBUG]`, msg, ...args);
    }
  }
};


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

/**
 * =========================
 *  Análise de Imagens no FigmaSpec
 * =========================
 */
async function analyzeImagesInFigmaSpec(figmaSpec, HEADERS_VISION, modeloVision) {
  
  if (!ANALYZE_IMAGES || !figmaSpec || !figmaSpec.components) {
    return figmaSpec;
  }

  try {
    // Detectar componentes com imagens
    const imageComponents = figmaSpec.components.filter(comp => 
      comp.media && 
      (comp.media.mediaType === 'image' || comp.media.isPhotograph === true)
    );

    if (imageComponents.length === 0) {
      return figmaSpec;
    }

    // Para cada imagem, vamos tentar extrair uma descrição
    for (let i = 0; i < imageComponents.length; i++) {
      const comp = imageComponents[i];
      
      // Gerar descrição real usando IA baseada no contexto
      const imageDescription = await generateImageDescription(comp, figmaSpec, HEADERS_VISION, modeloVision);
      
      if (imageDescription) {
        comp.imageDescription = imageDescription;
      } else {
        // Fallback para descrição baseada no contexto
        const fallbackDescription = `Imagem: ${comp.label || 'sem label'} (${comp.type})`;
        comp.imageDescription = fallbackDescription;
      }
      
      // Remover imageBase64 do JSON final (é apenas temporário para análise)
      delete comp.imageBase64;
    }

    return figmaSpec;
  } catch (error) {
    console.warn(`⚠️ Erro na análise de imagens: ${error.message}`);
    return figmaSpec;
  }
}

async function generateImageDescription(component, figmaSpec, HEADERS_VISION, modeloVision) {
  try {
    // Criar contexto baseado no componente e layout
    const context = {
      componentLabel: component.label || 'Imagem',
      componentType: component.type,
      bounds: component.bounds,
      layoutName: figmaSpec.layoutName || 'Layout',
      mainText: (figmaSpec.mainText || []).slice(0, 5),
      canvasDevice: figmaSpec.canvas?.device || 'mobile',
      canvasSize: figmaSpec.canvas ? `${figmaSpec.canvas.widthPx}x${figmaSpec.canvas.heightPx}px` : 'indefinido'
    };

    // Buscar textos próximos ao componente para contexto adicional
    const nearbyTexts = [];
    if (figmaSpec.components) {
      figmaSpec.components.forEach(comp => {
        if (comp.type === 'text' && comp.textContent && comp.textContent.trim()) {
          nearbyTexts.push(comp.textContent.trim());
        }
      });
    }

    // Verificar se temos uma imagem base64 disponível
    const imageBase64 = component.imageBase64 || component.imageData || null;
    
    if (imageBase64) {
      // Usar Vision API com a imagem real
      const prompt = `Analise esta imagem e gere uma descrição textual detalhada (máximo 120 caracteres) do que você vê.

CONTEXTO:
- Layout: "${context.layoutName}" (${context.canvasDevice})
- Componente: "${context.componentLabel}"
- Dimensões: ${context.bounds?.widthPx || '?'}x${context.bounds?.heightPx || '?'}px

INSTRUÇÕES:
- Descreva especificamente o que você vê na imagem
- Inclua detalhes sobre cores, objetos, composição e estilo visual
- Seja específico sobre elementos como: xícara, pires, colher, fundo, textura, iluminação
- Use linguagem clara e objetiva
- Foque no propósito da imagem no contexto da interface

Responda APENAS a descrição detalhada, sem explicações adicionais.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: HEADERS_VISION,
        body: JSON.stringify({
          model: modeloVision || "gpt-4.1-mini",
          messages: [
            { role: "user", content: prompt },
            { 
              role: "user", 
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageBase64 } }
              ]
            }
          ],
          max_tokens: 150,
          temperature: 0.1
        })
      });

      const result = await response.json();
      const description = result.choices?.[0]?.message?.content?.trim();
      
      if (description) {
        return description;
      }
    }

    // Fallback: usar apenas contexto textual
    
    const prompt = `Você é um especialista em UX que descreve imagens em interfaces digitais.

Analise o contexto da imagem abaixo e gere uma descrição textual detalhada (máximo 120 caracteres) do que a imagem provavelmente representa.

CONTEXTO DO LAYOUT:
- Nome: "${context.layoutName}"
- Dispositivo: ${context.canvasDevice} (${context.canvasSize})
- Componente: "${context.componentLabel}" (${context.componentType})
- Dimensões: ${context.bounds?.widthPx || '?'}x${context.bounds?.heightPx || '?'}px
- Textos principais: ${context.mainText.join(', ') || 'nenhum'}
- Textos próximos: ${nearbyTexts.slice(0, 3).join(', ') || 'nenhum'}

ANÁLISE DO RÓTULO:
O rótulo "${context.componentLabel}" sugere que esta imagem pode conter elementos relacionados a café, bebidas ou produtos similares. Se for uma imagem de café, considere elementos como: xícara, pires, colher, grãos, vapor, fundo/textura, iluminação, ângulo da foto, estilo visual.

INSTRUÇÕES:
- Gere uma descrição detalhada que ajude na análise heurística
- Seja específico sobre cores, objetos, composição e estilo visual
- Use linguagem clara e objetiva
- Foque no propósito da imagem no contexto da interface
- Inclua detalhes sobre iluminação, texturas e elementos visuais

EXEMPLOS DE RESPOSTA DETALHADA:
- "Xícara de café com pires visto de cima em fundo de madeira escura com colher"
- "Foto de pessoa sorrindo em ambiente profissional com iluminação natural"
- "Ilustração de smartphone com interface de app em estilo moderno"
- "Imagem de produto em destaque com fundo neutro e sombra sutil"
- "Banner promocional com oferta especial em cores vibrantes"

Responda APENAS a descrição detalhada, sem explicações adicionais.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: HEADERS_VISION,
      body: JSON.stringify({
        model: modeloVision || "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 150,
        temperature: 0.1
      })
    });

    const result = await response.json();
    const description = result.choices?.[0]?.message?.content?.trim();
    
    return description || null;
  } catch (error) {
    console.warn(`⚠️ Erro ao gerar descrição da imagem: ${error.message}`);
    return null;
  }
}

/**
 * =========================
 *  Limpeza de Arquivos Temporários
 * =========================
 */
function limparArquivosTemporarios() {
  if (!CLEANUP_TEMP_FILES) {
    return;
  }
  
  try {
    const tempDir = path.join(__dirname, "temp");
    const debugDir = path.join(__dirname, "debug_responses");
    const debugLayoutsDir = path.join(__dirname, "debug_layouts");
    const debugVisionDir = path.join(__dirname, "debug_vision");
    
    // Limpar pasta temp (sempre limpar)
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      files.forEach(file => {
        const filePath = path.join(tempDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          logger.warn(`Erro ao remover temp/${file}: ${e.message}`);
        }
      });
    }
    
    // Função para limpar arquivos antigos (7 dias)
    const limparArquivosAntigos = (dir, maxDays = 7) => {
      if (!fs.existsSync(dir)) return;
      
      const files = fs.readdirSync(dir);
      const agora = Date.now();
      const maxAge = maxDays * 24 * 60 * 60 * 1000; // 7 dias em ms
      
      let removidos = 0;
      files.forEach(file => {
        const filePath = path.join(dir, file);
        try {
          const stats = fs.statSync(filePath);
          const idade = agora - stats.mtime.getTime();
          
          if (idade > maxAge) {
          fs.unlinkSync(filePath);
            removidos++;
          }
        } catch (e) {
          logger.warn(`Erro ao verificar/remover ${file}: ${e.message}`);
        }
      });
      
      if (removidos > 0) {
        logger.info(`Removidos ${removidos} arquivos antigos de ${path.basename(dir)}/`);
      }
    };
    
    // Limpar arquivos de debug antigos (configurável via env)
    limparArquivosAntigos(debugDir, DEBUG_FILES_RETENTION_DAYS);
    limparArquivosAntigos(debugLayoutsDir, DEBUG_FILES_RETENTION_DAYS);
    limparArquivosAntigos(debugVisionDir, DEBUG_FILES_RETENTION_DAYS);
    
  } catch (e) {
    logger.warn(`Erro na limpeza de arquivos temporários: ${e.message}`);
  }
}

// Config
/** =========================
 * Configurações globais
 * - OPENAI_API_KEY: chave da API
 * - modeloVision: modelo usado para Vision (imagem -> JSON)
 * - temp: temperatura usada no Vision
 */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_PROJECT_ID = process.env.OPENAI_PROJECT_ID || "";
const OPENAI_ORG = process.env.OPENAI_ORG || "";

// Configurações do Vision (via .env)
const modeloVision = process.env.MODELO_VISION || "gpt-4.1-mini";
const tempVision = Number(process.env.TEMP_VISION || 0.1);
const maxTokensVision = Number(process.env.MAX_TOKENS_VISION || 20000);

// Variáveis de ambiente dos agentes
const MODELO_AGENTE_A = process.env.MODELO_AGENTE_A || "gpt-5-mini";
const MODELO_AGENTE_B = process.env.MODELO_AGENTE_B || "gpt-4o-mini";  
const MODELO_AGENTE_C = process.env.MODELO_AGENTE_C || "o3-mini";

// Agente A - JSON Analyst
async function runAgentA(figmaSpec, metodo, vectorStoreId) {
  const prompt = loadAgentPrompt('agente-a-json-analyst');
  if (!prompt) return null;
  
  const instruction = prompt.replaceAll("${metodo}", metodo);
  const figmaData = JSON.stringify(figmaSpec, null, 2);
  
  const mensagem = [
    `metodo: ${metodo}`,
    `dados_figma:`,
    figmaData
  ].join("\n");
  
  const fullPrompt = [instruction, "", "DADOS:", mensagem].join("\n");
  
  try {
    const body = {
      model: MODELO_AGENTE_A,
      input: fullPrompt,
      max_output_tokens: 20000,
      ...(USE_RAG && vectorStoreId ? { tools: [{ type: "file_search", vector_store_ids: [vectorStoreId] }] } : {})
    };
    
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", 
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODELO_AGENTE_A,
        messages: [{ role: "user", content: fullPrompt }],
        max_tokens: 20000
      })
    });
    
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    if (content) {
      const cleanContent = stripCodeFence(content);
      return JSON.parse(cleanContent);
    }
    
    return null;
  } catch (e) {
    logger.error(`Erro no Agente A: ${e.message}`);
    return null;
  }
}

// Agente B - Vision Reviewer  
async function runAgentB(imageBase64, metodo) {
  const prompt = loadAgentPrompt('agente-b-vision-reviewer');
  if (!prompt) return null;
  
  const instruction = prompt.replaceAll("${metodo}", metodo);
  
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODELO_AGENTE_B,
        messages: [{
          role: "user", 
          content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } }
          ]
        }],
        max_tokens: 4096
      })
    });
    
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    if (content) {
      const cleanContent = stripCodeFence(content);
      return JSON.parse(cleanContent);
    }
    
    return null;
  } catch (e) {
    logger.error(`Erro no Agente B: ${e.message}`);
    return null;
  }
}

// Agente C - Reconciler
async function runAgentC(achadosA, achadosB, metodo) {
  const prompt = loadAgentPrompt('agente-c-reconciler');
  if (!prompt) return null;
  
  const mensagem = [
    `heuristica: "${metodo}"`,
    `achadosA: ${JSON.stringify(achadosA, null, 2)}`,
    `achadosB: ${JSON.stringify(achadosB, null, 2)}`
  ].join("\n");
  
  const fullPrompt = [prompt, "", mensagem].join("\n");
  
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODELO_AGENTE_C,
        messages: [{ role: "user", content: fullPrompt }],
        max_tokens: 8000
      })
    });
    
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    if (content) {
      const cleanContent = stripCodeFence(content);
      return JSON.parse(cleanContent);
    }
    
    return null;
  } catch (e) {
    logger.error(`Erro no Agente C: ${e.message}`);
    return null;
  }
}
const MODELO_TEXTO  = process.env.MODELO_TEXTO || "gpt-5";
const MODELOS_SEM_TEMPERATURA = [/^gpt-5/i, /^o3/i, /^o4/i];
const TEMP_TEXTO    = Number(process.env.TEMP_TEXTO || 0.2);
const MAXTOK_TEXTO  = Number(process.env.MAX_TOKENS_TEXTO || 4000);

// Loop Toggles e modelos para etapa textual (Responses GPT‑5 vs Assistants)
// Forçar USE_RESPONSES=true (modo completo sempre ativo)
const USE_RESPONSES_DEFAULT = true; // /^(1|true|on|yes)$/i.test(process.env.USE_RESPONSES || "true");

// RAG (File Search / Vector Store)
const USE_RAG_DEFAULT = /^(1|true|on|yes)$/i.test(process.env.USE_RAG || "");
const VECTOR_STORE_ID_ENV = process.env.VECTOR_STORE_ID || "";

// Limpeza de arquivos temporários
const CLEANUP_TEMP_FILES = /^(1|true|on|yes)$/i.test(process.env.CLEANUP_TEMP_FILES || "true");
const DEBUG_FILES_RETENTION_DAYS = parseInt(process.env.DEBUG_FILES_RETENTION_DAYS) || 7;

// Análise de imagens no figmaSpec
const ANALYZE_IMAGES = /^(1|true|on|yes)$/i.test(process.env.ANALYZE_IMAGES || "true");

// Executar limpeza na inicialização
limparArquivosTemporarios();

// Executar limpeza a cada 6 horas
setInterval(limparArquivosTemporarios, 6 * 60 * 60 * 1000);





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
        const msg = `HTTP ${res.status} ${res.statusText} ${bodyText ? `- ${bodyText.slice(0, 200)}...` : ""}`;
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
      console.warn(`[retry] ${method} ${p} - tentativa ${attempt + 1}/${retry.retries + 1}; aguardando ${delay}ms`);
    } catch {
      console.warn(`[retry] ${method} ${url} - tentativa ${attempt + 1}/${retry.retries + 1}; aguardando ${delay}ms`);
    }
    await sleep(delay);
  }
  throw lastErr || new Error("fetchWithRetry: falha após todas as tentativas");
}


if (!OPENAI_API_KEY) {
  logger.error("Variável OPENAI_API_KEY não definida.");
  process.exit(1);
}

    // Cabeçalhos (uso básico só com a Project API Key)
    // Se quiser voltar a forçar Project/Org, basta descomentar as linhas correspondentes.
    const HEADERS_VISION = {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      // ...(OPENAI_PROJECT_ID ? { "OpenAI-Project": OPENAI_PROJECT_ID } : {}),
      // ...(OPENAI_ORG ? { "OpenAI-Organization": OPENAI_ORG } : {}),
    };

    const HEADERS_RESPONSES = {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
      // ...(OPENAI_PROJECT_ID ? { "OpenAI-Project": OPENAI_PROJECT_ID } : {}),
      // ...(OPENAI_ORG ? { "OpenAI-Organization": OPENAI_ORG } : {}),
    };


  // LOG de roteamento (sem vazar a chave)
  if (process.env.NODE_ENV === 'development') {
      const mask = (s) => (s ? s.slice(0, 7) + "..." : "(vazio)");
    logger.debug("ROUTING",
        "| project:", OPENAI_PROJECT_ID || "(sem header)",
        "| org:", OPENAI_ORG || "(sem header)",
        "| key:", process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.slice(0, 10) + "..." : "(sem)"
      );
  }

  /** Logger de status compacto */
  function status(group, msg, ok = true, extra) {
    const icon = ok ? "✅" : "⚠️";
    console.log(`   ${icon} ${msg}${extra ? `: ${extra}` : ""}`);
  }

  const logLine = (o) => fs.appendFileSync(path.join(__dirname, 'heuristica.ndjson'), JSON.stringify(o)+'\n');

  function readPromptFile(filename) {
    try {
      const promptPath = path.join(__dirname, 'prompts', filename);
      return fs.readFileSync(promptPath, 'utf8').trim();
    } catch (e) {
      logger.warn(`Não foi possível ler prompt de ${filename}:`, e.message);
      return null;
    }
  }


  const collectResponseToolTypes = (resp) => {
    const types = new Set();
    const visit = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      if (typeof node !== 'object') return;
      
      // Verificar se é um step de tool
      const kind = typeof node.type === 'string' ? node.type : null;
      if (kind) {
        const normalized = kind.toLowerCase();
        if (normalized.includes('file_search')) types.add('file_search');
        if ((normalized === 'tool_use' || normalized === 'tool_call' || normalized === 'tool_result') && typeof node.tool_name === 'string') {
          types.add(node.tool_name);
        }
      }
      
      // Verificar se há tool_calls na resposta
      if (node.tool_calls && Array.isArray(node.tool_calls)) {
        for (const toolCall of node.tool_calls) {
          if (toolCall.type === 'file_search') types.add('file_search');
          if (toolCall.function && toolCall.function.name === 'file_search') types.add('file_search');
        }
      }
      
      // Verificar se há steps na resposta
      if (node.steps && Array.isArray(node.steps)) {
        for (const step of node.steps) {
          if (step.type === 'tool' && step.tool_name === 'file_search') types.add('file_search');
          if (step.step_details && step.step_details.type === 'file_search') types.add('file_search');
        }
      }
      
      for (const key of Object.keys(node)) {
        if (key === 'tools') continue;
        visit(node[key]);
      }
    };
    
    // Visitar diferentes partes da resposta
    visit(resp?.output);
    visit(resp?.steps);
    visit(resp?.background);
    visit(resp);
    
    return Array.from(types);
  };


  const stripCodeFence = (s) => {
  if (!s || typeof s !== "string") return s;
  return s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
};

// Carrega prompts dos agentes
function loadAgentPrompt(agentName) {
  try {
    const promptPath = path.join(__dirname, 'prompts', `${agentName}.txt`);
    const promptContent = fs.readFileSync(promptPath, 'utf8').trim();
    logger.info(`📝 Prompt carregado: ${agentName} (${promptContent.length} chars)`);
    return promptContent;
  } catch (e) {
    logger.warn(`Não foi possível ler prompts/${agentName}.txt:`, e.message);
    return null;
  }
}

function buildHeurInstruction(metodo) {
  // Usar o prompt do Agente A (JSON Analyst)
  const prompt = loadAgentPrompt('agente-a-json-analyst');
  if (prompt) {
    return prompt.replaceAll("${metodo}", metodo);
  }
  
  logger.info(`📝 Usando prompt fallback`);
    // Fallback compactado baseado no heuristica.txt (formato JSON)
    return `Você é um especialista em UX com foco em análise heurística de interfaces digitais.

Avalie layouts fornecidos como JSON de layout (FigmaSpec). Identifique problemas prioritários e pontos positivos quando houver.

Método: ${metodo}.

Priorize dados do JSON. Use campos como:
- canvas.widthPx/heightPx, canvas.device
- components[] com bounds, spacing, textStyle, colorRefs
- typography.scale, palette, contrastPairs

Responda APENAS em formato JSON válido:
{
  "achados": [
    {
      "constatacao_hipotese": "Constatação ou Hipótese",
      "titulo_card": "Título do card",
      "heuristica_metodo": "Heurística/Método",
      "descricao": "Descrição com números do JSON",
      "sugestao_melhoria": "Sugestão de melhoria",
      "justificativa": "Benefício da melhoria",
      "severidade": "alto | médio | baixo | positiva",
      "referencias": ["lista de referências"]
    }
  ]
}

Use apenas: alto, médio, baixo, positiva para severidade.`;
  }
}


/** Extrai texto da Responses API (GPT‑5 etc.) de forma robusta */
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

  // Busca recursiva pela primeira string que pareça o seu formato 1-6
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
    })(j, /^\s*1\s*[---]\s*/m);
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
      // Run Cria uma run do Assistant (executa a análise heurística)
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
      console.warn("[WARN] probe falhou:", e.message);
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

    console.log(`\n📋 Análise iniciada:`);
    console.log(`   Layout: ${nomeLayoutUser || "(não especificado)"}`);
    console.log(`   Contexto: ${(descricao && descricao.trim()) ? descricao.trim().slice(0,100) + (descricao.length>100?"...":"") : "(vazio)"}`);

    const defaultCanvas = (canvas && canvas.width && canvas.height) ? canvas : null;

    // Log dos figmaSpecs reduzido
    if (figmaSpecs && Array.isArray(figmaSpecs) && figmaSpecs.length > 0) {
      logger.debug(`figmaSpecs: ${figmaSpecs.length} itens`);
    }

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

    const DEBUG_DIR = path.resolve(__dirname, 'debug_layouts');
    await fsp.rm(DEBUG_DIR, { recursive: true, force: true });
    await fsp.mkdir(DEBUG_DIR, { recursive: true }); 

    const job0 = performance.now(), batch_id = `batch_${Date.now()}`;

    for (let i = 0; i < N; i++) {
      const group = `ITEM ${i + 1}/${N}`;
      const hasSpec = !!figmaSpecs[i];
      const hasImg  = !!imgs[i];
      const itemImg = imgs[i];
      const s0 = performance.now();
      const tItem0 = performance.now();  // início do item
      const tPrep0 = performance.now();      // início do prep
      const spec    = hasSpec ? figmaSpecs[i] : null;

      console.log(`\n📱 Processando item ${i+1}/${N}:`);
      status(group, "Entrada", true, hasSpec ? "figmaSpec" : (hasImg ? "imagem" : "-"));

      // Descobrir W/H: usa canvas do spec, body (canvas) ou probe
      let W = null, H = null;
      if (hasSpec && spec) {
        try {
          // Se spec é string JSON, fazer parse direto
          let specStr = typeof spec === 'string' ? spec : JSON.stringify(spec);
          
          // Limpar caracteres de controle que podem quebrar o JSON
          specStr = specStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
          
          const specObj = JSON.parse(specStr);
          if (specObj?.canvas) {
            W = specObj.canvas.widthPx || null;
            H = specObj.canvas.heightPx || null;
          }
        } catch (e) {
          console.warn(`[DEBUG] Erro ao fazer parse do spec: ${e.message}`);
        }
      }
      if ((!W || !H) && defaultCanvas) {
        W = defaultCanvas.width; H = defaultCanvas.height;
      }
      if ((!W || !H) && hasImg) {
        const meta = await getImageSize(itemImg.url || itemImg);
        if (meta) { W = meta.width; H = meta.height; }
      }
      status(group, "Canvas px", !!(W && H), (W && H) ? `${W}x${H}` : "indefinido");

      // monta um bloco de contexto opcional (global + hints)
      const contextBlock = buildContextText(descricao, null, { W, H });
      status(group, "Vision: contexto", !!contextBlock, contextBlock ? "incluído" : "nenhum");

      let parsed = null;
      let raw = "";

      // 🔵 BYPASS VISION: usa diretamente o JSON vindo do Figma
      if (hasSpec) {
        // 🔵 BYPASS VISION: usa diretamente o JSON vindo do Figma
        // Se spec é string JSON, fazer parse direto
        if (typeof spec === 'string') {
          try {
            parsed = JSON.parse(spec);
          } catch (e) {
          console.warn(`[DEBUG] Erro ao fazer parse do spec: ${e.message}`);
            parsed = null;
          }
        } else {
          parsed = spec;
        }
        raw = JSON.stringify(parsed);
        status(group, "Modo", true, "usando figmaSpec (sem Vision)");
      // FALLBACK FALLBACK: usa Vision para converter imagem em JSON
      } else if (hasImg) {
        // FALLBACK FALLBACK: usa Vision para extrair do PNG
        const imagem = itemImg.url || itemImg;
        status(group, "Vision: chamada", true);
        
        // Lê o prompt do Vision do arquivo
        const promptVision = readPromptFile('vision.txt') || `Você é um especialista em UX que analisa interfaces digitais. Sua função é descrever textualmente o que a tela está transmitindo para o usuário, enriquecendo a análise heurística. Descreva de forma rica e detalhada o que você vê na interface, focando no impacto visual e emocional que ela causa no usuário. Analise hierarquia visual, tom e personalidade, clareza de propósito, elementos visuais, estados emocionais e contexto de uso. Responda em texto corrido e fluido, como se estivesse descrevendo a experiência para um colega de design. Seja específico sobre cores, tamanhos, posicionamentos e descreva o impacto emocional da interface.`;
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
            max_tokens: maxTokensVision,
            temperature: tempVision,
          }),
        }, { retries: 4, baseDelay: 600, maxDelay: 6000 });

        const rid = visionResponse.headers.get("x-request-id");
        if (!visionResponse.ok) {
          console.error("[ERROR] Vision body:", visionJson);
        }

        const usageV = visionJson?.usage || {};
        status(group, "Vision: tokens", true, `prompt:${usageV.prompt_tokens ?? "-"} completion:${usageV.completion_tokens ?? "-"} total:${usageV.total_tokens ?? "-"}`);

        const visionText = (visionJson?.choices?.[0]?.message?.content || "").trim();
        const stripCodeFence = (s) => s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
        raw = stripCodeFence(visionText);
        try { parsed = JSON.parse(raw); } catch { parsed = null; }

        try { fs.mkdirSync(path.join(__dirname, "debug_layouts"), { recursive: true }); } catch {}
        try { fs.writeFileSync(path.join(__dirname, "debug_layouts", "last_raw_always.json"), raw, "utf8"); } catch {}
        if (!parsed) {
          console.warn("[WARN] JSON inválido detectado, salvando saída bruta em debug_layouts/last_raw.json");
          try { fs.writeFileSync(path.join(__dirname, "debug_layouts", "last_raw.json"), raw, "utf8"); } catch {}
        }
      }

      // Normalizações comuns
      if (parsed && typeof parsed === 'object') {
        parsed.meta = parsed.meta || {};
        parsed.meta.modelLayoutName = parsed.layoutName || null;
        if (nomeLayoutUser) parsed.layoutName = String(nomeLayoutUser).slice(0, 80);
        else if (parsed.layoutName) parsed.layoutName = String(parsed.layoutName).slice(0, 80);
        else parsed.layoutName = "Untitled";

        const clamp = (s) => (s && s.length > 1000 ? s.slice(0, 1000) : s);
        const clean  = (s) => (s || "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
        const ctxUser = (descricao && descricao.trim()) ? clean(descricao) : "";

        if (parsed && typeof parsed === 'object') {
          const ctxUser = (descricao && descricao.trim()) ? clean(descricao) : "";
          parsed.meta = parsed.meta || {};
          if (ctxUser) parsed.meta.contextUser = clamp(ctxUser, 3000);
          if (parsed.meta.contextEcho) {
            parsed.meta.contextEcho = clamp(clean(parsed.meta.contextEcho), 1000);
          }
          // [ERROR] sem fallback: contextEcho é SEMPRE da IA; contextUser é SEMPRE do usuário
        }

        // Vision desabilitado quando há figmaSpec - só funciona com imagens reais
        // if (parsed && typeof parsed === 'object' && (!parsed.meta || !parsed.meta.contextEcho || parsed.meta.contextEcho === null || String(parsed.meta.contextEcho).trim().length < 60)) {
        //   const aiEcho = await summarizeContextEchoWithAI(parsed, HEADERS_VISION, modeloVision);
        //   if (aiEcho) parsed.meta = Object.assign({}, parsed.meta || {}, { contextEcho: aiEcho.trim().slice(0, 1000) });
        // }

        if (parsed && typeof parsed === 'object' && (!parsed.meta || !parsed.meta.contextEcho)) {
          const t=(parsed.mainText||[]).filter(Boolean).slice(0,2).join(" • ");
          const size=(parsed.canvas?.widthPx&&parsed.canvas?.heightPx)?`${parsed.canvas.widthPx}x${parsed.canvas.heightPx}px`:"indefinido";
          parsed.meta={...(parsed.meta||{}),contextEcho:`Layout "${parsed.layoutName}" (${parsed.canvas?.device||"indefinido"}), canvas ${size}. Destaques: ${t||"-"}.`};
        }

        // Pós-processamento local
        if (parsed && typeof parsed === 'object' && W && H) parsed = enrichWithCanvasPx(parsed, W, H);
        if (parsed && typeof parsed === 'object') parsed = addReadingOrderIfMissing(parsed);
        if (parsed && typeof parsed === 'object') {
          const mediaFix = splitIconVsImage(parsed);
          // parsed permanece o mesmo - splitIconVsImage só retorna misclassified
          if (mediaFix.misclassified?.length) status(group, "Correções ícone/imagem", true, `aplicadas: ${mediaFix.misclassified.length}`);
          else status(group, "Correções ícone/imagem", true, "nenhuma");
        }

        // Análise de imagens no figmaSpec
        if (parsed && typeof parsed === 'object' && hasSpec) {
          parsed = await analyzeImagesInFigmaSpec(parsed, HEADERS_VISION, modeloVision);
        }
      }

      // Persistir JSON bonito em disco + memória (sem poluir console)
      const visionPretty = parsed ? JSON.stringify(parsed, null, 2) : raw;
      LAST_VISION_RAW.push(visionPretty);
      try {
        const dir = path.join(__dirname, "debug_layouts");
        fs.mkdirSync(dir, { recursive: true });
        const fileName = hasSpec ? `figmaSpec_item${i+1}.json` : `vision_item${i+1}.json`;
        fs.writeFileSync(path.join(dir, fileName), visionPretty, "utf8");
        fs.writeFileSync(path.join(dir, "last.json"),
          JSON.stringify({ images: LAST_VISION_RAW, count: LAST_VISION_RAW.length }, null, 2),
          "utf8"
        );
        status(group, "Persistido", true, `debug_layouts/${fileName}`);

      status(group, "Agente", true, `Vision=${modeloVision} | Heurística=${USE_RESPONSES ? `Responses(${MODELO_TEXTO})` : "OFF"}`);
      status(group, "RAG", true, USE_RAG ? `ON (${vectorStoreId || "sem ID"})` : "OFF");

      if (USE_RESPONSES) {
      // Monta a mensagem mínima para a etapa textual
      const visionData = visionPretty || raw;
      const visionDataLimited = visionData.length > 50000 ? visionData.substring(0, 50000) + "\n... (dados truncados por tamanho)" : visionData;
        
        // Para figmaSpec, sempre incluir os dados no prompt (RAG não acessa arquivos locais)
        // Mas truncar se for muito grande para evitar estourar limites de tokens
        let figmaData = "";
        if (hasSpec) {
          const jsonString = JSON.stringify(spec, null, 2);
          const maxJsonSize = 40000; // ~10k tokens
          
          if (jsonString.length > maxJsonSize) {
            // Truncar mantendo estrutura essencial
            const truncatedSpec = {
              canvas: spec.canvas,
              components: spec.components?.slice(0, 20), // Primeiros 20 componentes
              typography: spec.typography,
              palette: spec.palette,
              contrastPairs: spec.contrastPairs?.slice(0, 10),
              meta: spec.meta
            };
            figmaData = JSON.stringify(truncatedSpec, null, 2);
            logger.info(`   figmaSpec truncado: ${jsonString.length} → ${figmaData.length} chars`);
          } else {
            figmaData = jsonString;
          }
        }
      
      const mensagemMinima = [
        `metodo: ${metodo}`,
        `contexto: ${descricao || "Nenhum."}`,
          hasSpec ? `dados_figma:` : `dados_imagem:`,
          hasSpec ? figmaData : visionDataLimited
      ].filter(Boolean).join("\n");
        // Usa o prompt do Assistant, se houver, como base. Se não, usa fallback.
        let instr = buildHeurInstruction(metodo);
        
        
        // Verificar se o prompt final não vai estourar limites
        // Ajustar tokens para modelos O3 (limite TPM menor)
        let maxTokens = MAXTOK_TEXTO;
        const isO3Model = /^o3/i.test(MODELO_TEXTO);
        if (isO3Model) {
          maxTokens = Math.min(MAXTOK_TEXTO, 4000);
        }
        
        const totalPromptLength = instr.length + mensagemMinima.length;
        const estimatedTokens = Math.ceil(totalPromptLength / 4);
        const maxAllowedTokens = maxTokens * 0.7; // 70% do limite para deixar espaço para resposta
        
        if (estimatedTokens > maxAllowedTokens) {
          logger.warn(`   Prompt muito grande: ${estimatedTokens} tokens (limite: ${maxAllowedTokens})`);
          // Reduzir ainda mais o figmaSpec se necessário
          if (hasSpec && figmaData.length > 20000) {
            const minimalSpec = {
              canvas: spec.canvas,
              components: spec.components?.slice(0, 10),
              meta: spec.meta
            };
            figmaData = JSON.stringify(minimalSpec, null, 2);
            logger.info(`   figmaSpec reduzido para mínimo: ${figmaData.length} chars`);
          }
        }
        if (isO3Model && instr.length > 8000) {
          // Versão reduzida do prompt para O3
          instr = `Você é um especialista em análise heurística de interfaces digitais.

Analise o JSON de layout fornecido e identifique problemas prioritários usando heurísticas de Nielsen ou vieses cognitivos.

Responda APENAS em formato JSON válido:
{
  "achados": [
    {
      "constatacao_hipotese": "Constatação ou Hipótese",
      "titulo_card": "Título do card",
      "heuristica_metodo": "Heurística/Método",
      "descricao": "Descrição do problema com números do JSON",
      "sugestao_melhoria": "Sugestão de melhoria",
      "justificativa": "Benefício da melhoria",
      "severidade": "alto | médio | baixo | positiva",
      "referencias": ["lista de referências"]
    }
  ]
}

Método: ${metodo}.
Priorize fatos geométricos (dx/dy, contraste, padding, gaps).
Para múltiplos achados, adicione mais objetos no array "achados".`;
        }

        const instr2 = `${instr}

        Regra de saída OBRIGATÓRIA:
        - Responda APENAS em formato JSON válido.
        - Estrutura obrigatória:
        {
          "achados": [
            {
              "constatacao_hipotese": "Constatação ou Hipótese",
              "titulo_card": "Título do card (curto e específico)",
              "heuristica_metodo": "Heurística/Método (apenas 1)",
              "descricao": "Descrição do problema/acerto com números do JSON",
              "sugestao_melhoria": "Sugestão de melhoria ou passos de verificação",
              "justificativa": "Benefício da melhoria",
              "severidade": "alto | médio | baixo | positiva",
              "referencias": ["lista", "de", "referências"]
            }
          ]
        }
        - Para múltiplos achados, adicione mais objetos no array "achados"
        - Use sempre a mesma estrutura para cada achado
        
        `;

        // figmaSpecFile foi removido - sempre usar dados inline agora
        const figmaSpecFile = null;

        const prompt = [instr2.replaceAll("${metodo}", metodo), "", "DADOS:", mensagemMinima].join("\n");

        // Salvar prompt do figmaSpec para debug
        if (process.env.NODE_ENV === 'development') {
        try {
          const debugDir = path.join(__dirname, "debug_responses");
          fs.mkdirSync(debugDir, { recursive: true });
          const promptFile = path.join(debugDir, `prompt_item${i+1}.txt`);
          fs.writeFileSync(promptFile, prompt, 'utf8');
        } catch (e) {
            console.warn(`   ⚠️ Erro ao salvar prompt: ${e.message}`);
          }
        }

        // Log do prompt reduzido
        const finalEstimatedTokens = Math.ceil(prompt.length / 4);
        const promptType = hasSpec ? "prompt + dados Figma" : "prompt + dados imagem";
        console.log(`   📝 Prompt: ${prompt.length.toLocaleString()} chars (~${finalEstimatedTokens.toLocaleString()} tokens), Tipo: ${promptType}`);
        

        const skipTemp = MODELOS_SEM_TEMPERATURA.some((rx) => rx.test(String(MODELO_TEXTO || "")));

        const body = {
          model: MODELO_TEXTO,
          input: prompt,
          ...(skipTemp ? {} : { temperature: TEMP_TEXTO }),
          max_output_tokens: maxTokens,
          ...(USE_RAG && vectorStoreId ? { tools: [{ type: "file_search", vector_store_ids: [vectorStoreId] }] } : {})
        };

        // Log da requisição
        console.log(`   📤 Enviando para ${body.model}: ${body.max_output_tokens.toLocaleString()} tokens máx${body.tools ? ', RAG ativo' : ''}`);

        const prep_ms = performance.now() - tPrep0;
        const tInfer = performance.now();

        const r = await fetchWithRetry("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: HEADERS_RESPONSES,
          body: JSON.stringify(body)
        }, { retries: 4, baseDelay: 600, maxDelay: 6000 });

        const jr = await r.json().catch(() => ({}));
        const tPost0 = performance.now(); // início do pós-processamento
        
        const ragStepTypes = (USE_RAG && vectorStoreId) ? collectResponseToolTypes(jr) : [];
        const ragUsed = ragStepTypes.includes('file_search');
        let rag_ms = 0;
        const ragFromUsage = jr?.usage?.metadata?.file_search_ms;
        
        // Log de tokens de entrada e saída
        const usage = jr?.usage;
        if (usage) {
          const promptTokens = usage.prompt_tokens || 0;
          const completionTokens = usage.completion_tokens || 0;
          const totalTokens = usage.total_tokens || 0;
          
          // Se os tokens individuais estão zerados mas o total não, usar estimativa
          let displayPromptTokens = promptTokens;
          let displayCompletionTokens = completionTokens;
          
          if (promptTokens === 0 && completionTokens === 0 && totalTokens > 0) {
            // Estimativa baseada no tamanho do prompt e resposta
            const estimatedPromptTokens = Math.ceil(prompt.length / 4);
            const estimatedCompletionTokens = totalTokens - estimatedPromptTokens;
            displayPromptTokens = estimatedPromptTokens;
            displayCompletionTokens = Math.max(0, estimatedCompletionTokens);
            console.log(`   📊 Tokens: entrada=${displayPromptTokens.toLocaleString()}, saída=${displayCompletionTokens.toLocaleString()}, total=${totalTokens.toLocaleString()}`);
          } else {
            console.log(`   📊 Tokens: entrada=${displayPromptTokens.toLocaleString()}, saída=${displayCompletionTokens.toLocaleString()}, total=${totalTokens.toLocaleString()}`);
          }
        }
        
        // Log do RAG se usado
        if (ragUsed) {
          console.log(`   🔍 RAG: ${ragStepTypes.join(', ')}`);
        }
        
        
        if (typeof ragFromUsage === 'number' && ragFromUsage >= 0) {
          rag_ms = ragFromUsage;
        } else {
          // Tentar calcular tempo baseado na diferença entre início da inferência e fim
          // Como o RAG acontece durante a inferência, vamos usar uma estimativa baseada no tempo total
          const totalInferenceTime = performance.now() - tInfer;
          if (ragUsed && totalInferenceTime > 0) {
            // Estimativa: RAG geralmente representa 10-30% do tempo de inferência
            rag_ms = Math.round(totalInferenceTime * 0.2); // 20% do tempo de inferência
          }
        }
        status(group, "Responses: rag steps", ragUsed, ragStepTypes.length ? ragStepTypes.join(', ') : "nenhum");
        try { fs.mkdirSync(path.join(__dirname, "debug_responses"), { recursive: true }); fs.writeFileSync(path.join(__dirname, "debug_responses", "last.json"), JSON.stringify(jr, null, 2), "utf8"); } catch {}
        const ridR = r.headers.get("x-request-id");
        status(group, "Responses: reqId", !!ridR, ridR || "(sem id)");
        status(group, "Responses: status", true, String(jr?.status || r.status));

        if (!r.ok) {
          console.error("[ERROR] Responses body:", jr);
          respostasIndividuais.push("[WARN] Não foi possível analisar. [[[FIM_HEURISTICA]]]");
          continue;
        }

        let out = extractResponsesText(jr);
        if (!out) {
          const flat = (jr?.output || []).flatMap(i => (i?.content || []).map(c => c?.text?.value || c?.text || "")).filter(Boolean).join("\n").trim();
          out = flat || (jr?.output_text || "");
        }
        
        // Processar resposta JSON
        if (out) {
          try {
            // Tentar extrair JSON da resposta
            let jsonText = out.trim();
            
            // Se a resposta não começa com {, tentar encontrar o JSON
            if (!jsonText.startsWith('{')) {
              const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                jsonText = jsonMatch[0];
              }
            }
            
            const parsed = JSON.parse(jsonText);
            
            if (parsed.achados && Array.isArray(parsed.achados)) {
              // Converter JSON para formato texto numerado
              const achadosTexto = [];
              parsed.achados.forEach((achado, index) => {
                const achadoTexto = [
                  `1 - ${achado.constatacao_hipotese || 'N/A'}`,
                  `2 - ${achado.titulo_card || 'N/A'}`,
                  `3 - ${achado.heuristica_metodo || 'N/A'}`,
                  `4 - ${achado.descricao || 'N/A'}`,
                  `5 - ${achado.sugestao_melhoria || 'N/A'}`,
                  `6 - ${achado.justificativa || 'N/A'}`,
                  `7 - ${achado.severidade || 'N/A'}`,
                  `8 - ${Array.isArray(achado.referencias) ? achado.referencias.join(', ') : (achado.referencias || 'N/A')}`
                ].join('\n');
                
                achadosTexto.push(achadoTexto);
              });
              
              out = achadosTexto.join('\n[[[FIM_HEURISTICA]]]\n');
              
            } else {
              console.warn(`⚠️ [${group}] JSON inválido ou sem campo 'achados'`);
            }
            
          } catch (e) {
            console.warn(`⚠️ [${group}] Erro ao processar JSON: ${e.message}`);
          }
        }
        status(group, "Responses: ok", !!out, out ? "texto" : "vazio");
        
        
        respostasIndividuais.push(out || "[WARN] Resposta vazia. [[[FIM_HEURISTICA]]]");
        
        const total_ms_responses = performance.now()-s0;
        const inferencia_total_ms_responses = performance.now()-tInfer;
        const inferencia_sem_rag_ms_responses = Math.max(0, inferencia_total_ms_responses - rag_ms);
        
        logLine({ ts:new Date().toISOString(), batch_id, screen_name: nomeLayoutUser || "(sem nome)", model_name: MODELO_TEXTO, screen_duration_ms: total_ms_responses, prep_ms, rag_ms, infer_ms: inferencia_sem_rag_ms_responses, post_ms: performance.now()-tPost0 });
        console.log(
          `[${group}] Timer Tela: ${sec(total_ms_responses)}s | ` +
          `prep: ${sec(prep_ms)}s | RAG: ${sec(rag_ms)}s | inferência: ${sec(inferencia_sem_rag_ms_responses)}s | pós: ${sec(performance.now()-tPost0)}s`
        );
        
        // Log de resumo de tokens
        if (usage) {
          const promptTokens = usage.prompt_tokens || 0;
          const completionTokens = usage.completion_tokens || 0;
          const totalTokens = usage.total_tokens || 0;
          
          // Usar estimativas se necessário
          let displayPromptTokens = promptTokens;
          let displayCompletionTokens = completionTokens;
          
          if (promptTokens === 0 && completionTokens === 0 && totalTokens > 0) {
            const estimatedPromptTokens = Math.ceil(prompt.length / 4);
            const estimatedCompletionTokens = totalTokens - estimatedPromptTokens;
            displayPromptTokens = estimatedPromptTokens;
            displayCompletionTokens = Math.max(0, estimatedCompletionTokens);
          }
          
          console.log(`[${group}] Resumo Tokens: ${displayPromptTokens.toLocaleString()} entrada + ${displayCompletionTokens.toLocaleString()} saída = ${totalTokens.toLocaleString()} total`);
        }

        continue;
      }
      } catch (e) {
        status(group, "Persistido", false, e.message);
      }

      // 2) Análise heurística usando prompt direto
      if (!USE_RESPONSES) {
        // Usar prompt direto para análise heurística
        const heurInstruction = buildHeurInstruction(metodo);
        const promptCompleto = `${heurInstruction}\n\nJSON do layout:\n${visionPretty || raw}`;
        
        try {
          const responseHeur = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: HEADERS_VISION,
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [{ role: "user", content: promptCompleto }],
              temperature: parseFloat(process.env.TEMP_TEXTO || "0.2"),
              max_tokens: parseInt(process.env.MAX_TOKENS_TEXTO || "8192")
            }),
          });
          
          const heurData = await responseHeur.json();
          const heurText = heurData.choices?.[0]?.message?.content || "[WARN] Resposta vazia da análise heurística.";
          
          respostasIndividuais.push(heurText);
          status(group, "Análise heurística: concluída (prompt direto)", true);
        } catch (e) {
          console.error("[ERROR] Erro na análise heurística:", e.message);
          respostasIndividuais.push("[WARN] Erro na análise heurística. [[[FIM_HEURISTICA]]]");
          status(group, "Análise heurística: erro", false);
        }
        continue;
      } else {
        // Fallback: análise direta sem Responses
        logger.warn(`Modo fallback: USE_RESPONSES=false - análise limitada`);
        
        const tInfer = performance.now();
        const prep_ms = performance.now() - tPrep0;
        const tPost0 = performance.now();
        
        // Resposta simples indicando que não há análise heurística
        const textoFallback = "Análise heurística não disponível. Configure USE_RESPONSES=true para ativar a análise completa.";
        
        const infer_ms = performance.now() - tInfer;
        const post_ms = performance.now() - tPost0;
        const total_ms = performance.now() - tItem0;
        
        // Construir canvasPx a partir de W e H
        const canvasPx = (W && H) ? `${W}x${H}` : "indefinido";
        
        console.log(`[${group}] Timer Tela: ${(total_ms / 1000).toFixed(2)}s | prep: ${(prep_ms / 1000).toFixed(2)}s | RAG: ${(0 / 1000).toFixed(2)}s | inferência: ${(infer_ms / 1000).toFixed(2)}s | pós: ${(post_ms / 1000).toFixed(2)}s`);
        console.log(`[${group}] Resumo Tokens: 0 entrada + 0 saída = 0 total`);
        
        respostasIndividuais.push({
          item: i + 1,
          texto: textoFallback,
          figmaSpec: parsed,
          canvasPx: canvasPx,
          method: metodo,
          context: descricao,
          timing: { prep_ms, infer_ms, post_ms, total_ms },
          tokens: { input: 0, output: 0, total: 0 }
        });
      }


    }
    
    // Delay entre requisições para evitar limite TPM do O3
    if (N > 1 && MODELO_TEXTO && /o3/i.test(MODELO_TEXTO)) {
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    console.log(`\n📊 Resumo: ${sec(performance.now()-job0)}s total (${N} telas processadas)`);
    console.log(`📤 Enviando ${respostasIndividuais.length} respostas para o frontend`);
    
    // Limpar arquivos temporários após o processamento
    limparArquivosTemporarios();
    
    return res.json({ respostas: respostasIndividuais });
  } catch (err) {
    logger.error("Erro geral:", err?.message || err);
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
    const fnameAll = path.join(__dirname, "debug_layouts", "last.json");
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
    const fnameAll = path.join(__dirname, "debug_layouts", "last.json");
    const s = fs.readFileSync(fnameAll, "utf8");
    const j = JSON.parse(s);
    if (j?.images) return res.json({ images: j.images, count: j.images.length });
  } catch {}
  return res.status(404).json({ error: "Nenhum Vision JSON na memória ainda." });
});

app.get("/", (_req, res) => {
  res.send("[OK] Backend rodando com Vision ➜ Assistant (v2) + status logs. Deploy automático ativo! ✅");
});

const PORT = process.env.PORT || 3000;
const ndjsonPath = path.join(__dirname, 'heuristica.ndjson');

app.listen(PORT, () => {
  logger.info(`Servidor iniciado na porta ${PORT}`);
  logger.info(`Logs salvos em: ${ndjsonPath}`);
  
  // Log das configurações do modelo
  logger.info(`\nConfigurações:`);
  logger.info(`   Vision: ${modeloVision} (temp: ${tempVision}, tokens: ${maxTokensVision.toLocaleString()})`);
  logger.info(`   Texto: ${MODELO_TEXTO}`);
  
  // Mostrar temperatura ou reasoning dependendo do modelo
  if (MODELOS_SEM_TEMPERATURA.some(pattern => pattern.test(MODELO_TEXTO))) {
    if (/^o3/i.test(MODELO_TEXTO)) {
      const reasoning = process.env.REASONING_EFFORT || 'medium';
      logger.info(`   Reasoning: ${reasoning}`);
    } else {
      logger.info(`   Temperatura: não aplicável (modelo ${MODELO_TEXTO})`);
    }
  } else {
    const tempTexto = Number(process.env.TEMP_TEXTO || 0.2);
    logger.info(`   Temperatura: ${tempTexto}`);
  }
  
  const maxTokTexto = Number(process.env.MAXTOK_TEXTO || 20000);
  logger.info(`   Tokens: ${maxTokTexto.toLocaleString()}`);
  
  const useRagStatus = USE_RAG_DEFAULT ? 'ON' : 'OFF';
  const vectorStoreId = VECTOR_STORE_ID_ENV;
  logger.info(`   RAG: ${useRagStatus}${useRagStatus === 'ON' && vectorStoreId ? ` (${vectorStoreId})` : ''}`);
  
  const cleanupStatus = CLEANUP_TEMP_FILES ? 'ON' : 'OFF';
  logger.info(`   Limpeza automática: ${cleanupStatus}`);
  
  const analyzeImagesStatus = ANALYZE_IMAGES ? 'ON' : 'OFF';
  logger.info(`   Análise de imagens: ${analyzeImagesStatus}`);
  logger.info('');
}).on('error', (err) => {
  logger.error('Erro ao iniciar servidor:', err.message);
  process.exit(1);
});

// Capturar erros não tratados
process.on('uncaughtException', (err) => {
  logger.error('Erro não tratado:', err.message);
  logger.error('Stack:', err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promise rejeitada:', reason);
  process.exit(1);
});


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
    // Log removido para evitar spam no healthcheck
    res.json({ ok: r.ok, id: j?.id, status: r.status });
  } catch (e) {
    logger.error("Erro ping-openai:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ==========================================
// ENDPOINTS TEMPORÁRIOS PARA DEBUG
// ==========================================

// Endpoint para listar arquivos de debug
app.get('/debug/files', (req, res) => {
  try {
    const files = {
      debug_layouts: [],
      debug_responses: [],
      debug_vision: []
    };
    
    // Listar arquivos de cada diretório
    const dirs = ['debug_layouts', 'debug_responses', 'debug_vision'];
    
    dirs.forEach(dir => {
      const dirPath = path.join(__dirname, dir);
      if (fs.existsSync(dirPath)) {
        const dirFiles = fs.readdirSync(dirPath).map(file => ({
          name: file,
          path: `${dir}/${file}`,
          size: fs.statSync(path.join(dirPath, file)).size,
          modified: fs.statSync(path.join(dirPath, file)).mtime
        }));
        files[dir] = dirFiles;
      }
    });
    
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint para baixar arquivo específico
app.get('/debug/download/:dir/:file', (req, res) => {
  try {
    const { dir, file } = req.params;
    const filePath = path.join(__dirname, dir, file);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Se for JSON, formatar
    if (file.endsWith('.json')) {
      try {
        const parsed = JSON.parse(content);
        res.json(parsed);
      } catch {
        res.type('text/plain').send(content);
      }
    } else {
      res.type('text/plain').send(content);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * ============================================
 *  Rota de Benchmark Multi-IA com Imagens
 * ============================================
 */
app.post("/benchmark-multi-ai", async (req, res) => {
  try {
    console.log(`\n🔥 [DEBUG] Endpoint /benchmark-multi-ai chamado!`);
    console.log(`🔥 [DEBUG] Body recebido:`, JSON.stringify(req.body, null, 2));
    
    const { figmaSpecs, categoria = 'free', testType = 'layout-analysis' } = req.body;
    
    console.log(`\n🚀 Benchmark Multi-IA iniciado:`);
    console.log(`   Categoria: ${categoria}`);
    console.log(`   Teste: ${testType}`);
    console.log(`   FigmaSpecs: ${figmaSpecs?.length || 0}`);

    // Verificar se OpenRouter está configurado
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes('your-key-here')) {
      return res.status(400).json({ 
        error: "OPENROUTER_API_KEY não configurada",
        message: "Configure sua chave OpenRouter no arquivo .env"
      });
    }

    // Modelos disponíveis para benchmark
    const BENCHMARK_MODELS = {
      'free': {
        'meta-llama/llama-3.3-70b-instruct': {
          name: 'Llama 3.3 70B',
          provider: 'Meta',
          cost: 'Free',
          description: 'Modelo open source avançado',
          maxTokens: 8192,
          temperature: 0.1
        },
        'mistralai/mistral-7b-instruct': {
          name: 'Mistral 7B',
          provider: 'Mistral AI',
          cost: 'Free',
          description: 'Modelo francês eficiente',
          maxTokens: 4096,
          temperature: 0.1
        },
        'meta-llama/llama-3.1-8b-instruct': {
          name: 'Llama 3.1 8B',
          provider: 'Meta',
          cost: 'Free',
          description: 'Modelo compacto e rápido',
          maxTokens: 4096,
          temperature: 0.1
        },
        'x-ai/grok-4-fast:free': {
          name: 'Grok 4 Fast',
          provider: 'xAI',
          cost: 'Free',
          description: 'Modelo multimodal mais recente da xAI',
          maxTokens: 8192,
          temperature: 0.1
        },
        'deepseek/deepseek-chat-v3.1:free': {
          name: 'DeepSeek V3.1',
          provider: 'DeepSeek',
          cost: 'Free',
          description: 'Modelo híbrido 671B com raciocínio',
          maxTokens: 2048,
          temperature: 0.1
        },
        'openai/gpt-oss-20b': {
          name: 'GPT-OSS 20B',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'Modelo MoE 21B da OpenAI',
          maxTokens: 512,
          temperature: 0.1
        },
        'deepseek/deepseek-r1-0528-qwen3-8b': {
          name: 'DeepSeek R1 Qwen3 8B',
          provider: 'DeepSeek',
          cost: 'Free',
          description: 'Modelo R1 com Qwen3 8B',
          maxTokens: 8192,
          temperature: 0.1
        },
        'qwen/qwen3-235b-a22b': {
          name: 'Qwen3 235B A22B',
          provider: 'Qwen',
          cost: 'Free',
          description: 'Modelo MoE 235B com modo pensante',
          maxTokens: 8192,
          temperature: 0.1
        },
        'tngtech/deepseek-r1t-chimera': {
          name: 'DeepSeek R1T Chimera',
          provider: 'TNG',
          cost: 'Free',
          description: 'Fusão R1 + V3 com raciocínio avançado',
          maxTokens: 2048,
          temperature: 0.1
        },
        'microsoft/mai-ds-r1': {
          name: 'Microsoft MAI DS R1',
          provider: 'Microsoft',
          cost: 'Free',
          description: 'DeepSeek-R1 melhorado pela Microsoft',
          maxTokens: 2048,
          temperature: 0.1
        },
        'qwen/qwen3-14b': {
          name: 'Qwen3 14B',
          provider: 'Qwen',
          cost: 'Free',
          description: 'Modelo 14B com modo pensante',
          maxTokens: 2048,
          temperature: 0.1
        },
        'tngtech/deepseek-r1t2-chimera': {
          name: 'DeepSeek R1T2 Chimera',
          provider: 'TNG',
          cost: 'Free',
          description: 'Chimera 2ª geração - 20% mais rápido',
          maxTokens: 8192,
          temperature: 0.1
        },
        'mistralai/mistral-small-3.2-24b-instruct': {
          name: 'Mistral Small 3.2 24B',
          provider: 'Mistral',
          cost: 'Free',
          description: 'Modelo 24B com suporte a imagens',
          maxTokens: 8192,
          temperature: 0.1
        },
        'moonshotai/kimi-k2:free': {
          name: 'Kimi K2 0711',
          provider: 'MoonshotAI',
          cost: 'Free',
          description: 'MoE 1T parâmetros com 32B ativos',
          maxTokens: 2048,
          temperature: 0.1
        },
        'deepseek/deepseek-r1-0528': {
          name: 'DeepSeek R1 0528',
          provider: 'DeepSeek',
          cost: 'Free',
          description: 'Equivalente ao OpenAI o1 - código aberto',
          maxTokens: 8192,
          temperature: 0.1
        },
        'mistralai/devstral-small-2505': {
          name: 'Devstral Small 2505',
          provider: 'Mistral',
          cost: 'Free',
          description: 'LLM agêntico para engenharia de software',
          maxTokens: 8192,
          temperature: 0.1
        },
        'meta-llama/llama-3.3-8b-instruct:free': {
          name: 'Llama 3.3 8B Instruct',
          provider: 'Meta',
          cost: 'Free',
          description: 'Variante ultrarrápida do Llama 3.3',
          maxTokens: 2048,
          temperature: 0.1
        },
        'x-ai/grok-4-fast': {
          name: 'Grok 4 Fast',
          provider: 'xAI',
          cost: 'Free',
          description: 'Multimodal com 2M contexto e raciocínio',
          maxTokens: 2000000,
          temperature: 0.1
        },
        'nvidia/nemotron-nano-9b-v2': {
          name: 'NVIDIA Nemotron Nano 9B V2',
          provider: 'NVIDIA',
          cost: 'Free',
          description: 'Modelo unificado para raciocínio',
          maxTokens: 2048,
          temperature: 0.1
        },
        'openai/gpt-oss-120b': {
          name: 'GPT-OSS 120B',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'Modelo MoE 117B da OpenAI',
          maxTokens: 33000,
          temperature: 0.1
        },
        'openai/gpt-oss-20b': {
          name: 'GPT-OSS 20B',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'Modelo MoE 21B da OpenAI',
          maxTokens: 131000,
          temperature: 0.1
        },
        'z-ai/glm-4.5-air': {
          name: 'GLM 4.5 Air',
          provider: 'Z.AI',
          cost: 'Free',
          description: 'MoE compacto com modo pensante',
          maxTokens: 2048,
          temperature: 0.1
        },
        'qwen/qwen3-coder:free': {
          name: 'Qwen3 Coder 480B A35B',
          provider: 'Qwen',
          cost: 'Free',
          description: 'Modelo MoE 480B especializado em código',
          maxTokens: 8192,
          temperature: 0.1
        },
        'moonshotai/kimi-k2-0711': {
          name: 'Kimi K2 0711',
          provider: 'MoonshotAI',
          cost: 'Free',
          description: 'Modelo MoE 1T especializado em agentes',
          maxTokens: 33000,
          temperature: 0.1
        },
        'cognitivecomputations/dolphin-mistral-24b-venice-edition:free': {
          name: 'Venice Uncensored',
          provider: 'Cognitive Computations',
          cost: 'Free',
          description: 'Modelo sem censura com controle total',
          maxTokens: 2048,
          temperature: 0.1
        },
        'tencent/hunyuan-a13b-instruct': {
          name: 'Hunyuan A13B Instruct',
          provider: 'Tencent',
          cost: 'Free',
          description: 'Modelo MoE 80B da Tencent',
          maxTokens: 2048,
          temperature: 0.1
        },
        // Modelos OpenAI integrados
        'gpt-4.1-mini': {
          name: 'GPT-4.1 Mini',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'Balanceado - bom custo-benefício',
          maxTokens: 2048,
          temperature: 0.1,
          isOpenAI: true
        },
        'gpt-4o-mini': {
          name: 'GPT-4o Mini',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'Vision otimizada - melhor para imagens',
          maxTokens: 2048,
          temperature: 0.1,
          isOpenAI: true
        },
        'gpt-4o': {
          name: 'GPT-4o',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'Alta qualidade - mais preciso',
          maxTokens: 2048,
          temperature: 0.1,
          isOpenAI: true
        }
      },
      'low-cost': {
        'anthropic/claude-3-haiku': {
          name: 'Claude 3 Haiku',
          provider: 'Anthropic',
          cost: '$0.25/1M tokens',
          description: 'Modelo rápido e eficiente',
          maxTokens: 4096,
          temperature: 0.1
        },
        'openai/gpt-4o-mini': {
          name: 'GPT-4o Mini',
          provider: 'OpenAI',
          cost: '$0.15/1M tokens',
          description: 'Versão otimizada do GPT-4',
          maxTokens: 8192,
          temperature: 0.1
        }
      },
      'openai': {
        'gpt-4.1-mini': {
          name: 'GPT-4.1 Mini',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'Balanceado - bom custo-benefício',
          maxTokens: 2048,
          temperature: 0.1
        },
        'gpt-4o-mini': {
          name: 'GPT-4o Mini',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'Vision otimizada - melhor para imagens',
          maxTokens: 2048,
          temperature: 0.1
        },
        'gpt-4o': {
          name: 'GPT-4o',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'Alta qualidade - mais preciso',
          maxTokens: 2048,
          temperature: 0.1
        },
        'gpt-5': {
          name: 'GPT-5',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'Premium - máxima qualidade textual',
          maxTokens: 2048,
          temperature: 0.1
        },
        'o3-mini': {
          name: 'O3 Mini',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'O3 determinístico - análise mais profunda',
          maxTokens: 2048,
          temperature: null,
          reasoning: 'medium'
        },
        'o3': {
          name: 'O3',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'O3 máximo - análise mais complexa',
          maxTokens: 2048,
          temperature: null,
          reasoning: 'high'
        },
        'o4-mini': {
          name: 'O4 Mini',
          provider: 'OpenAI',
          cost: 'Free',
          description: 'O4-mini - próxima geração com análise avançada',
          maxTokens: 2048,
          temperature: null,
          reasoning: 'high'
        }
      },
      'premium': {
        'anthropic/claude-3.5-sonnet': {
          name: 'Claude 3.5 Sonnet',
          provider: 'Anthropic',
          cost: '$3/1M tokens',
          description: 'Melhor modelo para análise e raciocínio',
          maxTokens: 8192,
          temperature: 0.1
        },
        'openai/gpt-4o': {
          name: 'GPT-4o',
          provider: 'OpenAI',
          cost: '$5/1M tokens',
          description: 'Modelo mais avançado da OpenAI',
          maxTokens: 8192,
          temperature: 0.1
        }
      }
    };

    // Prompts de teste específicos para UX/UI
    const UX_TEST_PROMPTS = {
      'layout-analysis': {
        title: 'Análise de Layout',
        prompt: `Analise este layout de interface e identifique os 2 problemas mais importantes de usabilidade:

Identifique:
1. UM problema de hierarquia visual
2. UMA questão de navegação

Para cada problema, explique:
- O que está errado
- Por que é problemático
- Como melhorar

Responda de forma clara e objetiva.`
      },
      'color-contrast': {
        title: 'Análise de Contraste',
        prompt: `Analise o contraste de cores nesta interface:

Avalie:
1. Conformidade com WCAG 2.1
2. Legibilidade do texto
3. Acessibilidade para daltônicos
4. Recomendações de melhoria

Forneça análise técnica detalhada.`
      },
      'navigation-flow': {
        title: 'Fluxo de Navegação',
        prompt: `Analise o fluxo de navegação desta aplicação:

Identifique:
1. Pontos de confusão
2. Caminhos desnecessários
3. Falta de feedback visual
4. Sugestões de otimização

Seja específico e prático.`
      }
    };

    const models = BENCHMARK_MODELS[categoria];
    if (!models) {
      return res.status(400).json({ 
        error: `Categoria "${categoria}" não encontrada`,
        available: Object.keys(BENCHMARK_MODELS)
      });
    }

    const testPrompt = UX_TEST_PROMPTS[testType];
    if (!testPrompt) {
      return res.status(400).json({ 
        error: `Tipo de teste "${testType}" não encontrado`,
        available: Object.keys(UX_TEST_PROMPTS)
      });
    }

    // Função para fazer requisição ao OpenRouter ou OpenAI
    async function callOpenRouter(modelId, prompt, figmaSpec, maxTokens = 4000) {
      const startTime = Date.now();
      
      try {
        let finalPrompt = prompt;
        
        // Se há FigmaSpec, adiciona ao prompt (como na análise normal)
        if (figmaSpec) {
          finalPrompt = `${prompt}\n\nDados do Figma:\n${JSON.stringify(figmaSpec, null, 2)}`;
        }

        const messages = [
          { role: "user", content: finalPrompt }
        ];

        // Obter informações do modelo primeiro
        const modelInfo = models[modelId];
        
        // Detectar se é modelo OpenAI (categoria 'openai' ou flag isOpenAI)
        const isOpenAI = categoria === 'openai' || modelInfo?.isOpenAI;
        const apiUrl = isOpenAI ? "https://api.openai.com/v1/chat/completions" : "https://openrouter.ai/api/v1/chat/completions";
        const apiKey = isOpenAI ? OPENAI_API_KEY : OPENROUTER_API_KEY;
        
        const headers = {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        };
        
        // Headers específicos do OpenRouter
        if (!isOpenAI) {
          headers['HTTP-Referer'] = 'http://localhost:3000';
          headers['X-Title'] = 'Heuristica UX Benchmark';
        }

        const requestBody = {
          model: modelId,
          messages: messages,
          max_tokens: maxTokens
        };

        // Adicionar temperatura apenas se não for modelo O3/O4
        if (modelInfo && modelInfo.temperature !== null) {
          requestBody.temperature = modelInfo.temperature || 0.1;
        }

        // Ajustar maxTokens baseado no limite de créditos (se disponível)
        if (modelInfo && modelInfo.maxTokens) {
          // Reduzir tokens para modelos com créditos limitados
          const adjustedTokens = Math.min(modelInfo.maxTokens, 1000);
          requestBody.max_tokens = adjustedTokens;
        }

        // Adicionar reasoning para modelos O3/O4
        if (modelInfo && modelInfo.reasoning) {
          requestBody.reasoning = modelInfo.reasoning;
        }

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(requestBody)
        });

        const endTime = Date.now();
        const latency = endTime - startTime;

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorData}`);
        }

        const data = await response.json();
        
        return {
          success: true,
          content: data.choices[0]?.message?.content || '',
          usage: data.usage || {},
          latency: latency,
          model: modelId
        };
      } catch (error) {
        const endTime = Date.now();
        return {
          success: false,
          error: error.message,
          latency: endTime - startTime,
          model: modelId
        };
      }
    }

    // Função para avaliar qualidade da resposta
    function evaluateUXResponse(response, modelInfo) {
      const content = response.content || '';
      
      const metrics = {
        length: content.length,
        wordCount: content.split(/\s+/).length,
        hasStructure: /^\d+\.|^-\s|^\*\s|^•\s/.test(content),
        hasProblems: /problema|issue|erro|falta|defeito|inconsistência/i.test(content),
        hasSolutions: /sugestão|melhoria|recomendação|solução|otimização/i.test(content),
        hasUXTerms: (content.match(/usabilidade|ux|ui|hierarquia|navegação|acessibilidade|contraste|legibilidade|fluxo|feedback/gi) || []).length,
        hasTechnicalTerms: (content.match(/wcag|aria|semântica|responsivo|mobile|desktop|breakpoint/gi) || []).length,
        hasSpecificExamples: /exemplo|caso|cenário|quando|onde/i.test(content),
        hasActionableAdvice: /deve|precisa|recomendo|sugiro|implemente/i.test(content),
        isDetailed: content.length > 500,
        isConcise: content.length > 100 && content.length < 1000
      };
      
      let score = 0;
      if (metrics.hasStructure) score += 15;
      if (metrics.hasProblems) score += 10;
      if (metrics.hasSolutions) score += 15;
      if (metrics.hasUXTerms >= 3) score += 10;
      if (metrics.hasTechnicalTerms >= 2) score += 5;
      if (metrics.hasSpecificExamples) score += 10;
      if (metrics.hasActionableAdvice) score += 10;
      if (metrics.isDetailed) score += 5;
      if (metrics.wordCount >= 100 && metrics.wordCount <= 500) score += 15;
      else if (metrics.wordCount >= 50 && metrics.wordCount <= 1000) score += 10;
      else if (metrics.wordCount >= 20) score += 5;
      
      return {
        ...metrics,
        score: Math.min(score, 100),
        grade: score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B+' : score >= 60 ? 'B' : score >= 50 ? 'C+' : score >= 40 ? 'C' : score >= 30 ? 'D' : 'F'
      };
    }

    const results = [];
    const modelEntries = Object.entries(models);
    const testFigmaSpec = figmaSpecs && figmaSpecs.length > 0 ? figmaSpecs[0] : null;

    console.log(`📊 Testando ${modelEntries.length} modelos...\n`);

    for (const [modelId, modelInfo] of modelEntries) {
      console.log(`🔄 Testando: ${modelInfo.name} (${modelInfo.provider})`);
      
      const result = await callOpenRouter(modelId, testPrompt.prompt, testFigmaSpec, modelInfo.maxTokens);
      
      if (result.success) {
        const evaluation = evaluateUXResponse(result, modelInfo);
        
        const modelResult = {
          model: modelInfo.name,
          provider: modelInfo.provider,
          cost: modelInfo.cost,
          latency: result.latency,
          tokensUsed: result.usage?.total_tokens || 0,
          evaluation: evaluation,
          response: result.content.substring(0, 300) + '...',
          fullResponse: result.content
        };
        
        results.push(modelResult);
        console.log(`✅ ${modelInfo.name}: ${result.latency}ms, Score: ${evaluation.score}/100 (${evaluation.grade})`);
      } else {
        console.log(`❌ ${modelInfo.name}: ${result.error}`);
        results.push({
          model: modelInfo.name,
          provider: modelInfo.provider,
          cost: modelInfo.cost,
          error: result.error,
          latency: result.latency
        });
      }
      
      // Pausa entre requests para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Ordenar por score (melhores primeiro)
    const successfulResults = results.filter(r => !r.error).sort((a, b) => b.evaluation.score - a.evaluation.score);
    
    // Estatísticas gerais
    let stats = {};
    if (successfulResults.length > 0) {
      const avgLatency = successfulResults.reduce((sum, r) => sum + r.latency, 0) / successfulResults.length;
      const avgScore = successfulResults.reduce((sum, r) => sum + r.evaluation.score, 0) / successfulResults.length;
      const bestModel = successfulResults[0];
      const fastestModel = successfulResults.reduce((fastest, current) => 
        current.latency < fastest.latency ? current : fastest
      );
      
      stats = {
        averageLatency: Math.round(avgLatency),
        averageScore: Math.round(avgScore),
        bestModel: bestModel.model,
        fastestModel: fastestModel.model,
        successfulModels: successfulResults.length,
        totalModels: results.length
      };
    }

    // Salvar resultados
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `benchmark-multi-ai-${categoria}-${testType}-${timestamp}.json`;
    const filepath = path.join(__dirname, 'debug_responses', filename);
    
    const debugDir = path.join(__dirname, 'debug_responses');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    const data = {
      timestamp: new Date().toISOString(),
      category: categoria,
      testType: testType,
      testTitle: testPrompt.title,
      stats: stats,
      results: results
    };
    
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`💾 Resultados salvos em: ${filename}`);

    return res.json({
      success: true,
      category: categoria,
      testType: testType,
      testTitle: testPrompt.title,
      stats: stats,
      results: results,
      filename: filename
    });

  } catch (error) {
    console.error("[ERROR] Erro no benchmark multi-IA:", error.message);
    return res.status(500).json({ 
      error: "Erro inesperado no benchmark", 
      details: error.message 
    });
  }
});