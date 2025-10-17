// ============================
// === CONFIGURAÇÃO DE AMBIENTE ===
// Este arquivo permite alternar facilmente entre desenvolvimento e produção
// ============================

export const CONFIG = {
  // Ambiente atual: 'development' ou 'production'
  ENVIRONMENT: 'production' as 'development' | 'production',
  
  // URLs da API
  API_URLS: {
    development: 'http://localhost:3000/analisar',
    production: 'https://agenti.uxday.com.br/analisar'
  },
  
  // Configurações específicas por ambiente
  SETTINGS: {
    development: {
      debug: true,
      timeout: 300000, // 5 minutos para desenvolvimento
      retries: 1
    },
    production: {
      debug: false,
      timeout: 180000, // 3 minutos para produção
      retries: 3
    }
  }
};

// Função para obter a URL da API baseada no ambiente
export function getApiUrl(): string {
  return CONFIG.API_URLS[CONFIG.ENVIRONMENT];
}

// Função para obter configurações do ambiente atual
export function getCurrentSettings() {
  return CONFIG.SETTINGS[CONFIG.ENVIRONMENT];
}

// Função para verificar se está em desenvolvimento
export function isDevelopment(): boolean {
  return CONFIG.ENVIRONMENT === 'development';
}

// Função para verificar se está em produção
export function isProduction(): boolean {
  return CONFIG.ENVIRONMENT === 'production';
}
