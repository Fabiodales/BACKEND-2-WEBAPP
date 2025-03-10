import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { YoutubeTranscript } from 'youtube-transcript';
import axios from 'axios';
import { Configuration, OpenAIApi } from 'openai';

const app = express();

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*'
}));

app.use(express.json());

// ✅ FIX: Configurazione API Key pulita senza spazi
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const DEEPL_API_KEY = process.env.DEEPL_API_KEY?.trim();

const configuration = new Configuration({ apiKey: OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

// ✅ FIX: Funzione per estrarre l'ID del video da un URL YouTube
function extractVideoId(url) {
  const regex = /(?:youtube\.com\/.*v=|youtu\.be\/)([^&?/]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// ✅ Endpoint per ottenere il transcript di un video YouTube
app.get('/api/transcript/:videoId', async (req, res) => {
  try {
    const videoId = req.params.videoId;

    if (!videoId) {
      return res.status(400).json({ success: false, error: "Invalid YouTube video URL." });
    }

    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    res.json({ success: true, transcript });
  } catch (error) {
    console.error("❌ Errore nel transcript:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Endpoint per rilevare la lingua
app.post('/api/detect-language', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, error: "Missing text input." });

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
    if (!DEEPL_API_KEY) {
      return res.status(500).json({ success: false, error: "Missing DeepL API Key." });
    }

    const { text, targetLanguage } = req.body;
    if (!text || !targetLanguage) {
      return res.status(400).json({ success: false, error: "Missing text or targetLanguage." });
    }

    const response = await axios.post(
      'https://api-free.deepl.com/v2/translate',
      { text: [text], target_lang: targetLanguage.toUpperCase() },
      {
        headers: {
          'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ success: true, translation: response.data.translations[0].text });
  } catch (error) {
    console.error("❌ Errore nella traduzione:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ Endpoint per generare il riassunto e la mappa concettuale
app.post('/api/summarize', async (req, res) => {
  try {
    const { transcript, language, length } = req.body;
    if (!transcript || !language || !length) {
      return res.status(400).json({ success: false, error: "Missing parameters." });
    }

    const fullText = transcript.map(item => item.text).join(' ');

    // ✅ FIX: Richiesta OpenAI con API Key pulita
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

    // ✅ FIX: Mappa concettuale senza errori
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

// ✅ Avvio del server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
