/**
 * =========================
 *  SISTEMA DE TRACING ESTRUTURADO
 * =========================
 * Baseado na resposta do ChatGPT para análise detalhada de performance
 */

const { performance } = require('perf_hooks');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

// Tipos de spans para padronização
const SPAN_TYPES = {
  PREP: 'prep',
  RAG_FETCH: 'rag_fetch', 
  RAG_RERANK: 'rag_rerank',
  MODEL_CALL: 'model_call',
  POST: 'post',
  TOTAL: 'total',
  // Específicos dos nossos agentes
  AGENT_A_JSON: 'agent_a_json',
  AGENT_B_VISION: 'agent_b_vision', 
  AGENT_C_RECONCILER: 'agent_c_reconciler',
  ORCHESTRATION: 'orchestration'
};

class Span {
  constructor(name, ms, extra = {}) {
    this.name = name;
    this.ms = ms;
    this.extra = extra;
  }
}

class Trace {
  constructor(traceId, route = null) {
    this.traceId = traceId;
    this.route = route;
    this.spans = [];
    this.at = new Date().toISOString();
    this.totals = {};
    this.tokens = {};
    this.agent = null;
  }

  addSpan(span) {
    this.spans.push(span);
  }

  setAgent(agentName) {
    this.agent = agentName;
  }

  setTokens(prompt = 0, completion = 0, total = 0) {
    this.tokens = { prompt, completion, total };
  }

  calculateTotals() {
    this.totals = {
      total_ms: +(this.spans.reduce((sum, span) => sum + span.ms, 0).toFixed(2)),
      span_count: this.spans.length
    };
  }

  toJSON() {
    this.calculateTotals();
    return {
      level: "info",
      type: "ai_trace",
      traceId: this.traceId,
      route: this.route,
      agent: this.agent,
      spans: this.spans,
      tokens: this.tokens,
      totals: this.totals,
      at: this.at
    };
  }
}

// Utilitário para cronometrar blocos de código
async function timeBlock(name, fn, extra = {}) {
  const t0 = performance.now();
  const result = await fn();
  const ms = +(performance.now() - t0).toFixed(2);
  return { result, ms, span: new Span(name, ms, extra) };
}

// Emitir trace para logs
function emitTrace(trace) {
  const logEntry = trace.toJSON();
  
  // Log no console
  console.log(JSON.stringify(logEntry));
  
  // Salvar em arquivo para análise posterior
  saveTraceToFile(logEntry);
}

// Salvar trace em arquivo para análise
function saveTraceToFile(traceData) {
  try {
    const debugDir = path.join(__dirname, 'debug_layouts');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    const timestamp = new Date().toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .replace('T', '_');
    
    const filename = `${timestamp}_${traceData.traceId.substring(0, 8)}_trace.json`;
    const filepath = path.join(debugDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(traceData, null, 2), 'utf8');
    console.log(`📊 Trace salvo: ${filename}`);
  } catch (error) {
    console.error(`❌ Erro ao salvar trace: ${error.message}`);
  }
}

// Criar novo trace
function createTrace(route = null) {
  const traceId = randomUUID();
  return new Trace(traceId, route);
}

// Análise de performance por span
function analyzeSpans(spans) {
  const analysis = {
    slowest: null,
    fastest: null,
    total: 0,
    breakdown: {}
  };

  spans.forEach(span => {
    analysis.total += span.ms;
    
    if (!analysis.slowest || span.ms > analysis.slowest.ms) {
      analysis.slowest = span;
    }
    
    if (!analysis.fastest || span.ms < analysis.fastest.ms) {
      analysis.fastest = span;
    }
    
    analysis.breakdown[span.name] = (analysis.breakdown[span.name] || 0) + span.ms;
  });

  return analysis;
}

// Budget de performance (alertas)
const PERFORMANCE_BUDGET = {
  rag_fetch_ms: 300,    // RAG não deve demorar mais que 300ms
  model_call_ms: 15000, // Modelo não deve demorar mais que 15s
  total_ms: 20000       // Total não deve passar de 20s
};

function checkPerformanceBudget(trace) {
  const alerts = [];
  
  trace.spans.forEach(span => {
    const budget = PERFORMANCE_BUDGET[span.name + '_ms'];
    if (budget && span.ms > budget) {
      alerts.push({
        type: 'BUDGET_EXCEEDED',
        span: span.name,
        actual: span.ms,
        budget: budget,
        excess: span.ms - budget
      });
    }
  });

  if (alerts.length > 0) {
    console.warn(`⚠️ Budget de performance excedido:`, alerts);
  }

  return alerts;
}

module.exports = {
  SPAN_TYPES,
  Span,
  Trace,
  timeBlock,
  emitTrace,
  createTrace,
  analyzeSpans,
  checkPerformanceBudget,
  saveTraceToFile
};
