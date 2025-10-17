/**
 * =========================
 *  SISTEMA DE MÉTRICAS DETALHADAS
 * =========================
 */

const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sec = (ms) => Number(ms/1000).toFixed(3); // Aumentar precisão para 3 casas decimais

// Função de alta resolução para timing preciso (microssegundos)
const hr = () => Number(process.hrtime.bigint() / 1000000n); // ms com precisão de microssegundos

class AgentMetrics {
  constructor(agentName) {
    this.agentName = agentName;
    this.requestId = crypto.randomUUID();
    this.startTime = null;
    this.endTime = null;
    this.timestamps = {
      start: null,
      end: null
    };
    this.phases = {};
    this.tokens = {
      input: 0,
      output: 0,
      breakdown: {}
    };
    this.networkTime = 0;
    this.streamingMetrics = {
      timeToFirstToken: null,
      generationTime: null,
      tokensPerSecond: null
    };
    this.model = null;
    this.status = 'pending';
  }

  startPhase(phaseName) {
    this.phases[phaseName] = {
      startTime: hr(), // Usar alta resolução
      endTime: null,
      duration: 0
    };
  }

  setTokens(input, output, breakdown = {}) {
    this.tokens.input = input;
    this.tokens.output = output;
    this.tokens.breakdown = breakdown;
  }

  endPhase(phaseName) {
    if (this.phases[phaseName]) {
      this.phases[phaseName].endTime = hr();
      this.phases[phaseName].duration = this.phases[phaseName].endTime - this.phases[phaseName].startTime;
    }
  }

  // Métricas de benchmark conhecidas por modelo
  static getModelBenchmarks() {
    return {
      "gpt-5-mini": {
        expectedLatency: 300, // ms
        expectedTokensPerSecond: 75,
        maxOptimalTokens: 20000
      },
      "gpt-4o-mini": {
        expectedLatency: 200,
        expectedTokensPerSecond: 100,
        maxOptimalTokens: 4000
      },
      "o3-mini": {
        expectedLatency: 400,
        expectedTokensPerSecond: 60,
        maxOptimalTokens: 15000
      }
    };
  }

  // Calcular performance vs benchmark esperado
  calculatePerformanceScore() {
    const benchmarks = AgentMetrics.getModelBenchmarks();
    const modelName = this.agentName.includes('gpt-5') ? 'gpt-5-mini' : 
                     this.agentName.includes('gpt-4') ? 'gpt-4o-mini' : 'o3-mini';
    
    const benchmark = benchmarks[modelName];
    if (!benchmark) return null;

    const actualLatency = this.getTotalDuration();
    const actualTokensPerSecond = this.tokens.output / (actualLatency / 1000);
    
    const latencyScore = Math.max(0, 100 - ((actualLatency - benchmark.expectedLatency) / benchmark.expectedLatency * 100));
    const tokensScore = Math.min(100, (actualTokensPerSecond / benchmark.expectedTokensPerSecond) * 100);
    
    return {
      model: modelName,
      latencyScore: Math.round(latencyScore),
      tokensScore: Math.round(tokensScore),
      overallScore: Math.round((latencyScore + tokensScore) / 2),
      benchmark: benchmark,
      actual: {
        latency: actualLatency,
        tokensPerSecond: actualTokensPerSecond
      }
    };
  }

  getAIProcessingTime() {
    if (!this.networkTime || !this.endTime || !this.startTime) return 0;
    const totalTime = this.getTotalDuration();
    return Math.max(0, totalTime - this.networkTime);
  }

  start() {
    this.startTime = hr();
    this.timestamps.start = new Date().toISOString();
    this.status = 'running';
  }

  end() {
    this.endTime = hr();
    this.timestamps.end = new Date().toISOString();
    this.status = 'completed';
  }

  setModel(modelName) {
    this.model = modelName;
  }

  setStreamingMetrics(timeToFirstToken, generationTime, tokensPerSecond) {
    this.streamingMetrics = {
      timeToFirstToken,
      generationTime,
      tokensPerSecond
    };
  }

  getTotalDuration() {
    return this.endTime - this.startTime;
  }

  // Gerar log estruturado no formato recomendado pelo ChatGPT
  generateStructuredLog() {
    const metrics = {};
    
    // Converter fases para formato de métricas
    Object.entries(this.phases).forEach(([name, phase]) => {
      const key = name.toLowerCase().replace(/\s+/g, '_') + '_ms';
      metrics[key] = Math.round(phase.duration * 100) / 100; // 2 casas decimais
    });

    return {
      request_id: this.requestId,
      agent: this.agentName,
      model: this.model,
      timestamps: this.timestamps,
      metrics_ms: {
        ...metrics,
        total_ms: Math.round(this.getTotalDuration() * 100) / 100,
        network_ms: Math.round(this.networkTime * 100) / 100,
        ai_processing_ms: Math.round(this.getAIProcessingTime() * 100) / 100
      },
      tokens: {
        input: this.tokens.input,
        output: this.tokens.output,
        total: this.tokens.input + this.tokens.output,
        breakdown: this.tokens.breakdown
      },
      streaming: this.streamingMetrics,
      status: this.status,
      performance_score: this.calculatePerformanceScore()
    };
  }

  getReport() {
    const totalDuration = this.getTotalDuration();
    const aiProcessingTime = this.getAIProcessingTime();
    const networkTime = this.networkTime || 0;
    
    const phasesReport = Object.entries(this.phases)
      .map(([name, phase]) => `    📊 ${name}: ${sec(phase.duration)}s`)
      .join('\n');

    const tokensReport = Object.entries(this.tokens.breakdown)
      .map(([name, count]) => `    🔢 ${name}: ${count} tokens`)
      .join('\n');

    return `
📈 MÉTRICAS DETALHADAS - ${this.agentName}:
⏱️ Tempo Total: ${sec(totalDuration)}s
⏱️ Tempo de Rede: ${sec(networkTime)}s
🧠 Tempo de IA: ${sec(aiProcessingTime)}s
${phasesReport}
💰 Tokens Total: ${this.tokens.input} entrada + ${this.tokens.output} saída = ${this.tokens.input + this.tokens.output} total
${tokensReport}`;
  }

  generateFormattedReport() {
    const totalDuration = this.getTotalDuration();
    const aiProcessingTime = this.getAIProcessingTime();
    const networkTime = this.networkTime || 0;
    const performanceScore = this.calculatePerformanceScore();
    const now = new Date();
    
    // Criar relatório formatado
    let report = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                           RELATÓRIO DE MÉTRICAS                             ║
║                              ${this.agentName}                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  📅 Data/Hora: ${now.toLocaleString('pt-BR')}                                    ║
║  ⏱️  Tempo Total: ${sec(totalDuration)}s                                           ║
║  🌐 Tempo de Rede: ${sec(networkTime)}s                                           ║
║  🧠 Tempo de IA: ${sec(aiProcessingTime)}s                                           ║`;

    // Adicionar score de performance se disponível
    if (performanceScore) {
      const scoreColor = performanceScore.overallScore >= 80 ? '🟢' : 
                        performanceScore.overallScore >= 60 ? '🟡' : '🔴';
      report += `
║  ${scoreColor} Score de Performance: ${performanceScore.overallScore}% (${performanceScore.model}) ║`;
    }

    report += `
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                              ANÁLISE DE TEMPO                               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║`;

    // Adicionar fases de tempo
    Object.entries(this.phases).forEach(([name, phase]) => {
      const percentage = ((phase.duration / totalDuration) * 100).toFixed(1);
      report += `
║  📊 ${name.padEnd(25)} │ ${sec(phase.duration).padStart(8)}s │ ${percentage.padStart(6)}% ║`;
    });

    report += `
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                            ANÁLISE DE TOKENS                                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  💰 Tokens de Entrada:  ${this.tokens.input.toString().padStart(8)} tokens                    ║
║  💰 Tokens de Saída:    ${this.tokens.output.toString().padStart(8)} tokens                    ║
║  💰 Total de Tokens:    ${(this.tokens.input + this.tokens.output).toString().padStart(8)} tokens                    ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                         BREAKDOWN DETALHADO                                 ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║`;

    // Adicionar breakdown de tokens
    Object.entries(this.tokens.breakdown).forEach(([name, count]) => {
      const percentage = this.tokens.input > 0 ? ((count / this.tokens.input) * 100).toFixed(1) : '0.0';
      report += `
║  🔢 ${name.padEnd(25)} │ ${count.toString().padStart(8)} tokens │ ${percentage.padStart(6)}% ║`;
    });

    report += `
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                              PERFORMANCE                                     ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  ⚡ Tokens por segundo: ${(this.tokens.output / (totalDuration / 1000)).toFixed(2)} tokens/s                    ║
║  💸 Custo estimado:     $${((this.tokens.input * 0.00001) + (this.tokens.output * 0.00003)).toFixed(4)} USD                    ║
║  🌐 % Tempo de Rede:    ${((networkTime / totalDuration) * 100).toFixed(1)}%                                           ║
║  🧠 % Tempo de IA:      ${((aiProcessingTime / totalDuration) * 100).toFixed(1)}%                                           ║`;

    // Adicionar comparação com benchmark se disponível
    if (performanceScore) {
      const latencyDiff = ((performanceScore.actual.latency - performanceScore.benchmark.expectedLatency) / performanceScore.benchmark.expectedLatency * 100).toFixed(1);
      const tokensDiff = ((performanceScore.actual.tokensPerSecond - performanceScore.benchmark.expectedTokensPerSecond) / performanceScore.benchmark.expectedTokensPerSecond * 100).toFixed(1);
      
      report += `
║                                                                              ║
║  📊 vs Benchmark (${performanceScore.model}):                                    ║
║     ⏱️  Latência: ${latencyDiff > 0 ? '+' : ''}${latencyDiff}% vs esperado                              ║
║     ⚡ Tokens/s: ${tokensDiff > 0 ? '+' : ''}${tokensDiff}% vs esperado                                ║`;
    }

    report += `
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`;

    return report;
  }

  async saveReportToFile() {
    try {
      // Criar pasta debug_layouts se não existir
      const debugDir = path.join(__dirname, 'debug_layouts');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      // Gerar nome único para o arquivo
      const now = new Date();
      const timestamp = now.toISOString()
        .replace(/[-:]/g, '')
        .replace(/\..+/, '')
        .replace('T', '_');
      
      const hash = crypto.createHash('md5')
        .update(`${timestamp}_${this.agentName}`)
        .digest('hex')
        .substring(0, 8);
      
      // Salvar relatório formatado (TXT)
      const txtFilename = `${timestamp}_${hash}_metrics_${this.agentName.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
      const txtFilepath = path.join(debugDir, txtFilename);
      const report = this.generateFormattedReport();
      fs.writeFileSync(txtFilepath, report, 'utf8');

      // Salvar log estruturado (JSON)
      const jsonFilename = `${timestamp}_${hash}_structured_${this.agentName.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      const jsonFilepath = path.join(debugDir, jsonFilename);
      const structuredLog = this.generateStructuredLog();
      fs.writeFileSync(jsonFilepath, JSON.stringify(structuredLog, null, 2), 'utf8');

      console.log(`📊 Relatório de métricas salvo: ${txtFilename}`);
      console.log(`📊 Log estruturado salvo: ${jsonFilename}`);
      return { txt: txtFilepath, json: jsonFilepath };
    } catch (error) {
      console.error(`❌ Erro ao salvar relatório: ${error.message}`);
      return null;
    }
  }
}

module.exports = { AgentMetrics };
