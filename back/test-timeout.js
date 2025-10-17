#!/usr/bin/env node

/**
 * Teste de timeout para verificar se as configurações estão funcionando
 */

require("dotenv").config();

// Simular as configurações de timeout
const TIMEOUTS = {
  DEFAULT: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
  OPENAI_API: parseInt(process.env.OPENAI_TIMEOUT) || 60000,
  GITHUB_API: parseInt(process.env.GITHUB_TIMEOUT) || 15000,
  HEALTH_CHECK: parseInt(process.env.HEALTH_TIMEOUT) || 5000,
  VISION_API: parseInt(process.env.VISION_TIMEOUT) || 120000
};

console.log("🔧 Configurações de Timeout:");
console.log(`- Padrão: ${TIMEOUTS.DEFAULT}ms`);
console.log(`- OpenAI API: ${TIMEOUTS.OPENAI_API}ms`);
console.log(`- GitHub API: ${TIMEOUTS.GITHUB_API}ms`);
console.log(`- Health Check: ${TIMEOUTS.HEALTH_CHECK}ms`);
console.log(`- Vision API: ${TIMEOUTS.VISION_API}ms`);

// Função de teste de timeout
const fetchWithTimeout = async (url, options = {}, timeoutMs = TIMEOUTS.DEFAULT) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  console.log(`\n🌐 Testando requisição para: ${url}`);
  console.log(`⏱️  Timeout configurado: ${timeoutMs}ms`);
  
  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const endTime = Date.now();
    
    clearTimeout(timeoutId);
    console.log(`✅ Sucesso! Tempo de resposta: ${endTime - startTime}ms`);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.log(`❌ Timeout após ${timeoutMs}ms`);
      throw new Error(`Request timeout after ${timeoutMs}ms for ${url}`);
    }
    console.log(`❌ Erro: ${error.message}`);
    throw error;
  }
};

// Teste de conectividade básica
const testConnectivity = async () => {
  console.log("\n🧪 Iniciando testes de conectividade...");
  
  try {
    // Teste 1: Health check rápido
    console.log("\n1️⃣ Testando health check...");
    await fetchWithTimeout("https://httpbin.org/delay/2", {}, TIMEOUTS.HEALTH_CHECK);
  } catch (error) {
    console.log(`⚠️  Health check falhou (esperado se timeout < 2s): ${error.message}`);
  }
  
  try {
    // Teste 2: Requisição padrão
    console.log("\n2️⃣ Testando requisição padrão...");
    await fetchWithTimeout("https://httpbin.org/delay/1", {}, TIMEOUTS.DEFAULT);
  } catch (error) {
    console.log(`❌ Requisição padrão falhou: ${error.message}`);
  }
  
  try {
    // Teste 3: Simular GitHub API
    console.log("\n3️⃣ Testando simulação GitHub API...");
    await fetchWithTimeout("https://api.github.com/zen", {}, TIMEOUTS.GITHUB_API);
  } catch (error) {
    console.log(`❌ GitHub API falhou: ${error.message}`);
  }
  
  console.log("\n✅ Testes de timeout concluídos!");
};

// Executar testes
testConnectivity().catch(console.error);