require('dotenv').config();

module.exports = {
  MONGODB_URI: process.env.MONGODB_URI,
  DB_NAME: 'drawing_game',
  COLLECTION_NAME: 'prompts'
};