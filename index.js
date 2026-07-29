const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ASKSUITE_API_KEY = process.env.ASKSUITE_API_KEY;
const GHL_API_KEY = process.env.GHL_API_KEY;

const CRITERIOS = [
  "Cordialidade e saudacao (15%): usou nome, foi educado, tom profissional",
  "Identificacao da necessidade (20%): coletou datas, adultos, criancas",
  "Oferta de produto adequado (20%): apresentou opcoes com preco e beneficios",
  "Tentativa de conversao (25%): fez oferta direta de reserva, criou urgencia",
  "Tratamento de objecoes (10%): respondeu hesitacoes e contornou duvidas",
  "Encerramento profissional (10%): agradeceu, disponibilizou contato"
].join("\n");

app.get("/health", function(req, res) {
  res.json({ status: "ok", anthropic_key: ANTHROPIC_API_KEY ? "definida" : "AUSENTE", ghl_key: GHL_API_KEY ? "definida" : "AUSENTE" });
});

app.get("/testar-anthropic", async function(req, res) {
  try {
    var response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 50, messages: [{ role: "user", content: "responda apenas: ok" }] })
    });
    var data = await response.json();
    res.send("<pre>" + JSON.stringify(data, null, 2) + "</pre>");
  } catch(e) {
    res.send("<pre>Erro: " + e.message + "</pre>");
  }
});

app.post("/buscar", async function(req, res) {
  try {
    var response = await fetch("https://control.asksuite.com/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": ASKSUITE_API_KEY },
      body: JSON.stringify({ companiesIds: [req.body.companyId], pageNumber: req.body.pageNumber || 1, pageSize: req.body.pageSize || 20, dateInit: req.body.dateInit, dateEnd: req.body.dateEnd })
    });
    var data = await response.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/auditar", async function(req, res) {
  var lead = req.body.lead;
  var descricao = [
    "Nome: " + (lead.name || "Nao informado"),
    "Atendente: " + (lead.attendant || "Nao atribuido"),
    "Tem reserva: " + (lead.hasReservation ? "Sim" : "Nao"),
    "Solicitou preco: " + (lead.requestPrice ? "Sim" : "Nao"),
    "Data entrada: " + (lead.arrivalDate || "Nao informada"),
    "Data saida: " + (lead.departureDate || "Nao informada"),
    "Adultos: " + (lead.adults || "Nao informado"),
    "Criancas: " + (lead.children || "Nao informado"),
    "Etiquetas: " + (lead.tagsString || "Nenhuma")
  ].join("\n");
  var prompt = "Voce e especialista em auditoria de atendimento hoteleiro. Avalie este lead.\n\nCRITERIOS:\n" + CRITERIOS + "\n\nDADOS:\n" + descricao + "\n\nResponda APENAS em JSON valido sem markdown: {\"scoreGeral\": 70, \"conversao\": \"Nao\", \"scores\": [{\"nome\":\"Cordialidade\",\"val\":70},{\"nome\":\"Identificacao\",\"val\":70},{\"nome\":\"Oferta\",\"val\":70},{\"nome\":\"Conversao\",\"val\":70},{\"nome\":\"Objecoes\",\"val\":70},{\"nome\":\"Encerramento\",\"val\":70}], \"resumo\": \"texto aqui\", \"insights\": [{\"tipo\":\"ok\",\"texto\":\"texto\"},{\"tipo\":\"warn\",\"texto\":\"texto\"},{\"tipo\":\"bad\",\"texto\":\"texto\"}]}";
  try {
    var response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 800, messages: [{ role: "user", content: prompt }] })
    });
    var data = await response.json();
    if (data.error) { res.status(500).json({ error: data.error.message }); return; }
    var txt = data.content.map(function(i) { return i.text || ""; }).join("");
    res.json(JSON.parse(txt.replace(/```json|```/g, "").trim()));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/ghl/conversas", async function(req, res) {
  try {
    var locationId = req.body.locationId;
    var limit = req.body.limit || 20;
    var url = "https://services.leadconnectorhq.com/conversations/search?locationId=" + locationId + "&limit=" + limit;
    if (req.body.startDate) url += "&startDate=" + req.body.startDate;
    if (req.body.endDate) url += "&endDate=" + req.body.endDate;
    var response = await fetch(url, {
      headers: { "Authorization": "Bearer " + GHL_API_KEY, "Version": "2021-07-28", "Accept": "application/json" }
    });
    var data = await response.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/ghl/mensagens", async function(req, res) {
  try {
    var response = await fetch("https://services.leadconnectorhq.com/conversations/" + req.body.conversationId + "/messages?limit=50", {
      headers: { "Authorization": "Bearer " + GHL_API_KEY, "Version": "2021-07-28", "Accept": "application/json" }
    });
    var data = await response.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/ghl/auditar", async function(req, res) {
  var conv = req.body.conversa;
  var historico = req.body.historico || "Historico nao disponivel";
  var descricao = [
    "Contato: " + (conv.contactName || "Nao informado"),
    "Atendente: " + (conv.assignedTo || "Nao atribuido"),
    "Canal: WhatsApp",
    "Status: " + (conv.status || ""),
    "Ultima mensagem: " + (conv.lastMessageDate ? new Date(conv.lastMessageDate).toLocaleDateString("pt-BR") : "")
  ].join("\n");
  var prompt = "Voce e especialista em auditoria de atendimento hoteleiro. Avalie esta conversa de WhatsApp.\n\nCRITERIOS:\n" + CRITERIOS + "\n\nDADOS DO CONTATO:\n" + descricao + "\n\nHISTORICO DA CONVERSA:\n" + historico + "\n\nResponda APENAS em JSON valido sem markdown: {\"scoreGeral\": 70, \"conversao\": \"Nao\", \"scores\": [{\"nome\":\"Cordialidade\",\"val\":70},{\"nome\":\"Identificacao\",\"val\":70},{\"nome\":\"Oferta\",\"val\":70},{\"nome\":\"Conversao\",\"val\":70},{\"nome\":\"Objecoes\",\"val\":70},{\"nome\":\"Encerramento\",\"val\":70}], \"resumo\": \"texto aqui\", \"insights\": [{\"tipo\":\"ok\",\"texto\":\"texto\"},{\"tipo\":\"warn\",\"texto\":\"texto\"},{\"tipo\":\"bad\",\"texto\":\"texto\"}]}";
  try {
    var response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 800, messages: [{ role: "user", content: prompt }] })
    });
    var data = await response.json();
    if (data.error) { res.status(500).json({ error: data.error.message }); return; }
    var txt = data.content.map(function(i) { return i.text || ""; }).join("");
    res.json(JSON.parse(txt.replace(/```json|```/g, "").trim()));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/", function(req, res) {
  var html = [];
  html.push('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auditor TAG</title>');
  html.push('<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f5f5f5;color:#1a1a1a}.header{background:#fff;border-bottom:1px solid #e5e5e5;padding:16px 24px;display:flex;justify-content:space-between;align-items:center}.header h1{font-size:18px;font-weight:600}.header p{font-size:12px;color:#666;margin-top:2px}.online{background:#E1F5EE;color:#085041;font-size:11px;padding:4px 10px;border-radius:6px;font-weight:500}.container{max-width:960px;margin:0 auto;padding:24px}.tabs{display:flex;gap:8px;margin-bottom:20px}.tabBtn{padding:8px 18px;border-radius:8px;border:1px solid #ddd;background:#fff;font-size:13px;cursor:pointer;font-weight:500}.tabBtn.active{background:#1a1a1a;color:#fff;border-color:#1a1a1a}.section{display:none}.section.active{display:block}.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:20px;margin-bottom:16px}.card h2{font-size:15px;font-weight:600;margin-bottom:16px}.frow{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}label{font-size:12px;color:#666;display:block;margin-bottom:4px}input{width:100%;border:1px solid #ddd;border-radius:8px;padding:8px 10px;font-size:13px}.btn{background:#1a1a1a;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:500;cursor:pointer;width:100%;margin-top:12px}.btn:disabled{opacity:0.4;cursor:not-allowed}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}.metric{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:16px;text-align:center}.mlabel{font-size:12px;color:#666;margin-bottom:4px}.mval{font-size:26px;font-weight:600}.blue{color:#2563eb}.green{color:#16a34a}.amber{color:#d97706}.red{color:#dc2626}.ccard{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin-bottom:8px}.cheader{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}.badge{font-size:11px;padding:3px 10px;border-radius:20px;font-weight:500}.bg{background:#dcfce7;color:#15803d}.ba{background:#fef3c7;color:#92400e}.br{background:#fee2e2;color:#991b1b}.scores{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:#555;margin:6px 0}.resumo{font-size:12px;color:#444;line-height:1.5;border-top:1px solid #f0f0f0;padding-top:8px;margin-top:6px}.prog{background:#f0f0f0;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center}.pbar{height:6px;border-radius:3px;background:#e5e5e5;margin:10px 0 6px}.pfill{height:100%;border-radius:3px;background:#16a34a;transition:width 0.4s}.ptitle{font-size:14px;font-weight:600}.pinfo{font-size:12px;color:#666}</style>');
  html.push('</head><body>');
  html.push('<div class="header"><div><h1>Auditor de Atendimento &middot; TAG</h1><p>GoHighLevel + Asksuite &middot; Powered by Claude AI</p></div><span class="online">Servidor online</span></div>');
  html.push('<div class="container">');
  html.push('<div class="tabs"><button class="tabBtn active" onclick="switchTab(\'ghl\',this)">BNB Flex (GHL)</button><button class="tabBtn" onclick="switchTab(\'ask\',this)">Westin (Asksuite)</button></div>');
  html.push('<div id="ghl" class="section active"><div class="card"><h2>BNB Flex &mdash; WhatsApp</h2>');
  html.push('<div class="frow"><div><label>Data inicio</label><input type="date" id="gDateInit"></div><div><label>Data fim</label><input type="date" id="gDateEnd"></div></div>');
  html.push('<label>Limite de conversas</label><input type="number" id="gLimit" value="20"><button class="btn" id="gBtn" onclick="buscarGHL()">Buscar e auditar</button></div>');
  html.push('<div id="gProg" style="display:none" class="prog"><div class="ptitle" id="gPT">Buscando...</div><div class="pbar"><div class="pfill" id="gPF" style="width:0%"></div></div><div class="pinfo" id="gPI"></div></div>');
  html.push('<div id="gMetrics" style="display:none" class="metrics"><div class="metric"><div class="mlabel">Auditadas</div><div class="mval blue" id="gT">0</div></div><div class="metric"><div class="mlabel">Convertidas</div><div class="mval green" id="gC">0%</div></div><div class="metric"><div class="mlabel">Score medio</div><div class="mval amber" id="gS">0</div></div><div class="metric"><div class="mlabel">Criticas</div><div class="mval red" id="gCr">0</div></div></div>');
  html.push('<div id="gLista"></div></div>');
  html.push('<div id="ask" class="section"><div class="card"><h2>Westin Porto de Galinhas &mdash; Leads</h2>');
  html.push('<div class="frow"><div><label>Data inicio</label><input type="date" id="aDateInit"></div><div><label>Data fim</label><input type="date" id="aDateEnd"></div></div>');
  html.push('<div class="frow"><div><label>Por pagina</label><input type="number" id="aPageSize" value="20"></div><div><label>Pagina</label><input type="number" id="aPageNum" value="1"></div></div>');
  html.push('<button class="btn" id="aBtn" onclick="buscarASK()">Buscar e auditar</button></div>');
  html.push('<div id="aProg" style="display:none" class="prog"><div class="ptitle" id="aPT">Buscando...</div><div class="pbar"><div class="pfill" id="aPF" style="width:0%"></div></div><div class="pinfo" id="aPI"></div></div>');
  html.push('<div id="aMetrics" style="display:none" class="metrics"><div class="metric"><div class="mlabel">Auditadas</div><div class="mval blue" id="aT">0</div></div><div class="metric"><div class="mlabel">Convertidas</div><div class="mval green" id="aC">0%</div></div><div class="metric"><div class="mlabel">Score medio</div><div class="mval amber" id="aS">0</div></div><div class="metric"><div class="mlabel">Criticas</div><div class="mval red" id="aCr">0</div></div></div>');
  html.push('<div id="aLista"></div></div></div>');
  html.push('<script>');
  html.push('var gAud=[],aAud=[];');
  html.push('function cor(v){return v>=75?"#16a34a":v>=50?"#d97706":"#dc2626";}');
  html.push('function switchTab(id,el){document.querySelectorAll(".section").forEach(function(s){s.classList.remove("active");});document.querySelectorAll(".tabBtn").forEach(function(t){t.classList.remove("active");});document.getElementById(id).classList.add("active");el.classList.add("active");}');
  html.push('function setP(p,pct,t,i){document.getElementById(p+"PF").style.width=pct+"%";document.getElementById(p+"PT").textContent=t;document.getElementById(p+"PI").textContent=i;}');
  html.push('function renderLista(auds,p){var n=auds.length;if(!n)return;document.getElementById(p+"Metrics").style.display="grid";var conv=auds.filter(function(a){return a.conversao==="Sim";}).length;document.getElementById(p+"T").textContent=n;document.getElementById(p+"C").textContent=Math.round(conv/n*100)+"%";document.getElementById(p+"S").textContent=Math.round(auds.reduce(function(s,a){return s+(a.scoreGeral||0);},0)/n)+"/100";document.getElementById(p+"Cr").textContent=auds.filter(function(a){return(a.scoreGeral||0)<50;}).length;document.getElementById(p+"Lista").innerHTML=auds.map(function(a){var cb=a.conversao==="Sim"?"bg":a.conversao==="Parcial"?"ba":"br";var ct=a.conversao==="Sim"?"Convertido":a.conversao==="Parcial"?"Parcial":"Nao convertido";return"<div class=\'ccard\'><div class=\'cheader\'><div><strong>"+(a.meta&&a.meta.nome?a.meta.nome:"Contato")+"</strong><div style=\'font-size:12px;color:#666;margin-top:2px\'>"+(a.meta&&a.meta.atendente?a.meta.atendente+" - ":"")+(a.meta&&a.meta.data?a.meta.data:"")+"</div></div><div style=\'display:flex;gap:6px;align-items:center\'><span class=\'badge "+cb+"\'>"+ct+"</span><span style=\'font-size:18px;font-weight:600;color:"+cor(a.scoreGeral||0)+"\'>"+( a.scoreGeral||0)+"/100</span></div></div><div class=\'scores\'>"+(a.scores||[]).map(function(s){return"<span>"+s.nome+": <strong style=\'color:"+cor(s.val)+"\'>"+s.val+"</strong></span>";}).join("")+"</div><div class=\'resumo\'>"+(a.resumo||"")+"</div></div>";}).join("");}');
  html.push('async function buscarGHL(){var dateInit=document.getElementById("gDateInit").value;var dateEnd=document.getElementById("gDateEnd").value;var limit=parseInt(document.getElementById("gLimit").value)||20;var btn=document.getElementById("gBtn");btn.disabled=true;btn.textContent="Processando...";document.getElementById("gProg").style.display="block";setP("g",10,"Conectando ao GHL...","Buscando conversas WhatsApp");try{var body={locationId:"mhlYful3Ik0RINNWJ6FO",limit:limit};if(dateInit)body.startDate=new Date(dateInit).getTime();if(dateEnd)body.endDate=new Date(dateEnd+"T23:59:59").getTime();var r=await fetch("/ghl/conversas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});var data=await r.json();var convs=data.conversations||[];if(!convs.length){setP("g",100,"Nenhuma conversa encontrada","Tente outro periodo");btn.disabled=false;btn.textContent="Buscar e auditar";return;}setP("g",30,convs.length+" conversas encontradas!","Auditando com IA...");gAud=[];for(var i=0;i<convs.length;i++){setP("g",Math.round(30+(i/convs.length)*65),"Auditando "+(i+1)+" de "+convs.length+"...","Contato: "+(convs[i].contactName||convs[i].id));try{var mr=await fetch("/ghl/mensagens",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversationId:convs[i].id})});var md=await mr.json();var msgs=(md.messages&&md.messages.messages)||md.messages||[];var historico=msgs.map(function(m){return(m.direction==="inbound"?"Cliente":"Atendente")+": "+(m.body||m.text||"[midia]");}).join("\\n");var ar=await fetch("/ghl/auditar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversa:convs[i],historico:historico})});var resultado=await ar.json();if(resultado.scoreGeral){resultado.meta={nome:convs[i].contactName||"Contato",atendente:convs[i].assignedTo||null,data:convs[i].lastMessageDate?new Date(convs[i].lastMessageDate).toLocaleDateString("pt-BR"):""};gAud.push(resultado);renderLista(gAud,"g");}}catch(e){console.error("Erro auditando",convs[i].id,e);}await new Promise(function(r){setTimeout(r,500);});}setP("g",100,"Auditoria concluida! "+gAud.length+" conversas","");}catch(e){setP("g",0,"Erro: "+e.message,"");}btn.disabled=false;btn.textContent="Buscar e auditar";}');
  html.push('async function buscarASK(){var dateInit=document.getElementById("aDateInit").value;var dateEnd=document.getElementById("aDateEnd").value;var pageSize=parseInt(document.getElementById("aPageSize").value)||20;var pageNum=parseInt(document.getElementById("aPageNum").value)||1;var btn=document.getElementById("aBtn");btn.disabled=true;btn.textContent="Processando...";document.getElementById("aProg").style.display="block";setP("a",10,"Conectando a Asksuite...","Buscando leads");try{var r=await fetch("/buscar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({companyId:"porto-de-galinhas-praia-hotel",dateInit:dateInit,dateEnd:dateEnd,pageNumber:pageNum,pageSize:pageSize})});var data=await r.json();var leads=data.list||[];if(!leads.length){setP("a",100,"Nenhuma conversa encontrada","Tente outro periodo");btn.disabled=false;btn.textContent="Buscar e auditar";return;}setP("a",30,leads.length+" leads encontrados!","Auditando com IA...");aAud=[];for(var i=0;i<leads.length;i++){setP("a",Math.round(30+(i/leads.length)*65),"Auditando "+(i+1)+" de "+leads.length+"...","Lead: "+(leads[i].name||leads[i].id));try{var ar=await fetch("/auditar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({lead:leads[i]})});var resultado=await ar.json();if(resultado.scoreGeral){resultado.meta={nome:leads[i].name||"Cliente",atendente:leads[i].attendant||null,data:leads[i].updatedAt?new Date(leads[i].updatedAt).toLocaleDateString("pt-BR"):""};aAud.push(resultado);renderLista(aAud,"a");}}catch(e){console.error(e);}await new Promise(function(r){setTimeout(r,300);});}setP("a",100,"Auditoria concluida! "+aAud.length+" leads","");}catch(e){setP("a",0,"Erro: "+e.message,"");}btn.disabled=false;btn.textContent="Buscar e auditar";}');
  html.push('var hoje=new Date();var s=new Date(hoje);s.setDate(hoje.getDate()-7);document.getElementById("gDateEnd").value=hoje.toISOString().split("T")[0];document.getElementById("gDateInit").value=s.toISOString().split("T")[0];document.getElementById("aDateEnd").value=hoje.toISOString().split("T")[0];document.getElementById("aDateInit").value=s.toISOString().split("T")[0];');
  html.push('</script></body></html>');
  res.send(html.join('\n'));
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log("Servidor rodando na porta " + PORT);
});
