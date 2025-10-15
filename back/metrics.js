/**
 * =========================
 *  SISTEMA DE MÉTRICAS DETALHADAS
 * =========================
 */

const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sec = (ms) => Number(ms/1000).toFixed(2);

class AgentMetrics {
  constructor(agentName) {
    this.agentName = agentName;
    this.startTime = null;
    this.endTime = null;
    this.phases = {};
    this.tokens = {
      input: 0,
      output: 0,
      breakdown: {}
    };
  }

  startPhase(phaseName) {
    this.phases[phaseName] = {
      startTime: performance.now(),
      endTime: null,
      duration: 0
    };
  }

  endPhase(phaseName) {
    if (this.phases[phaseName]) {
      this.phases[phaseName].endTime = performance.now();
      this.phases[phaseName].duration = this.phases[phaseName].endTime - this.phases[phaseName].startTime;
    }
  }

  setTokens(input, output, breakdown = {}) {
    this.tokens.input = input;
    this.tokens.output = output;
    this.tokens.breakdown = breakdown;
  }

  start() {
    this.startTime = performance.now();
  }

  end() {
    this.endTime = performance.now();
  }

  getTotalDuration() {
    return this.endTime - this.startTime;
  }

  getReport() {
    const totalDuration = this.getTotalDuration();
    const phasesReport = Object.entries(this.phases)
      .map(([name, phase]) => `    📊 ${name}: ${sec(phase.duration)}s`)
      .join('\n');

    const tokensReport = Object.entries(this.tokens.breakdown)
      .map(([name, count]) => `    🔢 ${name}: ${count} tokens`)
      .join('\n');

    return `
📈 MÉTRICAS DETALHADAS - ${this.agentName}:
⏱️ Tempo Total: ${sec(totalDuration)}s
${phasesReport}
💰 Tokens Total: ${this.tokens.input} entrada + ${this.tokens.output} saída = ${this.tokens.input + this.tokens.output} total
${tokensReport}`;
  }

  generateFormattedReport() {
    const totalDuration = this.getTotalDuration();
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
      
      const filename = `${timestamp}_${hash}_metrics_${this.agentName.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
      const filepath = path.join(debugDir, filename);

      // Gerar e salvar relatório
      const report = this.generateFormattedReport();
      fs.writeFileSync(filepath, report, 'utf8');

      console.log(`📊 Relatório de métricas salvo: ${filename}`);
      return filepath;
    } catch (error) {
      console.error(`❌ Erro ao salvar relatório: ${error.message}`);
      return null;
    }
  }
}

module.exports = { AgentMetrics };
