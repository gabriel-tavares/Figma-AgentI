/**
 * test-openrouter.js
 * Sistema de benchmark para testar múltiplas IAs via OpenRouter
 * 
 * Uso:
 *   node test-openrouter.js                    # roda todos os modelos
 *   node test-openrouter.js free               # apenas modelos gratuitos
 *   node test-openrouter.js premium            # apenas modelos premium
 *   node test-openrouter.js claude             # apenas modelos Claude
 *   node test-openrouter.js gemini             # apenas modelos Gemini
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuração do OpenRouter
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Modelos disponíveis no OpenRouter (com preços aproximados)
const OPENROUTER_MODELS = {
  // Modelos Gratuitos
  'free': {
    'meta-llama/llama-3.3-70b-instruct': {
      name: 'Llama 3.3 70B',
      provider: 'Meta',
      cost: 'Free',
      description: 'Modelo open source mais avançado',
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
    'x-ai/grok-beta': {
      name: 'Grok Beta',
      provider: 'xAI',
      cost: 'Free',
      description: 'Modelo beta da xAI',
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
      description: 'Modelo open source da OpenAI',
      maxTokens: 8192,
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
      maxTokens: 164000,
      temperature: 0.1
    },
    'microsoft/mai-ds-r1': {
      name: 'Microsoft MAI DS R1',
      provider: 'Microsoft',
      cost: 'Free',
      description: 'DeepSeek-R1 melhorado pela Microsoft',
      maxTokens: 164000,
      temperature: 0.1
    },
    'qwen/qwen3-14b': {
      name: 'Qwen3 14B',
      provider: 'Qwen',
      cost: 'Free',
      description: 'Modelo 14B com modo pensante',
      maxTokens: 8192,
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
      maxTokens: 2048,
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
    'nvidia/nemotron-nano-9b-v2': {
      name: 'NVIDIA Nemotron Nano 9B V2',
      provider: 'NVIDIA',
      cost: 'Free',
      description: 'Modelo unificado para raciocínio',
      maxTokens: 2048,
      temperature: 0.1
    },
    'deepseek/deepseek-chat-v3.1:free': {
      name: 'DeepSeek V3.1',
      provider: 'DeepSeek',
      cost: 'Free',
      description: 'Modelo híbrido 671B com raciocínio',
      maxTokens: 8192,
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
      maxTokens: 8192,
      temperature: 0.1
    },
    'z-ai/glm-4.5-air': {
      name: 'GLM 4.5 Air',
      provider: 'Z.AI',
      cost: 'Free',
      description: 'MoE compacto com modo pensante',
      maxTokens: 8192,
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
      maxTokens: 8192,
      temperature: 0.1
    },
    'cognitivecomputations/dolphin-mistral-24b-venice-edition:free': {
      name: 'Venice Uncensored',
      provider: 'Cognitive Computations',
      cost: 'Free',
      description: 'Modelo sem censura com controle total',
      maxTokens: 8192,
      temperature: 0.1
    },
  },
  
  // Modelos Premium (baixo custo)
  'premium': {
    'anthropic/claude-3.5-sonnet': {
      name: 'Claude 3.5 Sonnet',
      provider: 'Anthropic',
      cost: '$3/1M tokens',
      description: 'Melhor modelo para análise e raciocínio',
      maxTokens: 8192,
      temperature: 0.1
    },
    'openai/gpt-4o-mini': {
      name: 'GPT-4o Mini',
      provider: 'OpenAI',
      cost: '$0.15/1M tokens',
      description: 'Versão otimizada do GPT-4',
      maxTokens: 8192,
      temperature: 0.1
    },
    'google/gemini-1.5-pro': {
      name: 'Gemini 1.5 Pro',
      provider: 'Google',
      cost: '$1.25/1M tokens',
      description: 'Modelo avançado do Google',
      maxTokens: 8192,
      temperature: 0.1
    }
  },
  
  // Modelos OpenAI Diretos
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
  
  // Modelos Específicos por Provider
  'claude': {
    'anthropic/claude-3.5-sonnet': {
      name: 'Claude 3.5 Sonnet',
      provider: 'Anthropic',
      cost: '$3/1M tokens',
      description: 'Melhor modelo para análise e raciocínio',
      maxTokens: 8192,
      temperature: 0.1
    },
    'anthropic/claude-3-haiku': {
      name: 'Claude 3 Haiku',
      provider: 'Anthropic',
      cost: '$0.25/1M tokens',
      description: 'Modelo rápido e eficiente',
      maxTokens: 4096,
      temperature: 0.1
    }
  },
  
  'gemini': {
    'google/gemini-2.0-flash-exp': {
      name: 'Gemini 2.0 Flash',
      provider: 'Google',
      cost: 'Free',
      description: 'Modelo mais rápido do Google',
      maxTokens: 8192,
      temperature: 0.1
    },
    'google/gemini-1.5-pro': {
      name: 'Gemini 1.5 Pro',
      provider: 'Google',
      cost: '$1.25/1M tokens',
      description: 'Modelo avançado do Google',
      maxTokens: 8192,
      temperature: 0.1
    }
  }
};

// Prompt de teste para análise heurística
const TEST_PROMPT = `Analise este layout de interface e identifique problemas de usabilidade:

[IMAGEM: Layout de uma página de e-commerce com problemas de UX]

Identifique:
1. Problemas de hierarquia visual
2. Questões de navegação
3. Problemas de acessibilidade
4. Sugestões de melhoria

Responda de forma estruturada e objetiva.`;

// Função para fazer requisição ao OpenRouter
async function callOpenRouter(modelId, prompt, maxTokens = 4000, categoria = 'free') {
  const startTime = Date.now();
  
  try {
    // Obter informações do modelo primeiro
    const modelInfo = OPENROUTER_MODELS[categoria]?.[modelId];
    
    // Detectar se é modelo OpenAI (categoria 'openai' ou flag isOpenAI)
    const isOpenAI = categoria === 'openai' || modelInfo?.isOpenAI;
    const apiUrl = isOpenAI ? "https://api.openai.com/v1/chat/completions" : `${OPENROUTER_BASE_URL}/chat/completions`;
    const apiKey = isOpenAI ? OPENAI_API_KEY : OPENROUTER_API_KEY;
    
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
    
    // Headers específicos do OpenRouter
    if (!isOpenAI) {
      headers['HTTP-Referer'] = 'http://localhost:3000';
      headers['X-Title'] = 'Heuristica UX Test';
    }

    const requestBody = {
      model: modelId,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    };

    // Adicionar max_tokens ou max_completion_tokens dependendo do modelo
    if (modelId === 'gpt-5' || modelId.startsWith('o3') || modelId.startsWith('o4')) {
      requestBody.max_completion_tokens = maxTokens;
    } else {
      requestBody.max_tokens = maxTokens;
    }

    // Adicionar temperatura apenas se não for modelo O3/O4
    if (modelInfo && modelInfo.temperature !== null) {
      requestBody.temperature = modelInfo.temperature || 0.1;
    }

    // Ajustar maxTokens baseado no limite de créditos (se disponível)
    if (modelInfo && modelInfo.maxTokens) {
      // Reduzir tokens para modelos com créditos limitados
      const adjustedTokens = Math.min(modelInfo.maxTokens, 1000);
      if (modelId === 'gpt-5' || modelId.startsWith('o3') || modelId.startsWith('o4')) {
        requestBody.max_completion_tokens = adjustedTokens;
      } else {
        requestBody.max_tokens = adjustedTokens;
      }
    }

    // Remover reasoning para modelos O3/O4 (não suportado na API atual)
    // if (modelInfo && modelInfo.reasoning) {
    //   requestBody.reasoning = modelInfo.reasoning;
    // }

    const response = await fetch(apiUrl, {
      method: 'POST',
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
function evaluateResponse(response, modelInfo) {
  const content = response.content || '';
  
  // Métricas básicas
  const metrics = {
    length: content.length,
    wordCount: content.split(/\s+/).length,
    hasStructure: /^\d+\.|^-\s|^\*\s/.test(content), // Tem estrutura numerada ou com bullets
    hasProblems: /problema|issue|erro|falta/i.test(content),
    hasSolutions: /sugestão|melhoria|recomendação|solução/i.test(content),
    technicalTerms: (content.match(/usabilidade|ux|ui|hierarquia|navegação|acessibilidade/gi) || []).length
  };
  
  // Score baseado nas métricas
  let score = 0;
  if (metrics.hasStructure) score += 20;
  if (metrics.hasProblems) score += 25;
  if (metrics.hasSolutions) score += 25;
  if (metrics.technicalTerms >= 3) score += 15;
  if (metrics.wordCount >= 100) score += 15;
  
  return {
    ...metrics,
    score: Math.min(score, 100)
  };
}

// Função principal de benchmark
async function runBenchmark(modelCategory = 'free') {
  console.log(`🚀 Iniciando benchmark OpenRouter - Categoria: ${modelCategory}\n`);
  
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes('your-key-here')) {
    console.error('❌ OPENROUTER_API_KEY não configurada!');
    console.log('Configure sua chave no arquivo .env:');
    console.log('OPENROUTER_API_KEY=sk-or-your-key-here');
    return;
  }

  const models = OPENROUTER_MODELS[modelCategory];
  if (!models) {
    console.error(`❌ Categoria "${modelCategory}" não encontrada.`);
    console.log('Categorias disponíveis:', Object.keys(OPENROUTER_MODELS).join(', '));
    return;
  }

  const results = [];
  const modelEntries = Object.entries(models);

  console.log(`📊 Testando ${modelEntries.length} modelos...\n`);

  for (const [modelId, modelInfo] of modelEntries) {
    console.log(`🔄 Testando: ${modelInfo.name} (${modelInfo.provider})`);
    
    const result = await callOpenRouter(modelId, TEST_PROMPT, modelInfo.maxTokens, modelCategory);
    
    if (result.success) {
      const evaluation = evaluateResponse(result, modelInfo);
      
      const modelResult = {
        model: modelInfo.name,
        provider: modelInfo.provider,
        cost: modelInfo.cost,
        latency: result.latency,
        tokensUsed: result.usage?.total_tokens || 0,
        evaluation: evaluation,
        response: result.content.substring(0, 200) + '...' // Preview da resposta
      };
      
      results.push(modelResult);
      console.log(`✅ ${modelInfo.name}: ${result.latency}ms, Score: ${evaluation.score}/100`);
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
    
    // Pequena pausa entre requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Exibir resultados
  displayResults(results);
  
  // Salvar resultados
  saveResults(results, modelCategory);
}

// Função para exibir resultados
function displayResults(results) {
  console.log('\n📈 RESULTADOS DO BENCHMARK\n');
  console.log('=' * 80);
  
  // Ordenar por score (melhores primeiro)
  const successfulResults = results.filter(r => !r.error).sort((a, b) => b.evaluation.score - a.evaluation.score);
  
  successfulResults.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.model} (${result.provider})`);
    console.log(`   💰 Custo: ${result.cost}`);
    console.log(`   ⚡ Latência: ${result.latency}ms`);
    console.log(`   📊 Score: ${result.evaluation.score}/100`);
    console.log(`   📝 Palavras: ${result.evaluation.wordCount}`);
    console.log(`   🔧 Termos técnicos: ${result.evaluation.technicalTerms}`);
    console.log(`   📄 Preview: ${result.response}`);
  });
  
  // Estatísticas gerais
  if (successfulResults.length > 0) {
    const avgLatency = successfulResults.reduce((sum, r) => sum + r.latency, 0) / successfulResults.length;
    const avgScore = successfulResults.reduce((sum, r) => sum + r.evaluation.score, 0) / successfulResults.length;
    
    console.log('\n📊 ESTATÍSTICAS GERAIS');
    console.log(`   ⚡ Latência média: ${Math.round(avgLatency)}ms`);
    console.log(`   📊 Score médio: ${Math.round(avgScore)}/100`);
    console.log(`   ✅ Modelos funcionais: ${successfulResults.length}/${results.length}`);
  }
}

// Função para salvar resultados
function saveResults(results, category) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `benchmark-openrouter-${category}-${timestamp}.json`;
  const filepath = path.join(__dirname, 'debug_responses', filename);
  
  // Criar diretório se não existir
  const debugDir = path.join(__dirname, 'debug_responses');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
  
  const data = {
    timestamp: new Date().toISOString(),
    category: category,
    totalModels: results.length,
    successfulModels: results.filter(r => !r.error).length,
    results: results
  };
  
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`\n💾 Resultados salvos em: ${filename}`);
}

// Função para listar modelos disponíveis
function listAvailableModels() {
  console.log('📋 Modelos disponíveis no OpenRouter:\n');
  
  Object.entries(OPENROUTER_MODELS).forEach(([category, models]) => {
    console.log(`🔹 ${category.toUpperCase()}:`);
    Object.entries(models).forEach(([modelId, modelInfo]) => {
      console.log(`   ${modelInfo.name} (${modelInfo.provider}) - ${modelInfo.cost}`);
    });
    console.log('');
  });
}

// Main execution
const args = process.argv.slice(2);
const command = args[0] || 'free';

if (command === 'list') {
  listAvailableModels();
  process.exit(0);
}

if (command === 'help') {
  console.log('🔧 OpenRouter Benchmark Tool\n');
  console.log('Uso:');
  console.log('  node test-openrouter.js                    # testa modelos gratuitos');
  console.log('  node test-openrouter.js free               # apenas modelos gratuitos');
  console.log('  node test-openrouter.js premium           # apenas modelos premium');
  console.log('  node test-openrouter.js claude             # apenas modelos Claude');
  console.log('  node test-openrouter.js gemini             # apenas modelos Gemini');
  console.log('  node test-openrouter.js list               # lista todos os modelos');
  console.log('\nConfigure OPENROUTER_API_KEY no arquivo .env');
  process.exit(0);
}

// Executar benchmark
runBenchmark(command).catch(console.error);

