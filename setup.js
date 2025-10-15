#!/usr/bin/env node

/**
 * =========================
 * SETUP DESENVOLVIMENTO LOCAL
 * =========================
 * Script para configurar o ambiente de desenvolvimento
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Configurando ambiente de desenvolvimento...\n');

// Função para executar comandos
function runCommand(command, description) {
  console.log(`📦 ${description}...`);
  try {
    execSync(command, { stdio: 'inherit', cwd: path.join(__dirname, 'back') });
    console.log(`✅ ${description} concluído\n`);
  } catch (error) {
    console.error(`❌ Erro em ${description}:`, error.message);
    process.exit(1);
  }
}

// Função para criar arquivo .env de desenvolvimento
function createDevEnv() {
  console.log('📝 Criando arquivo .env para desenvolvimento...');
  
  const envContent = `# ===========================================
# FIGMA-AGENTI - DESENVOLVIMENTO LOCAL
# ===========================================

# ===========================================
# CHAVES DE API
# ===========================================

# OpenAI API Key (obrigatório)
# Obtenha em: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-openai-api-key-here

# OpenRouter API Key (opcional - para modelos alternativos)
# Obtenha em: https://openrouter.ai/keys
OPENROUTER_API_KEY=sk-or-your-openrouter-api-key-here

# ===========================================
# CONFIGURAÇÕES DE IA
# ===========================================

# Vector Store ID para RAG (opcional)
VECTOR_STORE_ID=

# Ativar RAG (Retrieval Augmented Generation)
USE_RAG=false

# ===========================================
# MODELOS DOS AGENTES ORQUESTRADOS
# ===========================================

# Agente A - JSON Analyst (analisa estrutura do figmaSpec)
MODELO_AGENTE_A=gpt-4o-mini

# Agente B - Vision Reviewer (analisa imagem da tela)
MODELO_AGENTE_B=gpt-4o-mini

# Agente C - Reconciler (concilia e finaliza)
MODELO_AGENTE_C=gpt-4o-mini

# ===========================================
# CONFIGURAÇÕES DE TEMPERATURA
# ===========================================

# Temperatura para Vision API (0.0 - 1.0)
TEMP_VISION=0.1

# Temperatura para análise de texto (0.0 - 1.0)
TEMP_TEXTO=0.2

# ===========================================
# LIMITES DE TOKENS
# ===========================================

# Máximo de tokens para Vision API
MAX_TOKENS_VISION=4096

# Máximo de tokens para análise de texto
MAX_TOKENS_TEXTO=20000

# ===========================================
# CONFIGURAÇÕES DO SERVIDOR
# ===========================================

# Porta do servidor
PORT=3000

# Ambiente (development, production)
NODE_ENV=development

# ===========================================
# CONFIGURAÇÕES DE LIMPEZA
# ===========================================

# Limpar arquivos temporários automaticamente
CLEANUP_TEMP_FILES=false

# Quantos dias manter arquivos de debug (padrão: 7 dias)
DEBUG_FILES_RETENTION_DAYS=7

# ===========================================
# CONFIGURAÇÕES DE RETRY
# ===========================================

# Número de tentativas em caso de erro
RETRY_ATTEMPTS=3

# Delay base entre tentativas (ms)
RETRY_DELAY=1000

# ===========================================
# CONFIGURAÇÕES DE CORS
# ===========================================

# URLs permitidas para CORS
CORS_ORIGIN=http://localhost:3000,https://www.figma.com,https://figma.com,null

# ===========================================
# CONFIGURAÇÕES DE LOG
# ===========================================

# Nível de log (debug, info, warn, error)
LOG_LEVEL=debug

# Salvar logs em arquivo
LOG_TO_FILE=false

# ===========================================
# CONFIGURAÇÕES DE DEPLOY
# ===========================================

# URL base da API (para desenvolvimento local)
API_BASE_URL=http://localhost:3000

# Timeout para requisições (ms)
REQUEST_TIMEOUT=30000`;

  try {
    fs.writeFileSync(path.join(__dirname, 'back', '.env'), envContent);
    console.log('✅ Arquivo .env criado com sucesso\n');
  } catch (error) {
    console.error('❌ Erro ao criar arquivo .env:', error.message);
    process.exit(1);
  }
}

// Função para adicionar scripts de desenvolvimento ao package.json
function updatePackageJson() {
  console.log('📝 Atualizando package.json com scripts de desenvolvimento...');
  
  const packagePath = path.join(__dirname, 'back', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  // Adicionar scripts de desenvolvimento
  packageJson.scripts = {
    ...packageJson.scripts,
    "dev": "NODE_ENV=development node index.js",
    "dev:watch": "NODE_ENV=development nodemon index.js",
    "prod": "NODE_ENV=production node index.js",
    "setup": "node ../setup.js"
  };
  
  // Adicionar nodemon como devDependency se não existir
  if (!packageJson.devDependencies) {
    packageJson.devDependencies = {};
  }
  if (!packageJson.devDependencies.nodemon) {
    packageJson.devDependencies.nodemon = "^3.0.2";
  }
  
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
  console.log('✅ package.json atualizado com scripts de desenvolvimento\n');
}

// Função principal
async function main() {
  try {
    // 1. Instalar dependências do backend
    runCommand('npm install', 'Instalando dependências do backend');
    
    // 2. Instalar dependências do frontend
    runCommand('cd ../front && npm install', 'Instalando dependências do frontend');
    
    // 3. Criar arquivo .env
    createDevEnv();
    
    // 4. Atualizar package.json
    updatePackageJson();
    
    // 5. Instalar nodemon
    runCommand('npm install', 'Instalando nodemon para desenvolvimento');
    
    console.log('🎉 Configuração concluída com sucesso!');
    console.log('\n📋 Próximos passos:');
    console.log('1. Edite o arquivo back/.env e adicione suas chaves de API');
    console.log('2. Execute: npm run dev (para iniciar o servidor)');
    console.log('3. Execute: npm run dev:watch (para desenvolvimento com auto-reload)');
    console.log('4. Configure o plugin no Figma usando front/manifest.json');
    
  } catch (error) {
    console.error('❌ Erro durante a configuração:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { main };