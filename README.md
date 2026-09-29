# Junta PDF

Une vários PDFs em um só, na ordem em que foram adicionados, com a opção de reorganizar, escrever textos nas páginas e preencher formulários antes de juntar.

Tudo roda no navegador. Nenhum arquivo é enviado a servidor, e a ferramenta funciona offline: é um único arquivo HTML, sem instalação.

![Tela do Junta PDF](docs/captura.png)

## Como usar

1. Baixe o arquivo [`dist/junta-pdf.html`](dist/junta-pdf.html) e abra no navegador (Chrome, Edge, Firefox ou Safari atualizados).
2. Arraste os PDFs para a área indicada ou clique em **Escolher PDFs**.
3. Confira a ordem. Para mudá-la, arraste pela alça ⠿ ou use os botões ↑ ↓.
4. Opcional: na etapa **Editar páginas**, clique na página para escrever um texto ou preencha os campos de formulário.
5. Clique em **Juntar**, digite o nome do arquivo e clique em **Baixar PDF**.

## Funcionalidades

### Ordem dos arquivos

- Os PDFs entram no fim da lista, na ordem em que chegam, com a posição numerada.
- A ordem pode ser alterada arrastando (mouse) ou com os botões ↑ ↓ (também no celular).
- **Voltar à ordem de adição** desfaz qualquer reorganização.
- Antes de juntar, a etapa 3 mostra a ordem final com o número de páginas de cada arquivo.

> Quando vários arquivos são selecionados de uma só vez, a sequência dentro desse lote é definida pelo sistema operacional (em geral, ordem alfabética). Se a ordem importar, confira a lista ou adicione os arquivos um por vez.

### Edição

- **Textos livres.** Clique em qualquer ponto da página para criar um texto. Aceita várias linhas, tamanho em pt, cor e negrito.
- **Posicionamento.** Arraste o texto com o mouse, ou mova com as setas do teclado: 1 pt por toque, 10 pt com Shift. Delete remove o texto selecionado.
- **Formulários.** Se o PDF tiver campos (texto, caixa de marcar, lista, opção), eles aparecem ao lado da prévia para preenchimento.

O texto no PDF final cai na mesma posição mostrada na prévia, com diferença em torno de 1 pt, inclusive em páginas giradas.

### Carregamento, junção e exportação

- Barra de progresso com o percentual real da leitura dos arquivos e da junção.
- Aviso quando a lista, a ordem ou as edições mudam depois da última junção, para não baixar uma versão desatualizada.
- Nome do arquivo de saída definido por você. Caracteres inválidos no Windows (`/ \ : * ? " < > |`) são trocados por `_`.
- **Abrir em nova aba** para conferir o resultado antes de baixar.

### PDFs protegidos ou fora do padrão

PDFs com restrição de edição (comum em extratos, boletos e documentos oficiais) e arquivos que a pdf-lib não consegue ler entram como **imagem das páginas**. O visual fica igual, mas o texto dessas páginas deixa de ser selecionável. Se o PDF exigir senha de abertura, a ferramenta pede a senha. Os textos adicionados funcionam normalmente sobre essas páginas.

## Limitações

- A edição **acrescenta** conteúdo por cima da página. Não altera nem apaga o texto que já existe no PDF.
- Os textos usam a fonte Helvetica padrão do PDF, que cobre português (acentos, ç, aspas, travessões). Caracteres fora dela, como emojis e alfabetos não latinos, são trocados por `?`, com aviso na tela.
- Os formulários são "achatados" no resultado: os valores ficam visíveis, mas os campos deixam de ser editáveis. Formulários XFA (usados por alguns órgãos públicos) não são suportados.
- A prévia mostra o formulário original. Os valores preenchidos aparecem no PDF final.
- Páginas convertidas em imagem aumentam o tamanho do arquivo final.
- O limite de tamanho depende da memória do computador. Arquivos com centenas de MB podem deixar o navegador lento.

## Estrutura do repositório

```
junta-pdf/
├── dist/
│   └── junta-pdf.html        # arquivo pronto para uso (gerado pelo build)
├── src/
│   ├── index.template.html   # interface: HTML, CSS e JavaScript
│   └── nucleo-pdf.js         # lógica: coordenadas, textos, formulários e junção
├── docs/
│   └── captura.png
├── build.js                  # embute as bibliotecas e gera o dist/
└── package.json
```

O `dist/junta-pdf.html` fica versionado para que qualquer pessoa possa baixá-lo e usar direto, sem precisar compilar.

## Desenvolvimento

Requer [Node.js](https://nodejs.org) 16 ou superior.

```bash
npm install
npm run build
```

O build lê `src/index.template.html`, substitui os marcadores `/*__PDFLIB__*/`, `/*__PDFJS__*/`, `/*__PDFJS_WORKER__*/` e `/*__NUCLEO__*/` pelo código das bibliotecas e do núcleo, e grava `dist/junta-pdf.html`. Depois de alterar qualquer arquivo em `src/`, rode o build de novo e abra o HTML gerado no navegador.

### Como funciona

- **Leitura.** Cada arquivo é lido com `FileReader`, que informa o progresso, e aberto com a **pdf-lib**. Se a pdf-lib recusar o arquivo (protegido ou fora do padrão), ele é aberto com a **pdf.js** e marcado para entrar como imagem.
- **Prévia.** A pdf.js desenha a página em um `<canvas>`. O worker da pdf.js fica embutido no HTML e é carregado por uma URL `blob:`, o que permite funcionar sem servidor.
- **Posição do texto.** A posição é guardada como fração da página visível (0 a 1). Na exportação, `pontoTelaParaPdf` converte esse ponto para o espaço de coordenadas do PDF, considerando a CropBox e a rotação da página (0°, 90°, 180° e 270°). O texto é desenhado com a mesma rotação, para aparecer na horizontal. As constantes `ALTURA_LINHA` (1,2) e `LINHA_BASE` (0,946) alinham a linha de base do PDF com a da prévia em CSS.
- **Formulários.** Os campos são lidos com a API de formulários da pdf-lib. Na junção, os valores alterados são gravados, as aparências são regeneradas e o formulário é achatado. Sem isso, os campos perderiam o conteúdo ao copiar as páginas para o novo documento.
- **Páginas como imagem.** Cada página é renderizada pela pdf.js a até 2× (limitado a 3000 px no maior lado), convertida em JPEG e inserida em uma página do mesmo tamanho.

### Testes manuais sugeridos

Antes de publicar uma alteração, vale testar com:

- um PDF comum de várias páginas;
- um PDF com página girada (digitalização deitada);
- um PDF com formulário;
- um PDF com restrição de edição e outro com senha de abertura.

Confira no resultado a ordem das páginas, a posição dos textos e os valores dos campos.

## Tecnologias

- [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1: junção, textos e formulários (licença MIT).
- [PDF.js](https://github.com/mozilla/pdf.js) 3.11.174: prévia das páginas e leitura de PDFs protegidos (licença Apache 2.0).
- JavaScript puro, sem framework.

As duas bibliotecas são embutidas no `dist/junta-pdf.html`. Ao distribuir o arquivo, mantenha os avisos de licença delas.

## Licença

Defina a licença do projeto adicionando um arquivo `LICENSE` na raiz. A licença MIT é uma escolha comum e compatível com as bibliotecas usadas.
