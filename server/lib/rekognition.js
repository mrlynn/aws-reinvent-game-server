const { RekognitionClient, DetectLabelsCommand } = require('@aws-sdk/client-rekognition');
const fs = require('fs').promises;

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function analyzeDrawing(imagePath) {
  const imageBuffer = await fs.readFile(imagePath);
  const params = {
    Image: {
      Bytes: imageBuffer
    },
    MaxLabels: 10,
    MinConfidence: 75,
  };
  const command = new DetectLabelsCommand(params);
  try {
    const rekognitionResponse = await rekognitionClient.send(command);
    return rekognitionResponse.Labels.map(label => label.Name);
  } catch (error) {
    console.error('Error in Rekognition:', error);
    throw error;
  }
}

module.exports = analyzeDrawing;