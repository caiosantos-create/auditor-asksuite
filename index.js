const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors({ origin: "*" }));
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

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/debug", async (req, res) => {
  try {
    const response = await fetch("https://control.asksuite.com/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ASKSUITE_API_KEY },
      body: JSON.stringify({
        companiesIds: ["porto-de-galinhas-praia-hotel"],
        pageNumber: 1,
        pageSize: 5,
        dateInit: "2026-01-01",
        dateEnd: "2026-05-14"
      }),
    });
    const text = await response.text();
    res.send(`<pre>Status: ${response.status}\n\n${text}</pre>`);
  } catch(e) {
    res.send(`<pre>Erro: ${e.message}</pre>`);
  }
});

app.post("/buscar", async (req, res) => {
  const { companyId, dateInit, dateEnd, pageNumber, pageSize } = req.body;
  try {
    const response = await fetch("https://control.asksuite.com/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ASKSUITE_API_KEY },
      body: JSON.stringify({ companiesIds: [companyId], pageNumber: pageNumber || 1, pageSize: pageSize || 20, dateInit, dateEnd }),
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

  const prompt = `Você é especialista em auditoria de atendimento hoteleiro. Avalie este lead com base nos critérios abaixo.\n\nCRITÉRIOS:\n${CRITERIOS}\n\nDADOS DO LEAD:\n${descricao}\n\nResponda APENAS em JSON válido, sem markdown:\n{\n  "scoreGeral": number,\n  "conversao": "Sim" | "Não" | "Parcial",\n  "scores": [\n    {"nome":"Cordialidade","val":number},\n    {"nome":"Identificação","val":number},\n    {"nome":"Oferta","val":number},\n    {"nome":"Conversão","val":number},\n    {"nome":"Objeções","val":number},\n    {"nome":"Encerramento","val":number}\n  ],\n  "resumo": "2 frases sobre este lead",\n  "insights": [\n    {"tipo":"ok","texto":"ponto positivo"},\n    {"tipo":"warn","texto":"ponto de atenção"},\n    {"tipo":"bad","texto":"ponto crítico"}\n  ]\n}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await response.json();
    const txt = data.content.map((i) => i.text || "").join("");
    const result = JSON.parse(txt.replace(/```json|```/g, "").trim());
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Auditor de Atendimento</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;color:#1a1a1a}
.header{background:#fff;border-bottom:1px solid #e5e5e5;padding:16px 24px;display:flex;justify-content:space-between;align-items:center}
.header h1{font-size:18px;font-weight:600}
.header p{font-size:12px;color:#666;margin-top:2px}
.tag{background:#E1F5EE;color:#085041;font-size:11px;padding:4px 10px;border-radius:6px;font-weight:500}
.container{max-width:900px;margin:0 auto;padding:24px}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:20px;margin-bottom:16px}
.card h2{font-size:15px;font-weight:600;margin-bottom:16px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
label{font-size:12px;color:#666;display:block;margin-bottom:4px}
input{width:100%;border:1px solid #ddd;border-radius:8px;padding:8px 10px;font-size:13px}
.btn{background:#1a1a1a;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:500;cursor:pointer;width:100%;margin-top:4px}
.btn:disabled{opacity:0.4;cursor:not-allowed}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.metric{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:16px;text-align:center}
.metric-label{font-size:12px;color:#666;margin-bottom:4px}
.metric-val{font-size:26px;font-weight:600}
.blue{color:#2563eb}.green{color:#16a34a}.amber{color:#d97706}.red{color:#dc2626}
.conv-card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin-bottom:8px}
.conv-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
.badge{font-size:11px;padding:3px 10px;border-radius:20px;font-weight:500}
.b-green{background:#dcfce7;color:#15803d}
.b-amber{background:#fef3c7;color:#92400e}
.b-red{background:#fee2e2;color:#991b1b}
.scores{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:#555;margin:8px 0}
.resumo{font-size:13px;color:#444;line-height:1.5;border-top:1px solid #f0f0f0;padding-top:8px;margin-top:8px}
.prog-wrap{background:#f0f0f0;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center}
.prog-bar{height:6px;border-radius:3px;background:#e5e5e5;margin:10px 0 6px}
.prog-fill{height:100%;border-radius:3px;background:#16a34a;transition:width 0.4s}
.prog-title{font-size:14px;font-weight:600}
.prog-info{font-size:12px;color:#666}
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>Auditor de Atendimento</h1>
    <p>The Westin Porto de Galinhas · Powered by Claude AI</p>
  </div>
  <span class="tag">Servidor online</span>
</div>
<div class="container">
  <div class="card">
    <h2>Parâmetros de busca</h2>
    <label>Company ID</label>
    <input type="text" id=
