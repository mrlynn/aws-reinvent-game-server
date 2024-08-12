const { RekognitionClient, DetectLabelsCommand, DetectModerationLabelsCommand } = require('@aws-sdk/client-rekognition');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');
const fs = require('fs').promises;
require('dotenv').config({ path: '../.env' });

// console.log('AWS_REGION:', process.env.AWS_REGION);
// console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'Set' : 'Not set');
// console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'Set' : 'Not set');
// console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID);
// console.log('AWS_SECRET_ACCESS_KEY',process.env.AWS_SECRET_ACCESS_KEY )

const rekognition = new RekognitionClient({
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      logger: console,
    },
});

// const rekognition = new RekognitionClient({
//     region: process.env.AWS_REGION || 'us-east-1',
//     credentials: defaultProvider(),
//     logger: console,
// });

async function detectLabels(imagePath) {
    try {
        const imageData = await fs.readFile(imagePath);
        const params = {
            Image: {
                Bytes: imageData
            },
            MaxLabels: 10,
            MinConfidence: 70
        };

        const command = new DetectLabelsCommand(params);
        const data = await rekognition.send(command);
        return data.Labels.map(label => label.Name);
    } catch (error) {
        console.error('Error in Rekognition label detection:', error);
        throw error;
    }
}

async function moderateContent(imagePath) {
    try {
        const imageData = await fs.readFile(imagePath);
        const params = {
            Image: {
                Bytes: imageData
            },
            MinConfidence: 60
        };

        const command = new DetectModerationLabelsCommand(params);
        const data = await rekognition.send(command);
        return data.ModerationLabels.length === 0;
    } catch (error) {
        console.error('Error in Rekognition content moderation:', error);
        throw error;
    }
}

async function analyzeDrawing(imagePath) {
    try {
        const [labels, isAppropriate] = await Promise.all([
            detectLabels(imagePath),
            moderateContent(imagePath)
        ]);
        return { labels, isAppropriate };
    } catch (error) {
        console.error('Error analyzing drawing:', error);
        // Return a default result in case of error
        return { labels: [], isAppropriate: true };
    }
}

module.exports = analyzeDrawing;