const { RekognitionClient, DetectLabelsCommand, DetectModerationLabelsCommand } = require('@aws-sdk/client-rekognition');
const fs = require('fs').promises;

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function detectLabels(imageBuffer) {
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
    console.error('Error in Rekognition label detection:', error);
    throw error;
  }
}

async function moderateContent(imageBuffer) {
  const params = {
    Image: {
      Bytes: imageBuffer
    },
    MinConfidence: 60
  };
  const command = new DetectModerationLabelsCommand(params);
  try {
    const moderationResponse = await rekognitionClient.send(command);
    return moderationResponse.ModerationLabels;
  } catch (error) {
    console.error('Error in Rekognition content moderation:', error);
    throw error;
  }
}

async function analyzeDrawing(imagePath) {
  const imageBuffer = await fs.readFile(imagePath);
  
  // Perform content moderation
  const moderationLabels = await moderateContent(imageBuffer);
  if (moderationLabels.length > 0) {
    throw new Error('Inappropriate content detected');
  }

  // If content is appropriate, detect labels
  const labels = await detectLabels(imageBuffer);
  
  return {
    labels: labels,
    isAppropriate: true
  };
}

module.exports = analyzeDrawing;