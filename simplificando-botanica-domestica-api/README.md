# API de leituras

Execute `node server.js` com `MONGODB_URI` definido no `.env`.

## Importação do catálogo de plantas

O catálogo original está em `dados/catalogo_100_plantas.json`.

```powershell
npm run importar:plantas -- --validar
npm run importar:plantas
```

O primeiro comando valida o arquivo sem acessar o banco. O segundo importa no
banco `simplificando-botanica-domestica`, coleção `plantas`, usando `id` como
chave única. O `tipo_planta` das leituras corresponde a esse `id`.

Cada documento mantém nome, nome científico, tipo, perfil de cultivo,
`valores_ideais`, `faixas_referencia` e a identificação do catálogo. Os quatro
valores ideais são números, com os nomes originais dos sensores. Metodologia,
unidades e fontes são preservadas na coleção `catalogos_plantas`.

Reexecutar atualiza os mesmos IDs sem duplicar plantas. Um conflito de ID com
outra espécie interrompe a importação antes de escrever plantas. O comando
confere os valores gravados após a importação; não altera a coleção `leituras`.

## POST /leituras

Exemplo ilustrativo de leitura calibrada:

```json
{
  "id_controlador": 1,
  "tipo_planta": 1,
  "horario_leitura": "2026-10-03T12:00:00Z",
  "temperatura": 25.5,
  "umidade_ar": 62.3,
  "ldr": 450.25,
  "umidade_solo": 48.6
}
```

Os sete campos originais são obrigatórios. Valores inválidos de sensores viram
`null`. Números em strings (por exemplo, `"25.5"`) também viram `null`.

`ldr` agora contém lux e `umidade_solo` contém porcentagem. Ambos aceitam
decimais: lux finito e não negativo, percentual de
0 a 100. Temperatura permanece em °C e umidade do ar em porcentagem.

Atualize a API e o firmware juntos: o firmware antigo enviava valores brutos
sob esses mesmos nomes. A API não pode distinguir a unidade de uma requisição
apenas pelo valor numérico. O servidor grava `unidades` como metadado interno;
esse campo não é enviado pelo ESP32 e não é aceito no corpo da requisição.

## GET /leituras/ultimas-validas/:id_controlador

Use `GET /leituras/ultimas-validas/1?tipo_planta=1` para escolher a planta do
controlador. A consulta filtra os dois IDs e não mistura leituras de plantas
diferentes. Se o controlador possui somente um tipo de planta no histórico,
`tipo_planta` pode ser omitido. Com mais de um, a API responde 400 e lista
`tipos_plantas` para seleção. Controlador inexistente ou planta sem associação
ao controlador responde 404.

Retorna `id_controlador`, `tipo_planta`, `planta` (nomes) e `sensores`, contendo `temperatura`, `umidade_ar`,
`ldr` e `umidade_solo`. Cada sensor tem `valor` (número ou
`null`) e `horario_atualizacao` (data UTC da medição ou `null`). O horário pode
ser diferente para cada sensor. Zero é válido.

Os nomes originais são usados tanto no envio quanto na resposta. O histórico
bruto sem metadado de unidade não é tratado como lux ou porcentagem nem
convertido retroativamente. Registros anteriores com `luminosidade_lux` e
`umidade_solo_percentual` continuam sendo consultados como valores convertidos.

## GET /sensores

Lista os dispositivos ESP32 (`id_controlador`) distintos presentes nas leituras,
com os tipos de planta relacionados a cada um, sem repetição. A associação é
histórica: se um controlador mudou de planta, ambas aparecem para consulta.
Não é uma lista de todos os tipos de medição nem de todas as plantas do catálogo.

`GET /sensores?id_controlador=1` filtra um dispositivo específico. A lista é
ordenada por controlador e tipo de planta. Sem dados, retorna `sensores: []`.

Exemplo ilustrativo:

```json
{
  "sensores": [
    {
      "id_controlador": 1,
      "plantas": [
        {
          "tipo_planta": 1,
          "nome": "Jiboia",
          "nome_cientifico": "Epipremnum aureum",
          "cadastrada": true
        }
      ]
    }
  ]
}
```

Se uma leitura referencia uma planta ausente no catálogo, a associação continua
na lista, com nomes `null` e `cadastrada: false`. Use o controlador e
`tipo_planta` escolhidos para consultar últimas válidas ou `/analises`.

## GET /leituras/historico/:id_controlador

Exemplo para consultar as leituras fictícias de setembro:

```http
GET /leituras/historico/999?tipo_planta=1&inicio=2026-09-01&fim=2026-09-30&pagina=1&limite=100
```

O histórico filtra controlador e planta. `tipo_planta` pode ser omitido quando
o controlador possui uma única planta no histórico. Com mais de uma, a API
exige a seleção, como na consulta das últimas válidas.

Parâmetros:

| Parâmetro | Comportamento |
| --- | --- |
| `inicio` | Opcional; início do intervalo, inclusivo. |
| `fim` | Opcional; fim do intervalo. |
| `pagina` | Inteiro positivo, padrão 1. |
| `limite` | Registros por página, padrão 100, máximo 1000. |
| `ordem` | `asc` (padrão, mais antigas primeiro) ou `desc`. |

Datas `AAAA-MM-DD` são interpretadas em São Paulo. `fim=2026-09-30` inclui
todo o dia 30: usa o início do dia 1º de outubro como limite exclusivo.
Datas e horas ISO UTC (`2026-09-30T12:00:00Z`, com milissegundos opcionais)
delimitam instantes exatos e inclusivos. Sem datas, consulta todo o histórico
até o momento atual, respeitando a paginação. Leituras futuras não são retornadas.

A resposta contém `planta`, `periodo`, `unidades`, `paginacao` e `leituras`.
`paginacao` informa página, limite, total de registros, total de páginas e
`tem_proxima`. Uma página após o fim retorna lista vazia mantendo o total.

Cada leitura contém ID, horários de medição e recebimento, os quatro sensores
com seus nomes originais, `media_ponderada`, `cobertura_pesos`, `notas` por sensor
e `dados_ficticios`. Medições ausentes ou inválidas permanecem `null`, sem
preenchimento com a leitura anterior. O histórico de ADC bruto não é apresentado
como lux ou porcentagem.

As notas históricas são calculadas na consulta com as referências e pesos
atuais do cadastro da planta, usando o mesmo método de `/analises`. Alterações
nesses parâmetros também alteram as notas calculadas para leituras antigas.
Se o tipo de planta não estiver no catálogo, as medições continuam disponíveis,
mas nome, pesos, notas e índice retornam `null`.

Para retornar as 720 leituras fictícias de setembro em uma única página:

```http
GET /leituras/historico/999?tipo_planta=1&inicio=2026-09-01&fim=2026-09-30&limite=1000
```

## GET /analises/:id_controlador

Exemplos:

```http
GET /analises/1
GET /analises/1?tipo_planta=1
```

Sem `tipo_planta`, a rota usa a planta da leitura mais recente do controlador.
Com o parâmetro, usa a planta informada, mesmo que ainda não haja leituras.
As consultas sempre filtram controlador e planta para não misturar espécies.

Os pesos ficam em `pesos_sensores` de cada documento da coleção `plantas`:

```json
{ "temperatura": 2, "umidade_ar": 1, "ldr": 2, "umidade_solo": 3 }
```

Esses são os pesos definidos pelo usuário, inicialmente iguais nas 100 plantas.
Podem ser ajustados individualmente no cadastro. A referência muda por planta,
usando seus próprios valores ideais e faixas. Pesos devem ser números finitos,
nunca negativos, com soma positiva. Peso zero desativa o sensor no índice.

`npm run configurar:pesos` reaplica os pesos acima às 100 plantas e verifica a
gravação. Reimportar o catálogo preserva pesos personalizados existentes.

### Cálculo do índice

Não se somam °C, lux e porcentagens diretamente. Cada sensor recebe uma nota
de proximidade à meta na escala 0–100:

- Valor ideal: nota 100.
- Limite inferior ou superior da faixa de referência: nota 50.
- Desvio de duas vezes a distância entre ideal e limite: nota 0.
- Entre esses pontos: queda linear, usando a tolerância do lado do desvio.

Fórmula: `nota = max(0, 100 - 50 * abs(valor - ideal) / tolerancia)`.
No valor ideal a nota é 100, inclusive quando o ideal coincide com um limite.

`media_ponderada = soma(nota * peso) / soma(pesos dos sensores válidos)`.

Medições `null`, inválidas e ADC bruto do histórico não entram na conta; valores
zero são válidos. `cobertura_pesos` indica a porcentagem do peso total disponível:
100 significa todos os sensores habilitados disponíveis. Sem sensor disponível,
o índice é `null`. A nota descreve proximidade às metas estimadas do catálogo,
não uma medição experimental da saúde da planta. O cálculo atual não diferencia
o período iluminado da noite; interpretar o componente de lux considerando a
metodologia de luz do catálogo.

### Resposta e períodos

A resposta contém `planta` (referências e pesos), `atual`, `diaria`, `semanal`
e `mensal`, além de `gerado_em` e `fuso_horario`.

- `atual`: média ponderada dos últimos valores válidos de cada sensor, com valor,
  nota, peso e `horario_atualizacao` individual. Não há limite de idade: conferir
  os horários para distinguir dados recentes de leituras antigas.
- `diaria`: da meia-noite de hoje até o momento da consulta.
- `semanal`: da meia-noite de segunda-feira até o momento da consulta.
- `mensal`: do primeiro dia do mês até o momento da consulta.

Os limites são calculados em `America/Sao_Paulo` e enviados como datas UTC.
Cada período contém `inicio`, `fim`, `media_ponderada`, `cobertura_pesos_media`,
`leituras_total`, `leituras_com_indice` e `sensores`. Para cada sensor, `media`
é a média numérica na unidade original, `nota_media` é a média das notas e
`quantidade` é a contagem das medições válidas.

A média ponderada de um período é a média aritmética dos índices calculados
para suas leituras válidas. Os pesos são recalculados por leitura conforme os
sensores disponíveis. Não é a nota calculada sobre as médias brutas. Leituras
totalmente nulas contam em `leituras_total`, mas não em `leituras_com_indice`.
Não há preenchimento de lacunas nem ponderação pelo tempo entre amostras.
Períodos sem dados retornam médias `null` e contagens zero. Resultados são
arredondados para duas casas decimais, sem arredondar etapas intermediárias.

`npm test` executa os testes de cálculo, períodos e rota sem acessar o banco.

## Calibração do ESP32

As configurações ficam em `../Esp32/Esp32.ino`. Os valores iniciais `-1`, `NAN`
e `LDR_NAO_CONFIGURADO` indicam calibração ausente. Enquanto não forem preenchidos,
as conversões retornam `null`; temperatura e umidade do ar continuam sendo
enviadas. O monitor serial mostra os valores brutos para calibração.

- `SOLO_ADC_SECO`: ADC medido no ponto definido como seco (0%).
- `SOLO_ADC_UMIDO`: ADC medido no ponto definido como bem úmido (100%).
- `LDR_ALIMENTACAO_MV`: tensão real do divisor, em milivolts.
- `LDR_RESISTOR_OHMS`: resistência fixa do divisor.
- `LDR_RESISTENCIA_10_LUX_OHMS`: resistência do LDR a 10 lux, do datasheet ou calibração.
- `LDR_GAMMA`: expoente da curva resistência/lux, do datasheet ou calibração.
- `LDR_LIGACAO`: `LDR_NO_VCC` ou `LDR_NO_GND`, conforme a montagem.

O percentual do solo é uma escala relativa à calibração, calculada por
`100 * (ADC - seco) / (umido - seco)` e limitada a 0–100. Os dois pontos devem
ser diferentes. Não representa uma medição do teor volumétrico de água.

O lux é uma estimativa pelo modelo `lux = 10 * (R10 / Rldr)^(1 / gamma)`.
A resistência é obtida do divisor usando `analogReadMilliVolts`. ADC saturado,
tensão fora do intervalo e parâmetros ausentes ou inválidos resultam em `null`.

Referências:

- [ADC calibrado do ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html)
- [Modelo de conversão do LDR](https://docs.wokwi.com/parts/wokwi-photoresistor-sensor)
- [Exemplo de calibração de sensor de solo](https://wiki.dfrobot.com/sen0193/)
