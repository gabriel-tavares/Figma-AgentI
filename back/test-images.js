// Teste simples da funcionalidade de análise de imagens
const fs = require('fs');

// Carregar o figmaSpec
const figmaSpec = JSON.parse(fs.readFileSync('temp/figma_spec_item1.json', 'utf8'));

console.log('🔍 Testando detecção de imagens...');
console.log(`Total de componentes: ${figmaSpec.components.length}`);

// Detectar componentes com imagens
const imageComponents = figmaSpec.components.filter(comp => 
  comp.media && 
  (comp.media.mediaType === 'image' || comp.media.isPhotograph === true)
);

console.log(`📸 Imagens encontradas: ${imageComponents.length}`);

if (imageComponents.length > 0) {
  console.log('Primeira imagem encontrada:');
  console.log('- Label:', imageComponents[0].label);
  console.log('- Type:', imageComponents[0].type);
  console.log('- MediaType:', imageComponents[0].media.mediaType);
  console.log('- IsPhotograph:', imageComponents[0].media.isPhotograph);
  
  // Simular adição de descrição
  imageComponents[0].imageDescription = "Teste: Foto de pessoa sorrindo em ambiente profissional";
  console.log('✅ Descrição adicionada:', imageComponents[0].imageDescription);
}

console.log('Teste concluído!');
