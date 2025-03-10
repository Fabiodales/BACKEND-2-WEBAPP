import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { YoutubeTranscript } from 'youtube-transcript';
import { Configuration, OpenAIApi } from 'openai';

const app = express();

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Carica chiavi
const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
const DEEPL_API_KEY = process.env.DEEPL_API_KEY?.trim();
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY?.trim();
const PORT = process.env.PORT || 3001;

// Configura OpenAI
const configuration = new Configuration({ apiKey: OPENAI_API_KEY });
const openai = new OpenAIApi(configuration);

/**
 * Endpoint: /api/video-info/:videoId
 * - Restituisce info sul video (title, thumbnail, durata, ecc.) e sul canale (nome, iscritti, ecc.)
 */
app.get('/api/video-info/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!videoId) {
      return res.status(400).json({ success: false, error: "Missing videoId" });
    }

    // 1) Info sul video
    let url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    let response = await axios.get(url);
    const items = response.data.items;
    if (!items || items.length === 0) {
      return res.status(404).json({ success: false, error: "Video not found" });
    }

    const videoData = items[0];
    const snippet = videoData.snippet;
    const contentDetails = videoData.contentDetails;
    const statistics = videoData.statistics;

    // 2) Info sul canale
    const channelId = snippet.channelId;
    url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`;
    response = await axios.get(url);
    const channelItems = response.data.items;
    if (!channelItems || channelItems.length === 0) {
      return res.status(404).json({ success: false, error: "Channel not found" });
    }

    const channelData = channelItems[0];
    const channelSnippet = channelData.snippet;
    const channelStatistics = channelData.statistics;

    // Organizza i dati
    const videoInfo = {
      title: snippet.title,
      description: snippet.description,
      publishedAt: snippet.publishedAt,
      thumbnails: snippet.thumbnails,
      duration: contentDetails.duration,
      statistics: {
        viewCount: statistics.viewCount,
        likeCount: statistics.likeCount
      }
    };

    const channelInfo = {
      channelId,
      channelTitle: snippet.channelTitle,
      channelDescription: channelSnippet.description,
      channelThumbnails: channelSnippet.thumbnails,
      subscriberCount: channelStatistics.subscriberCount,
      videoCount: channelStatistics.videoCount
    };

    res.json({ success: true, videoInfo, channelInfo });
  } catch (error) {
    console.error("❌ /api/video-info Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Endpoint: /api/transcript/:videoId
 * - Restituisce il transcript del video
 */
app.get('/api/transcript/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    if (!videoId) {
      return res.status(400).json({ success: false, error: "Invalid video ID." });
    }

    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    if (!transcript || transcript.length === 0) {
      return res.status(404).json({ success: false, error: "No transcript available." });
    }

    res.json({ success: true, transcript });
  } catch (error) {
    console.error("❌ /api/transcript Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Endpoint: /api/detect-language
 * Body: { text }
 * - Rileva la lingua (ISO code) tramite OpenAI
 */
app.post('/api/detect-language', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: "Missing text input." });
    }

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Detect the language and return only the ISO code (e.g., 'en', 'it', 'es')."
        },
        {
          role: "user",
          content: text.substring(0, 300)
        }
      ],
      max_tokens: 5,
      temperature: 0
    });

    const language = response.data.choices[0].message.content.trim().toLowerCase();
    res.json({ success: true, language });
  } catch (error) {
    console.error("❌ /api/detect-language Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Endpoint: /api/translate
 * Body: { text, targetLanguage } -> "IT", "EN", ecc.
 * - Usa DeepL
 */
app.post('/api/translate', async (req, res) => {
  try {
    if (!DEEPL_API_KEY) {
      return res.status(500).json({ success: false, error: "Missing DEEPL_API_KEY." });
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

    const translation = response.data.translations[0].text;
    res.json({ success: true, translation });
  } catch (error) {
    console.error("❌ /api/translate Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Endpoint: /api/summarize
 * Body: { transcript, language }
 * - Restituisce un riassunto con heading (h2,h3) e emoji
 */
app.post('/api/summarize', async (req, res) => {
  try {
    const { transcript, language } = req.body;
    if (!transcript || !language) {
      return res.status(400).json({ success: false, error: "Missing parameters." });
    }

    // Unisci il testo
    const fullText = transcript.map(item => item.text).join(' ');

    // Prompt per un riassunto dettagliato con headings ed emoji
    const summaryPrompt = [
      {
        role: "system",
        content: `You are an advanced summarization assistant. The user wants a well-structured summary in ${language}.
Use headings (h2, h3, etc.) and emojis to highlight key concepts. 
Produce a thorough summary with relevant details, properly indented, but not extremely long.`
      },
      {
        role: "user",
        content: `Transcript:\n\n${fullText.substring(0, 8000)}\n\nInstructions:
- Use headings (h2, h3, etc.) for sections
- Use emojis for key concepts
- Be detailed, do not be extremely short
- Language: ${language}
`
      }
    ];

    const summaryResponse = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: summaryPrompt,
      max_tokens: 800,
      temperature: 0.5
    });

    const summary = summaryResponse.data.choices[0].message.content.trim();

    // Restituisci solo il riassunto (niente flowchart)
    res.json({ success: true, summary });
  } catch (error) {
    console.error("❌ /api/summarize Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Avvio server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
