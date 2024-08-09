const { RekognitionClient, DetectLabelsCommand } = require('@aws-sdk/client-rekognition');

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

module.exports = analyzeDrawing;