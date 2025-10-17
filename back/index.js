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
const { AgentMetrics } = require('./metrics');
const { performance } = require('perf_hooks');

// ===========================================
// CONFIGURAÇÃO DE TIMEOUT PARA REQUISIÇÕES HTTP
// ===========================================

// Timeouts específicos para diferentes tipos de requisições (ms)
const TIMEOUTS = {
  DEFAULT: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
  OPENAI_API: parseInt(process.env.OPENAI_TIMEOUT) || 60000,  // 60s para APIs da OpenAI
  GITHUB_API: parseInt(process.env.GITHUB_TIMEOUT) || 15000,  // 15s para GitHub API
  HEALTH_CHECK: parseInt(process.env.HEALTH_TIMEOUT) || 5000, // 5s para health checks
  VISION_API: parseInt(process.env.VISION_TIMEOUT) || 120000  // 2min para análise de imagens
};

// Função utilitária para requisições HTTP com timeout
const fetchWithTimeout = async (url, options = {}, timeoutMs = TIMEOUTS.DEFAULT) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms for ${url}`);
    }
    throw error;
  }
};

// Funções específicas para diferentes tipos de requisições
const fetchOpenAI = (url, options = {}) => fetchWithTimeout(url, options, TIMEOUTS.OPENAI_API);
const fetchGitHub = (url, options = {}) => fetchWithTimeout(url, options, TIMEOUTS.GITHUB_API);
const fetchHealth = (url, options = {}) => fetchWithTimeout(url, options, TIMEOUTS.HEALTH_CHECK);
const fetchVision = (url, options = {}) => fetchWithTimeout(url, options, TIMEOUTS.VISION_API);
const { 
  SPAN_TYPES, 
  Span,
  timeBlock, 
  emitTrace, 
  createTrace, 
  analyzeSpans, 
  checkPerformanceBudget,
  shutdownLangfuse
} = require('./tracing');
const sec = (ms) => Number(ms/1000).toFixed(2);
const crypto = require('crypto');

/**
 * =========================
 *  GERAÇÃO DE NOMES ÚNICOS
 * =========================
 */

/**
 * Gera nome único para arquivos de debug
 * Formato: YYYYMMDD_HHMMSS_hash8_tipo.json
 */
function generateUniqueDebugFileName(type = 'figmaSpec', group = 'item1') {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '_');
  
  // Hash curto baseado em timestamp + tipo + group
  const hash = crypto.createHash('md5')
    .update(`${timestamp}_${type}_${group}`)
    .digest('hex')
    .substring(0, 8);
  
  return `${timestamp}_${hash}_${type}_${group}.json`;
}

/**
 * Limpa arquivos de debug antigos (mais de 24 horas)
 */
async function cleanupOldDebugFiles() {
  try {
    const debugDirs = ['debug_layouts', 'debug_responses', 'debug_vision'];
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas em ms
    
    for (const dirName of debugDirs) {
      const dirPath = path.join(__dirname, dirName);
      
      try {
        const files = await fsp.readdir(dirPath);
        const now = Date.now();
        
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stats = await fsp.stat(filePath);
          
          // Remove arquivos com mais de 24 horas (exceto last.json)
          if (now - stats.mtime.getTime() > maxAge && file !== 'last.json') {
            await fsp.unlink(filePath);
            logger.debug(`🗑️ Arquivo antigo removido: ${dirName}/${file}`);
          }
        }
      } catch (err) {
        // Diretório não existe ou erro de leitura - ignorar
      }
    }
  } catch (error) {
    logger.warn(`⚠️ Erro na limpeza de arquivos de debug: ${error.message}`);
  }
}

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

      const response = await fetchVision("https://api.openai.com/v1/chat/completions", {
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

    const response = await fetchVision("https://api.openai.com/v1/chat/completions", {
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
async function runAgentA(figmaSpec, metodo, vectorStoreId, useRag = false) {
  const trace = createTrace('/agent-a');
  trace.setAgent('Agente A (JSON Analyst)');
  
  const metrics = new AgentMetrics('Agente A (JSON Analyst)');
  metrics.start();
  
  try {
    // PREP: Carregar e processar dados
    const prep = await timeBlock(SPAN_TYPES.PREP, async () => {
      const prompt = loadAgentPrompt('agente-a-json-analyst');
      if (!prompt) throw new Error('Prompt não encontrado');
      
      const instruction = prompt.replaceAll("${metodo}", metodo);
      const figmaData = JSON.stringify(figmaSpec, null, 2);
      
      const mensagem = [
        `metodo: ${metodo}`,
        `dados_figma:`,
        figmaData
      ].join("\n");
      
      const fullPrompt = [instruction, "", "DADOS:", mensagem].join("\n");
      
      return {
        prompt: fullPrompt,
        instruction,
        figmaData,
        inputBytes: JSON.stringify(figmaSpec).length
      };
    }, { 
      metodo,
      figmaComponents: figmaSpec?.length || 0,
      useRag 
    });
    
    trace.addSpan(prep.span);
    
    // Fases granulares para Agente A
    metrics.startPhase('Carregar Prompt');
    metrics.endPhase('Carregar Prompt');
    
    metrics.startPhase('Serializar JSON');
    const serializedData = JSON.stringify(figmaSpec);
    metrics.endPhase('Serializar JSON');
    
    metrics.startPhase('Montar Prompt Final');
    const finalPrompt = [prep.result.instruction, "", "DADOS:", prep.result.mensagem].join("\n");
    metrics.endPhase('Montar Prompt Final');
    
    // RAG FETCH (se habilitado)
    let ragContext = null;
    if (useRag && vectorStoreId) {
      const ragFetch = await timeBlock(SPAN_TYPES.RAG_FETCH, async () => {
        // Simular busca RAG (implementar sua lógica real aqui)
        const ragResponse = await fetchOpenAI("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{
              role: "user",
              content: `Com base no seu conhecimento sobre ${metodo}, liste as principais heurísticas relevantes para análise de interfaces.`
            }],
            max_tokens: 2000,
            temperature: 0.1
          })
        });
        
        const ragResult = await ragResponse.json();
        return ragResult.choices?.[0]?.message?.content || '';
      }, { 
        vectorStoreId,
        metodo,
        k: 12 
      });
      
      trace.addSpan(ragFetch.span);
      ragContext = ragFetch.result;
    }
    
    // MODEL CALL: Chamada para o LLM
    const modelCall = await timeBlock(SPAN_TYPES.MODEL_CALL, async () => {
      // Verificar tipo de modelo para usar API correta
      const isGPT5 = /^gpt-5/i.test(MODELO_AGENTE_A);
      const isO3 = /^o3/i.test(MODELO_AGENTE_A);
      
      // Métricas granulares para chamada da API
      metrics.startPhase('Preparar Request Body');
      let response;
      
      if (isGPT5) {
        // gpt-5-nano usa Responses API
        const requestBody = {
          model: MODELO_AGENTE_A,
          input: prep.result.prompt,
          reasoning: { effort: "medium" },
          text: { verbosity: "medium" }
        };
        
        metrics.endPhase('Preparar Request Body');
        metrics.startPhase('Serializar Request Body');
        const requestBodyJson = JSON.stringify(requestBody);
        metrics.endPhase('Serializar Request Body');
        
        logger.info(`🔄 Agente A: Usando Responses API para ${MODELO_AGENTE_A}`);
        
        metrics.startPhase('Enviar Request');
        response = await fetchOpenAI("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: requestBodyJson
        });
        metrics.endPhase('Enviar Request');
      } else {
        // Outros modelos usam Chat Completions API
        const requestBody = {
          model: MODELO_AGENTE_A,
          messages: [{ role: "user", content: prep.result.prompt }],
          temperature: 0.2
        };
        
        if (isO3) {
          // o3-mini específico
          requestBody.reasoning = { effort: "medium" };
          requestBody.max_output_tokens = 20000;
        } else {
          // Modelos antigos (gpt-4, etc.)
          requestBody.max_tokens = 20000;
        }
        
        logger.info(`🔄 Agente A: Usando Chat Completions API para ${MODELO_AGENTE_A}`);
        
        response = await fetchOpenAI("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody)
        });
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }
      
      metrics.startPhase('Deserializar Response');
      const result = await response.json();
      metrics.endPhase('Deserializar Response');
      
      // Debug: mostrar estrutura da resposta
      logger.info(`🔄 Agente A: Response status: ${response.status}`);
      logger.info(`🔄 Agente A: Response structure: ${JSON.stringify(result, null, 2).substring(0, 500)}...`);
      
      // Debug: mostrar estrutura de usage
      logger.info(`🔄 Agente A: Usage structure: ${JSON.stringify(result.usage, null, 2)}`);
      
      metrics.startPhase('Extrair Conteúdo');
      let content;
      let usage;
      
      if (isGPT5) {
        // Responses API retorna output[1].content[0].text
        content = result.output?.[1]?.content?.[0]?.text;
        usage = result.usage;
        logger.info(`🔄 Agente A: GPT-5 content extracted: ${content ? content.length : 0} chars`);
        logger.info(`🔄 Agente A: GPT-5 usage: ${JSON.stringify(usage, null, 2)}`);
      } else {
        // Chat Completions API retorna choices[0].message.content
        content = result.choices?.[0]?.message?.content;
        usage = result.usage;
        logger.info(`🔄 Agente A: Chat Completions content extracted: ${content ? content.length : 0} chars`);
        logger.info(`🔄 Agente A: Chat Completions usage: ${JSON.stringify(usage, null, 2)}`);
      }
      
      if (!content) {
        logger.error(`🔄 Agente A: No content in response`);
        logger.error(`🔄 Agente A: Full response: ${JSON.stringify(result, null, 2)}`);
        throw new Error('Nenhum conteúdo recebido do modelo');
      }
      
      metrics.endPhase('Extrair Conteúdo');
      logger.info(`🔄 Agente A: Content received: ${content.length} chars`);
      
      return {
        content: content,
        usage: usage,
        model: MODELO_AGENTE_A
      };
    }, {
      model: MODELO_AGENTE_A,
      promptLength: prep.result.prompt.length,
      useRag,
      hasRagContext: !!ragContext
    });
    
    trace.addSpan(modelCall.span);
    
    // POST: Processar resposta
    const post = await timeBlock(SPAN_TYPES.POST, async () => {
      if (!modelCall.result.content) {
        throw new Error('Nenhum conteúdo recebido do modelo');
      }
      
      metrics.startPhase('Limpar Code Fence');
      const cleanContent = stripCodeFence(modelCall.result.content);
      metrics.endPhase('Limpar Code Fence');
      
      metrics.startPhase('Parse JSON');
      let parsedResult;
      try {
        parsedResult = JSON.parse(cleanContent);
      } catch (jsonError) {
        logger.error(`❌ Agente A: Erro ao fazer parse do JSON: ${jsonError.message}`);
        logger.error(`❌ Agente A: Conteúdo limpo (primeiros 500 chars): ${cleanContent.substring(0, 500)}`);
        logger.error(`❌ Agente A: Conteúdo limpo (últimos 500 chars): ${cleanContent.substring(Math.max(0, cleanContent.length - 500))}`);
        
        // Tentar corrigir JSON malformado
        const fixedContent = fixMalformedJSON(cleanContent);
        if (fixedContent) {
          logger.info(`🔄 Agente A: Tentando corrigir JSON malformado...`);
          parsedResult = JSON.parse(fixedContent);
        } else {
          throw jsonError;
        }
      }
      metrics.endPhase('Parse JSON');
      
      metrics.startPhase('Processar Conteúdo');
      const result = {
        achados: parsedResult.achados || [],
        contentLength: modelCall.result.content.length,
        cleanContentLength: cleanContent.length
      };
      metrics.endPhase('Processar Conteúdo');
      
      return result;
    }, {
      contentLength: modelCall.result.content?.length || 0
    });
    
    trace.addSpan(post.span);
    
    // Calcular tokens (usar dados reais da API)
    const promptTokens = modelCall.result.usage?.prompt_tokens || 0;
    const outputTokens = modelCall.result.usage?.completion_tokens || 0;
    const totalTokens = promptTokens + outputTokens;
    
    trace.setTokens(promptTokens, outputTokens);
    
    // Finalizar métricas
    metrics.setModel(MODELO_AGENTE_A);
    metrics.setTokens(promptTokens, outputTokens, {
      'Prompt Base': Math.ceil(prep.result.instruction.length / 4),
      'Dados Figma': Math.ceil(prep.result.figmaData.length / 4),
      'RAG Context': ragContext ? Math.ceil(ragContext.length / 4) : 0,
      'Total Entrada': promptTokens,
      'Saída': outputTokens
    });
    
    metrics.end();
    
    // Emitir trace
    await emitTrace(trace);
    
    // Verificar budget de performance
    checkPerformanceBudget(trace);
    
    // Análise de spans
    const analysis = analyzeSpans(trace.spans);
    logger.info(`📊 Análise de spans - Mais lento: ${analysis.slowest.name} (${analysis.slowest.ms}ms)`);
    
    logger.info(metrics.getReport());
    await metrics.saveReportToFile();
    
    return { 
      data: post.result, 
      tokens: { input: promptTokens, output: outputTokens },
      metrics,
      trace: trace.toJSON()
    };
    
  } catch (error) {
    logger.error(`❌ Agente A falhou: ${error.message}`);
    trace.addSpan(new Span('error', 0, { error: error.message }));
    await emitTrace(trace);
    metrics.end();
    return null;
  }
}

// Função para buscar contexto RAG via Assistants API
async function getRagContext(metodo, vectorStoreId) {
  try {
    // Criar uma pergunta sobre o método para buscar contexto relevante
    const query = `Explique sobre ${metodo} em análise heurística de interfaces. Inclua critérios, exemplos e como aplicar.`;
    
    // Usar Chat Completions com file_search para buscar contexto
    const response = await fetchOpenAI("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: query }],
        tools: [{ type: "file_search", vector_store_ids: [vectorStoreId] }],
        max_tokens: 2000
      })
    });
    
    const result = await response.json();
    
    if (response.ok && result.choices?.[0]?.message?.content) {
      return result.choices[0].message.content;
    }
    
    return null;
  } catch (e) {
    logger.error(`Erro ao buscar RAG context: ${e.message}`);
    return null;
  }
}

// Agente B - Vision Reviewer com RAG compartilhado
async function runAgentB(imageBase64, metodo, vectorStoreId, useRag = false, ragContext = null) {
  const metrics = new AgentMetrics('Agente B (Vision Reviewer)');
  metrics.start();
  
  metrics.startPhase('Carregar Prompt');
  const prompt = loadAgentPrompt('agente-b-vision-reviewer');
  if (!prompt) return null;
  metrics.endPhase('Carregar Prompt');
  
  metrics.startPhase('Processar Dados');
  const instruction = prompt.replaceAll("${metodo}", metodo);
  
  // Calcular tokens estimados
  const instructionTokens = Math.ceil(instruction.length / 4);
  const imageTokens = Math.ceil(imageBase64.length / 4); // Estimativa para imagem
  metrics.endPhase('Processar Dados');
  
  try {
    logger.info(`🔄 Agente B: Iniciando análise de imagem (${imageBase64 ? imageBase64.length : 0} chars)`);
    
    let finalPrompt = instruction;
    
    // USAR CONTEXTO RAG COMPARTILHADO (mais eficiente que buscar novamente)
    if (ragContext && ragContext.trim()) {
      logger.info(`🔄 Agente B: Usando contexto RAG compartilhado (${ragContext.length} chars)`);
      finalPrompt += `\n\nCONTEXTO HEURÍSTICAS VISUAIS:\n${ragContext}`;
    } else if (useRag && vectorStoreId) {
      logger.info(`🔄 Agente B: RAG compartilhado não disponível, usando fallback...`);
      // Fallback: buscar RAG se não foi compartilhado
      logger.info(`🔄 Agente B: Buscando contexto RAG para ${metodo}...`);
      
      // 1ª CHAMADA: Buscar contexto RAG específico para vision
      // NOTA: Chat Completions não suporta file_search, usar apenas texto
      const ragResponse = await fetchOpenAI("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{
            role: "user",
            content: `Com base no seu conhecimento sobre ${metodo}, liste as principais heurísticas visuais relevantes para análise de interfaces. Foque em aspectos que podem ser identificados visualmente: contraste, alinhamento, hierarquia visual, consistência visual, feedback visual, etc. Seja conciso e específico para análise de imagens.`
          }],
          max_tokens: 2000,
          temperature: 0.1
        })
      });
      
      if (ragResponse.ok) {
        const ragResult = await ragResponse.json();
        const ragContextFallback = ragResult.choices?.[0]?.message?.content;
        
        if (ragContextFallback) {
          logger.info(`🔄 Agente B: Contexto RAG obtido (fallback): ${ragContextFallback.length} chars`);
          finalPrompt += `\n\nCONTEXTO HEURÍSTICAS VISUAIS:\n${ragContextFallback}`;
        } else {
          logger.warn(`🔄 Agente B: RAG não retornou contexto`);
        }
      } else {
        const ragError = await ragResponse.json();
        logger.warn(`🔄 Agente B: Erro na busca RAG: ${ragResponse.status} - ${JSON.stringify(ragError)}`);
      }
    }
    
    // 2ª CHAMADA: Vision com contexto RAG injetado
    logger.info(`🔄 Agente B: Executando análise visual com contexto...`);
    
    const visionResponse = await fetchVision("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{
          role: "user", 
          content: [
            { type: "text", text: finalPrompt },
            { type: "image_url", image_url: { url: imageBase64 } }
          ]
        }],
        max_tokens: 4096,
        temperature: 0.1
      })
    });
    
    logger.info(`🔄 Agente B: Vision response status: ${visionResponse.status}`);
    
    if (!visionResponse.ok) {
      const error = await visionResponse.json();
      logger.error(`🔄 Agente B: Vision API Error: ${JSON.stringify(error)}`);
      return null;
    }
    
    const visionResult = await visionResponse.json();
    const content = visionResult.choices?.[0]?.message?.content;
    
    if (content) {
      metrics.startPhase('Processar Conteúdo');
      logger.info(`🔄 Agente B: Content received: ${content.length} chars`);
      
      metrics.startPhase('Limpar Code Fence');
      const cleanContent = stripCodeFence(content);
      metrics.endPhase('Limpar Code Fence');
      
      metrics.startPhase('Parse JSON');
      const parsedResult = JSON.parse(cleanContent);
      metrics.endPhase('Parse JSON');
      
      metrics.endPhase('Processar Conteúdo');
      
      // Extrair tokens da resposta
      const tokens = {
        input: visionResult.usage?.prompt_tokens || 0,
        output: visionResult.usage?.completion_tokens || 0
      };
      
      // Definir breakdown detalhado de tokens
      // Usar o contexto RAG que foi realmente usado (compartilhado ou fallback)
      const actualRagContext = ragContext || (finalPrompt.includes('CONTEXTO HEURÍSTICAS VISUAIS:') ? 
        finalPrompt.split('CONTEXTO HEURÍSTICAS VISUAIS:')[1] : '');
      
      const tokenBreakdown = {
        'Prompt Base': instructionTokens,
        'Imagem': imageTokens,
        'RAG Context': actualRagContext ? Math.ceil(actualRagContext.length / 4) : 0,
        'Total Entrada': tokens.input,
        'Saída': tokens.output
      };
      
      metrics.setTokens(tokens.input, tokens.output, tokenBreakdown);
      metrics.end();
      logger.info(metrics.getReport());
      
      // Salvar relatório formatado em arquivo
      await metrics.saveReportToFile();
      
      return { data: parsedResult, tokens, metrics };
    } else {
      logger.warn(`🔄 Agente B: No content in vision response`);
      return null;
    }
    
  } catch (e) {
    logger.error(`❌ Erro no Agente B: ${e.message}`);
    logger.error(`❌ Stack trace: ${e.stack}`);
    return null;
  }
}

// Agente C - Reconciler
async function runAgentC(achadosA, achadosB, metodo, vectorStoreId, useRag = false, ragContext = null) {
  const metrics = new AgentMetrics('Agente C (Reconciler)');
  metrics.start();
  
  metrics.startPhase('Carregar Prompt');
  const prompt = loadAgentPrompt('agente-c-reconciler');
  if (!prompt) return null;
  metrics.endPhase('Carregar Prompt');
  
  metrics.startPhase('Processar Dados');
  const mensagem = [
    `heuristica: "${metodo}"`,
    `achadosA: ${JSON.stringify(achadosA, null, 2)}`,
    `achadosB: ${JSON.stringify(achadosB, null, 2)}`
  ].join("\n");
  
  let fullPrompt = [prompt, "", mensagem].join("\n");
  
  // Calcular tokens estimados
  const promptTokens = Math.ceil(prompt.length / 4);
  const achadosATokens = Math.ceil(JSON.stringify(achadosA).length / 4);
  const achadosBTokens = Math.ceil(JSON.stringify(achadosB).length / 4);
  metrics.endPhase('Processar Dados');
  
  // ADICIONAR CONTEXTO RAG COMPARTILHADO
  if (ragContext && ragContext.trim()) {
    logger.info(`🔄 Agente C: Usando contexto RAG compartilhado (${ragContext.length} chars)`);
    fullPrompt += `\n\nCONTEXTO HEURÍSTICAS (do Agente A):\n${ragContext}`;
  }
  
  try {
    logger.info(`🔄 Agente C: Iniciando reconciliação de ${(achadosA.achados?.length || 0) + (achadosB.achados?.length || 0)} achados`);
    
    // Verificar se é modelo GPT-5/O3 (Responses API) ou GPT-4 (Chat Completions)
    const modeloAgenteC = process.env.MODELO_AGENTE_C || "o3-mini";
    const isResponsesModel = /^(gpt-5|o3|o4)/i.test(modeloAgenteC);
    
    logger.info(`🔄 Agente C: Usando modelo ${modeloAgenteC} via ${isResponsesModel ? 'Responses' : 'Chat Completions'} API`);
    
    if (isResponsesModel) {
      // Usar Responses API para GPT-5, O3, etc.
      const body = {
        model: modeloAgenteC,
        input: fullPrompt,
        max_output_tokens: 8000,
        ...(useRag && vectorStoreId ? { tools: [{ type: "file_search", vector_store_ids: [vectorStoreId] }] } : {})
      };
      
      const response = await fetchOpenAI("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      
      logger.info(`🔄 Agente C: Response status: ${response.status}`);
      
      if (!response.ok) {
        const error = await response.json();
        logger.error(`🔄 Agente C: Responses API Error: ${JSON.stringify(error)}`);
        return null;
      }
      
      const result = await response.json();
      
      // Debug: mostrar estrutura de usage do Agente C
      logger.info(`🔄 Agente C: Usage structure: ${JSON.stringify(result.usage, null, 2)}`);
      
      const content = result.output?.[1]?.content?.[0]?.text || result.output?.[0]?.content?.[0]?.text?.value || result.output_text;
      
      if (content) {
        metrics.startPhase('Processar Conteúdo');
        logger.info(`🔄 Agente C: Content received: ${content.length} chars`);
        
        metrics.startPhase('Limpar Code Fence');
        const cleanContent = stripCodeFence(content);
        metrics.endPhase('Limpar Code Fence');
        
        metrics.startPhase('Parse JSON');
        let parsedResult;
        try {
          parsedResult = JSON.parse(cleanContent);
        } catch (jsonError) {
          logger.error(`❌ Agente C: Erro ao fazer parse do JSON: ${jsonError.message}`);
          logger.error(`❌ Agente C: Conteúdo limpo (primeiros 500 chars): ${cleanContent.substring(0, 500)}`);
          logger.error(`❌ Agente C: Conteúdo limpo (últimos 500 chars): ${cleanContent.substring(Math.max(0, cleanContent.length - 500))}`);
          
          // Tentar corrigir JSON malformado
          const fixedContent = fixMalformedJSON(cleanContent);
          if (fixedContent) {
            logger.info(`🔄 Agente C: Tentando corrigir JSON malformado...`);
            parsedResult = JSON.parse(fixedContent);
          } else {
            throw jsonError;
          }
        }
        metrics.endPhase('Parse JSON');
        
        metrics.endPhase('Processar Conteúdo');
        
        // Extrair tokens da resposta (Responses API)
        // Debug: mostrar estrutura de usage
        const tokens = {
          input: result.usage?.prompt_tokens || result.usage?.input_tokens || 0,
          output: result.usage?.completion_tokens || result.usage?.output_tokens || 0
        };
        
        // Definir breakdown detalhado de tokens
        const tokenBreakdown = {
          'Prompt Base': promptTokens,
          'Achados A': achadosATokens,
          'Achados B': achadosBTokens,
          'RAG Context': ragContext ? Math.ceil(ragContext.length / 4) : 0,
          'Total Entrada': tokens.input,
          'Saída': tokens.output
        };
        
        metrics.setTokens(tokens.input, tokens.output, tokenBreakdown);
        logger.info(`🔄 Agente C: Tokens extraídos: input=${tokens.input}, output=${tokens.output}`);
        
        metrics.end();
        logger.info(metrics.getReport());
        
        // Salvar relatório formatado em arquivo
        await metrics.saveReportToFile();
        
        return { data: parsedResult, tokens, metrics };
      }
    } else {
      // Usar Chat Completions para GPT-4, etc.
      // NOTA: Chat Completions não suporta file_search, usar conhecimento do modelo
      const body = {
        model: modeloAgenteC,
        messages: [{ role: "user", content: fullPrompt }],
        max_tokens: 8000,
        temperature: 0.1
      };
      
      logger.info(`🔄 Agente C: Chat Completions ${ragContext ? 'com RAG compartilhado' : 'sem RAG'} - usando conhecimento do modelo`);
      
      const response = await fetchOpenAI("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      
      logger.info(`🔄 Agente C: Response status: ${response.status}`);
      
      if (!response.ok) {
        const error = await response.json();
        logger.error(`🔄 Agente C: Chat Completions API Error: ${JSON.stringify(error)}`);
        return null;
      }
      
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      
      if (content) {
        metrics.startPhase('Processar Conteúdo');
        logger.info(`🔄 Agente C: Content received: ${content.length} chars`);
        const cleanContent = stripCodeFence(content);
        const parsedResult = JSON.parse(cleanContent);
        metrics.endPhase('Processar Conteúdo');
        
        // Extrair tokens da resposta (Chat Completions API)
        const tokens = {
          input: result.usage?.prompt_tokens || 0,
          output: result.usage?.completion_tokens || 0
        };
        
        // Definir breakdown detalhado de tokens
        const tokenBreakdown = {
          'Prompt Base': promptTokens,
          'Achados A': achadosATokens,
          'Achados B': achadosBTokens,
          'RAG Context': ragContext ? Math.ceil(ragContext.length / 4) : 0,
          'Total Entrada': tokens.input,
          'Saída': tokens.output
        };
        
        metrics.setTokens(tokens.input, tokens.output, tokenBreakdown);
        metrics.end();
        logger.info(metrics.getReport());
        
        // Salvar relatório formatado em arquivo
        await metrics.saveReportToFile();
        
        return { data: parsedResult, tokens, metrics };
      }
    }
    
    logger.warn(`🔄 Agente C: No content received from API`);
    return null;
  } catch (e) {
    logger.error(`❌ Erro no Agente C: ${e.message}`);
    logger.error(`❌ Stack trace: ${e.stack}`);
    return null;
  }
}

// =========================
// ENRIQUECIMENTO COM CONTEXTO DE CLIPPING
// =========================

/**
 * Enriquece o figmaSpec com metadados de clipping e contexto de container
 * para resolver falsos positivos de "imagem cortada"
 */
function enrichFigmaSpecWithClippingContext(figmaSpec) {
  if (!figmaSpec || !figmaSpec.components) {
    return figmaSpec;
  }

  logger.info(`🔄 Enriqueciendo figmaSpec com contexto de clipping...`);
  
  // Criar mapa de componentes por ID para lookup rápido
  const componentMap = new Map();
  figmaSpec.components.forEach(comp => {
    componentMap.set(comp.id, comp);
  });

  // Processar cada componente
  const enrichedComponents = figmaSpec.components.map(comp => {
    const enrichedComp = { ...comp };
    
    // Detectar contexto de clipping
    enrichedComp.clippingContext = analyzeClippingContext(comp, figmaSpec);
    
    // Detectar contexto de container
    enrichedComp.containerContext = analyzeContainerContext(comp, figmaSpec);
    
    // Detectar contexto de Auto Layout
    enrichedComp.layoutContext = analyzeLayoutContext(comp, figmaSpec);
    
    return enrichedComp;
  });

  return {
    ...figmaSpec,
    components: enrichedComponents,
    _enriched: true,
    _enrichmentTimestamp: new Date().toISOString()
  };
}

/**
 * Analisa o contexto de clipping de um componente
 */
function analyzeClippingContext(comp, figmaSpec) {
  const clippingContext = {
    isClipped: false,
    clipParentId: null,
    visibleBounds: comp.bounds || null,
    physicalBounds: comp.bounds || null,
    overflowBehavior: 'visible',
    intentionalOverflow: false
  };

  // Detectar se está dentro de um frame com clipping
  if (comp.parentId) {
    const parent = figmaSpec.components.find(c => c.id === comp.parentId);
    if (parent && parent.type === 'FRAME' && parent.clipsContent) {
      clippingContext.isClipped = true;
      clippingContext.clipParentId = parent.id;
      clippingContext.overflowBehavior = 'hidden';
      
      // Calcular bounds visíveis após clipping
      clippingContext.visibleBounds = calculateVisibleBounds(comp, parent);
      clippingContext.physicalBounds = comp.bounds;
    }
  }

  // Detectar se overflow é intencional
  clippingContext.intentionalOverflow = detectIntentionalOverflow(comp, figmaSpec);

  return clippingContext;
}

/**
 * Analisa o contexto de container de um componente
 */
function analyzeContainerContext(comp, figmaSpec) {
  const containerContext = {
    isInsideFrame: false,
    frameType: null,
    frameBounds: null,
    respectsFrameBounds: true
  };

  if (comp.parentId) {
    const parent = figmaSpec.components.find(c => c.id === comp.parentId);
    if (parent && parent.type === 'FRAME') {
      containerContext.isInsideFrame = true;
      containerContext.frameType = detectFrameType(parent);
      containerContext.frameBounds = parent.bounds;
      containerContext.respectsFrameBounds = checkBoundsRespect(comp, parent);
    }
  }

  return containerContext;
}

/**
 * Calcula bounds visíveis após clipping
 */
function calculateVisibleBounds(comp, clipFrame) {
  if (!comp.bounds || !clipFrame.bounds) {
    return comp.bounds;
  }

  const compBounds = comp.bounds;
  const frameBounds = clipFrame.bounds;

  // Intersecção entre elemento e frame
  const visibleX = Math.max(compBounds.x, frameBounds.x);
  const visibleY = Math.max(compBounds.y, frameBounds.y);
  const visibleRight = Math.min(
    compBounds.x + compBounds.width,
    frameBounds.x + frameBounds.width
  );
  const visibleBottom = Math.min(
    compBounds.y + compBounds.height,
    frameBounds.y + frameBounds.height
  );

  return {
    x: visibleX,
    y: visibleY,
    width: Math.max(0, visibleRight - visibleX),
    height: Math.max(0, visibleBottom - visibleY)
  };
}

/**
 * Detecta se overflow é intencional (padrão comum em design)
 */
function detectIntentionalOverflow(comp, figmaSpec) {
  const compName = (comp.name || '').toLowerCase();
  const compType = comp.type;

  // Padrão 1: Imagem de fundo/hero
  if (compType === 'RECTANGLE' && comp.fills?.length > 0) {
    const isBackgroundLayer = compName.includes('background') ||
                             compName.includes('bg') ||
                             compName.includes('hero') ||
                             compName.includes('cover');
    if (isBackgroundLayer) return true;
  }

  // Padrão 2: Elemento decorativo
  if (compName.includes('decoration') ||
      compName.includes('ornament') ||
      compName.includes('floating') ||
      compName.includes('splash')) {
    return true;
  }

  // Padrão 3: Imagem dentro de container nomeado
  if (comp.parentId) {
    const parent = figmaSpec.components.find(c => c.id === comp.parentId);
    if (parent && parent.name) {
      const parentName = parent.name.toLowerCase();
      const containerNames = ['image container', 'img wrapper', 'photo frame', 'hero container'];
      if (containerNames.some(name => parentName.includes(name))) {
        return true;
      }
    }
  }

  // Padrão 4: Imagem com proporções típicas de hero/cover
  if (comp.bounds && compType === 'RECTANGLE') {
    const aspectRatio = comp.bounds.width / comp.bounds.height;
    // Proporções típicas de imagens hero (mais largas que altas)
    if (aspectRatio > 1.5 && comp.bounds.width > 800) {
      return true;
    }
  }

  return false;
}

/**
 * Detecta tipo de frame (screen vs component)
 */
function detectFrameType(frame) {
  if (!frame || frame.type !== 'FRAME') return null;

  const frameName = (frame.name || '').toLowerCase();
  const bounds = frame.bounds;

  // Screens geralmente têm dimensões mobile/desktop padrão
  const screenSizes = [
    { w: 375, h: 667 },   // iPhone SE
    { w: 390, h: 844 },   // iPhone 12/13
    { w: 414, h: 896 },   // iPhone 11 Pro Max
    { w: 1920, h: 1080 }, // Desktop
    { w: 1440, h: 900 }   // MacBook
  ];

  if (bounds) {
    const isScreenSize = screenSizes.some(size => 
      Math.abs(bounds.width - size.w) < 10 && 
      Math.abs(bounds.height - size.h) < 10
    );
    
    if (isScreenSize || frameName.includes('screen')) return 'screen';
  }

  if (frameName.includes('component')) return 'component';
  return 'group';
}

/**
 * Verifica se elemento respeita bounds do frame pai
 */
function checkBoundsRespect(comp, parent) {
  if (!comp.bounds || !parent.bounds) return true;

  const compBounds = comp.bounds;
  const parentBounds = parent.bounds;

  // Verifica se o componente está completamente dentro do frame
  return compBounds.x >= parentBounds.x &&
         compBounds.y >= parentBounds.y &&
         (compBounds.x + compBounds.width) <= (parentBounds.x + parentBounds.width) &&
         (compBounds.y + compBounds.height) <= (parentBounds.y + parentBounds.height);
}

/**
 * Analisa o contexto de Auto Layout de um componente
 */
function analyzeLayoutContext(comp, figmaSpec) {
  const layoutContext = {
    isControlledByParent: false,
    parentLayoutMode: null,
    effectiveAlignment: {
      horizontal: 'LEFT',
      vertical: 'TOP'
    },
    parentLayoutProps: null,
    respectsParentLayout: true
  };

  // Detectar se pai tem Auto Layout ativo
  if (comp.parentId) {
    const parent = figmaSpec.components.find(c => c.id === comp.parentId);
    if (parent && parent.layoutMode && parent.layoutMode !== 'NONE') {
      layoutContext.isControlledByParent = true;
      layoutContext.parentLayoutMode = parent.layoutMode;
      
      // Calcular alinhamento efetivo
      layoutContext.effectiveAlignment = calculateEffectiveAlignment(comp, parent);
      
      // Extrair props de Auto Layout do pai
      layoutContext.parentLayoutProps = extractAutoLayoutProps(parent);
      
      // Verificar se elemento respeita layout do pai
      layoutContext.respectsParentLayout = checkIfRespectsLayout(comp, parent);
    }
  }

  // Se não tem pai com Auto Layout, usa alinhamento próprio
  if (!layoutContext.isControlledByParent) {
    layoutContext.effectiveAlignment = {
      horizontal: comp.textAlignHorizontal || 'LEFT',
      vertical: comp.textAlignVertical || 'TOP'
    };
  }

  return layoutContext;
}

/**
 * Calcula alinhamento efetivo baseado no Auto Layout do pai
 */
function calculateEffectiveAlignment(comp, parent) {
  if (!parent || !parent.layoutMode || parent.layoutMode === 'NONE') {
    return {
      horizontal: comp.textAlignHorizontal || 'LEFT',
      vertical: comp.textAlignVertical || 'TOP'
    };
  }

  let effectiveHorizontal = 'LEFT';
  let effectiveVertical = 'TOP';

  // Auto Layout HORIZONTAL
  if (parent.layoutMode === 'HORIZONTAL') {
    // Eixo principal (horizontal) → usa counterAxisAlignItems
    effectiveHorizontal = mapAutoLayoutToAlignment(parent.counterAxisAlignItems);
    
    // Eixo secundário (vertical) → usa primaryAxisAlignItems
    effectiveVertical = mapAutoLayoutToAlignment(parent.primaryAxisAlignItems);
  } 
  // Auto Layout VERTICAL
  else if (parent.layoutMode === 'VERTICAL') {
    // Eixo principal (vertical) → usa primaryAxisAlignItems
    effectiveVertical = mapAutoLayoutToAlignment(parent.primaryAxisAlignItems);
    
    // Eixo secundário (horizontal) → usa counterAxisAlignItems
    effectiveHorizontal = mapAutoLayoutToAlignment(parent.counterAxisAlignItems);
  }

  return {
    horizontal: effectiveHorizontal,
    vertical: effectiveVertical
  };
}

/**
 * Mapeia propriedades de Auto Layout para alinhamento
 */
function mapAutoLayoutToAlignment(alignValue) {
  const mapping = {
    'MIN': 'LEFT',
    'CENTER': 'CENTER',
    'MAX': 'RIGHT',
    'SPACE_BETWEEN': 'LEFT',
    'BASELINE': 'LEFT'
  };
  
  return mapping[alignValue] || 'LEFT';
}

/**
 * Extrai props de Auto Layout do pai
 */
function extractAutoLayoutProps(parent) {
  return {
    primaryAxisAlignItems: parent.primaryAxisAlignItems || 'MIN',
    counterAxisAlignItems: parent.counterAxisAlignItems || 'MIN',
    itemSpacing: parent.itemSpacing || 0,
    paddingLeft: parent.paddingLeft || 0,
    paddingRight: parent.paddingRight || 0,
    paddingTop: parent.paddingTop || 0,
    paddingBottom: parent.paddingBottom || 0,
    layoutWrap: parent.layoutWrap || 'NO_WRAP'
  };
}

/**
 * Verifica se elemento respeita layout do pai
 */
function checkIfRespectsLayout(comp, parent) {
  if (!parent || !parent.layoutMode) return false;
  
  // Elementos com layoutPositioning: 'ABSOLUTE' não seguem Auto Layout
  if (comp.layoutPositioning === 'ABSOLUTE') {
    return false;
  }
  
  // Elementos com constraints fixos podem ignorar Auto Layout
  if (comp.constraints) {
    const constraints = comp.constraints;
    const hasFixedConstraints = 
      constraints.horizontal !== 'LEFT_RIGHT' ||
      constraints.vertical !== 'TOP_BOTTOM';
    
    if (hasFixedConstraints) return false;
  }
  
  return true;
}

// =========================
// VALIDAÇÃO PRÉ-RECONCILIAÇÃO
// =========================

/**
 * Filtra falsos positivos ANTES do Agente C processar
 */
class PreReconciliationValidator {
  
  async validateHeuristics(heuristics, enrichedFigmaSpec) {
    if (!heuristics || !Array.isArray(heuristics)) {
      return heuristics;
    }

    logger.info(`🔍 Validando ${heuristics.length} heurísticas para falsos positivos...`);
    
    const validatedHeuristics = heuristics.filter(h => {
      // Regra 1: Remove "imagem cortada" se for overflow intencional
      if (this.isIntentionalImageOverflow(h, enrichedFigmaSpec)) {
        logger.info(`[Validator] Removendo falso positivo: ${h.titulo_card}`);
        return false;
      }
      
      // Regra 2: Remove alertas de elementos decorativos
      if (this.isDecorativeElement(h, enrichedFigmaSpec)) {
        logger.info(`[Validator] Removendo elemento decorativo: ${h.titulo_card}`);
        return false;
      }
      
      // Regra 3: Valida se elemento cortado é crítico
      if (h.titulo_card && h.titulo_card.toLowerCase().includes('cortad')) {
        return this.isCriticalCut(h, enrichedFigmaSpec);
      }
      
      // Regra 4: Remove falsos positivos de Auto Layout
      if (this.isAutoLayoutFalsePositive(h, enrichedFigmaSpec)) {
        logger.info(`[Validator] Removendo falso positivo de Auto Layout: ${h.titulo_card}`);
        return false;
      }
      
      return true;
    });

    const removedCount = heuristics.length - validatedHeuristics.length;
    if (removedCount > 0) {
      logger.info(`🔍 Validação concluída: ${removedCount} falsos positivos removidos`);
    }

    return validatedHeuristics;
  }

  isIntentionalImageOverflow(heuristic, enrichedFigmaSpec) {
    if (!enrichedFigmaSpec || !enrichedFigmaSpec.components) {
      return false;
    }

    // Identifica o nó relacionado à heurística
    const node = enrichedFigmaSpec.components.find(comp => 
      heuristic.node_id === comp.id ||
      (heuristic.titulo_card && heuristic.titulo_card.toLowerCase().includes(comp.name.toLowerCase()))
    );
    
    if (!node || !node.clippingContext) {
      return false;
    }
    
    // Checa se é imagem com overflow intencional
    const isImage = node.type === 'RECTANGLE' && 
                   node.fills && 
                   node.fills.some(f => f.type === 'IMAGE');
    
    return isImage && node.clippingContext.intentionalOverflow === true;
  }

  isDecorativeElement(heuristic, enrichedFigmaSpec) {
    if (!enrichedFigmaSpec || !enrichedFigmaSpec.components) {
      return false;
    }

    const node = enrichedFigmaSpec.components.find(comp => 
      heuristic.node_id === comp.id ||
      (heuristic.titulo_card && heuristic.titulo_card.toLowerCase().includes(comp.name.toLowerCase()))
    );
    
    if (!node) {
      return false;
    }

    const nodeName = (node.name || '').toLowerCase();
    
    // Elementos decorativos conhecidos
    const decorativeKeywords = [
      'decoration', 'ornament', 'floating', 'splash', 
      'background', 'bg', 'hero', 'cover', 'overlay'
    ];
    
    return decorativeKeywords.some(keyword => nodeName.includes(keyword));
  }

  isCriticalCut(heuristic, enrichedFigmaSpec) {
    if (!enrichedFigmaSpec || !enrichedFigmaSpec.components) {
      return true; // dúvida → mantém alerta
    }

    const node = enrichedFigmaSpec.components.find(comp => 
      heuristic.node_id === comp.id ||
      (heuristic.titulo_card && heuristic.titulo_card.toLowerCase().includes(comp.name.toLowerCase()))
    );
    
    if (!node || !node.clippingContext) {
      return true; // dúvida → mantém alerta
    }
    
    const { visibleBounds, physicalBounds } = node.clippingContext;
    
    if (!visibleBounds || !physicalBounds) {
      return true; // dúvida → mantém alerta
    }
    
    // Calcula % de área visível
    const visibleArea = visibleBounds.width * visibleBounds.height;
    const totalArea = physicalBounds.width * physicalBounds.height;
    const visibilityRatio = visibleArea / totalArea;
    
    // Elementos críticos devem ter >80% visíveis
    const criticalTypes = ['TEXT', 'BUTTON', 'INPUT'];
    if (criticalTypes.includes(node.type)) {
      return visibilityRatio < 0.8;
    }
    
    // Imagens podem ter até 50% cortadas se forem decorativas
    return visibilityRatio < 0.5;
  }

  // =========================
  // VALIDAÇÃO DE AUTO LAYOUT
  // =========================
  
  isAutoLayoutFalsePositive(heuristic, enrichedFigmaSpec) {
    if (!enrichedFigmaSpec || !enrichedFigmaSpec.components) {
      return false;
    }

    // Identifica heurísticas sobre alinhamento
    const alignmentKeywords = [
      'alinhamento',
      'desalinhado',
      'centralizado',
      'posicionado',
      'esquerda',
      'direita',
      'margem',
      'padding'
    ];
    
    const isAlignmentIssue = alignmentKeywords.some(keyword =>
      heuristic.titulo_card && heuristic.titulo_card.toLowerCase().includes(keyword) ||
      heuristic.descricao && heuristic.descricao.toLowerCase().includes(keyword)
    );
    
    if (!isAlignmentIssue) return false;
    
    // Busca o nó relacionado
    const node = enrichedFigmaSpec.components.find(comp => 
      heuristic.node_id === comp.id ||
      (heuristic.titulo_card && heuristic.titulo_card.toLowerCase().includes(comp.name.toLowerCase()))
    );
    
    if (!node || !node.layoutContext) return false;
    
    // Se elemento está sob controle de Auto Layout e effectiveAlignment
    // está correto, é falso positivo
    if (node.layoutContext.isControlledByParent) {
      const effective = node.layoutContext.effectiveAlignment;
      
      // Para botões, CENTER é esperado
      if (node.type === 'BUTTON' || (node.name && node.name.toLowerCase().includes('button'))) {
        return effective.horizontal === 'CENTER';
      }
      
      // Para textos dentro de botões, CENTER também é esperado
      const parentNode = enrichedFigmaSpec.components.find(n => 
        n.children && n.children.some(c => c.id === node.id)
      );
      
      if (parentNode && (parentNode.type === 'BUTTON' || (parentNode.name && parentNode.name.toLowerCase().includes('button')))) {
        return effective.horizontal === 'CENTER';
      }
      
      // Para elementos com Auto Layout funcionando corretamente
      if (effective.horizontal === 'CENTER' && effective.vertical === 'CENTER') {
        return true; // Falso positivo - está centralizado corretamente
      }
    }
    
    return false;
  }
}

/**
 * =========================
 *  Detecção de Imagem Pura
 * =========================
 * Detecta se a tela selecionada é uma imagem pura (print de layout para benchmark)
 * Neste caso, apenas o Agente B trabalha e o Agente C faz a validação final
 */
function isPureImageScreen(figmaSpec, imageBase64) {
  // Critérios para detectar imagem pura:
  // 1. Tem imagem base64 mas poucos ou nenhum componente estruturado
  // 2. FigmaSpec tem poucos componentes (menos de 5)
  // 3. Componentes são principalmente imagens ou elementos simples
  // 4. Não há estrutura complexa de layout
  
  if (!imageBase64) {
    return false; // Sem imagem, não é imagem pura
  }
  
  if (!figmaSpec || !figmaSpec.components) {
    return true; // Sem estrutura, provavelmente é imagem pura
  }
  
  const componentCount = figmaSpec.components.length;
  const imageComponents = figmaSpec.components.filter(comp => 
    comp.type === 'RECTANGLE' && 
    comp.fills && 
    comp.fills.some(f => f.type === 'IMAGE')
  );
  
  // Se tem poucos componentes e a maioria são imagens, é provável que seja imagem pura
  const isLowComponentCount = componentCount < 5;
  const isMostlyImages = imageComponents.length > componentCount * 0.6;
  const hasMinimalStructure = componentCount < 3;
  
  // Se tem estrutura mínima OU (poucos componentes E maioria são imagens)
  const isPureImage = hasMinimalStructure || (isLowComponentCount && isMostlyImages);
  
  if (isPureImage) {
    logger.info(`🖼️ Imagem pura detectada: ${componentCount} componentes, ${imageComponents.length} imagens`);
  }
  
  return isPureImage;
}

// Orquestrador Principal - Coordena A, B e C
async function orchestrateAnalysis(figmaSpec, imageBase64, metodo, vectorStoreId, group, useRag = false) {
  logger.info(`🎭 Orquestrador iniciado: ${group}`);
  
  // ENRIQUECER FIGMASPEC COM CONTEXTO DE CLIPPING
  const enrichedFigmaSpec = enrichFigmaSpecWithClippingContext(figmaSpec);
  logger.info(`🔄 FigmaSpec enriquecido: ${enrichedFigmaSpec.components?.length || 0} componentes processados`);
  
  // DETECTAR SE É IMAGEM PURA
  const isPureImage = isPureImageScreen(enrichedFigmaSpec, imageBase64);
  if (isPureImage) {
    logger.info(`🖼️ REGRA ESPECIAL: Imagem pura detectada - pulando Agente A, apenas B + C`);
  }
  
  const startTime = performance.now();
  let achadosA = null, achadosB = null, achadosFinal = null;
  let ragContext = null; // Para compartilhar entre agentes
  
  // Timers detalhados
  let timeRAG = 0, timeAgenteA = 0, timeAgenteB = 0, timeAgenteC = 0;
  
  // Tracking de tokens
  let tokensA = { input: 0, output: 0 };
  let tokensB = { input: 0, output: 0 };
  let tokensC = { input: 0, output: 0 };
  
  try {
    // NOVA ESTRATÉGIA: Extrair RAG primeiro, depois executar A e B em paralelo
    logger.info(`   🔄 Extraindo contexto RAG para compartilhamento...`);
    
    if (useRag && vectorStoreId) {
      const ragStart = performance.now();
      try {
        ragContext = await getRagContext(metodo, vectorStoreId);
        if (ragContext) {
          logger.info(`🔄 Contexto RAG extraído: ${ragContext.length} chars (será compartilhado)`);
        }
      } catch (ragError) {
        logger.warn(`🔄 Erro ao extrair RAG: ${ragError.message}`);
      }
      timeRAG = performance.now() - ragStart;
    }
    
    // Executar agentes baseado no tipo de tela
    let resultA, resultB;
    
    if (isPureImage) {
      // REGRA ESPECIAL: Imagem pura - apenas Agente B
      logger.info(`   🔄 Executando apenas Agente B (Vision) para imagem pura...`);
      
      const agenteBStart = performance.now();
      
      if (imageBase64) {
        const agenteBStartIndividual = performance.now();
        const result = await runAgentB(imageBase64, metodo, vectorStoreId, useRag, ragContext);
        const agenteBEndIndividual = performance.now();
        timeAgenteB = agenteBEndIndividual - agenteBStartIndividual;
        
        if (result && result.tokens) {
          tokensB = result.tokens;
          resultB = { status: 'fulfilled', value: result.data };
        } else {
          resultB = { status: 'fulfilled', value: result };
        }
      } else {
        resultB = { status: 'rejected', reason: new Error('Sem imagem para análise') };
      }
      
      // Agente A não executa para imagem pura
      resultA = { status: 'rejected', reason: new Error('Pulado - imagem pura') };
      achadosA = { achados: [] };
      
    } else {
      // EXECUÇÃO NORMAL: Agente A e B em paralelo
      logger.info(`   🔄 Executando Agente A (JSON) e B (Vision) em paralelo...`);
      
      const agenteAStart = performance.now();
      const agenteBStart = performance.now();
      
      const [resultAPromise, resultBPromise] = await Promise.allSettled([
        (async () => {
          const agenteAStartIndividual = performance.now();
          const result = await runAgentA(enrichedFigmaSpec, metodo, vectorStoreId, useRag);
          const agenteAEndIndividual = performance.now();
          timeAgenteA = agenteAEndIndividual - agenteAStartIndividual;
          
          if (result && result.tokens) {
            tokensA = result.tokens;
            return result.data;
          }
          return result;
        })(),
        imageBase64 ? (async () => {
          const agenteBStartIndividual = performance.now();
          const result = await runAgentB(imageBase64, metodo, vectorStoreId, useRag, ragContext);
          const agenteBEndIndividual = performance.now();
          timeAgenteB = agenteBEndIndividual - agenteBStartIndividual;
          
          if (result && result.tokens) {
            tokensB = result.tokens;
            return result.data;
          }
          return result;
        })() : Promise.resolve(null)
      ]);
      
      resultA = resultAPromise;
      resultB = resultBPromise;
    }
    
    // Processar resultados do Agente A
    if (isPureImage) {
      // Para imagem pura, Agente A não executa
      logger.info(`   ⏭️ Agente A: pulado (imagem pura)`);
      achadosA = { achados: [] };
    } else if (resultA.status === 'fulfilled' && resultA.value) {
      if (resultA.value.data) {
        achadosA = resultA.value.data;
        tokensA = resultA.value.tokens;
      } else {
        achadosA = resultA.value;
      }
      logger.info(`   ✅ Agente A: ${achadosA.achados?.length || 0} achados`);
      
      // VALIDAÇÃO PRÉ-RECONCILIAÇÃO - Filtrar falsos positivos
      const validator = new PreReconciliationValidator();
      achadosA.achados = await validator.validateHeuristics(achadosA.achados, enrichedFigmaSpec);
      logger.info(`   ✅ Agente A (pós-validação): ${achadosA.achados?.length || 0} achados`);
    } else {
      logger.warn(`   ⚠️ Agente A falhou: ${resultA.reason?.message || 'erro desconhecido'}`);
      achadosA = { achados: [] };
    }
    
    // Processar resultados do Agente B
    if (resultB.status === 'fulfilled' && resultB.value) {
      if (resultB.value.data) {
        achadosB = resultB.value.data;
        tokensB = resultB.value.tokens;
      } else {
        achadosB = resultB.value;
      }
      logger.info(`   ✅ Agente B: ${achadosB.achados?.length || 0} achados`);
      
      // VALIDAÇÃO PRÉ-RECONCILIAÇÃO - Filtrar falsos positivos
      const validatorB = new PreReconciliationValidator();
      achadosB.achados = await validatorB.validateHeuristics(achadosB.achados, enrichedFigmaSpec);
      logger.info(`   ✅ Agente B (pós-validação): ${achadosB.achados?.length || 0} achados`);
    } else {
      if (imageBase64) {
        logger.warn(`   ⚠️ Agente B falhou: ${resultB.reason?.message || 'erro desconhecido'}`);
      } else {
        logger.info(`   ⏭️ Agente B: pulado (sem imagem)`);
      }
      achadosB = { achados: [] };
    }
    
    // Validação leve antes do Reconciler
    const totalAchados = (achadosA.achados?.length || 0) + (achadosB.achados?.length || 0);
    if (totalAchados === 0) {
      if (isPureImage) {
        logger.warn(`   ⚠️ Nenhum achado do Agente B (imagem pura) - usando fallback`);
        return {
          achados: [{
            constatacao_hipotese: "Hipótese",
            titulo_card: "Análise de imagem pura não disponível",
            heuristica_metodo: "Sistema — Imagem Pura",
            descricao: "Não foi possível gerar análise da imagem pura. Verifique se a imagem contém elementos analisáveis ou tente com uma tela estruturada.",
            sugestao_melhoria: "1) Verificar se a imagem contém interface analisável. 2) Tentar com tela estruturada do Figma. 3) Verificar qualidade da imagem.",
            justificativa: "Imagens puras (prints de layout) podem não conter elementos estruturados para análise heurística.",
            severidade: "baixo",
            referencias: ["Análise — Imagem Pura"]
          }]
        };
      } else {
        logger.warn(`   ⚠️ Nenhum achado dos agentes A e B - usando fallback`);
        return {
          achados: [{
            constatacao_hipotese: "Hipótese",
            titulo_card: "Análise não disponível",
            heuristica_metodo: "Sistema — Geral",
            descricao: "Não foi possível gerar análise com os agentes especializados. Tente novamente ou verifique a configuração.",
            sugestao_melhoria: "1) Verificar conectividade com APIs. 2) Validar configuração dos modelos. 3) Tentar novamente.",
            justificativa: "Garantir funcionamento adequado do sistema de análise.",
            severidade: "médio",
            referencias: ["Troubleshooting — Sistema"]
          }]
        };
      }
    }
    
    // Executar Agente C (Reconciler)
    logger.info(`   🔄 Executando Agente C (Reconciler)...`);
    const agenteCStartIndividual = performance.now();
    const resultC = await runAgentC(achadosA, achadosB, metodo, vectorStoreId, useRag, ragContext);
    const agenteCEndIndividual = performance.now();
    timeAgenteC = agenteCEndIndividual - agenteCStartIndividual;
    
    if (resultC && resultC.tokens) {
      tokensC = resultC.tokens;
      achadosFinal = resultC.data;
    } else {
      achadosFinal = resultC;
    }
    
    if (achadosFinal && achadosFinal.achados?.length > 0) {
      logger.info(`   ✅ Agente C: ${achadosFinal.achados.length} achados finais`);
    } else {
      logger.warn(`   ⚠️ Agente C falhou - usando merge simples`);
      // Fallback: merge simples dos achados A + B (limitado a 8)
      const allAchados = [...(achadosA.achados || []), ...(achadosB.achados || [])];
      achadosFinal = { 
        achados: allAchados.slice(0, 8).map(achado => ({
          ...achado,
          constatacao_hipotese: achado.constatacao_hipotese || "Constatação"
        }))
      };
    }
    
    const totalTime = performance.now() - startTime;
    logger.info(`   🎭 Orquestrador concluído: ${(totalTime / 1000).toFixed(2)}s`);
    
    // Logs detalhados de performance por agente
    logger.info(`[ITEM ${group}] Timer Detalhado:`);
    logger.info(`   📊 RAG: ${(timeRAG / 1000).toFixed(2)}s`);
    
    if (isPureImage) {
      logger.info(`   🔄 Agente A (JSON): PULADO - Imagem pura`);
      logger.info(`   🔄 Agente B (Vision): ${(timeAgenteB / 1000).toFixed(2)}s → ${achadosB ? `${achadosB.achados?.length || 0} achados` : 'falhou'} | Tokens: ${tokensB.input || 0}→${tokensB.output || 0}`);
    } else {
      logger.info(`   🔄 Agente A (JSON): ${(timeAgenteA / 1000).toFixed(2)}s → ${achadosA ? `${achadosA.achados?.length || 0} achados` : 'falhou'} | Tokens: ${tokensA.input || 0}→${tokensA.output || 0}`);
      logger.info(`   🔄 Agente B (Vision): ${(timeAgenteB / 1000).toFixed(2)}s → ${achadosB ? `${achadosB.achados?.length || 0} achados` : imageBase64 ? 'falhou' : 'pulado'} | Tokens: ${tokensB.input || 0}→${tokensB.output || 0}`);
    }
    
    logger.info(`   🔄 Agente C (Reconciler): ${(timeAgenteC / 1000).toFixed(2)}s → ${achadosFinal ? `${achadosFinal.achados?.length || 0} achados finais` : 'falhou'} | Tokens: ${tokensC.input || 0}→${tokensC.output || 0}`);
    
    const totalTokensInput = (tokensA.input || 0) + (tokensB.input || 0) + (tokensC.input || 0);
    const totalTokensOutput = (tokensA.output || 0) + (tokensB.output || 0) + (tokensC.output || 0);
    const totalTokens = totalTokensInput + totalTokensOutput;
    
    logger.info(`   💰 Tokens TOTAL: ${totalTokensInput} entrada + ${totalTokensOutput} saída = ${totalTokens} total`);
    logger.info(`   ⏱️ Tempo total orquestração: ${(totalTime / 1000).toFixed(2)}s`);
    
    // Debug adicional para tokens zerados
    if (tokensA.input === 0 && tokensA.output === 0) {
      logger.warn(`🔍 DEBUG: Agente A retornou tokens zerados - verificar extração`);
    }
    if (tokensC.input === 0 && tokensC.output === 0) {
      logger.warn(`🔍 DEBUG: Agente C retornou tokens zerados - verificar extração`);
    }
    
    return achadosFinal;
    
  } catch (e) {
    logger.error(`❌ Erro no orquestrador: ${e.message}`);
    return {
      achados: [{
        constatacao_hipotese: "Hipótese",
        titulo_card: "Erro na análise orquestrada",
        heuristica_metodo: "Sistema — Erro",
        descricao: `Erro interno durante a coordenação dos agentes: ${e.message}`,
        sugestao_melhoria: "1) Verificar logs do servidor. 2) Tentar novamente. 3) Reportar se persistir.",
        justificativa: "Identificar e resolver problemas técnicos.",
        severidade: "alto",
        referencias: ["Error Handling — Sistema"]
      }]
    };
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
app.use(express.static(path.join(__dirname, "../front"))); // servir arquivos do frontend

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
      const res = await fetchWithTimeout(url, options);
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

// Função para tentar corrigir JSON malformado
const fixMalformedJSON = (content) => {
  try {
    // Tentar correções comuns
    let fixed = content;
    
    // 1. Remover caracteres de controle invisíveis
    fixed = fixed.replace(/[\x00-\x1F\x7F]/g, '');
    
    // 2. Corrigir strings não terminadas (adicionar aspas no final se necessário)
    const openQuotes = (fixed.match(/"/g) || []).length;
    if (openQuotes % 2 !== 0) {
      // Número ímpar de aspas - adicionar aspas no final
      fixed = fixed.trim() + '"';
    }
    
    // 3. Corrigir vírgulas extras antes de fechamentos
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // 4. Corrigir vírgulas faltando entre objetos
    fixed = fixed.replace(/}(\s*){/g, '},$1{');
    
    // 5. Garantir que termina com } ou ]
    if (!fixed.trim().endsWith('}') && !fixed.trim().endsWith(']')) {
      // Tentar adicionar fechamento baseado no contexto
      if (fixed.includes('"achados"')) {
        fixed = fixed.trim() + '}';
      }
    }
    
    // Testar se o JSON corrigido é válido
    JSON.parse(fixed);
    return fixed;
  } catch (e) {
    logger.warn(`🔄 Não foi possível corrigir JSON malformado: ${e.message}`);
    return null;
  }
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
      const entradaStatus = hasSpec && hasImg ? "figmaSpec + imagem" : (hasSpec ? "figmaSpec" : (hasImg ? "imagem" : "-"));
      status(group, "Entrada", true, entradaStatus);

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
        
        // Salvar sempre com nome único
        const rawFileName = generateUniqueDebugFileName('raw', 'always');
        try { fs.writeFileSync(path.join(__dirname, "debug_layouts", rawFileName), raw, "utf8"); } catch {}
        
        if (!parsed) {
          console.warn(`[WARN] JSON inválido detectado, salvando saída bruta em debug_layouts/${rawFileName}`);
          const errorFileName = generateUniqueDebugFileName('raw', 'error');
          try { fs.writeFileSync(path.join(__dirname, "debug_layouts", errorFileName), raw, "utf8"); } catch {}
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
        const fileName = hasSpec ? 
          generateUniqueDebugFileName('figmaSpec', `item${i+1}`) : 
          generateUniqueDebugFileName('vision', `item${i+1}`);
        fs.writeFileSync(path.join(dir, fileName), visionPretty, "utf8");
        fs.writeFileSync(path.join(dir, "last.json"),
          JSON.stringify({ images: LAST_VISION_RAW, count: LAST_VISION_RAW.length }, null, 2),
          "utf8"
        );
        status(group, "Persistido", true, `debug_layouts/${fileName}`);

      status(group, "Agente", true, `Orquestrador: A(${MODELO_AGENTE_A}) + B(${MODELO_AGENTE_B}) + C(${MODELO_AGENTE_C})`);
      status(group, "RAG", true, USE_RAG ? `ON (${vectorStoreId || "sem ID"})` : "OFF");

      // NOVA ABORDAGEM: Usar orquestrador com 3 agentes especializados
      try {
        const tAnalise = performance.now();
        
        // Executar orquestração: A (JSON) + B (Vision) → C (Reconciler)
        const resultadoFinal = await orchestrateAnalysis(
          spec,                    // figmaSpec para Agente A
          itemImg?.url || null,    // imagem base64 para Agente B (extrair URL do objeto)
          metodo,                  // método heurístico
          vectorStoreId,           // RAG
          group,                   // identificação do grupo
          USE_RAG                  // flag do RAG
        );
        
        const analise_ms = performance.now() - tAnalise;
        
        if (resultadoFinal && resultadoFinal.achados?.length > 0) {
          // Converter resultado final para formato texto numerado (compatível com frontend)
              const achadosTexto = [];
          resultadoFinal.achados.forEach((achado, index) => {
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
              
          const textoFinal = achadosTexto.join('\n[[[FIM_HEURISTICA]]]\n');
          respostasIndividuais.push(textoFinal);
          
          status(group, "Orquestrador: concluído", true, `${resultadoFinal.achados.length} achados`);
          
          // Log de timing detalhado
          const prep_ms = tAnalise - tPrep0;
          const post_ms = performance.now() - (tAnalise + analise_ms);
          
          console.log(`[ITEM ${i+1}/${N}] Timer Tela: ${((performance.now() - tItem0) / 1000).toFixed(2)}s | prep: ${(prep_ms / 1000).toFixed(2)}s | orquestração: ${(analise_ms / 1000).toFixed(2)}s | pós: ${(post_ms / 1000).toFixed(2)}s`);
          console.log(`[ITEM ${i+1}/${N}] Resumo: ${resultadoFinal.achados.length} achados gerados via orquestração`);
          
        } else {
          // Fallback se orquestração falhar
          logger.warn(`⚠️ Orquestração falhou para ${group} - usando fallback`);
          respostasIndividuais.push("Análise não disponível no momento. Tente novamente. [[[FIM_HEURISTICA]]]");
          status(group, "Orquestrador: fallback", false, "análise não disponível");
        }
        
        continue;
        
      } catch (e) {
        logger.error(`❌ Erro no orquestrador para ${group}: ${e.message}`);
        respostasIndividuais.push(`Erro na análise orquestrada: ${e.message} [[[FIM_HEURISTICA]]]`);
        status(group, "Orquestrador: erro", false, e.message);
        continue;
      }
      } catch (e) {
        status(group, "Persistido", false, e.message);
      }
    }

    // ========================================
    // Fim do loop de processamento de itens  
    // ========================================
    
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

app.listen(PORT, async () => {
  logger.info(`Servidor iniciado na porta ${PORT}`);
  logger.info(`Logs salvos em: ${ndjsonPath}`);
  
  // Limpeza inicial de arquivos antigos
  await cleanupOldDebugFiles();
  
  // Limpeza periódica a cada 2 horas
  setInterval(cleanupOldDebugFiles, 2 * 60 * 60 * 1000);
  
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

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🔄 Recebido SIGINT, encerrando servidor...');
  await shutdownLangfuse();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('🔄 Recebido SIGTERM, encerrando servidor...');
  await shutdownLangfuse();
  process.exit(0);
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
app.get("/status", (req, res) => {
  res.json({
    status: "running",
    service: "figma-agenti-backend",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

app.get("/ping-openai", async (_req, res) => {
  try {
    const r = await fetchHealth("https://api.openai.com/v1/chat/completions", {
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

app.post("/analyze", (req, res) => {
  res.json({
    message: "Análise de UX - Endpoint em desenvolvimento",
    status: "placeholder",
    timestamp: new Date().toISOString()
  });
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

// =========================
// ENDPOINTS PARA FEEDBACK E TRACKING
// =========================

// Endpoint para receber feedback dos usuários
app.post('/api/feedback', async (req, res) => {
  try {
    const { achadoIndex, feedback, timestamp, userId } = req.body;
    
    // Validar dados
    if (typeof achadoIndex !== 'number' || !['like', 'dislike'].includes(feedback)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Dados de feedback inválidos' 
      });
    }
    
    // Salvar feedback (aqui você pode salvar em banco de dados)
    const feedbackData = {
      achadoIndex,
      feedback,
      timestamp: timestamp || new Date().toISOString(),
      userId: userId || 'anonymous',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };
    
    // Log do feedback
    logger.info(`📊 Feedback recebido: ${feedback} para achado ${achadoIndex} (usuário: ${userId})`);
    
    // Aqui você pode salvar em banco de dados
    // await saveFeedbackToDatabase(feedbackData);
    
    res.json({ 
      success: true, 
      message: 'Feedback registrado com sucesso',
      data: feedbackData
    });
    
  } catch (error) {
    logger.error(`❌ Erro ao processar feedback: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor' 
    });
  }
});

// Endpoint para rastrear cliques em referências
app.post('/api/track-reference', async (req, res) => {
  try {
    const { reference, timestamp, userId } = req.body;
    
    // Validar dados
    if (!reference || typeof reference !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Referência inválida' 
      });
    }
    
    // Salvar tracking (aqui você pode salvar em banco de dados)
    const trackingData = {
      reference,
      timestamp: timestamp || new Date().toISOString(),
      userId: userId || 'anonymous',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };
    
    // Log do tracking
    logger.info(`🔗 Clique em referência: ${reference} (usuário: ${userId})`);
    
    // Aqui você pode salvar em banco de dados
    // await saveTrackingToDatabase(trackingData);
    
    res.json({ 
      success: true, 
      message: 'Tracking registrado com sucesso',
      data: trackingData
    });
    
  } catch (error) {
    logger.error(`❌ Erro ao processar tracking: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor' 
    });
  }
});

// Endpoint para obter estatísticas de feedback
app.get('/api/feedback/stats', async (req, res) => {
  try {
    // Aqui você pode buscar estatísticas do banco de dados
    // const stats = await getFeedbackStats();
    
    // Exemplo de resposta
    const stats = {
      totalFeedback: 0,
      likes: 0,
      dislikes: 0,
      mostLikedHeuristic: null,
      mostDislikedHeuristic: null,
      feedbackByDate: []
    };
    
    res.json({ 
      success: true, 
      data: stats
    });
    
  } catch (error) {
    logger.error(`❌ Erro ao obter estatísticas: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Erro interno do servidor' 
    });
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

        const response = await fetchWithTimeout(apiUrl, {
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