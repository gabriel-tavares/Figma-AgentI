/**
 * setup-openrouter.js
 * Script para configurar OpenRouter e testar modelos
 */

const fs = require('fs');
const path = require('path');

function createEnvFile() {
  const envContent = `# Configuração Heuristica UX
# Gerado automaticamente em ${new Date().toISOString()}

# Chave da API OpenAI (para modelos originais)
OPENAI_API_KEY=sk-your-key-here

# Chave da API OpenRouter (para múltiplos modelos)
# Obtenha em: https://openrouter.ai/
OPENROUTER_API_KEY=sk-or-your-key-here

# Modelos padrão
MODELO_TEXTO=gpt-4o-mini
MODELO_VISION=gpt-4.1-mini

# Temperaturas
TEMP_TEXTO=0.1
TEMP_VISION=0.1

# Tokens máximos
MAXTOK_TEXTO=8000
MAXTOK_VISION=20000

# RAG
USE_RAG=true
VECTOR_STORE_ID=vs_your_vector_store_id

# API
USE_RESPONSES=true

# Servidor
PORT=3000

# Reasoning (apenas para modelos O3)
# REASONING_EFFORT=medium
`;

  const envPath = path.join(__dirname, '.env');
  
  try {
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✅ Arquivo .env criado com sucesso!');
    console.log('\n📝 Próximos passos:');
    console.log('1. Configure sua OPENROUTER_API_KEY no arquivo .env');
    console.log('2. Obtenha sua chave em: https://openrouter.ai/');
    console.log('3. Execute: node test-openrouter.js free');
    return true;
  } catch (error) {
    console.error('❌ Erro ao criar .env:', error.message);
    return false;
  }
}

function showInstructions() {
  console.log('🚀 Setup OpenRouter para Heuristica UX\n');
  console.log('Este script irá:');
  console.log('1. Criar arquivo .env com configurações');
  console.log('2. Permitir testar múltiplas IAs simultaneamente');
  console.log('3. Comparar performance entre modelos\n');
  
  console.log('📋 Modelos disponíveis:');
  console.log('   🔹 FREE: Gemini 2.0 Flash, Llama 3.3, Phi 3.5');
  console.log('   🔹 PREMIUM: Claude 3.5 Sonnet, GPT-4o Mini, Gemini 1.5 Pro');
  console.log('   🔹 CLAUDE: Claude 3.5 Sonnet, Claude 3 Haiku');
  console.log('   🔹 GEMINI: Gemini 2.0 Flash, Gemini 1.5 Pro\n');
  
  console.log('💰 Custos aproximados:');
  console.log('   FREE: $0 (modelos gratuitos)');
  console.log('   PREMIUM: $0.15 - $3 por 1M tokens');
  console.log('   Claude: $0.25 - $3 por 1M tokens');
  console.log('   Gemini: $0 - $1.25 por 1M tokens\n');
}

// Main execution
const args = process.argv.slice(2);
const command = args[0];

if (command === 'help' || !command) {
  showInstructions();
  process.exit(0);
}

if (command === 'init') {
  showInstructions();
  if (createEnvFile()) {
    console.log('\n🎉 Setup concluído!');
    console.log('Execute: node test-openrouter.js free');
  }
  process.exit(0);
}

console.log('Uso: node setup-openrouter.js init');


