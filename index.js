const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ASKSUITE_API_KEY = process.env.ASKSUITE_API_KEY;

const CRITERIOS = `
- Cordialidade e saudação (15%): usou nome, foi educado, tom profissional
- Identificação da necessidade (20%): coletou datas, adultos, crianças
- Oferta de produto adequado (20%): apresentou opções com preço e benefícios
- Tentativa de conversão (25%): fez oferta direta de reserva, criou urgência
- Tratamento de objeções (10%): respondeu hesitações e contornou dúvidas
- Encerramento profissional (10%): agradeceu, disponibilizou contato
`;

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/buscar", async (req, res) => {
  const { companyId, dateInit, dateEnd, pageNumber, pageSize } = req.body;
  try {
    const response = await fetch("https://control.asksuite.com/api/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ASKSUITE_API_KEY,
      },
      body: JSON.stringify({
        companiesIds: [companyId],
        pageNumber: pageNumber || 1,
        pageSize: pageSize || 20,
        dateInit,
        dateEnd,
      }),
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/auditar", async (req, res) => {
  const { lead } = req.body;
  const descricao = `
Nome: ${lead.name || "Não informado"}
Atendente: ${lead.attendant || "Não atribuído"}
Plataforma: ${lead.platform || ""} / Canal: ${lead.source || ""}
Data: ${lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString("pt-BR") : ""}
Tem reserva: ${lead.hasReservation ? "Sim" : "Não"}
Solicitou preço: ${lead.requestPrice ? "Sim" : "Não"}
Data entrada: ${lead.arrivalDate || "Não informada"}
Data saída: ${lead.departureDate || "Não informada"}
Adultos: ${lead.adults || "Não informado"}
Crianças: ${lead.children || "Não informado"}
Etiquetas: ${lead.tagsString || "Nenhuma"}
Atendimento humano: ${lead.humanRequest ? "Sim" : "Não"}
Email: ${lead.email || "Não informado"}
Telefone: ${lead.phone || "Não informado"}
Valor cotação: ${lead.minTotalValuePriceQuote ? `${lead.currencyPriceQuote} ${lead.minTotalValuePriceQuote}` : "Não gerada"}
  `.trim();

  const prompt = `Você é especialista em auditoria de atendimento hoteleiro. Avalie este lead com base nos critérios abaixo.

CRITÉRIOS:
${CRITERIOS}

DADOS DO LEAD:
${descricao}

Responda APENAS em JSON válido, sem markdown:
{
  "scoreGeral": number,
  "conversao": "Sim" | "Não" | "Parcial",
  "scores": [
    {"nome":"Cordialidade","val":number},
    {"nome":"Identificação","val":number},
    {"nome":"Oferta","val":number},
    {"nome":"Conversão","val":number},
    {"nome":"Objeções","val":number},
    {"nome":"Encerramento","val":number}
  ],
  "resumo": "2 frases sobre este lead",
  "insights": [
    {"tipo":"ok","texto":"ponto positivo"},
    {"tipo":"warn","texto":"ponto de atenção"},
    {"tipo":"bad","texto":"ponto crítico"}
  ]
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    const txt = data.content.map((i) => i.text || "").join("");
    const result = JSON.parse(txt.replace(/```json|```/g, "").trim());
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
