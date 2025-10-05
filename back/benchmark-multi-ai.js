/**
 * benchmark-multi-ai.js
 * Sistema avançado de benchmark para múltiplas IAs
 * Integra OpenRouter com sistema existente
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuração do OpenRouter
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Modelos expandidos com mais opções gratuitas e de baixo custo
const BENCHMARK_MODELS = {
  // Modelos 100% Gratuitos
  'free': {
    'google/gemini-2.0-flash-exp': {
      name: 'Gemini 2.0 Flash',
      provider: 'Google',
      cost: 'Free',
      description: 'Modelo mais rápido do Google, gratuito',
      maxTokens: 8192,
      temperature: 0.1,
      category: 'free'
    },
    'meta-llama/llama-3.3-70b-instruct': {
      name: 'Llama 3.3 70B',
      provider: 'Meta',
      cost: 'Free',
      description: 'Modelo open source mais avançado',
      maxTokens: 8192,
      temperature: 0.1,
      category: 'free'
    },
    'microsoft/phi-3.5-mini-instruct': {
      name: 'Phi 3.5 Mini',
      provider: 'Microsoft',
      cost: 'Free',
      description: 'Modelo compacto e eficiente',
      maxTokens: 4096,
      temperature: 0.1,
      category: 'free'
    },
    'qwen/qwen-2.5-72b-instruct': {
      name: 'Qwen 2.5 72B',
      provider: 'Alibaba',
      cost: 'Free',
      description: 'Modelo chinês de alta qualidade',
      maxTokens: 8192,
      temperature: 0.1,
      category: 'free'
    }
  },
  
  // Modelos de Baixo Custo (< $1/1M tokens)
  'low-cost': {
    'anthropic/claude-3-haiku': {
      name: 'Claude 3 Haiku',
      provider: 'Anthropic',
      cost: '$0.25/1M tokens',
      description: 'Modelo rápido e eficiente',
      maxTokens: 4096,
      temperature: 0.1,
      category: 'low-cost'
    },
    'openai/gpt-4o-mini': {
      name: 'GPT-4o Mini',
      provider: 'OpenAI',
      cost: '$0.15/1M tokens',
      description: 'Versão otimizada do GPT-4',
      maxTokens: 8192,
      temperature: 0.1,
      category: 'low-cost'
    },
    'google/gemini-1.5-flash': {
      name: 'Gemini 1.5 Flash',
      provider: 'Google',
      cost: '$0.075/1M tokens',
      description: 'Modelo rápido do Google',
      maxTokens: 8192,
      temperature: 0.1,
      category: 'low-cost'
    }
  },
  
  // Modelos Premium (alta qualidade)
  'premium': {
    'anthropic/claude-3.5-sonnet': {
      name: 'Claude 3.5 Sonnet',
      provider: 'Anthropic',
      cost: '$3/1M tokens',
      description: 'Melhor modelo para análise e raciocínio',
      maxTokens: 8192,
      temperature: 0.1,
      category: 'premium'
    },
    'openai/gpt-4o': {
      name: 'GPT-4o',
      provider: 'OpenAI',
      cost: '$5/1M tokens',
      description: 'Modelo mais avançado da OpenAI',
      maxTokens: 8192,
      temperature: 0.1,
      category: 'premium'
    },
    'google/gemini-1.5-pro': {
      name: 'Gemini 1.5 Pro',
      provider: 'Google',
      cost: '$1.25/1M tokens',
      description: 'Modelo avançado do Google',
      maxTokens: 8192,
      temperature: 0.1,
      category: 'premium'
    }
  }
};

// Prompts de teste específicos para UX/UI
const UX_TEST_PROMPTS = {
  'layout-analysis': {
    title: 'Análise de Layout',
    prompt: `Analise este layout de interface e identifique problemas de usabilidade:

[IMAGEM: Layout de uma página de e-commerce com problemas de UX]

Identifique:
1. Problemas de hierarquia visual
2. Questões de navegação
3. Problemas de acessibilidade
4. Sugestões de melhoria

Responda de forma estruturada e objetiva.`
  },
  
  'color-contrast': {
    title: 'Análise de Contraste',
    prompt: `Analise o contraste de cores nesta interface:

[IMAGEM: Interface com problemas de contraste]

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

[IMAGEM: Fluxo de navegação de um app]

Identifique:
1. Pontos de confusão
2. Caminhos desnecessários
3. Falta de feedback visual
4. Sugestões de otimização

Seja específico e prático.`
  }
};

// Função para fazer requisição ao OpenRouter
async function callOpenRouter(modelId, prompt, maxTokens = 4000) {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Heuristica UX Benchmark'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.1
      })
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

// Função avançada para avaliar qualidade da resposta
function evaluateUXResponse(response, modelInfo) {
  const content = response.content || '';
  
  // Métricas específicas para UX/UI
  const metrics = {
    // Métricas básicas
    length: content.length,
    wordCount: content.split(/\s+/).length,
    
    // Estrutura da resposta
    hasStructure: /^\d+\.|^-\s|^\*\s|^•\s/.test(content),
    hasNumberedList: /^\d+\./.test(content),
    hasBulletPoints: /^[-*•]\s/.test(content),
    
    // Conteúdo específico de UX
    hasProblems: /problema|issue|erro|falta|defeito|inconsistência/i.test(content),
    hasSolutions: /sugestão|melhoria|recomendação|solução|otimização/i.test(content),
    hasUXTerms: (content.match(/usabilidade|ux|ui|hierarquia|navegação|acessibilidade|contraste|legibilidade|fluxo|feedback/gi) || []).length,
    hasTechnicalTerms: (content.match(/wcag|aria|semântica|responsivo|mobile|desktop|breakpoint/gi) || []).length,
    
    // Qualidade da análise
    hasSpecificExamples: /exemplo|caso|cenário|quando|onde/i.test(content),
    hasActionableAdvice: /deve|precisa|recomendo|sugiro|implemente/i.test(content),
    
    // Detalhamento
    isDetailed: content.length > 500,
    isConcise: content.length > 100 && content.length < 1000
  };
  
  // Score baseado nas métricas (peso específico para UX)
  let score = 0;
  
  // Estrutura (20 pontos)
  if (metrics.hasStructure) score += 15;
  if (metrics.hasNumberedList) score += 5;
  
  // Conteúdo UX (40 pontos)
  if (metrics.hasProblems) score += 10;
  if (metrics.hasSolutions) score += 15;
  if (metrics.hasUXTerms >= 3) score += 10;
  if (metrics.hasTechnicalTerms >= 2) score += 5;
  
  // Qualidade (25 pontos)
  if (metrics.hasSpecificExamples) score += 10;
  if (metrics.hasActionableAdvice) score += 10;
  if (metrics.isDetailed) score += 5;
  
  // Tamanho adequado (15 pontos)
  if (metrics.wordCount >= 100 && metrics.wordCount <= 500) score += 15;
  else if (metrics.wordCount >= 50 && metrics.wordCount <= 1000) score += 10;
  else if (metrics.wordCount >= 20) score += 5;
  
  return {
    ...metrics,
    score: Math.min(score, 100),
    grade: getGrade(Math.min(score, 100))
  };
}

// Função para atribuir nota
function getGrade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B+';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C+';
  if (score >= 40) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

// Função principal de benchmark
async function runAdvancedBenchmark(category = 'free', testType = 'layout-analysis') {
  console.log(`🚀 Benchmark Avançado OpenRouter`);
  console.log(`📊 Categoria: ${category}`);
  console.log(`🧪 Teste: ${UX_TEST_PROMPTS[testType].title}\n`);
  
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes('your-key-here')) {
    console.error('❌ OPENROUTER_API_KEY não configurada!');
    console.log('Configure sua chave no arquivo .env:');
    console.log('OPENROUTER_API_KEY=sk-or-your-key-here');
    console.log('Obtenha sua chave em: https://openrouter.ai/');
    return;
  }

  const models = BENCHMARK_MODELS[category];
  if (!models) {
    console.error(`❌ Categoria "${category}" não encontrada.`);
    console.log('Categorias disponíveis:', Object.keys(BENCHMARK_MODELS).join(', '));
    return;
  }

  const testPrompt = UX_TEST_PROMPTS[testType].prompt;
  const results = [];
  const modelEntries = Object.entries(models);

  console.log(`📊 Testando ${modelEntries.length} modelos...\n`);

  for (const [modelId, modelInfo] of modelEntries) {
    console.log(`🔄 Testando: ${modelInfo.name} (${modelInfo.provider})`);
    
    const result = await callOpenRouter(modelId, testPrompt, modelInfo.maxTokens);
    
    if (result.success) {
      const evaluation = evaluateUXResponse(result, modelInfo);
      
      const modelResult = {
        model: modelInfo.name,
        provider: modelInfo.provider,
        cost: modelInfo.cost,
        category: modelInfo.category,
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
        category: modelInfo.category,
        error: result.error,
        latency: result.latency
      });
    }
    
    // Pausa entre requests para evitar rate limiting
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Exibir resultados detalhados
  displayAdvancedResults(results, testType);
  
  // Salvar resultados
  saveAdvancedResults(results, category, testType);
}

// Função para exibir resultados avançados
function displayAdvancedResults(results, testType) {
  console.log('\n📈 RESULTADOS DETALHADOS\n');
  console.log('=' * 100);
  
  // Ordenar por score (melhores primeiro)
  const successfulResults = results.filter(r => !r.error).sort((a, b) => b.evaluation.score - a.evaluation.score);
  
  console.log(`🏆 RANKING - ${UX_TEST_PROMPTS[testType].title}\n`);
  
  successfulResults.forEach((result, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
    
    console.log(`${medal} ${result.model} (${result.provider})`);
    console.log(`   💰 Custo: ${result.cost}`);
    console.log(`   ⚡ Latência: ${result.latency}ms`);
    console.log(`   📊 Score: ${result.evaluation.score}/100 (${result.evaluation.grade})`);
    console.log(`   📝 Palavras: ${result.evaluation.wordCount}`);
    console.log(`   🔧 Termos UX: ${result.evaluation.hasUXTerms}`);
    console.log(`   🛠️ Termos técnicos: ${result.evaluation.hasTechnicalTerms}`);
    console.log(`   📋 Estruturado: ${result.evaluation.hasStructure ? '✅' : '❌'}`);
    console.log(`   💡 Soluções: ${result.evaluation.hasSolutions ? '✅' : '❌'}`);
    console.log(`   📄 Preview: ${result.response}`);
    console.log('');
  });
  
  // Estatísticas gerais
  if (successfulResults.length > 0) {
    const avgLatency = successfulResults.reduce((sum, r) => sum + r.latency, 0) / successfulResults.length;
    const avgScore = successfulResults.reduce((sum, r) => sum + r.evaluation.score, 0) / successfulResults.length;
    const bestModel = successfulResults[0];
    const fastestModel = successfulResults.reduce((fastest, current) => 
      current.latency < fastest.latency ? current : fastest
    );
    
    console.log('📊 ESTATÍSTICAS GERAIS');
    console.log(`   ⚡ Latência média: ${Math.round(avgLatency)}ms`);
    console.log(`   📊 Score médio: ${Math.round(avgScore)}/100`);
    console.log(`   🏆 Melhor modelo: ${bestModel.model} (${bestModel.evaluation.score}/100)`);
    console.log(`   ⚡ Mais rápido: ${fastestModel.model} (${fastestModel.latency}ms)`);
    console.log(`   ✅ Modelos funcionais: ${successfulResults.length}/${results.length}`);
    
    // Análise por categoria de custo
    const freeModels = successfulResults.filter(r => r.category === 'free');
    const lowCostModels = successfulResults.filter(r => r.category === 'low-cost');
    const premiumModels = successfulResults.filter(r => r.category === 'premium');
    
    if (freeModels.length > 0) {
      const avgFreeScore = freeModels.reduce((sum, r) => sum + r.evaluation.score, 0) / freeModels.length;
      console.log(`   🆓 Score médio (gratuitos): ${Math.round(avgFreeScore)}/100`);
    }
    
    if (lowCostModels.length > 0) {
      const avgLowCostScore = lowCostModels.reduce((sum, r) => sum + r.evaluation.score, 0) / lowCostModels.length;
      console.log(`   💰 Score médio (baixo custo): ${Math.round(avgLowCostScore)}/100`);
    }
    
    if (premiumModels.length > 0) {
      const avgPremiumScore = premiumModels.reduce((sum, r) => sum + r.evaluation.score, 0) / premiumModels.length;
      console.log(`   💎 Score médio (premium): ${Math.round(avgPremiumScore)}/100`);
    }
  }
}

// Função para salvar resultados avançados
function saveAdvancedResults(results, category, testType) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `benchmark-advanced-${category}-${testType}-${timestamp}.json`;
  const filepath = path.join(__dirname, 'debug_responses', filename);
  
  // Criar diretório se não existir
  const debugDir = path.join(__dirname, 'debug_responses');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
  
  const data = {
    timestamp: new Date().toISOString(),
    category: category,
    testType: testType,
    testTitle: UX_TEST_PROMPTS[testType].title,
    totalModels: results.length,
    successfulModels: results.filter(r => !r.error).length,
    results: results,
    summary: {
      bestModel: results.filter(r => !r.error).sort((a, b) => b.evaluation.score - a.evaluation.score)[0],
      fastestModel: results.filter(r => !r.error).reduce((fastest, current) => 
        current.latency < fastest.latency ? current : fastest
      ),
      averageScore: results.filter(r => !r.error).reduce((sum, r) => sum + r.evaluation.score, 0) / results.filter(r => !r.error).length
    }
  };
  
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`\n💾 Resultados salvos em: ${filename}`);
}

// Função para listar opções disponíveis
function listOptions() {
  console.log('📋 Opções disponíveis:\n');
  
  console.log('🔹 CATEGORIAS:');
  Object.entries(BENCHMARK_MODELS).forEach(([category, models]) => {
    console.log(`   ${category}: ${Object.keys(models).length} modelos`);
  });
  
  console.log('\n🔹 TESTES UX:');
  Object.entries(UX_TEST_PROMPTS).forEach(([key, test]) => {
    console.log(`   ${key}: ${test.title}`);
  });
  
  console.log('\n💰 CUSTOS:');
  console.log('   free: $0 (modelos gratuitos)');
  console.log('   low-cost: $0.075 - $0.25 por 1M tokens');
  console.log('   premium: $1.25 - $5 por 1M tokens');
}

// Main execution
const args = process.argv.slice(2);
const category = args[0] || 'free';
const testType = args[1] || 'layout-analysis';

if (category === 'help' || category === 'list') {
  listOptions();
  process.exit(0);
}

if (!UX_TEST_PROMPTS[testType]) {
  console.error(`❌ Tipo de teste "${testType}" não encontrado.`);
  console.log('Tipos disponíveis:', Object.keys(UX_TEST_PROMPTS).join(', '));
  process.exit(1);
}

// Executar benchmark avançado
runAdvancedBenchmark(category, testType).catch(console.error);


