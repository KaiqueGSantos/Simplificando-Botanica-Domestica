require("dotenv").config();

const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
app.use(express.json());

async function iniciar() {
  const cliente = new MongoClient(process.env.MONGODB_URI);
  await cliente.connect();

  const colecao = cliente
  .db("simplificando-botanica-domestica")
  .collection("leituras");

  app.post("/leituras", async (req, res) => {
    try {
        const dados = {
            ...req.body,
            horario_leitura: new Date(req.body.horario_leitura),
            horario_recebido: new Date()
        };

        await colecao.insertOne(dados);

        console.log("Dados enviados:", dados);
        res.status(201).json({ mensagem: "Dados salvos!" });
    } catch {
        res.status(500).json({ erro: "Erro ao salvar os dados." });
    }
  });

    app.get("/health", (req, res) => {
        res.json({ mensagem: "API acessivel!" });
    });

  app.listen(3000, "0.0.0.0", () => {
    console.log ("API iniciada na porta 3000");
  });
}

iniciar().catch(() => {
  console.error("Não foi possível conectar ao MongoDB.");
  process.exit(1);
});