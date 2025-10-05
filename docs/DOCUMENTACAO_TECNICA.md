# 📋 Documentação Técnica - Plugin Heurística UX

## 🎯 Visão Geral

O **Plugin Heurística UX** é uma ferramenta avançada de análise de usabilidade para Figma que utiliza Inteligência Artificial para avaliar interfaces digitais seguindo metodologias consolidadas de UX/UI.

## 🏗️ Arquitetura do Sistema

### Componentes Principais

1. **Frontend (Plugin Figma)**
   - Interface de usuário com 4 telas principais
   - Lógica de comunicação com o backend
   - Renderização de cards de análise no Figma

2. **Backend (Node.js/Express)**
   - API REST para processamento de análises
   - Integração com múltiplas IAs (OpenAI, OpenRouter)
   - Sistema de benchmark para comparação de modelos

3. **Sistema de IA**
   - Análise heurística baseada em metodologias
   - Processamento de imagens via Vision API
   - Extração de dados estruturados do Figma

## 🔄 Fluxo Completo de Análise

### Etapa 1: Seleção e Preparação
- **Usuário seleciona frames** no Figma
- **Plugin detecta automaticamente** a quantidade de frames selecionados
- **Interface atualiza** contador e contexto (tela única vs. fluxo)

### Etapa 2: Configuração da Análise
- **Seleção do método**: Nielsen ou Vieses Cognitivos
- **Contexto opcional**: descrição do usuário sobre a tela/fluxo
- **Validação**: verificação se há pelo menos um frame selecionado

### Etapa 3: Processamento Híbrido
O sistema decide automaticamente o melhor método para cada frame:

#### Para Frames Reais do Figma:
- **Extração de FigmaSpec**: dados estruturados nativos
- **Informações extraídas**:
  - Dimensões e posicionamento (bounds)
  - Tipografia (família, tamanho, peso)
  - Cores e paleta
  - Estrutura de componentes
  - Auto Layout e espaçamentos
  - Ordem de leitura

#### Para Imagens/Screenshots:
- **Vision API**: conversão de imagem para JSON estruturado
- **Análise visual**: identificação de elementos e layout
- **Contexto adicional**: descrição textual da interface

### Etapa 4: Análise Heurística
- **Aplicação de metodologias**:
  - **Nielsen**: 10 heurísticas clássicas de usabilidade
  - **Vieses Cognitivos**: análise de vieses comportamentais
- **Identificação de problemas**:
  - Hierarquia visual
  - Navegação e fluxo
  - Acessibilidade e contraste
  - Consistência de padrões
  - Feedback e status do sistema

### Etapa 5: Geração de Cards
- **Criação automática** de cards no Figma
- **Posicionamento inteligente** ao lado dos frames analisados
- **Categorização por severidade**:
  - 🔴 **Alto**: problemas críticos
  - 🟡 **Médio**: problemas moderados
  - 🟢 **Baixo**: problemas menores
  - 🔵 **Positivo**: pontos fortes identificados

### Etapa 6: Resumo e Controle
- **Painel lateral** com resumo de todas as análises
- **Filtros por severidade** para focar em problemas específicos
- **Controle de visibilidade** dos cards
- **Links de referência** para cada heurística aplicada

## 🧠 Metodologias de Análise

### Heurísticas de Nielsen
1. **Visibilidade do Status do Sistema**
2. **Compatibilidade com o Mundo Real**
3. **Controle e Liberdade do Usuário**
4. **Consistência e Padrões**
5. **Prevenção de Erros**
6. **Reconhecimento ao Invés de Lembrança**
7. **Flexibilidade e Eficiência de Uso**
8. **Estética e Design Minimalista**
9. **Ajuda aos Usuários a Reconhecer, Diagnosticar e Recuperar-se de Erros**
10. **Ajuda e Documentação**

### Vieses Cognitivos
- **Viés de Confirmação**
- **Viés de Ancoragem**
- **Viés de Disponibilidade**
- **Viés de Representatividade**
- **Viés de Status Quo**
- **Viés de Perda**

## 🎨 Sistema de Severidade

### Critérios de Classificação

#### 🔴 Severidade Alta
- **Problemas críticos** que impedem o uso
- **Violações de acessibilidade** graves
- **Erros de navegação** que causam perda de usuários
- **Problemas de contraste** que afetam legibilidade

#### 🟡 Severidade Média
- **Problemas de usabilidade** que causam confusão
- **Inconsistências** de padrões
- **Falta de feedback** em ações importantes
- **Problemas de hierarquia** visual

#### 🟢 Severidade Baixa
- **Melhorias de polimento**
- **Otimizações** de experiência
- **Consistência** de detalhes
- **Ajustes** de espaçamento

#### 🔵 Severidade Positiva
- **Pontos fortes** identificados
- **Boa prática** implementada
- **Solução elegante** encontrada
- **Padrão consistente** aplicado

## 🚀 Funcionalidades Avançadas

### Bench AI (Benchmark Multi-IA)
- **Teste simultâneo** de múltiplas IAs
- **Comparação de qualidade** e performance
- **Métricas específicas** para análise UX
- **Ranking automático** por score

### Modelos de IA Suportados
- **OpenAI**: GPT-4, GPT-4o, O3, O3-mini
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Haiku
- **Google**: Gemini 2.0 Flash, Gemini 1.5 Pro
- **Meta**: Llama 3.3 70B
- **Microsoft**: Phi 3.5 Mini
- **Alibaba**: Qwen 2.5 72B

### Sistema de Configuração
- **Variáveis de ambiente** para personalização
- **Prompts customizáveis** para diferentes metodologias
- **Configuração de modelos** por tipo de análise
- **Sistema de RAG** para conhecimento específico

## 📊 Métricas e Avaliação

### Métricas de Qualidade
- **Score UX (0-100 pontos)**:
  - Estrutura da resposta (20 pts)
  - Conteúdo específico de UX (40 pts)
  - Qualidade e exemplos (25 pts)
  - Tamanho adequado (15 pts)

### Métricas Técnicas
- **Latência**: tempo de resposta em ms
- **Tokens usados**: consumo de recursos
- **Custo**: preço por 1M tokens
- **Disponibilidade**: taxa de sucesso

## 🔧 Regras de Funcionamento

### Regras de Entrada
1. **Mínimo 1 frame** selecionado obrigatório
2. **Máximo 10 frames** por análise (limite de performance)
3. **Frames válidos**: FRAME, COMPONENT, INSTANCE, SECTION
4. **Contexto opcional** mas recomendado para melhor análise

### Regras de Processamento
1. **Priorização automática** de frames reais sobre imagens
2. **Fallback inteligente** para Vision API quando necessário
3. **Deduplicação** de achados similares
4. **Limite de 8 achados** por tela para manter foco

### Regras de Saída
1. **Cards sempre posicionados** ao lado direito dos frames
2. **Ordenação por severidade**: problemas primeiro, positivos por último
3. **Nomenclatura consistente**: `[AI] Título :: Severidade`
4. **Referências obrigatórias** para cada heurística aplicada

## 🎯 Casos de Uso

### Análise de Tela Única
- **Contexto**: "Contexto da tela"
- **Foco**: problemas específicos da interface
- **Saída**: cards detalhados com sugestões

### Análise de Fluxo
- **Contexto**: "Contexto do fluxo"
- **Foco**: consistência entre telas
- **Saída**: análise comparativa e padrões

### Benchmark de Modelos
- **Objetivo**: comparar qualidade de diferentes IAs
- **Entrada**: mesma tela para todos os modelos
- **Saída**: ranking de performance e qualidade

## 🔍 Sistema de Debug

### Logs Automáticos
- **Tempo de processamento** por etapa
- **Tokens utilizados** por modelo
- **Erros e fallbacks** aplicados
- **Arquivos de debug** salvos automaticamente

### Arquivos de Debug
- **`debug_layouts/`**: JSONs de layout processados
- **`debug_responses/`**: respostas das IAs
- **`debug_vision/`**: resultados da Vision API
- **`heuristica.ndjson`**: log estruturado de todas as análises

## 🚨 Limitações e Considerações

### Limitações Técnicas
- **Rate limiting** das APIs de IA
- **Tamanho máximo** de imagens para Vision API
- **Timeout** de 4 minutos por análise
- **Dependência** de conexão com internet

### Limitações de Análise
- **Interface estática** apenas (não analisa interações)
- **Contexto limitado** ao que é visível
- **Subjetividade** inerente à análise heurística
- **Necessidade de validação** humana dos resultados

## 🔮 Roadmap e Melhorias

### Funcionalidades Futuras
- **Análise de protótipos** interativos
- **Integração com design systems**
- **Métricas de acessibilidade** automatizadas
- **Análise de performance** de carregamento
- **Sistema de aprendizado** com feedback do usuário

### Otimizações Planejadas
- **Cache inteligente** de análises similares
- **Processamento em lote** para múltiplas telas
- **Análise incremental** para mudanças pequenas
- **Sistema de templates** para análises recorrentes

---

*Esta documentação é atualizada regularmente conforme o desenvolvimento do plugin.*

