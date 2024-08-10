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

        // Perform vector search
        const searchResults = await promptsCollection.aggregate([
            {
                $vectorSearch: {
                    index: "default",
                    path: "descriptionEmbedding",
                    queryVector: labelEmbedding,
                    numCandidates: 100,
                    limit: 1
                }
            },
            {
                $project: {
                    description: 1,
                    name: 1,
                    score: { $meta: "vectorSearchScore" }
                }
            }
        ]).toArray();
        console.log('Vector search results:', JSON.stringify(searchResults, null, 2));

        if (searchResults.length === 0) {
            console.log('No matching results found in vector search');
            // Fallback scoring method
            const promptLabels = prompt.description.toLowerCase().split(' ');
            const matchingLabels = labels.filter(label => promptLabels.includes(label.toLowerCase()));
            similarity = matchingLabels.length / Math.max(labels.length, promptLabels.length);
            score = Math.round(similarity * 100);
            explanation = `No close matches found. Fallback scoring used. Drawing labels: ${labels.join(', ')}`;
        } else {
            const matchedPrompt = searchResults[0];
            similarity = matchedPrompt.score;
            score = Math.round(similarity * 100);
            explanation = `Drawing labels: ${labels.join(', ')}`;
        }

        const response = {
            score: score,
            similarity: similarity,
            explanation: `Drawing labels: ${labels.join(', ')}`,
            promptText: prompt.description,
            promptName: prompt.name
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

module.exports = app;