
// Transcrição de áudio (Whisper)
import formidable from "formidable";
import fs from "fs";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: err.message });

    const file = fs.createReadStream(files.audio.filepath);
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: (() => {
        const data = new FormData();
        data.append("file", file);
        data.append("model", "whisper-1");
        return data;
      })()
    });

    const result = await response.json();
    res.status(200).json({ text: result.text });
  });
}
