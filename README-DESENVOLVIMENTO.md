# 🚀 Figma-AgentI - Desenvolvimento Local

## ✅ Status da Configuração

O ambiente de desenvolvimento local foi configurado com sucesso! Aqui está o que foi feito:

### 📦 Dependências Instaladas
- ✅ Backend: Todas as dependências instaladas
- ✅ Frontend: Todas as dependências instaladas
- ✅ Nodemon: Instalado para desenvolvimento com auto-reload

### ⚙️ Configurações Criadas
- ✅ Arquivo `.env` criado em `back/.env`
- ✅ Scripts npm configurados no `back/package.json`
- ✅ Manifest.json atualizado para desenvolvimento local

### 🔧 Scripts Disponíveis

#### Backend (`cd back`)
```bash
npm run dev          # Inicia servidor em modo desenvolvimento
npm run dev:watch    # Inicia servidor com auto-reload
npm run prod         # Inicia servidor em modo produção
npm start            # Inicia servidor padrão
```

#### Frontend (`cd front`)
```bash
npm run build        # Compila TypeScript para JavaScript
npm run watch        # Compila e observa mudanças
npm run lint         # Verifica código com ESLint
npm run lint:fix     # Corrige problemas de lint automaticamente
```

## 🎯 Próximos Passos

### 1. Configurar Chaves de API
Edite o arquivo `back/.env` e adicione suas chaves:

```env
# Substitua pelos valores reais
OPENAI_API_KEY=sk-your-real-openai-key-here
OPENROUTER_API_KEY=sk-or-your-real-openrouter-key-here
```

### 2. Iniciar o Backend
```bash
cd back
npm run dev
```

O servidor estará disponível em: `http://localhost:3000`

### 3. Compilar o Frontend
```bash
cd front
npm run build
```

### 4. Instalar Plugin no Figma
1. Abra o Figma Desktop
2. Vá em `Plugins` > `Development` > `Import plugin from manifest...`
3. Selecione o arquivo `front/manifest.json`

## 🔍 Verificação do Setup

### Backend Funcionando
- ✅ Servidor rodando na porta 3000
- ✅ Endpoint raiz respondendo: `http://localhost:3000/`
- ✅ CORS configurado para Figma

### Frontend Funcionando
- ✅ TypeScript compilando sem erros
- ✅ Arquivo `code.js` gerado (83KB)
- ✅ Manifest.json configurado para localhost

## 🐛 Troubleshooting

### Problema: Servidor não inicia
```bash
# Verificar se a porta 3000 está livre
netstat -ano | findstr :3000

# Se ocupada, matar o processo
taskkill /PID <PID> /F
```

### Problema: Plugin não carrega no Figma
1. Verificar se `front/manifest.json` está correto
2. Verificar se `front/code.js` existe e foi compilado
3. Verificar se o backend está rodando

### Problema: Erro de CORS
- Verificar se `http://localhost:3000` está em `devAllowedDomains`
- Verificar se o backend tem CORS configurado

## 📁 Estrutura do Projeto

```
Figma-AgentI/
├── back/                    # Backend Node.js
│   ├── .env                 # Configurações de ambiente
│   ├── index.js             # Servidor principal
│   ├── package.json         # Scripts de desenvolvimento
│   └── prompts/             # Prompts para IA
├── front/                   # Frontend Plugin Figma
│   ├── code.ts              # Lógica principal (TypeScript)
│   ├── code.js              # Código compilado (JavaScript)
│   ├── ui.html              # Interface do usuário
│   └── manifest.json        # Configuração do plugin
└── setup.js                 # Script de configuração
```

## 🎉 Pronto para Desenvolver!

Agora você pode:
- Editar o código TypeScript em `front/code.ts`
- Compilar com `npm run build` no frontend
- Desenvolver com auto-reload usando `npm run dev:watch` no backend
- Testar o plugin diretamente no Figma

---

**Desenvolvido com ❤️ para a comunidade UX/UI**