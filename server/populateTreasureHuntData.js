require('dotenv').config();
const { MongoClient } = require('mongodb');
const axios = require('axios');
const { MONGODB_URI, DB_NAME } = require('./dbConfig');

const client = new MongoClient(MONGODB_URI);

const clues = [
    { clue: "What data structure uses LIFO?", answer: "Stack" },
    { clue: "Which sorting algorithm has an average time complexity of O(n log n)?", answer: "Quicksort" },
    { clue: "What design pattern is used for object creation?", answer: "Factory" },
    { clue: "Which data structure allows fast insertion and deletion at both ends?", answer: "Deque" },
    { clue: "What technique is used to avoid recalculating results in recursive functions?", answer: "Memoization" }
];

const codeSnippets = [
    {
        snippet: `
class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

    def pop(self):
        return self.items.pop()

    def peek(self):
        return self.items[-1]

    def is_empty(self):
        return len(self.items) == 0
        `,
        description: "Implementation of a Stack data structure in Python"
    },
    {
        snippet: `
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)
        `,
        description: "Implementation of the Quicksort algorithm in Python"
    },
    {
        snippet: `
class Factory:
    def create_product(self, product_type):
        if product_type == 'A':
            return ProductA()
        elif product_type == 'B':
            return ProductB()
        else:
            raise ValueError('Invalid product type')
        `,
        description: "Example of a Factory design pattern in Python"
    },
    {
        snippet: `
from collections import deque

d = deque()
d.append('a')  # add to right
d.appendleft('b')  # add to left
d.pop()  # remove from right
d.popleft()  # remove from left
        `,
        description: "Usage of a Deque (double-ended queue) in Python"
    },
    {
        snippet: `
def fibonacci(n, memo={}):
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    memo[n] = fibonacci(n-1, memo) + fibonacci(n-2, memo)
    return memo[n]
        `,
        description: "Memoized Fibonacci function in Python"
    }
];

async function generateEmbedding(text) {
    try {
        const response = await axios.post('https://api.openai.com/v1/embeddings', {
            input: text,
            model: "text-embedding-ada-002"
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data.data[0].embedding;
    } catch (error) {
        console.error('Error generating embedding:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function populateCollections() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db(DB_NAME);
        const cluesCollection = db.collection('treasureHuntClues');
        const snippetsCollection = db.collection('codeSnippets');

        // Clear existing documents
        await cluesCollection.deleteMany({});
        await snippetsCollection.deleteMany({});
        console.log('Cleared existing documents');

        // Generate embeddings and insert new clues
        const cluesWithEmbeddings = await Promise.all(clues.map(async clue => {
            const embedding = await generateEmbedding(clue.clue);
            return { ...clue, embedding };
        }));

        const cluesResult = await cluesCollection.insertMany(cluesWithEmbeddings);
        console.log(`${cluesResult.insertedCount} clues inserted`);

        // Generate embeddings and insert new code snippets
        const snippetsWithEmbeddings = await Promise.all(codeSnippets.map(async snippet => {
            const embedding = await generateEmbedding(snippet.description);
            return { ...snippet, embedding };
        }));

        const snippetsResult = await snippetsCollection.insertMany(snippetsWithEmbeddings);
        console.log(`${snippetsResult.insertedCount} code snippets inserted`);

        // Create vector search index for code snippets
        await snippetsCollection.createIndex(
            { embedding: "vector" },
            { 
                name: "default",
                vectorSearchOptions: {
                    numDimensions: 1536  // Dimension of text-embedding-ada-002 model
                }
            }
        );
        console.log('Vector search index created for code snippets');

    } catch (error) {
        console.error('Error populating collections:', error);
    } finally {
        await client.close();
        console.log('Disconnected from MongoDB');
    }
}

populateCollections();