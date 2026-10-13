require("dotenv").config();

const express = require("express");
const { MongoClient } = require("mongodb");

const SENSORES = ["temperatura", "umidade_ar", "ldr", "umidade_solo"];
const PESOS = { temperatura: 2, umidade_ar: 1, ldr: 2, umidade_solo: 3 };
const UNIDADES = {
  temperatura: "°C",
  umidade_ar: "%",
  ldr: "lux",
  umidade_solo: "%",
};
const ANTERIORES = {
  ldr: "luminosidade_lux",
  umidade_solo: "umidade_solo_percentual",
};
const FUSO = "America/Sao_Paulo";

function numeroValido(valor, campo) {
  const min = campo === "temperatura" ? -40 : 0;
  const max =
    campo === "temperatura" ? 80 : campo === "ldr" ? Number.MAX_VALUE : 100;

  return (
    typeof valor === "number" &&
    Number.isFinite(valor) &&
    valor >= min &&
    valor <= max
  );
}

// Evita apresentar leituras antigas de ADC como lux ou porcentagem.
function valores(leitura) {
  const resultado = {};

  for (const campo of SENSORES) {
    const convertido =
      !ANTERIORES[campo] ||
      leitura.unidades?.[campo] === UNIDADES[campo] ||
      leitura.modo_unidades === "calibradas";

    const valor =
      convertido && numeroValido(leitura[campo], campo)
        ? leitura[campo]
        : leitura[ANTERIORES[campo]];

    resultado[campo] = numeroValido(valor, campo) ? valor : null;
  }

  return resultado;
}

function arredondar(valor) {
  return valor === null ? null : Number(valor.toFixed(2));
}

// Índice de proximidade às referências do catálogo.
function pontuar(dados, planta) {
  const notas = {};
  const pesos = { ...PESOS, ...planta?.pesos_sensores };
  let soma = 0;
  let disponivel = 0;
  let total = 0;

  for (const campo of SENSORES) {
    const peso =
      Number.isFinite(pesos[campo]) && pesos[campo] >= 0
        ? pesos[campo]
        : PESOS[campo];

    const ideal = planta?.valores_ideais?.[campo];
    const faixa = planta?.faixas_referencia?.[campo];
    let nota = null;

    if (
      dados[campo] !== null &&
      Number.isFinite(ideal) &&
      Number.isFinite(faixa?.min) &&
      Number.isFinite(faixa?.max) &&
      faixa.min < faixa.max &&
      ideal >= faixa.min &&
      ideal <= faixa.max
    ) {
      const tolerancia =
        dados[campo] < ideal ? ideal - faixa.min : faixa.max - ideal;

      nota =
        dados[campo] === ideal
          ? 100
          : tolerancia > 0
            ? Math.max(
                0,
                100 - 50 * Math.abs(dados[campo] - ideal) / tolerancia
              )
            : 0;
    }

    notas[campo] = nota;
    total += peso;

    if (nota !== null) {
      soma += nota * peso;
      disponivel += peso;
    }
  }

  return {
    notas,
    media_ponderada: disponivel ? soma / disponivel : null,
    cobertura_pesos: total ? 100 * disponivel / total : 0,
  };
}

function resumir(documentos, planta) {
  let soma = 0;
  let quantidade = 0;
  let cobertura = 0;

  const sensores = Object.fromEntries(
    SENSORES.map(campo => [
      campo,
      { media: 0, soma_notas: 0, quantidade: 0, notas_validas: 0 },
    ])
  );

  for (const documento of documentos) {
    const dados = valores(documento);
    const indice = pontuar(dados, planta);

    if (indice.media_ponderada !== null) {
      soma += indice.media_ponderada;
      cobertura += indice.cobertura_pesos;
      quantidade++;
    }

    for (const campo of SENSORES) {
      if (dados[campo] === null) continue;

      const sensor = sensores[campo];
      sensor.quantidade++;
      sensor.media += (dados[campo] - sensor.media) / sensor.quantidade;

      if (indice.notas[campo] !== null) {
        sensor.soma_notas += indice.notas[campo];
        sensor.notas_validas++;
      }
    }
  }

  for (const campo of SENSORES) {
    const sensor = sensores[campo];

    sensores[campo] = {
      media: sensor.quantidade ? arredondar(sensor.media) : null,
      nota_media: sensor.notas_validas
        ? arredondar(sensor.soma_notas / sensor.notas_validas)
        : null,
      quantidade: sensor.quantidade,
    };
  }

  return {
    media_ponderada: quantidade ? arredondar(soma / quantidade) : null,
    cobertura_pesos_media: quantidade
      ? arredondar(cobertura / quantidade)
      : null,
    leituras_total: documentos.length,
    leituras_com_indice: quantidade,
    sensores,
  };
}

function falha(mensagem, status = 400) {
  throw Object.assign(new Error(mensagem), { status });
}

function idValido(valor) {
  const id = Number(valor);

  if (!Number.isSafeInteger(id) || id < 1) {
    falha("Informe um ID inteiro positivo.");
  }

  return id;
}

function dataConsulta(texto, fim = false) {
  if (
    typeof texto !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/.test(texto)
  ) {
    falha("Use uma data AAAA-MM-DD ou um horário ISO UTC com Z.");
  }

  const dia = texto.length === 10;
  const data = new Date(dia ? `${texto}T00:00:00-03:00` : texto);

  if (
    !Number.isFinite(data.getTime()) ||
    data.toISOString().slice(0, dia ? 10 : 19) !==
      texto.slice(0, dia ? 10 : 19)
  ) {
    falha("Data inválida.");
  }

  if (dia && fim) data.setUTCDate(data.getUTCDate() + 1);

  return data;
}

function criarApp(banco) {
  const app = express();
  app.use(express.json());

  // Permite consultas do frontend durante o desenvolvimento local.
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") return res.sendStatus(204);

    next();
  });

  const leituras = banco.collection("leituras");
  const plantas = banco.collection("plantas");

  const rota = funcao => (req, res, next) =>
    Promise.resolve()
      .then(() => funcao(req, res))
      .catch(next);

  async function selecionar(req) {
    const id = idValido(req.params.id_controlador);
    const tipos = await leituras.distinct("tipo_planta", {
      id_controlador: id,
    });

    if (!tipos.length) falha("Controlador sem leituras.", 404);

    if (req.query.tipo_planta === undefined && tipos.length > 1) {
      falha("Informe tipo_planta para selecionar a planta.");
    }

    const tipo =
      req.query.tipo_planta === undefined
        ? tipos[0]
        : idValido(req.query.tipo_planta);

    if (!tipos.includes(tipo)) {
      falha("Planta não associada ao controlador.", 404);
    }

    return {
      id_controlador: id,
      tipo_planta: tipo,
      horario_leitura: { $type: "date", $lte: new Date() },
    };
  }

  async function ultimas(filtro) {
    const sensores = {};

    for (const campo of SENSORES) {
      const faixa = {
        $type: "number",
        $gte: campo === "temperatura" ? -40 : 0,
        $lte:
          campo === "temperatura"
            ? 80
            : campo === "ldr"
              ? Number.MAX_VALUE
              : 100,
      };

      const condicao = ANTERIORES[campo]
        ? {
            $or: [
              {
                [campo]: faixa,
                [`unidades.${campo}`]: UNIDADES[campo],
              },
              { [campo]: faixa, modo_unidades: "calibradas" },
              { [ANTERIORES[campo]]: faixa },
            ],
          }
        : { [campo]: faixa };

      const leitura = await leituras.findOne(
        { ...filtro, ...condicao },
        { sort: { horario_leitura: -1, _id: -1 } }
      );

      sensores[campo] = {
        valor: leitura ? valores(leitura)[campo] : null,
        horario_atualizacao: leitura?.horario_leitura ?? null,
        unidade: UNIDADES[campo],
      };
    }

    return sensores;
  }

  app.get("/health", (req, res) => {
    res.json({ mensagem: "API acessível!" });
  });

  app.get("/plantas", rota(async (req, res) => {
    const catalogo = await plantas
      .find({}, { projection: { _id: 0 } })
      .sort({ id: 1 })
      .toArray();

    res.json(catalogo);
  }));

  app.post("/leituras", rota(async (req, res) => {
    const dados = req.body;

    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
      falha("Envie um objeto JSON.");
    }

    const id = idValido(dados.id_controlador);
    const tipo = idValido(dados.tipo_planta);

    if (
      typeof dados.horario_leitura !== "string" ||
      !dados.horario_leitura.includes("T")
    ) {
      falha("Informe horario_leitura em ISO UTC.");
    }

    const horario = dataConsulta(dados.horario_leitura);

    if (horario > Date.now() + 300000) {
      falha("Horário mais de cinco minutos no futuro.");
    }

    const leitura = {
      id_controlador: id,
      tipo_planta: tipo,
      horario_leitura: horario,
      horario_recebido: new Date(),
      unidades: UNIDADES,
    };

    // Sensor ausente ou inválido vira null, sem perder os demais.
    for (const campo of SENSORES) {
      leitura[campo] = numeroValido(dados[campo], campo)
        ? dados[campo]
        : null;
    }

    await leituras.insertOne(leitura);

    res.status(201).json({ mensagem: "Dados salvos!" });
  }));

  app.get("/sensores", rota(async (req, res) => {
    const filtro =
      req.query.id_controlador === undefined
        ? {}
        : { id_controlador: idValido(req.query.id_controlador) };

    const grupos = await leituras.aggregate([
      { $match: filtro },
      {
        $group: {
          _id: "$id_controlador",
          tipos: { $addToSet: "$tipo_planta" },
        },
      },
      { $sort: { _id: 1 } },
    ]).toArray();

    const catalogo = await plantas.find(
      {},
      { projection: { id: 1, nome: 1, nome_cientifico: 1 } }
    ).toArray();

    res.json({
      sensores: grupos.map(grupo => ({
        id_controlador: grupo._id,
        plantas: grupo.tipos.sort((a, b) => a - b).map(tipo => {
          const planta = catalogo.find(p => p.id === tipo);

          return {
            tipo_planta: tipo,
            nome: planta?.nome ?? null,
            nome_cientifico: planta?.nome_cientifico ?? null,
            cadastrada: !!planta,
          };
        }),
      })),
    });
  }));

  app.get("/leituras/ultimas-validas/:id_controlador", rota(async (req, res) => {
    const filtro = await selecionar(req);
    const planta = await plantas.findOne(
      { id: filtro.tipo_planta },
      { projection: { _id: 0 } }
    );

    res.json({
      id_controlador: filtro.id_controlador,
      tipo_planta: filtro.tipo_planta,
      planta,
      sensores: await ultimas(filtro),
    });
  }));

  app.get("/leituras/historico/:id_controlador", rota(async (req, res) => {
    const pagina = idValido(req.query.pagina ?? 1);
    const limite = idValido(req.query.limite ?? 100);

    if (
      limite > 1000 ||
      !Number.isSafeInteger((pagina - 1) * limite)
    ) {
      falha("Limite máximo de 1000; confira a página.");
    }

    if (
      req.query.ordem &&
      !["asc", "desc"].includes(req.query.ordem)
    ) {
      falha("ordem deve ser asc ou desc.");
    }

    const filtro = await selecionar(req);

    if (req.query.inicio) {
      filtro.horario_leitura.$gte = dataConsulta(req.query.inicio);
    }

    if (req.query.fim) {
      filtro.horario_leitura.$lt = dataConsulta(req.query.fim, true);
    }

    if (filtro.horario_leitura.$gte >= filtro.horario_leitura.$lt) {
      falha("inicio deve ser anterior a fim.");
    }

    const planta = await plantas.findOne({ id: filtro.tipo_planta });
    const ordem = req.query.ordem === "desc" ? -1 : 1;
    const total = await leituras.countDocuments(filtro);

    const documentos = await leituras
      .find(filtro)
      .sort({ horario_leitura: ordem, _id: ordem })
      .skip((pagina - 1) * limite)
      .limit(limite)
      .toArray();

    res.json({
      id_controlador: filtro.id_controlador,
      tipo_planta: filtro.tipo_planta,
      unidades: UNIDADES,
      paginacao: {
        pagina,
        limite,
        total,
        total_paginas: Math.ceil(total / limite),
      },
      leituras: documentos.map(leitura => {
        const dados = valores(leitura);
        const indice = pontuar(dados, planta);

        return {
          id: leitura._id.toString(),
          horario_leitura: leitura.horario_leitura,
          horario_recebido: leitura.horario_recebido ?? null,
          ...dados,
          media_ponderada: arredondar(indice.media_ponderada),
          cobertura_pesos: arredondar(indice.cobertura_pesos),
        };
      }),
    });
  }));

  app.get("/analises/:id_controlador", rota(async (req, res) => {
    const filtro = await selecionar(req);
    const planta = await plantas.findOne(
      { id: filtro.tipo_planta },
      { projection: { _id: 0 } }
    );

    if (!planta) {
      falha("Importe o catálogo na coleção plantas.", 404);
    }

    const sensores = await ultimas(filtro);
    const dadosAtuais = Object.fromEntries(
      SENSORES.map(campo => [campo, sensores[campo].valor])
    );
    const indice = pontuar(dadosAtuais, planta);
    const agora = filtro.horario_leitura.$lte;

    // São Paulo: UTC-3. Semana começa na segunda-feira.
    const hoje = agora.toLocaleDateString("sv-SE", { timeZone: FUSO });
    const diaria = dataConsulta(hoje);
    const semanal = new Date(diaria);

    semanal.setUTCDate(
      semanal.getUTCDate() - (semanal.getUTCDay() + 6) % 7
    );

    const mensal = dataConsulta(`${hoje.slice(0, 7)}-01`);
    const inicio = new Date(
      Math.min(semanal.getTime(), mensal.getTime())
    );

    const documentos = await leituras.find({
      ...filtro,
      horario_leitura: {
        ...filtro.horario_leitura,
        $gte: inicio,
      },
    }).toArray();

    const resposta = {
      id_controlador: filtro.id_controlador,
      tipo_planta: filtro.tipo_planta,
      gerado_em: agora,
      fuso_horario: FUSO,
      planta,
      atual: {
        sensores,
        media_ponderada: arredondar(indice.media_ponderada),
        cobertura_pesos: arredondar(indice.cobertura_pesos),
      },
    };

    for (const [nome, data] of Object.entries({ diaria, semanal, mensal })) {
      resposta[nome] = {
        inicio: data,
        fim: agora,
        ...resumir(
          documentos.filter(leitura => leitura.horario_leitura >= data),
          planta
        ),
      };
    }

    res.json(resposta);
  }));

  app.use((req, res) => {
    res.status(404).json({ erro: "Rota não encontrada." });
  });

  app.use((erro, req, res, next) => {
    const status =
      erro.status >= 400 && erro.status < 500 ? erro.status : 500;

    if (status === 500) console.error("Erro na API:", erro.name);

    res.status(status).json({
      erro:
        status === 500
          ? "Não foi possível processar a requisição."
          : erro.message,
    });
  });

  return app;
}

async function iniciar() {
  if (!process.env.MONGODB_URI) {
    throw new Error("Defina MONGODB_URI no .env.");
  }

  const cliente = new MongoClient(process.env.MONGODB_URI);
  await cliente.connect();

  const banco = cliente.db("simplificando-botanica-domestica");

  await banco.collection("leituras").createIndex({
    id_controlador: 1,
    tipo_planta: 1,
    horario_leitura: -1,
  });

  criarApp(banco).listen(3000, "0.0.0.0", () => {
    console.log("API iniciada na porta 3000");
  });
}

if (require.main === module) {
  iniciar().catch(erro => {
    console.error(
      "Falha ao iniciar:",
      erro.name === "Error" ? erro.message : erro.name
    );
    process.exitCode = 1;
  });
}

module.exports = { criarApp };