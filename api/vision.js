// api/vision.js — HTTP nativo + REST direto (sem SDK)
const { fetch } = require("undici");

async function readBodyBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipartBody(buf, boundary) {
  const boundaryBuf = Buffer.from("--" + boundary);
  const endBoundaryBuf = Buffer.from("--" + boundary + "--");
  const parts = [];

  let pos = buf.indexOf(boundaryBuf);
  if (pos === -1) return parts;
  pos += boundaryBuf.length;

  while (pos < buf.length) {
    if (buf.indexOf(endBoundaryBuf, pos - boundaryBuf.length) === pos - boundaryBuf.length) break;
    if (buf[pos] === 13 && buf[pos + 1] === 10) pos += 2;

    const next = buf.indexOf(boundaryBuf, pos);
    const end = next === -1 ? buf.length : next;
    const chunk = buf.slice(pos, end);

    const sep = chunk.indexOf(Buffer.from("\r\n\r\n"));
    if (sep === -1) { pos = end + boundaryBuf.length; continue; }
    const headerStr = chunk.slice(0, sep).toString("utf8");
    let bodyPart = chunk.slice(sep + 4);
    if (bodyPart.length >= 2 && bodyPart[bodyPart.length - 2] === 13 && bodyPart[bodyPart.length - 1] === 10) {
      bodyPart = bodyPart.slice(0, -2);
    }

    const headers = {};
    headerStr.split(/\r?\n/g).forEach((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return;
      const k = line.slice(0, idx).trim().toLowerCase();
      const v = line.slice(idx + 1).trim();
      headers[k] = v;
    });
    parts.push({ headers, data: bodyPart });
    pos = end + boundaryBuf.length;
  }
  return parts;
}

module.exports = async function handler(req, res) {
  try {
    let prompt;
    let imageB64;
    let mime = "image/png";

    const ct = String(req.headers["content-type"] || "");
    if (ct.includes("multipart/form-data")) {
      const m = ct.match(/boundary=([^;]+)/i);
      const boundary = m ? m[1].trim().replace(/^"|"$/g, "") : null;
      if (!boundary) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "boundary ausente" }));
      }
      const bodyBuf = await readBodyBuffer(req);
      const parts = parseMultipartBody(bodyBuf, boundary);

      for (const p of parts) {
        const disp = String(p.headers["content-disposition"] || "");
        const nameMatch = disp.match(/name="([^"]+)"/i);
        const fieldName = nameMatch ? nameMatch[1] : "";
        const filenameMatch = disp.match(/filename="([^"]*)"/i);
        if (filenameMatch && fieldName) {
          const partMime = String(p.headers["content-type"] || "");
          mime = partMime || mime;
          imageB64 = p.data.toString("base64");
        } else if (fieldName === "prompt") {
          prompt = p.data.toString("utf8");
        }
      }
    } else {
      const b = req.body || {};
      prompt = b.prompt;
      imageB64 = b.imageB64;
      mime = b.mime || mime;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "OPENAI_API_KEY ausente" }));
    }
    if (!imageB64) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "imageB64 ausente" }));
    }

    // Aceita tanto base64 cru quanto dataURL completo
    const dataUrl = imageB64.startsWith("data:")
      ? imageB64
      : `data:${mime};base64,${imageB64}`;

    const body = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt || "Analise a imagem e dê um diagnóstico executável." },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ]
    };

    const oaRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const json = await oaRes.json().catch(() => null);

    if (!oaRes.ok) {
      console.error("Vision OpenAI error:", oaRes.status, json);
      res.writeHead(oaRes.status, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        error: json?.error?.message || `OpenAI ${oaRes.status}`
      }));
    }

    const text = json?.choices?.[0]?.message?.content || "(sem conteúdo)";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ text }));
  } catch (e) {
    console.error("Vision 500 fatal:", e);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e?.message || "Erro desconhecido" }));
  }
};
