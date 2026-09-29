// Gera dist/junta-pdf.html: um único arquivo com as bibliotecas embutidas (funciona offline).
const fs = require('fs');
const path = require('path');

const ler = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
// "</script" dentro de um <script> encerraria a tag antes da hora
const seguro = (codigo) => codigo.replace(/<\/script/gi, '<\\/script');

const partes = {
  '/*__PDFLIB__*/': seguro(ler('node_modules/pdf-lib/dist/pdf-lib.min.js')),
  '/*__PDFJS__*/': seguro(ler('node_modules/pdfjs-dist/build/pdf.min.js')),
  '/*__PDFJS_WORKER__*/': seguro(ler('node_modules/pdfjs-dist/build/pdf.worker.min.js')),
  '/*__NUCLEO__*/': seguro(ler('src/nucleo-pdf.js')),
};

let html = ler('src/index.template.html');
for (const [marcador, codigo] of Object.entries(partes)) {
  if (!html.includes(marcador)) throw new Error(`Marcador ${marcador} não encontrado no modelo.`);
  html = html.split(marcador).join(codigo);
}

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
const destino = path.join(__dirname, 'dist', 'junta-pdf.html');
fs.writeFileSync(destino, html);
console.log(`Gerado ${path.relative(__dirname, destino)} (${(html.length / 1048576).toFixed(2)} MB)`);
