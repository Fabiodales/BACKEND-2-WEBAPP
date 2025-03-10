import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { YoutubeTranscript } from 'youtube-transcript';
import axios from 'axios';
import { Configuration, OpenAIApi } from 'openai';

const app = express();

// ✅ Configurazione CORS per evitare problemi con il frontend
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*'
}));

app.use(express.json());

// ✅ Configurazione OpenAI GPT-3.5 Turbo
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// ✅ Endpoint per ottenere il transcript di un video YouTube
app.get('/api/transcript/:videoId', async (req, res) => {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(req.params.videoId);
    res.json({ success: true, transcript });
  } catch (error) {
    console.error("❌ Errore nel transcript:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Endpoint per rilevare la lingua del testo con OpenAI
app.post('/api/detect-language', async (req, res) => {
  try {
    const { text } = req.body;

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Detect the language and return only the ISO language code (e.g., 'en', 'it', 'es')." },
        { role: "user", content: text.substring(0, 100) }
      ],
      max_tokens: 5,
      temperature: 0,
    });

    const language = response.data.choices[0].message.content.trim().toLowerCase();
    res.json({ success: true, language });
  } catch (error) {
    console.error("❌ Errore nel rilevamento della lingua:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Endpoint per tradurre il testo con DeepL
app.post('/api/translate', async (req, res) => {
  try {
    if (!process.env.DEEPL_API_KEY) {
      throw new Error("⚠️ Missing DeepL API Key. Check your environment variables.");
    }

    const languageMap = { english: 'EN', italian: 'IT', spanish: 'ES', french: 'FR', german: 'DE', portuguese: 'PT' };
    const { text, targetLanguage } = req.body;

    const deepLApiKey = process.env.DEEPL_API_KEY.trim(); // 🔹 FIX per errori nel token

    const response = await axios.post('https://api-free.deepl.com/v2/translate', {
      text: [text],
      target_lang: languageMap[targetLanguage] || 'EN'
    }, {
      headers: { 
        'Authorization': `DeepL-Auth-Key ${deepLApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({ success: true, translation: response.data.translations[0].text });
  } catch (error) {
    console.error("❌ Errore nella traduzione:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Endpoint per generare un riassunto e una mappa concettuale con GPT-3.5 Turbo
app.post('/api/summarize', async (req, res) => {
  try {
    const { transcript, language, length } = req.body;
    const fullText = transcript.map(item => item.text).join(' ');

    // 🎯 Prompt per il riassunto
    const summaryResponse = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: `Summarize in ${language}, structured with markdown headers.` },
        { role: "user", content: fullText.substring(0, 4000) }
      ],
      max_tokens: { short: 300, medium: 500, long: 800 }[length] || 500,
      temperature: 0.3,
    });

    const summary = summaryResponse.data.choices[0].message.content.trim();

    // 🎯 Prompt per la mappa concettuale
    const conceptMapResponse = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Generate a JSON concept map from the summary." },
        { role: "user", content: summary }
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    let conceptMap;
    try {
      conceptMap = JSON.parse(conceptMapResponse.data.choices[0].message.content.trim());
    } catch (error) {
      console.error("⚠️ Errore nella generazione della mappa concettuale, usando fallback.");
      conceptMap = {
        conceptMap: [
          { id: "root", label: "Main Topic", group: 0 },
          { id: "1", label: "Subtopic 1", group: 1 },
          { id: "2", label: "Subtopic 2", group: 1 }
        ],
        connections: [
          { source: "root", target: "1" },
          { source: "root", target: "2" }
        ]
      };
    }

    res.json({ success: true, summary, conceptMap });
  } catch (error) {
    console.error("❌ Errore nel riassunto:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Avvia il server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
