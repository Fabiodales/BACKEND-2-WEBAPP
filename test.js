import dotenv from 'dotenv';
dotenv.config();
import { Configuration, OpenAIApi } from 'openai';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function testCompletion() {
  try {
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: "Say hello",
      max_tokens: 5,
      temperature: 0,
    });
    console.log(response.data);
  } catch (error) {
    console.error("Errore nella testCompletion:", error.response?.data || error.message);
  }
}

testCompletion();
