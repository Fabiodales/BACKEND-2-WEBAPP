// server.js
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

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Transcript endpoint
app.get('/api/transcript/:videoId', async (req, res) => {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(req.params.videoId);
    res.json({ success: true, transcript });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Language detection endpoint
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// Translate endpoint with DeepL
app.post('/api/translate', async (req, res) => {
  try {
    const languageMap = { english: 'EN', italian: 'IT', spanish: 'ES', french: 'FR', german: 'DE', portuguese: 'PT' };
    const { text, targetLanguage } = req.body;
    const response = await axios.post('https://api-free.deepl.com/v2/translate', {
      text: [text],
      target_lang: languageMap[targetLanguage] || 'EN'
    }, {
      headers: { 'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}` }
    });
    res.json({ success: true, translation: response.data.translations[0].text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Summarize and generate concept map endpoint
app.post('/api/summarize', async (req, res) => {
  try {
    const { transcript, language, length } = req.body;
    const fullText = transcript.map(item => item.text).join(' ');

    const summaryResponse = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "system", content: `Summarize in ${language}, structured with markdown headers.` }, { role: "user", content: fullText.substring(0, 4000) }],
      max_tokens: { short: 300, medium: 500, long: 800 }[length] || 500,
      temperature: 0.3,
    });

    const summary = summaryResponse.data.choices[0].message.content.trim();

    const conceptMapResponse = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Generate a JSON concept map from the summary." },
        { role: "user", content: summary }
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const conceptMap = JSON.parse(conceptMapResponse.data.choices[0].message.content.trim());

    res.json({ success: true, summary, conceptMap });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));