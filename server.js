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

// 🔥 Configura OpenAI
const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
}));

// 🎙️ Endpoint per ottenere la trascrizione
app.get('/api/transcript/:videoId', async (req, res) => {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(req.params.videoId);
    res.json({ success: true, transcript });
  } catch (error) {
    console.error("❌ Errore nel transcript:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🌍 Endpoint per rilevare la lingua
app.post('/api/detect-language', async (req, res) => {
  try {
    const { text } = req.body;
    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Detect the language and return only the ISO language code." },
        { role: "user", content: text.substring(0, 100) }
      ],
      max_tokens: 5,
      temperature: 0,
    });

    const language = response.data.choices[0].message.content.trim().toLowerCase();
    res.json({ success: true, language });
  } catch (error) {
    console.error("❌ Errore nella rilevazione della lingua:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔄 Endpoint per la traduzione con DeepL
app.post('/api/translate', async (req, res) => {
  try {
    const languageMap = { english: 'EN', italian: 'IT', spanish: 'ES', french: 'FR', german: 'DE', portuguese: 'PT' };
    const { text, targetLanguage } = req.body;

    const response = await axios.post(
      'https://api-free.deepl.com/v2/translate',
      new URLSearchParams({
        text: text,
        target_lang: languageMap[targetLanguage] || 'EN'
      }).toString(),
      {
        headers: { 
          'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    res.json({ success: true, translation: response.data.translations[0].text });
  } catch (error) {
    console.error("❌ Errore nella traduzione con DeepL:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📝 Endpoint per generare il riassunto e la mappa concettuale
app.post('/api/summarize', async (req, res) => {
  try {
    const { transcript, language, length } = req.body;

    if (!transcript || transcript.length === 0) {
      return res.status(400).json({ success: false, error: "Transcript is empty" });
    }

    const fullText = transcript.map(item => item.text).join(' ');

    console.log("🔍 Testo inviato a OpenAI:", fullText.substring(0, 100));

    const summaryResponse = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: `Summarize in ${language}, structured with markdown headers.` },
        { role: "user", content: fullText.substring(0, 4000) }
      ],
      max_tokens: { short: 300, medium: 500, long: 800 }[length] || 500,
      temperature: 0.3,
    });

    if (!summaryResponse.data.choices || summaryResponse.data.choices.length === 0) {
      throw new Error("OpenAI returned an empty response");
    }

    const summary = summaryResponse.data.choices[0].message.content.trim();
    console.log("✅ Riassunto ricevuto:", summary.substring(0, 100));

    // Genera la mappa concettuale
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
      console.error("⚠️ Errore nel parsing della mappa concettuale:", error.message);
      conceptMap = { error: "Failed to parse concept map JSON." };
    }

    res.json({ success: true, summary, conceptMap });

  } catch (error) {
    console.error("🚨 Errore nel riassunto:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🚀 Avvio del server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
