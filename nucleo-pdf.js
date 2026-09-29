/* Núcleo do mesclador de PDF. Depende do PDFLib (pdf-lib) e, para PDFs protegidos, do pdfjsLib. */
(function (raiz) {
  // Métricas usadas tanto na prévia (CSS) quanto no PDF final, para o texto cair no mesmo lugar.
  const ALTURA_LINHA = 1.2;   // entrelinha, em múltiplos do tamanho da fonte
  const LINHA_BASE = 0.946;   // distância do topo da caixa até a linha de base da 1ª linha

  const pausa = () => new Promise((r) => setTimeout(r, 0));

  function hexParaRgb(hex) {
    const h = String(hex || '#000000').replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16) / 255 || 0,
      g: parseInt(h.substring(2, 4), 16) / 255 || 0,
      b: parseInt(h.substring(4, 6), 16) / 255 || 0,
    };
  }

  /* Dimensões da página como ela aparece na tela (já girada). */
  function dimensoesVisiveis(pagina) {
    const rot = ((pagina.getRotation().angle % 360) + 360) % 360;
    const caixa = pagina.getCropBox();
    const deitada = rot === 90 || rot === 270;
    return { rot, caixa, largura: deitada ? caixa.height : caixa.width, altura: deitada ? caixa.width : caixa.height };
  }

  /* Converte um ponto visto na tela (em pt, a partir do canto superior esquerdo) para o espaço do PDF. */
  function pontoTelaParaPdf(px, py, rot, caixa) {
    const { x: cx, y: cy, width: cw, height: ch } = caixa;
    switch (rot) {
      case 90: return { x: cx + py, y: cy + px };
      case 180: return { x: cx + cw - px, y: cy + py };
      case 270: return { x: cx + cw - py, y: cy + ch - px };
      default: return { x: cx + px, y: cy + ch - py };
    }
  }

  /* A fonte padrão do PDF (Helvetica) só codifica WinAnsi: acentos do português ok, emojis e outros não. */
  function textoCompativel(texto, fonte) {
    const aceitos = new Set(fonte.getCharacterSet());
    let trocados = 0;
    const limpo = Array.from(String(texto).replace(/\t/g, '    ').replace(/\r/g, '')).map((c) => {
      if (c === '\n' || aceitos.has(c.codePointAt(0))) return c;
      trocados++;
      return '?';
    }).join('');
    return { limpo, trocados };
  }

  function desenharTexto(pagina, ed, fontes, PDFLib) {
    const fonte = ed.negrito ? fontes.negrito : fontes.normal;
    const { rot, caixa, largura, altura } = dimensoesVisiveis(pagina);
    const { limpo } = textoCompativel(ed.texto, fonte);
    const cor = hexParaRgb(ed.cor);
    limpo.split('\n').forEach((linha, i) => {
      if (!linha.trim()) return;
      const px = ed.u * largura;
      const py = ed.v * altura + ed.tamanho * (LINHA_BASE + i * ALTURA_LINHA);
      const p = pontoTelaParaPdf(px, py, rot, caixa);
      pagina.drawText(linha, {
        x: p.x, y: p.y, size: ed.tamanho, font: fonte,
        color: PDFLib.rgb(cor.r, cor.g, cor.b),
        rotate: PDFLib.degrees(rot),
      });
    });
  }

  /* ---------- Formulários ---------- */

  function tipoCampo(campo, PDFLib) {
    if (campo instanceof PDFLib.PDFTextField) return 'texto';
    if (campo instanceof PDFLib.PDFCheckBox) return 'caixa';
    if (campo instanceof PDFLib.PDFDropdown) return 'lista';
    if (campo instanceof PDFLib.PDFOptionList) return 'lista';
    if (campo instanceof PDFLib.PDFRadioGroup) return 'opcao';
    return null; // botões e assinaturas: ignorados
  }

  function lerCampos(doc, PDFLib) {
    let campos = [];
    try {
      campos = doc.getForm().getFields();
    } catch (e) { return []; }
    const lista = [];
    for (const c of campos) {
      const tipo = tipoCampo(c, PDFLib);
      if (!tipo) continue;
      const item = { nome: c.getName(), tipo, somenteLeitura: c.isReadOnly() };
      try {
        if (tipo === 'texto') { item.valor = c.getText() || ''; item.multilinha = c.isMultiline(); }
        else if (tipo === 'caixa') item.valor = c.isChecked();
        else if (tipo === 'lista') { item.opcoes = c.getOptions(); item.valor = (c.getSelected() || [])[0] || ''; }
        else if (tipo === 'opcao') { item.opcoes = c.getOptions(); item.valor = c.getSelected() || ''; }
      } catch (e) { item.valor = tipo === 'caixa' ? false : ''; }
      item.original = item.valor;
      lista.push(item);
    }
    return lista;
  }

  function aplicarCampos(doc, campos, fontes, PDFLib) {
    const form = doc.getForm();
    const avisos = [];
    for (const item of campos) {
      if (item.valor === item.original) continue;
      try {
        const c = form.getField(item.nome);
        if (item.tipo === 'texto') c.setText(textoCompativel(item.valor, fontes.normal).limpo || undefined);
        else if (item.tipo === 'caixa') item.valor ? c.check() : c.uncheck();
        else if (item.tipo === 'lista' || item.tipo === 'opcao') { if (item.valor) c.select(item.valor); }
      } catch (e) {
        avisos.push(`Campo "${item.nome}" não pôde ser preenchido.`);
      }
    }
    try { form.updateFieldAppearances(fontes.normal); } catch (e) { /* segue com as aparências existentes */ }
    try { form.flatten(); } catch (e) { avisos.push('O formulário não pôde ser "achatado"; os campos podem não aparecer no PDF final.'); }
    return avisos;
  }

  /* ---------- Junção ---------- */

  async function rasterizarPagina(pdfjsDoc, numero, destino, PDFLib) {
    const pag = await pdfjsDoc.getPage(numero);
    const base = pag.getViewport({ scale: 1 });
    const escala = Math.min(2, 3000 / Math.max(base.width, base.height));
    const vp = pag.getViewport({ scale: escala });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pag.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    const img = await destino.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const nova = destino.addPage([base.width, base.height]);
    nova.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
    pag.cleanup();
    canvas.width = canvas.height = 0;
    return nova;
  }

  async function juntar(arquivos, edicoes, opcoes) {
    const { PDFLib, abrirPdfjs, aoProgredir } = opcoes;
    const saida = await PDFLib.PDFDocument.create();
    const fontes = {
      normal: await saida.embedFont(PDFLib.StandardFonts.Helvetica),
      negrito: await saida.embedFont(PDFLib.StandardFonts.HelveticaBold),
    };
    const avisos = [];
    const total = arquivos.reduce((s, a) => s + a.paginas, 0) || 1;
    let feitas = 0;

    for (const arq of arquivos) {
      const edsDoArquivo = edicoes.filter((e) => e.arqId === arq.id && e.texto.trim());
      const paginasSaida = [];

      if (!arq.modoImagem) {
        const origem = await PDFLib.PDFDocument.load(arq.bytes, { updateMetadata: false });
        if (arq.campos && arq.campos.length) {
          const fontesOrigem = { normal: await origem.embedFont(PDFLib.StandardFonts.Helvetica) };
          aplicarCampos(origem, arq.campos, fontesOrigem, PDFLib).forEach((a) => avisos.push(`${arq.nome}: ${a}`));
        }
        const copiadas = await saida.copyPages(origem, origem.getPageIndices());
        for (const p of copiadas) {
          paginasSaida.push(saida.addPage(p));
          feitas++;
          if (feitas % 5 === 0) { aoProgredir && aoProgredir(feitas / total); await pausa(); }
        }
      } else {
        const doc = await abrirPdfjs(arq);
        for (let n = 1; n <= doc.numPages; n++) {
          paginasSaida.push(await rasterizarPagina(doc, n, saida, PDFLib));
          feitas++;
          aoProgredir && aoProgredir(feitas / total);
          await pausa();
        }
      }

      let trocados = 0;
      for (const ed of edsDoArquivo) {
        const pagina = paginasSaida[ed.pagina];
        if (!pagina) continue;
        trocados += textoCompativel(ed.texto, ed.negrito ? fontes.negrito : fontes.normal).trocados;
        desenharTexto(pagina, ed, fontes, PDFLib);
      }
      if (trocados) avisos.push(`${arq.nome}: ${trocados} caractere(s) sem suporte na fonte foram trocados por "?".`);
      aoProgredir && aoProgredir(feitas / total);
      await pausa();
    }

    const bytes = await saida.save();
    aoProgredir && aoProgredir(1);
    return { bytes, paginas: saida.getPageCount(), avisos };
  }

  function nomeArquivoSeguro(texto, padrao) {
    let s = String(texto || '').trim().replace(/\.pdf$/i, '');
    s = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
    return (s || padrao) + '.pdf';
  }

  raiz.NucleoPdf = {
    ALTURA_LINHA, LINHA_BASE,
    dimensoesVisiveis, pontoTelaParaPdf, textoCompativel, desenharTexto,
    lerCampos, aplicarCampos, juntar, nomeArquivoSeguro,
  };
})(typeof window !== 'undefined' ? window : globalThis);
