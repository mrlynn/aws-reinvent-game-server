require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors'); // Import cors
const dbConfig = require('./dbConfig');
const { RekognitionClient, DetectLabelsCommand } = require('@aws-sdk/client-rekognition');

const app = express();
const upload = multer({ dest: 'uploads/' });

let client;
let db;

async function connectToDatabase() {
    if (client && client.topology && client.topology.isConnected()) {
        console.log('Already connected to MongoDB');
        return client.db(dbConfig.DB_NAME);
    }

    try {
        client = new MongoClient(dbConfig.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();
        db = client.db(dbConfig.DB_NAME);
        console.log('Connected to MongoDB');
        return db;
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        throw error;
    }
}

async function getDatabase() {
    if (!db) {
        db = await connectToDatabase();
    }
    return db;
}

const rekognitionClient = new RekognitionClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  async function analyzeDrawing(imageBytes) {
    const params = {
      Image: {
        Bytes: imageBytes,
      },
      MaxLabels: 10,
      MinConfidence: 75,
    };
    const command = new DetectLabelsCommand(params);
    const rekognitionResponse = await rekognitionClient.send(command);
    return rekognitionResponse.Labels.map(label => label.Name);
  }

app.use(cors()); // Use cors middleware
app.use(express.json());

app.get('/api/getRandomPrompt', async (req, res) => {
    console.log('Received request for random prompt');
    try {
        const db = await getDatabase();
        const promptsCollection = db.collection(dbConfig.COLLECTION_NAME);

        const prompts = await promptsCollection.aggregate([{ $sample: { size: 1 } }]).toArray();
        console.log('Prompts retrieved:', JSON.stringify(prompts, null, 2));

        if (prompts.length === 0) {
            console.log('No prompts found in the database');
            return res.status(404).json({ message: 'No prompts available' });
        }

        const randomPrompt = prompts[0];
        console.log('Random prompt being sent:', JSON.stringify(randomPrompt, null, 2));

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

app.post('/api/checkDrawing', upload.single('drawing'), async (req, res) => {
    console.log('Received request to /api/checkDrawing');
    try {
        const { promptId } = req.body;
        const drawingFile = req.file;

        if (!drawingFile) {
            console.log('No drawing file uploaded');
            return res.status(400).json({ message: 'No drawing file uploaded' });
        }

        console.log(`Processing drawing for prompt ID: ${promptId}`);
        const drawingPath = path.join(__dirname, drawingFile.path);
        const imageBytes = fs.readFileSync(drawingPath);
        const labels = await analyzeDrawing(imageBytes);
        console.log('Rekognition labels:', labels);

        const db = await getDatabase();
        const promptsCollection = db.collection(dbConfig.COLLECTION_NAME);

        const prompt = await promptsCollection.findOne({ _id: new ObjectId(promptId) });
        if (!prompt) {
            console.log('Prompt not found');
            return res.status(404).json({ message: 'Prompt not found' });
        }
        console.log('Found prompt:', prompt.description);

        // Generate embedding for the concatenated labels
        const labelText = labels.join(' ');
        console.log('Generating embedding for labels:', labelText);
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
        console.log('Generated embedding for labels (first 5 elements):', labelEmbedding.slice(0, 5));
        agg = [
            {
                $vectorSearch: {
                    index: "vector_index",
                    path: "descriptionEmbedding",
                    queryVector: labelEmbedding,
                    numCandidates: 100,
                    limit: 1
                }
            },
            {
                $project: {
                    description: 1,
                    score: { $meta: "vectorSearchScore" }
                }
            }
        ];
        console.log("Agg: ", agg);
        // Perform vector search
        console.log('Performing vector search');
        const searchResults = await promptsCollection.aggregate([
            {
                $vectorSearch: {
                    index: "vector_index",
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

        if (searchResults.length === 0) {
            console.log('No matching results found');
            return res.status(404).json({ message: 'No matching results found' });
        }

        const matchedPrompt = searchResults[0];
        const similarity = matchedPrompt.score;
        const score = Math.round(similarity * 100);

        console.log('Vector search result:', {
            matchedDescription: matchedPrompt.description,
            name: matchedPrompt.name,
            similarity: similarity,
            score: score
        });

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
    } finally {
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }
    }
});

// Helper function to calculate cosine similarity
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
