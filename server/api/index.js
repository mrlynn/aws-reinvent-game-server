const express = require('express');
const { ObjectId } = require('mongodb');
const axios = require('axios');
const connectToDatabase = require('../lib/database').default;
const analyzeDrawing = require('../lib/rekognition');
const cors = require('cors');
const path = require('path');  
const fs = require('fs').promises;


const app = express();
app.use(express.json({ limit: '10mb' }));
const allowedOrigins = [
    'https://main.d1fueswraai8k7.amplifyapp.com',
    'http://localhost:3000', // For local development
    // Add any other origins you need
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));



app.get('/api/getRandomPrompt', async (req, res) => {
    try {
        const { db } = await connectToDatabase();
        const promptsCollection = db.collection(process.env.COLLECTION_NAME);

        const prompts = await promptsCollection.aggregate([{ $sample: { size: 1 } }]).toArray();

        if (prompts.length === 0) {
            return res.status(404).json({ message: 'No prompts available' });
        }

        const randomPrompt = prompts[0];
        res.json({
            promptId: randomPrompt._id.toString(),
            text: randomPrompt.name,
            description: randomPrompt.description
        });
    } catch (error) {
        console.error('Error fetching random prompt:', error);
        res.status(500).json({ message: 'Error fetching random prompt', error: error.message });
    }
});

app.post('/api/checkDrawing', async (req, res) => {
    console.log('Received request to /api/checkDrawing');
    try {
        const { promptId, drawing } = req.body;
        console.log('Received promptId:', promptId);
        console.log('Received drawing data length:', drawing ? drawing.length : 'undefined');

        if (!drawing) {
            return res.status(400).json({ message: 'No drawing data provided' });
        }

        // Extract the base64 data from the drawing string
        const base64Data = drawing.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Save the image temporarily
        const tempFilePath = path.join('/tmp', `drawing-${Date.now()}.png`);
        await fs.writeFile(tempFilePath, imageBuffer);

        // Analyze the drawing
        const labels = await analyzeDrawing(tempFilePath);
        console.log('Rekognition labels:', labels);

        // Delete the temporary file
        await fs.unlink(tempFilePath);

        const { db } = await connectToDatabase();
        const promptsCollection = db.collection(process.env.COLLECTION_NAME);

        let prompt;
        try {
            prompt = await promptsCollection.findOne({ _id: new ObjectId(promptId) });
        } catch (error) {
            console.error('Invalid promptId:', promptId);
            return res.status(400).json({ message: 'Invalid promptId provided' });
        }

        if (!prompt) {
            return res.status(404).json({ message: 'Prompt not found' });
        }

        // Check if nameEmbedding exists, if not, create it
        if (!prompt.nameEmbedding) {
            const nameEmbeddingResponse = await axios.post('https://api.openai.com/v1/embeddings', {
                input: prompt.name,
                model: "text-embedding-ada-002"
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            prompt.nameEmbedding = nameEmbeddingResponse.data.data[0].embedding;

            // Update the prompt in the database with the new nameEmbedding
            await promptsCollection.updateOne(
                { _id: prompt._id },
                { $set: { nameEmbedding: prompt.nameEmbedding } }
            );
        }

        // Generate embedding for the concatenated labels
        const labelText = labels.join(' ');
        const embeddingResponse = await axios.post('https://api.openai.com/v1/embeddings', {
            input: labelText,
            model: "text-embedding-ada-002"
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        const labelEmbedding = embeddingResponse.data.data[0].embedding;

        // // Perform vector search using nameEmbedding
        // const searchResults = await promptsCollection.aggregate([
        //     {
        //         $vectorSearch: {
        //             index: "nameEmbedding_index",  // Make sure this index exists for nameEmbedding
        //             path: "nameEmbedding",
        //             queryVector: labelEmbedding,
        //             numCandidates: 100,
        //             limit: 1
        //         }
        //     },
        //     {
        //         $project: {
        //             description: 1,
        //             name: 1,
        //             score: { $meta: "vectorSearchScore" }
        //         }
        //     }
        // ]).toArray();
        // console.log('Vector search results:', JSON.stringify(searchResults, null, 2));

        // if (searchResults.length === 0) {
        //     console.log('No matching results found in vector search');
        //     // Fallback scoring method
        //     const promptLabels = prompt.name.toLowerCase().split(' ');
        //     const matchingLabels = labels.filter(label => promptLabels.includes(label.toLowerCase()));
        //     similarity = matchingLabels.length / Math.max(labels.length, promptLabels.length);
        //     score = Math.round(similarity * 100);
        //     explanation = `No close matches found. Fallback scoring used. Drawing labels: ${labels.join(', ')}`;
        // } else {
        //     const matchedPrompt = searchResults[0];
        //     similarity = matchedPrompt.score;
        //     score = Math.round(similarity * 100);
        //     explanation = `Drawing labels: ${labels.join(', ')}`;
        // }

        // Calculate cosine similarity between label embedding and prompt name embedding
        const similarity = cosineSimilarity(labelEmbedding, prompt.nameEmbedding);
        const score = Math.round(similarity * 100);        

        const response = {
            score: score,
            similarity: similarity,
            explanation: `Drawing labels: ${labels.join(', ')}`,
            promptText: prompt.description,
            promptName: prompt.name,
            detectedLabels: labels,
            vectorSearchResults: [{
                name: prompt.name,
                description: prompt.description,
                score: similarity
            }]
        };

        console.log('Sending response:', response);
        res.json(response);
    } catch (error) {
        console.error('Error in /api/checkDrawing:', error);
        res.status(500).json({
            message: 'Error checking drawing',
            error: error.message,
            stack: error.stack
        });
    }
});

// Helper function to calculate cosine similarity
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

// Save game result
app.post('/api/saveGameResult', async (req, res) => {
    try {
      const { db } = await connectToDatabase();
      const gameResultsCollection = db.collection('gameResults');
      const userStatsCollection = db.collection('userStats');
  
      const result = await gameResultsCollection.insertOne({
        ...req.body,
        timestamp: new Date()
      });
  
      // Update user statistics
      await userStatsCollection.updateOne(
        { playerName: req.body.playerName },
        {
          $inc: { totalScore: req.body.score, gamesPlayed: 1 },
          $max: { highScore: req.body.score },
          $set: { lastPlayed: new Date() }
        },
        { upsert: true }
      );
  
      res.status(200).json({ message: 'Game result saved', id: result.insertedId });
    } catch (error) {
      console.error('Error saving game result:', error);
      res.status(500).json({ message: 'Error saving game result', error: error.message });
    }
  });
  
  // Get leaderboard
  app.get('/api/leaderboard', async (req, res) => {
    try {
      const { db } = await connectToDatabase();
      const userStatsCollection = db.collection('userStats');
  
      const leaderboard = await userStatsCollection.find()
        .sort({ highScore: -1 })
        .limit(10)
        .toArray();
  
      res.status(200).json(leaderboard);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      res.status(500).json({ message: 'Error fetching leaderboard', error: error.message });
    }
  });
  
  // Get user statistics
  app.get('/api/userStats/:playerName', async (req, res) => {
    try {
      const { db } = await connectToDatabase();
      const userStatsCollection = db.collection('userStats');
  
      const stats = await userStatsCollection.findOne({ playerName: req.params.playerName });
  
      if (stats) {
        res.status(200).json(stats);
      } else {
        res.status(404).json({ message: 'User not found' });
      }
    } catch (error) {
      console.error('Error fetching user stats:', error);
      res.status(500).json({ message: 'Error fetching user stats', error: error.message });
    }
  });

module.exports = app;