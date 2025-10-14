"use strict";
// Código corrigido para análise individual de layouts
// Este arquivo substitui o code.ts atual
// ... (todo o código anterior até a linha 980) ...
// [API] Chamada antiga comentada - agora cada layout é analisado individualmente
// A chamada da API foi movida para dentro da função analyzeSingleLayout
try {
    await Promise.all([
        figma.loadFontAsync({ family: "Inter", style: "Regular" }),
        figma.loadFontAsync({ family: "Inter", style: "Bold" }),
        figma.loadFontAsync({ family: "Inter", style: "Italic" })
    ]);
}
catch (e) {
    console.warn("Alguma fonte não foi carregada:", e);
}
// Tenta carregar SemiBold separadamente, se falhar usa Bold como fallback
let semiBoldAvailable = false;
try {
    await figma.loadFontAsync({ family: "Inter", style: "SemiBold" });
    semiBoldAvailable = true;
}
catch (e) {
    console.warn("Inter SemiBold não disponível, usando Bold como fallback:", e);
}
const layoutsPayload = [];
// Função para analisar um layout individual
async function analyzeSingleLayout(targetNode, telaIndex) {
    const OFFSET_X = 80;
    let cardsPayload = [];
    try {
        // Criar Auto Layout para esta tela
        const autoLayout = figma.createFrame();
        autoLayout.name = `[AI] ${targetNode.name || 'Layout'}`;
        autoLayout.layoutMode = "VERTICAL";
        autoLayout.primaryAxisSizingMode = "AUTO";
        autoLayout.counterAxisSizingMode = "AUTO";
        autoLayout.primaryAxisAlignItems = "MIN";
        autoLayout.counterAxisAlignItems = "MIN";
        autoLayout.itemSpacing = 24;
        autoLayout.paddingLeft = 0;
        autoLayout.paddingRight = 0;
        autoLayout.paddingTop = 0;
        autoLayout.paddingBottom = 0;
        autoLayout.fills = [];
        autoLayout.cornerRadius = 0;
        autoLayout.strokes = [];
        // Posicionar o Auto Layout ao lado da tela
        autoLayout.x = targetNode.x + targetNode.width + OFFSET_X;
        autoLayout.y = targetNode.y;
        // Adicionar Auto Layout à página
        figma.currentPage.appendChild(autoLayout);
        // Preparar dados específicos para este layout
        const layoutImage = imagensBase64[telaIndex];
        const layoutSpec = figmaSpecs[telaIndex];
        const layoutName = targetNode.name || `Layout ${telaIndex + 1}`;
        // Chamada da API para este layout específico
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                imagens: layoutImage ? [layoutImage] : [],
                figmaSpecs: layoutSpec ? [layoutSpec] : [],
                metodo,
                descricao,
                nomeLayout: layoutName
            })
        });
        const data = await response.json();
        let blocos = [];
        if (data && Array.isArray(data.respostas)) {
            // Verificar se é JSON formatado
            const primeiraResposta = data.respostas[0];
            if (typeof primeiraResposta === 'string' && primeiraResposta.includes('```json')) {
                try {
                    // Extrair JSON do markdown
                    const jsonMatch = primeiraResposta.match(/```json\n([\s\S]*?)\n```/);
                    if (jsonMatch) {
                        const jsonData = JSON.parse(jsonMatch[1]);
                        if (jsonData.achados && Array.isArray(jsonData.achados)) {
                            // Converter cada achado para formato esperado pelo parser
                            blocos = jsonData.achados.map((achado) => {
                                return `1 - ${achado.titulo_card || 'Achado de usabilidade'}
2 - ${achado.heuristica_metodo || 'Heurística de Nielsen'}
3 - ${achado.descricao || ''}
4 - ${achado.sugestao_melhoria || ''}
5 - ${achado.justificativa || ''}
6 - ${achado.justificativa || ''}
7 - ${achado.severidade || 'médio'}
8 - ${Array.isArray(achado.referencias) ? achado.referencias.join(', ') : achado.referencias || ''}`;
                            });
                        }
                        else {
                            blocos = data.respostas;
                        }
                    }
                    else {
                        blocos = data.respostas;
                    }
                }
                catch (e) {
                    console.error("❌ [DEBUG] Erro ao processar JSON:", e);
                    blocos = data.respostas;
                }
            }
            else {
                blocos = data.respostas;
            }
        }
        else {
            console.error("❌ [DEBUG] Erro: respostas não é um array ou está vazio");
        }
        // 🔧 anti-split: une "Sem título" + próximo que começa com "Hipótese Título do Card:"
        if (blocos.length >= 2 && /^Sem título/i.test(blocos[0]) && /^Hipótese Título do Card:/i.test(blocos[1])) {
            blocos[0] = blocos[0] + "\n\n" + blocos[1];
            blocos.splice(1, 1);
        }
        // Processar todos os blocos como partes individuais para esta tela
        const todasPartes = [];
        for (let i = 0; i < blocos.length; i++) {
            const blocoOriginal = blocos[i] || "";
            // Suporte a múltiplas heurísticas no mesmo bloco, separadas por [[[FIM_HEURISTICA]]]
            const partes = blocoOriginal.split("[[[FIM_HEURISTICA]]]").map((p) => p.trim()).filter((p) => p.length > 0);
            // Fallback para marcador antigo [[FIM_HEURISTICA]]
            if (partes.length === 0 && blocoOriginal.includes("[[FIM_HEURISTICA]]")) {
                partes.push(blocoOriginal.split("[[FIM_HEURISTICA]]")[0].trim());
            }
            todasPartes.push(...partes);
        }
        const partesNegativas = todasPartes
            .filter(p => !/positiv/i.test(extrairSeveridade(p)))
            .sort((a, b) => rankSeveridade(extrairSeveridade(a)) - rankSeveridade(extrairSeveridade(b)));
        const partesPositivas = todasPartes
            .filter(p => /positiv/i.test(extrairSeveridade(p)))
            .slice(0, MAX_POSITIVE_CARDS);
        const partesOrdenadas = [...partesNegativas, ...partesPositivas];
        cardsPayload = [];
        for (const parte of partesOrdenadas) {
            console.log(`[DEBUG] Processando parte: ${parte.substring(0, 50)}...`);
            console.log(`[DEBUG] targetNode disponível:`, !!targetNode);
            console.log(`[DEBUG] targetNode.id:`, targetNode && targetNode.id);
            // Quebra o bloco em linhas e remove espaços
            let parteSan = parte;
            const linhas = parteSan
                .split('\n')
                .map(linha => linha.trim())
                .filter(linha => linha.length > 0);
            if (linhas.length === 0)
                continue;
            const titulo = linhas[0]?.replace(/^\d+\s*-\s*/, '') || 'Achado de usabilidade';
            const heuristica = linhas[1]?.replace(/^\d+\s*-\s*/, '') || 'Heurística de Nielsen';
            const descricao = linhas[2]?.replace(/^\d+\s*-\s*/, '') || '';
            const sugestao = linhas[3]?.replace(/^\d+\s*-\s*/, '') || '';
            const justificativa = linhas[4]?.replace(/^\d+\s*-\s*/, '') || '';
            const referencias = linhas[7]?.replace(/^\d+\s*-\s*/, '') || '';
            const severidadeRaw = extrairSeveridade(parte);
            const sevKey = getSeveridadeKey({ severidade: severidadeRaw });
            const sevMeta = SEVERIDADES[sevKey];
            // Criar card
            const card = figma.createFrame();
            card.name = `Card: ${titulo}`;
            card.layoutMode = "HORIZONTAL";
            card.primaryAxisSizingMode = "AUTO";
            card.counterAxisSizingMode = "AUTO";
            card.itemSpacing = 16;
            card.paddingLeft = 16;
            card.paddingRight = 16;
            card.paddingTop = 16;
            card.paddingBottom = 16;
            card.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
            card.cornerRadius = 8;
            card.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
            // Barra lateral com severidade
            const barraLateral = figma.createFrame();
            barraLateral.name = "Barra Lateral";
            barraLateral.layoutMode = "VERTICAL";
            barraLateral.primaryAxisSizingMode = "FIXED";
            barraLateral.counterAxisSizingMode = "AUTO";
            barraLateral.itemSpacing = 8;
            barraLateral.paddingLeft = 12;
            barraLateral.paddingRight = 12;
            barraLateral.paddingTop = 12;
            barraLateral.paddingBottom = 12;
            barraLateral.fills = [{ type: "SOLID", color: sevMeta.color }];
            barraLateral.cornerRadius = 8;
            barraLateral.strokes = [];
            // Número da severidade
            const numeroSeveridade = figma.createText();
            numeroSeveridade.name = "Número Severidade";
            numeroSeveridade.characters = sevMeta.number;
            numeroSeveridade.fontSize = 24;
            numeroSeveridade.fontName = { family: "Inter", style: "Bold" };
            numeroSeveridade.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
            barraLateral.appendChild(numeroSeveridade);
            // Label da severidade
            const labelSeveridade = figma.createText();
            labelSeveridade.name = "Label Severidade";
            labelSeveridade.characters = sevMeta.label;
            labelSeveridade.fontSize = 12;
            labelSeveridade.fontName = { family: "Inter", style: "Regular" };
            labelSeveridade.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
            barraLateral.appendChild(labelSeveridade);
            // Conteúdo principal
            const contentCol = figma.createFrame();
            contentCol.name = "Conteúdo";
            contentCol.layoutMode = "VERTICAL";
            contentCol.primaryAxisSizingMode = "AUTO";
            contentCol.counterAxisSizingMode = "AUTO";
            contentCol.itemSpacing = 8;
            contentCol.paddingLeft = 0;
            contentCol.paddingRight = 0;
            contentCol.paddingTop = 0;
            contentCol.paddingBottom = 0;
            contentCol.fills = [];
            contentCol.cornerRadius = 0;
            contentCol.strokes = [];
            // Função helper para criar seções
            const makeSection = (titulo, conteudo, monospace = false) => {
                if (!conteudo || conteudo.trim().length === 0)
                    return null;
                const sec = figma.createFrame();
                sec.name = titulo;
                sec.layoutMode = "VERTICAL";
                sec.primaryAxisSizingMode = "AUTO";
                sec.counterAxisSizingMode = "AUTO";
                sec.itemSpacing = 4;
                sec.paddingLeft = 0;
                sec.paddingRight = 0;
                sec.paddingTop = 0;
                sec.paddingBottom = 0;
                sec.fills = [];
                sec.cornerRadius = 0;
                sec.strokes = [];
                const tituloSec = figma.createText();
                tituloSec.name = `Título ${titulo}`;
                tituloSec.characters = titulo;
                tituloSec.fontSize = 12;
                tituloSec.fontName = { family: "Inter", style: "SemiBold" };
                tituloSec.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
                sec.appendChild(tituloSec);
                const conteudoSec = figma.createText();
                conteudoSec.name = `Conteúdo ${titulo}`;
                conteudoSec.characters = conteudo;
                conteudoSec.fontSize = 12;
                conteudoSec.fontName = { family: "Inter", style: "Regular" };
                conteudoSec.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
                if (monospace) {
                    conteudoSec.fontName = { family: "Inter", style: "Regular" };
                }
                sec.appendChild(conteudoSec);
                return sec;
            };
            // 1 - Título
            const secTitulo = makeSection("Título", titulo);
            if (secTitulo)
                contentCol.appendChild(secTitulo);
            // 2 - Heurística
            const secHeuristica = makeSection("Heurística", heuristica);
            if (secHeuristica)
                contentCol.appendChild(secHeuristica);
            // 3 - Descrição
            const secDescricao = makeSection("Descrição", descricao);
            if (secDescricao)
                contentCol.appendChild(secDescricao);
            // 4 - Sugestão
            const secSugestao = makeSection("Sugestão", sugestao);
            if (secSugestao)
                contentCol.appendChild(secSugestao);
            // 5 - Justificativa
            const secJust = makeSection("Justificativa", justificativa);
            if (secJust)
                contentCol.appendChild(secJust);
            // 8 - Referências
            const secRef = makeSection("Referências", referencias, true);
            if (secRef)
                contentCol.appendChild(secRef);
            card.appendChild(barraLateral);
            card.appendChild(contentCol);
            // Adiciona o card finalizado ao Auto Layout
            autoLayout.appendChild(card);
            // Agora que o card foi realmente criado, refletimos no resumo
            cardsPayload.push({ analise: parte, severidade: sevMeta.label, sevKey, severidadeRaw, nodeId: targetNode.id });
        }
        // Nome do layout sem optional chaining
        const nodeName = (targetNode && targetNode.name) ? targetNode.name : (`Layout`);
        return { nome: nodeName, cards: cardsPayload };
    }
    catch (error) {
        console.error(`[DEBUG] Erro ao processar análise da tela ${telaIndex + 1}:`, error);
        // Continua mesmo se houver erro
        const nodeName = (targetNode && targetNode.name) ? targetNode.name : 'Layout';
        return { nome: `${nodeName} (Erro)`, cards: [] };
    }
}
// Iterar por cada tela selecionada e analisar individualmente
for (let telaIndex = 0; telaIndex < orderedSelection.length; telaIndex++) {
    const targetNode = orderedSelection[telaIndex];
    console.log(`[DEBUG] Analisando layout ${telaIndex + 1}: ${targetNode.name}`);
    const layoutResult = await analyzeSingleLayout(targetNode, telaIndex);
    layoutsPayload.push(layoutResult);
} // fim do loop da tela
// Envia resultados para a UI
figma.ui.postMessage({ carregando: false, analises: layoutsPayload });
try { }
catch (e) {
    console.error("❌ [DEBUG] Erro completo na análise:", e);
    console.error("❌ [DEBUG] Tipo do erro:", typeof e);
    console.error("❌ [DEBUG] Mensagem do erro:", e && e.message ? e.message : e);
    figma.ui.postMessage({ carregando: false, resultado: "❌ Erro na análise." });
}
;
