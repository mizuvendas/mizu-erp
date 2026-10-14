# Mizu ERP — notas para quem for mexer aqui

ERP + emissor de NF-e da **Mizu Materiais de Limpeza** (J R M BESSA MIZU
COMERCIO, CNPJ 46.836.769/0001-45, Rio Verde/GO). Dona: Gilb.

**Restrição que vale sempre: custo mensal zero.** Nada de serviço pago,
nada de assinatura. Foi por isso que o sistema saiu do TOTVS.

---

## Como a dona trabalha

Ela manda os pedidos, você prepara, e **só começa a implementar quando ela
confirmar**. Não inicie por conta própria.

Ela não é programadora. Explique em português comum, sem jargão — e quando
o assunto for fiscal, diga o que acontece na prática (a nota é rejeitada, o
preço sai errado, a multa vem), não o nome da regra.

Quando a decisão muda o que vai ser construído e tem duas respostas
razoáveis, pergunte antes. Principalmente quando uma das opções destrói
dado: "apagar uma venda" já significou duas coisas opostas aqui.

---

## O repositório

- `index.html` — **o sistema inteiro**, arquivo único, ~33 mil linhas.
  HTML + CSS + JS num `<script>` só. Publicado em GitHub Pages:
  https://mizuvendas.github.io/mizu-erp
- Os dados dela vivem em `localStorage`, chave `gv_sistema_data_v1`.
  Não há servidor, não há banco.

### Como editar

**Nunca reescreva o arquivo.** Sempre patch com âncora, em Python:

1. A âncora tem de aparecer **exatamente uma vez** — conte antes.
2. Se qualquer âncora falhar, **aborte sem escrever nada**.
3. Faça backup com carimbo de hora antes de gravar, e apague depois.
4. Rode em `device_bash` com heredoc **entre aspas** (`<<'PYEOF'`), senão
   o shell come os `${...}` e as crases dos template literals.

Edite direto na máquina dela. `device_commit_files` já serviu cópia velha
mesmo com `force:true` — não dá para confiar nele para o `index.html`.

### Como verificar (não pule)

```bash
# 1. sintaxe: extrai o maior <script> e checa
python3 -c "
import io,re
h=io.open('index.html',encoding='utf-8').read()
io.open('/tmp/b.js','w',encoding='utf-8').write(max(re.findall(r'<script[^>]*>(.*?)</script>',h,re.S),key=len))
" && node --check /tmp/b.js
```

Depois: `device_stage_files` do `index.html` e rodar os testes Playwright no
container (Chromium em `/opt/pw-browsers`), semeando
`localStorage['gv_sistema_data_v1']`.

**Os testes não ficam no repositório** — vivem no container, que é
descartado quando a sessão acaba. Se forem perdidos, vale reescrever: eles
já pegaram defeitos caros (ver "Erros que já passaram" abaixo).

### Como publicar

`git push` e `gh api` dão **403** nessa máquina. O único caminho que
funciona é **GitHub Desktop por computer-use**:

- `computer_resolve_access` com `"GitHub Desktop"` → conceder.
- A janela pertence a **outro processo**: `githubdesktop.exe` (hoje em
  `app-3.6.6/`, muda a cada atualização). Resolva esse nome **depois** de
  abrir o app, e conceda também — sem ele a tela sai mascarada.
- Botão "Push origin" no topo. Confirme com
  `git log --oneline origin/main -1`.
- As permissões expiram. Toda sessão nova precisa conceder de novo.

**git deixa `.lock` para trás** porque não consegue apagar os próprios
arquivos temporários sem permissão de exclusão. Isso quebra o próximo
comando git, inclusive os dela. Peça
`device_request_delete_permission` em `C:\Users\takat\Documents` e limpe
`.git/*.lock` e `tmp_obj_*`.

---

## Regras de negócio que não são óbvias

### ST (substituição tributária)

Dois campos no produto, e a diferença importa:

- `temST` — o que os **fornecedores** praticaram. Observação, muda a cada
  nota.
- `stConfirmado` — o que o **contador** disse. `null` = ainda não
  respondeu. **Só esse muda a tributação.** Nenhuma entrada de nota
  sobrescreve.

Precificar com a alíquota de ST porque um fornecedor reteve é aposta; se
der errado, a margem dela encolhe. Por isso o sistema espera o contador.

- Simples Nacional, Anexo I, 1ª faixa: **4,00%**. O ICMS é 34% disso, logo
  receita de ST segregada → **2,64%**. Ambos configuráveis
  (`config.impostoPct`, `config.impostoPctST`).
- CSOSN 500 **exige CEST** no XML, senão a Receita rejeita a nota.

### Entrada de nota

- O XML traz NCM, CEST, CFOP, CST/CSOSN, origem, custo, IPI, ST, frete e
  as duplicatas do boleto. Ela decide três coisas: qual produto, o fator de
  conversão e o preço.
- **Fator de conversão**: sem ele, `enCustoUnitario` divide por 1 e devolve
  o custo da *embalagem* com nome de "custo por unidade". Nunca mostre
  custo, margem ou lucro sem o fator preenchido.
- **Frete**: existe por item (`prod/vFrete`) e no total (`ICMSTot/vFrete`).
  Quando o fornecedor declara só no total, o sistema rateia por conta
  própria, **pelo valor de cada item**. `modFrete` 1, 2 ou 4 = o frete não
  está na nota; avise que o custo está incompleto.
- `enRecalcularFrete(e)` tem de rodar sempre que a base mudar: importação,
  frete por fora, item tirado ou devolvido, e antes de concluir.

### Repasse

- Uma linha de repasse **é uma venda** (`v.pagadorId` preenchido). Não
  existe entidade "repasse".
- `tirarVendaDoRepasse()` limpa só o `pagadorId`. A venda continua: o
  faturamento, o estoque e a comissão ficam. `v.repasse` fica intacto de
  propósito, para poder voltar atrás com os pagamentos junto.
- `STATE.cobrancasRepasse` — cobrança que **não veio de venda**. Fica fora
  de `STATE.vendas` de propósito: não é venda, logo não entra em
  faturamento, estoque, comissão ou relatório de produto.
- `getLinhasRepasse()` devolve os dois tipos com a mesma forma, e **toda**
  a tela lê dali (totais, KPIs, quinzenas, saldo por pagador, PDF, Excel).
  Mexa ali e aparece em todo lugar.
- As telas de pagamento resolvem o documento por `repasseDoc(id)`, não por
  `STATE.vendas.find`.

---

## Erros que já passaram por aqui

Valem como aviso, não como história:

- **Dois renderizadores para a mesma tela.** O custo por unidade ficou
  certo na tabela e errado no detalhe: R$ 45,79 no lugar de R$ 5,72, com um
  lucro de R$ 1.552,04 que não existia. Prefira uma tela em duas
  densidades a duas telas.
- **`required` no HTML barrando o submit calado.** O campo Marca era
  obrigatório e produto nascido de entrada de nota nasce sem marca: o botão
  Salvar parecia morto. Valide no handler e diga o que falta.
- **Função que nunca existiu.** `nomeClientePorId` quebrava a tela de
  cancelar nota — mas só quando havia nota emitida, porque com a lista
  vazia o `.map` não rodava. Quebrava exatamente quando era necessária.
- **Patch com âncora larga apagando funções.** Um `trocar` mal ancorado
  levou seis funções junto. Só o teste pegou.
- **Aviso falso.** O selo dizia "falta NCM" de um produto cujo NCM vinha
  naquela mesma nota. Aviso que grita à toa ensina a ignorar aviso.
- **simplexml + json perde texto** de elemento que tem atributo e texto
  juntos (o `docZip` do DistDFe). Use DOM.

---

## Em aberto

- **Emissor com ST**: mandar CSOSN 500, CFOP 5405 (interno) / 6404
  (interestadual) e CEST para produto com `stConfirmado === true`. Hoje
  sai como 102/5102 para tudo. **Isso trava a emissão** no dia em que o
  contador confirmar o primeiro produto.
- O emissor manda `SEM GTIN` fixo em vez do código de barras real.
- **Não há validação de CNPJ em lugar nenhum** do sistema. CNPJ de cliente
  errado = nota rejeitada, descoberto só na hora de emitir.
- Foto do produto, com busca por código de barras ou nome.
- Relatório mensal de receita segregada (com ST / sem ST) para o contador.
- O bloco de duplicatas da NF-e (`tagfat`/`tagdup`) nunca foi testado
  contra a SEFAZ.
- No servidor (Render): `NFE_SERIE=2`, `NFCE_SERIE=2` e o CSC de produção
  ainda não estão configurados. **Ela não deve emitir pela Mizu até isso
  ser feito.**
- Telas fora da entrada ainda leem `STATE.config.impostoPct` direto, em vez
  de `impostoDoProduto(prod)`.

---

## O emissor de NF-e

Projeto separado, em `~/Documents/mizu-nfe` (PHP, biblioteca NFePHP),
hospedado no Render. `src/EmissorNfe.php` emite e cancela;
`src/NotasRecebidas.php` lê o DistDFe da SEFAZ.

- `tpAmb`: 1 = produção, 2 = homologação.
- DistDFe: cStat 138 = documento encontrado, 137 = nenhum,
  **656 = consumo indevido, bloqueia por 1 hora**. Respeite o `ultNSU`.

---

## O novo desenho da Entrada de Nota (aprovado 13/10/2026, ainda não construído)

A dona percorreu o Linx Microvix tela por tela e mandou 17 prints. O desenho
foi aprovado; a construção ficou parada a pedido dela. **Não comece sem ela
pedir.** O desenho clicável está num canvas de Design no claude.ai —
peça o link a ela se precisar ver.

**A decisão central:** o caminho é o do Microvix — telas separadas, uma
pergunta por tela, modais por cima, menu escuro à esquerda. Não é uma tela
só. A tela de hoje (tabela única com detalhe que abre) **sai do menu**, mas
só quando a nova estiver inteira e testada: nota de fornecedor não espera.

O motor fica: rateio do frete, fator de conversão, leitura das duplicatas,
sinais de ST. Só o desenho muda.

**As seis telas:**

1. **Entrada NF-e** — lista das notas emitidas contra o CNPJ, chegando
   sozinhas da Receita (o leitor DistDFe já existe, falta ligar). Filtro de
   período, busca, situação. Rejeitar, porque cai remessa e devolução ali
   também, não só compra. Importar por arquivo **ou pela chave de 44
   dígitos**. Mostrar a hora da última leitura: lista vazia sem data é
   ambígua.
2. **Associar e cadastrar produtos** — abas com contador (não associados ×
   associados). "Associar automaticamente" abre modal: escolhe o par de
   campos (XML → cadastro), depois mostra a comparação **nome deles × nome
   seu, lado a lado, com caixinha para desfazer**. Repete com outro par até
   esvaziar.
3. **Cadastrar novos produtos** — grade, com ⧉ no cabeçalho para copiar a
   primeira linha para as outras. **Só identificação: sem valor e sem
   fator.** Foi ela quem corrigiu isso, e está certa — no Microvix o preço
   é definido aqui, antes de o fator existir, e foi assim que a vassoura
   virou R$ 70,69 de custo e R$ 141,38 de venda quando custa R$ 5,89.
4. **Fator de conversão** — código de barras, código interno, descrição,
   fator. Sugerir o número lido do nome ("c/8", "c/24", "fardo c/50"), **sem
   agarrar qualquer número**: "c/1000fls" é folha, não unidade. Avisar
   quando compra em CX/FD e vende em UN com fator 1.
5. **Por quanto vender** — margem em todos de uma vez ou um a um, preço e
   margem ligados nos dois sentidos, e o campo sempre digitável (a sugestão
   é sugestão). Mostrar **preço de hoje ao lado do custo novo** e avisar
   quando o custo subiu e o preço não: é o erro que não dá sintoma.
6. **Finalizar** — operação (com o CFOP à vista), data, comprador,
   depósito, transportadora, frete; e o pagamento com a barra
   TOTAL / A PAGAR / LANÇADO / RESTANTE, com as parcelas já lidas do boleto.

**A nota de todo dia:** quando tudo já está cadastrado, as telas sem
trabalho se encolhem. A 3 nem aparece, a 4 vem preenchida do cadastro, a 5
mostra só o que mudou de custo. Cinco cliques. As seis etapas só acontecem
na primeira compra de um fornecedor.

**Campos:** "Linha" vira **Setor**, com Entrada / Intermediário / Premium —
é como ela chama. Categoria continua sendo o que o produto é.

**Regras de interface que vieram da visita:**

- Contador em toda tela; o trabalho tem tamanho e encolhe à vista.
- O que veio da nota fica cinza e não se edita; o que é decisão dela, branco.
- **Confirmação só onde é destrutivo.** O Microvix pergunta igual para
  copiar "Setor" e para copiar a tributação — e na terceira vez a pessoa
  clica "Sim" sem ler. Copiar campo comum não pergunta (é reversível);
  copiar tributação confere o NCM antes e avisa se diferem.
- **Dado fiscal viaja junto do item em todas as telas.** O Microvix pede a
  configuração tributária sem mostrar NCM/CEST/CFOP/CST ao lado, e por isso
  ela tem de sair da tela para conferir. Essa é a nossa maior vantagem.
- A tela vazia é recompensa: "Esta nota está pronta para ser lançada".
- Lista fechada, mas com "criar novo" ali mesmo.
- Produto sem GTIN ganha código de barras interno, para poder ser bipado.

**Ordem de construção combinada:** 2 → 3 → 4 → 5 → 6 → 1. A caixa de
entrada fica por último porque depende do servidor e do DistDFe (cStat 656
bloqueia por uma hora).


---

## O que mudou em 14/10/2026

Tudo isto está em `index.html`, passou em todas as baterias de teste válidas
e na varredura dos 25 menus, e está publicado.

### Produtos
- Listagem refeita: código, cód. barras, produto (com marca e fornecedor embaixo),
  setor, custo/venda/margem, estoque com carinha, ações. Linhas zebradas.
- Cadastro virou **página inteira** (`page-produto-cadastro`), seis seções, índice e
  foto fixos à direita. O modal antigo continua existindo e é usado **só** quando
  `abrirFormProduto(id, onSalvo)` é chamado de dentro de uma venda ou orçamento —
  sair da tela ali seria perder a venda.
- `SETORES_PRODUTO` — entrada / intermediário / premium. O nome é **Setor**, não
  "Linha": "Linha" já é usada no dia a dia pra linha do fabricante.
- Sugestão de NCM pelo nome (`sugerirNcmLocal`): 1) o que já veio nas notas de
  entrada, 2) `NCM_RAMO`, a tabela do ramo embutida, 3) a tabela oficial
  (BrasilAPI) a pedido. CEST fica travado até o NCM ter 8 dígitos
  (`cestsDoNcm`), e a configuração tributária é sugerida por origem + ST.
- O aviso de que há sugestão aparece **embaixo do campo do nome** — sem isso
  ela nasce lá na seção de Tributação, fora da vista de quem digita o nome.
  Foi exatamente o que a dona reportou.

### O que falta num produto — regra única
- `produtoPendencias(p)` devolve `{bloqueia, completar}`. É a mesma regra na
  listagem, no cadastro, no carrinho do orçamento e na emissão da nota.
  `pendenciasDeNota`, `produtoEmiteNota`, `textoPendencias` e `campoDaPendencia`
  são apelidos em cima dela — **não escrever uma segunda regra.**
- `abrirCorrigirProdutoFiscal(id)` corrige NCM/CEST/unidade/ST numa caixinha,
  sem sair do orçamento.

### Histórico sem produto (apagar o cadastro e refazer)
- `orfaosDoHistorico()` acha os produtos apagados que ainda aparecem em vendas e
  orçamentos. `abrirReligarHistorico(produtoId)` aparece sozinha ao cadastrar um
  produto novo e religa **todos os clientes de uma vez** via
  `definirSubstituicaoProduto` (produto antigo → produto novo).
- `idsEquivalentesProduto(produtoId)` é o que mantém o histórico de preço
  (última, penúltima, mais caro) funcionando depois do recadastro. **Sem isso o
  histórico some na prática**: as vendas antigas guardam o código antigo e a tela
  pergunta pelo novo. Qualquer consulta por `it.produtoId` tem de passar por aqui.

### Entrada de nota — o desenho aprovado, construído
- Seis telas (`en3*`): lista NF-e → associar → cadastrar → fator → preço → finalizar.
  Fator e finalizar são **modais**; o resto é página. Cabeçalho de tabela azul,
  coluna FISCAL em azul mais fundo.
- `en3Procurar` + `en3ModalComparar`: os dois modais da associação automática.
- Copiar coluna: campo comum não pergunta nada; **tributação confere o NCM** e
  avisa se diferem. Confirmação só onde é destrutivo.
- `en2SugerirFator` lê "c/12", "fardo c/50", "12x1L" e **não** cai em "c/1000fls".
- A tela antiga (`enHtmlConferencia`) continua no arquivo mas não é mais alcançada.
  Tirar quando a dona disser.

### Orçamento — três modelos, o mesmo motor
- `STATE.config.orcamentoModelo`: `'classico'`, `'esteira'` ou `'balcao'`.
- A esteira **não é uma tela nova**: `orcAplicarEsteira()` roda no fim de
  `renderOrcamentos()`, depois de todos os listeners, e move os cards 1/2/(3+4)
  para dentro de `orc-passo-1/2/3`. Mover um nó preserva os eventos, então tudo
  que o clássico faz a esteira faz igual, por construção.
  - **Armadilha já paga:** marcar o ponto de inserção ANTES de mover o primeiro
    card. Assim que c1 muda de pai, `c1.parentNode` vira a própria parada 1 e as
    paradas 2 e 3 nascem dentro dela, escondidas.
  - Se os títulos "1." a "4." mudarem, `orcCardPorTitulo` devolve null e a esteira
    simplesmente não se aplica — o clássico continua inteiro.
- `orcHtmlPainelDoDia()`: os quatro números (aguardando cliente / em separação /
  na rua / entregue sem nota) aparecem nos **três** modelos.

### Orçamento — o terceiro modelo: BALCÃO
- `STATE.config.orcamentoModelo`: `'classico'` | `'esteira'` | `'balcao'`.
- O caminho do "Venda Fácil" do Microvix, tela a tela como ela mostrou: barra
  única no alto (cliente à esquerda, campo de bipar no meio), carrinho no
  corpo, faixa de situação embaixo e duas saídas — **Pré-venda** (que é o
  orçamento) ou **Continuar para pagamento** (que fecha a venda).
- Começa em **Consumidor final**. Só no fim pergunta o nome (obrigatório) e o
  CPF (opcional) — `orcBalcaoPedirNome`. Se o CPF já existir no cadastro, usa
  o cliente existente em vez de duplicar.
- A linha do carrinho mostra **custo e margem coloridos** (≥20% verde, ≥8%
  âmbar, abaixo vermelho). É o que o Microvix esconde e o que evita baixar o
  preço no balcão até virar prejuízo.
- Como a esteira, **não é motor novo**: `orcAplicarBalcao` guarda os cards
  1–4 do clássico em `#orc-balcao-extras` (o botão "⋯ Dados adicionais"
  revela) e escreve nos mesmos campos escondidos. Repasse, comissão, condição
  de pagamento, origem de coleta e a validação do salvar continuam valendo.
- `orcBalcaoPronto` é a tela de ✓ com imprimir orçamento, controle de
  separação e entrega, WhatsApp, nota, XML, fechar a venda agora e nova venda.
- Pagamento: `ORC_FORMAS_BALCAO` (Dinheiro, PIX, Cartão, Crediário, Boleto).
  O motor grava **uma** forma por venda; dividir a mesma venda em duas formas
  não existe ainda. A barra Restante/Troco já está desenhada pra quando
  entrar, e o rótulo escolhido vai pra observação pra não virar tudo
  "à vista".

### O menu lateral do balcão (≡ Pedidos)
- `orcBalcaoAbrirPainel()` abre a gaveta da direita com três abas:
  **Em aberto** (pendente/enviado), **Aprovados** (aprovado ainda não
  faturado + tudo que está em separação ou na rua) e **Vendas feitas**.
- Busca por número, cliente ou produto dentro da gaveta.
- Os botões chamam as MESMAS funções do resto do sistema — `editarOrcamento`,
  `converterOrcamentoEmVenda`, `abrirOpcoesControleEntrega`,
  `marcarEntregaConcluida`, `marcarRetiradaOrcamento`, `verDetalheOrcamento`,
  `gerarPdfOrcamento`, `gerarPdfVenda`, `abrirDetalheVendaCliente`,
  `abrirHistoricoComprasCliente`. Nada aqui é lista nova.
- `orcBalcaoEfetivar(id)` é o "Faturar Pedido": traz a pré-venda pro balcão
  com os itens no carrinho; a faixa vira "Faturar pedido N" e o botão
  Pré-venda dá lugar a Salvar.
- **🧾 Histórico** também na barra do balcão, ao lado de Pesquisar — aparece
  quando o cliente escolhido já comprou aqui. Mesmo modal do clássico.

### Visual (base: Linx Microvix, cores Mizu)
- `--primary` agora é **#0081A7**. `--primary-escuro` #1B4B5A é o botão que fecha
  o passo (concluir, lançar, emitir) — cor diferente porque a consequência é outra.
  `--primary-fundo` #006C8D é a coluna de destaque no cabeçalho da tabela.
- `.data-table thead th` ficou azul em **todo** o sistema; linhas zebradas;
  `--shadow: none` (o desenho é plano); `.nav-item.active` com faixa azul;
  `.barra-acoes` é a barra de ações no pé de uma tabela.

### Correções de passagem
- `addDays` tolera data ruim ou dias ausentes. Um único orçamento sem
  `validadeDias` deixava a tela de Orçamentos **em branco**.
- `carrinhoLimpar` chamava `confirmarAcao`, que não existe — era `confirmAction`.
- `carrinhoAdicionar` usava `prompt()`, que não aparece em toda tela onde o
  sistema roda; virou caixinha própria.
- `en3Finalizar` tratava `enConferenciaValor` como se nunca voltasse null —
  entrada manual sem valor informado quebrava a tela.
- **`[hidden]` não funcionava no sistema inteiro.** `.btn` é `inline-flex` e
  a faixa de faturar tem `display:flex` no próprio style — os dois ganham do
  `[hidden]` do navegador. Resultado: a faixa "Faturar pedido" aparecia numa
  venda nova e o botão Salvar aparecia junto com Pré-venda. Entrou
  `[hidden]{ display:none !important; }` no CSS, logo antes de `.btn`.
- O campo de custo do item chama-se **`custoUnit`**, não `custo`. A linha do
  balcão lia `it.custo` e mostrava custo R$ 0,00 com margem 96% — justo o
  número que ela olha pra decidir o preço. Hoje lê `custoUnit` e, se faltar,
  cai no custo do cadastro.
- Os quatro quadradinhos do painel do dia somavam `o.total`, campo que o
  orçamento **não guarda** — davam sempre R$ 0,00. Agora somam por
  `calcularVenda`, igual à lista e ao PDF.
- Cadastrar o cliente no fim da venda de balcão não repintava a barra de
  cima: ficava "Consumidor final" com o cliente já selecionado.

### Paridade entre os três modelos — como provar
`smoke_paridade.py` monta o MESMO orçamento (dois itens, cliente, vendedor,
comissão, repasse 20% pra um pagador, boleto, desconto de 5%, observação) nos
três modelos e compara o registro salvo **campo a campo**: clienteId,
condicaoPagamento, crediarioDia, crediarioParcelas, desconto, itens,
observacoes, pagadorId, prazosBoleto, repassePct, temComissao, validadeDias,
vencimentoReceber, vendedor. Os três gravam igual.
Além disso, uma varredura compara todos os `id`, todos os handlers inline e
todo texto de botão/rótulo visível: **nada que o clássico tem falta na esteira
ou no balcão** (os dois só acrescentam). Rodar isso sempre que mexer no
formulário de orçamento.

## Testes
`smoke_en3.py`, `smoke_esteira.py`, `smoke_balcao.py`, `smoke_balcao_menu.py`,
`smoke_produtos.py`, `smoke_pendencias.py`, `smoke_orfaos.py` são novos.
Viraram `.obsoleto` (não testam mais nada que exista): `smoke_bloco_a/b/c/d`,
`smoke_en2`, `smoke_entrada2` (chamavam `en2Ir`, do modelo antigo de entrada),
`smoke.py` (olhava a tabela antiga de Produtos) e `smoke_ficha` (chamava
`nfeCnpjValido`, que já não existia antes desta sessão).
**Os testes vivem só no container da sessão; não estão no repositório.**

## Em aberto
- NF-e: falta `NFE_SERIE=2`, `NFCE_SERIE=2` e o CSC de produção no Render, e um
  teste de verdade contra a SEFAZ. **Não emitir da Mizu antes disso.**
- DistDFe (notas chegando sozinhas da Receita): o leitor existe, falta ligar —
  precisa do certificado A1 no servidor e de um intervalo de consulta (cStat 656
  bloqueia por 1 hora).
- Lista de compra: hoje é clicar produto por produto. A dona quer que nasça do
  histórico de vendas por período, filtrada por setor.
- Quando ela escolher entre clássico, esteira e balcão, apagar os outros dois.
- Pagamento dividido (metade PIX, metade dinheiro) não existe — mexe no Caixa
  e no Contas a Receber.
