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
