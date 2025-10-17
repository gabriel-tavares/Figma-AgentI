/**
 * =========================
 *  INTEGRAÇÃO LANGFUSE
 * =========================
 * Envia traces estruturados para o dashboard Langfuse
 */

const { Langfuse } = require('langfuse');

const ROUTE_TRACE_NAMES = {
  '/agent-a': 'agente_a_json',
  '/agent-b': 'agente_b_vision',
  '/agent-c': 'agente_c_reconciler',
  '/orchestrate': 'orquestracao_register'
};

class LangfuseIntegration {
  constructor() {
    this.enabled = process.env.LANGFUSE_ENABLED === 'true';
    this.client = null;
    
    if (this.enabled) {
      this.initializeClient();
    }
  }

  initializeClient() {
    try {
      this.client = new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL,
        environment: process.env.NODE_ENV ?? 'prod',
        release: process.env.COMMIT_SHA ?? process.env.npm_package_version,
        flushAt: 1, // Enviar imediatamente
        flushInterval: 1000, // Enviar a cada 1 segundo
        sessionId: 'figma-agenti-session', // Session ID fixo para agrupar traces
        userId: 'figma-user' // User ID fixo
      });

      console.log('✅ Langfuse client inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar Langfuse:', error.message);
      this.enabled = false;
    }
  }

  /**
   * Envia um trace completo para o Langfuse
   * @param {Object} traceData - Dados do trace estruturado
   */
  async sendTrace(traceData) {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      // Criar trace principal seguindo o padrão do Langfuse
      const traceName =
        ROUTE_TRACE_NAMES[traceData.route] ||
        `figma-agenti-${(traceData.route || 'analysis').replace(/^\//, '').replace(/\//g, '_') || 'analysis'}`;
      const trace = this.client.trace({
        id: traceData.traceId,
        name: traceName,
        sessionId: 'figma-agenti-session',
        userId: 'figma-user',
        metadata: {
          route: traceData.route,
          agent: traceData.agent,
          totals: traceData.totals,
          tokens: traceData.tokens,
          timestamp: traceData.at,
          project: 'figma-agenti'
        }
      });

      // Adicionar cada span como generation (padrão Langfuse)
      traceData.spans.forEach((span, index) => {
        trace.generation({
          id: `${traceData.traceId}-gen-${index}`,
          name: span.name,
          startTime: new Date(traceData.at),
          endTime: new Date(new Date(traceData.at).getTime() + span.ms),
          metadata: {
            duration_ms: span.ms,
            extra: span.extra,
            span_type: span.name
          }
        });
      });

      // Finalizar o trace
      trace.update({
        output: {
          total_duration_ms: traceData.totals.total_ms,
          span_count: traceData.totals.span_count,
          tokens_used: traceData.tokens.total
        }
      });

      // Forçar envio imediato
      await this.client.flush();

      console.log(`📊 Trace enviado para Langfuse: ${traceData.traceId}`);

    } catch (error) {
      console.error('❌ Erro ao enviar trace para Langfuse:', error.message);
    }
  }

  /**
   * Envia métricas de performance para o Langfuse
   * @param {Object} metrics - Métricas de performance
   */
  async sendMetrics(metrics) {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      const trace = this.client.trace({
        id: `metrics-${Date.now()}`,
        name: 'figma-agenti-metrics',
        metadata: {
          type: 'performance_metrics',
          timestamp: new Date().toISOString()
        }
      });

      // Adicionar métricas como generations
      Object.entries(metrics).forEach(([key, value], index) => {
        trace.generation({
          id: `metric-${index}`,
          name: key,
          metadata: {
            value: value,
            metric_type: typeof value
          }
        });
      });

      console.log('📈 Métricas enviadas para Langfuse');

    } catch (error) {
      console.error('❌ Erro ao enviar métricas para Langfuse:', error.message);
    }
  }

  /**
   * Envia dados de um agente específico
   * @param {string} agentName - Nome do agente
   * @param {Object} agentData - Dados do agente
   */
  async sendAgentData(agentName, agentData) {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      const trace = this.client.trace({
        id: `agent-${agentName}-${Date.now()}`,
        name: `figma-agenti-${agentName}`,
        metadata: {
          agent: agentName,
          timestamp: new Date().toISOString(),
          ...agentData.metadata
        }
      });

      // Adicionar dados do agente como generation
      trace.generation({
        id: `agent-${agentName}-data`,
        name: `${agentName}-analysis`,
        metadata: {
          model: agentData.model,
          tokens: agentData.tokens,
          duration_ms: agentData.duration_ms,
          input: agentData.input,
          output: agentData.output
        }
      });

      console.log(`🤖 Dados do agente ${agentName} enviados para Langfuse`);

    } catch (error) {
      console.error(`❌ Erro ao enviar dados do agente ${agentName}:`, error.message);
    }
  }

  /**
   * Fecha a conexão com o Langfuse
   */
  async shutdown() {
    if (this.client) {
      await this.client.flush();
      await this.client.shutdownAsync();
      console.log('🔌 Conexão Langfuse fechada');
    }
  }
}

// Instância singleton
const langfuseIntegration = new LangfuseIntegration();

module.exports = {
  LangfuseIntegration,
  langfuseIntegration
};
