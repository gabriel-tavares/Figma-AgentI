/**
 * test-models.js
 * Configura e testa diferentes modelos OpenAI para análise heurística.
 * 
 * Uso:
 *   node test-models.js o3-mini     # configura e mostra como rodar
 *   node test-models.js gpt-4o       # outro modelo
 *   node test-models.js list         # lista todos disponíveis
 * 
 * Depois de configurar, rode: node index.js
 */

const fs = require('fs');
const path = require('path');

// Configurações globais de tokens
const TOKENS_CONFIG = {
  DEFAULT: 8000,      // Tokens padrão para modelos regulares
  PREMIUM: 12000,      // Tokens para GPT-5 (maior qualidade)
  O3: 15000           // Tokens para modelos O3 (limite TPM menor)
};

// Configurações globais de temperatura
const TEMP_CONFIG = {
  DEFAULT: 0.1,        // Temperatura padrão para modelos regulares
  PREMIUM: 0.1,        // Temperatura para GPT-5 (maior criatividade)
  O3: null,            // O3 não usa temperatura
  O4: null             // O4 não usa temperatura
};

// Configurações globais de reasoning (apenas para modelos O3/O4)
const REASONING_CONFIG = {
  O3_MINI: 'medium',   // Reasoning para o3-mini
  O3: 'high',         // Reasoning para o3
  O4_MINI: 'high'     // Reasoning para o4-mini (próxima geração)
};

// Configurações dos modelos disponíveis (apenas etapa textual)
const MODEL_CONFIGS = {
  'gpt-4.1-mini': {
    texto: { model: 'gpt-4.1-mini', temp: TEMP_CONFIG.DEFAULT, tokens: TOKENS_CONFIG.DEFAULT },
    description: 'Balanceado - bom custo-benefício'
  },
  'gpt-4o-mini': {
    texto: { model: 'gpt-4o-mini', temp: TEMP_CONFIG.DEFAULT, tokens: TOKENS_CONFIG.DEFAULT },
    description: 'Vision otimizada - melhor para imagens'
  },
  'gpt-4o': {
    texto: { model: 'gpt-4o', temp: TEMP_CONFIG.DEFAULT, tokens: TOKENS_CONFIG.DEFAULT },
    description: 'Alta qualidade - mais preciso'
  },
  'gpt-5': {
    texto: { model: 'gpt-5', temp: TEMP_CONFIG.PREMIUM, tokens: TOKENS_CONFIG.PREMIUM },
    description: 'Premium - máxima qualidade textual'
  },
  'o3-mini': {
    texto: { model: 'o3-mini', tokens: TOKENS_CONFIG.O3, reasoning: REASONING_CONFIG.O3_MINI },
    description: 'O3 determinístico - análise mais profunda'
  },
  'o3': {
    texto: { model: 'o3', tokens: TOKENS_CONFIG.O3, reasoning: REASONING_CONFIG.O3 },
    description: 'O3 máximo - análise mais complexa'
  },
  'o4-mini': {
    texto: { model: 'o4-mini', temp: TEMP_CONFIG.O4, tokens: TOKENS_CONFIG.O3, reasoning: REASONING_CONFIG.O4_MINI },
    description: 'O4-mini - próxima geração com análise avançada'
  }
};

function listModels() {
  console.log('📋 Modelos disponíveis:\n');
  Object.entries(MODEL_CONFIGS).forEach(([name, config]) => {
    console.log(`🔹 ${name}`);
    if (config.texto.temp) {
      console.log(`   Texto: ${config.texto.model} (temp: ${config.texto.temp})`);
    } else {
      console.log(`   Texto: ${config.texto.model}`);
    }
    if (config.texto.reasoning) {
      console.log(`   Reasoning: ${config.texto.reasoning}`);
    }
    console.log(`   ${config.description}\n`);
  });
}

function generateEnvFile(modelName) {
  const config = MODEL_CONFIGS[modelName];
  if (!config) {
    console.error(`❌ Modelo "${modelName}" não encontrado.`);
    console.log('Use "node test-models.js list" para ver modelos disponíveis.');
    return false;
  }

  // Ler .env existente para preservar configurações importantes
  let existingEnv = {};
  const envPath = path.join(__dirname, '.env');
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const keyTrim = key.trim();
        const valueTrim = valueParts.join('=').trim();
        // Preservar apenas configurações importantes que não são padrão
        if (keyTrim === 'OPENAI_API_KEY' && !valueTrim.includes('your-key-here')) {
          existingEnv[keyTrim] = valueTrim;
        }
        if (keyTrim === 'VECTOR_STORE_ID' && !valueTrim.includes('your_vector_store_id')) {
          existingEnv[keyTrim] = valueTrim;
        }
      }
    });
  } catch (e) {
    // Arquivo .env não existe, usar valores padrão
  }

  const envContent = `# Configuração para ${modelName}
# Gerado automaticamente em ${new Date().toISOString()}

# Chave da API
OPENAI_API_KEY=${existingEnv.OPENAI_API_KEY || 'sk-your-key-here'}

# Modelos
MODELO_TEXTO=${config.texto.model}
MODELO_VISION=gpt-4.1-mini

# Temperaturas
${config.texto.temp ? `TEMP_TEXTO=${config.texto.temp}` : '# TEMP_TEXTO=0.1 (ignorado para modelos O3)'}
TEMP_VISION=0.1

# Tokens máximos
MAXTOK_TEXTO=${config.texto.tokens}
MAXTOK_VISION=20000

# RAG
USE_RAG=true
VECTOR_STORE_ID=${existingEnv.VECTOR_STORE_ID || 'vs_your_vector_store_id'}

# API
USE_RESPONSES=true

# Servidor
PORT=3000

# Reasoning (apenas para modelos O3)
${config.texto.reasoning ? `REASONING_EFFORT=${config.texto.reasoning}` : '# REASONING_EFFORT=medium'}
`;

  return envContent;
}

function updateEnvFile(modelName) {
  const config = MODEL_CONFIGS[modelName];
  if (!config) {
    console.error(`❌ Modelo "${modelName}" não encontrado.`);
    return false;
  }

  const envPath = path.join(__dirname, '.env');
  
  try {
    // Ler configurações existentes importantes
    let existingEnv = {};
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const keyTrim = key.trim();
          const valueTrim = valueParts.join('=').trim();
          // Preservar apenas configurações importantes que não são padrão
          if (keyTrim === 'OPENAI_API_KEY' && !valueTrim.includes('your-key-here')) {
            existingEnv[keyTrim] = valueTrim;
          }
          if (keyTrim === 'VECTOR_STORE_ID' && !valueTrim.includes('your_vector_store_id')) {
            existingEnv[keyTrim] = valueTrim;
          }
        }
      });
    } catch (e) {
      // Arquivo .env não existe, usar valores padrão
    }

    // Gerar arquivo .env limpo
    const envContent = `# Configuração para ${modelName}
# Gerado automaticamente em ${new Date().toISOString()}

# Chave da API
OPENAI_API_KEY=${existingEnv.OPENAI_API_KEY || 'sk-your-key-here'}

# Modelos
MODELO_TEXTO=${config.texto.model}
MODELO_VISION=gpt-4.1-mini

# Temperaturas
${config.texto.temp ? `TEMP_TEXTO=${config.texto.temp}` : '# TEMP_TEXTO=0.1 (ignorado para modelos O3/O4)'}
TEMP_VISION=0.1

# Tokens máximos
MAXTOK_TEXTO=${config.texto.tokens}
MAXTOK_VISION=20000

# RAG
USE_RAG=true
VECTOR_STORE_ID=${existingEnv.VECTOR_STORE_ID || 'vs_your_vector_store_id'}

# API
USE_RESPONSES=true

# Servidor
PORT=3000

# Reasoning (apenas para modelos O3/O4)
${config.texto.reasoning ? `REASONING_EFFORT=${config.texto.reasoning}` : '# REASONING_EFFORT=medium'}
`;

    // Escrever arquivo limpo
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(`✅ Arquivo .env atualizado para modelo: ${modelName}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao atualizar .env:`, error.message);
    return false;
  }
}

function showConfig(modelName) {
  const config = MODEL_CONFIGS[modelName];
  if (!config) {
    console.error(`❌ Modelo "${modelName}" não encontrado.`);
    return false;
  }

  console.log(`\n🔧 Configuração para: ${modelName}`);
  console.log(`📝 ${config.description}\n`);
  
  console.log('📊 Parâmetros:');
  console.log(`   Vision: gpt-4.1-mini (fixo)`);
  console.log(`   Texto: ${config.texto.model}`);
  if (config.texto.temp) {
    console.log(`   - Temperatura: ${config.texto.temp} (${config.texto.temp === TEMP_CONFIG.DEFAULT ? 'padrão' : config.texto.temp === TEMP_CONFIG.PREMIUM ? 'premium' : 'custom'})`);
  }
  console.log(`   - Tokens: ${config.texto.tokens.toLocaleString()} (${config.texto.tokens === TOKENS_CONFIG.DEFAULT ? 'padrão' : config.texto.tokens === TOKENS_CONFIG.PREMIUM ? 'premium' : config.texto.tokens === TOKENS_CONFIG.O3 ? 'O3' : 'custom'})`);
  if (config.texto.reasoning) {
    let reasoningType = 'custom';
    if (modelName === 'o3-mini') reasoningType = 'O3-mini';
    else if (modelName === 'o3') reasoningType = 'O3';
    else if (modelName === 'o4-mini') reasoningType = 'O4-mini';
    
    console.log(`   - Reasoning: ${config.texto.reasoning} (${reasoningType})`);
  }
  
  console.log('');
  
  return true;
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log('🔧 Test Models - Configurador de Modelos OpenAI\n');
  console.log('Uso:');
  console.log('  node test-models.js <modelo>     # configura modelo específico');
  console.log('  node test-models.js list        # lista modelos disponíveis');
  console.log('  node test-models.js show <modelo> # mostra config sem aplicar\n');
  console.log('Exemplos:');
  console.log('  node test-models.js o3-mini');
  console.log('  node test-models.js gpt-4o');
  console.log('  node test-models.js list');
  process.exit(0);
}

if (command === 'list') {
  listModels();
  process.exit(0);
}

if (command === 'show') {
  const modelName = args[1];
  if (!modelName) {
    console.error('❌ Especifique um modelo: node test-models.js show <modelo>');
    process.exit(1);
  }
  showConfig(modelName);
  process.exit(0);
}

// Configurar modelo específico
const modelName = command;
if (updateEnvFile(modelName)) {
  showConfig(modelName);
}
