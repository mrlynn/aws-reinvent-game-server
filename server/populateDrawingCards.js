require('dotenv').config();
const { MongoClient } = require('mongodb');
const axios = require('axios');
const { MONGODB_URI, DB_NAME, COLLECTION_NAME } = require('./dbConfig');

const client = new MongoClient(MONGODB_URI);

const cards = [
    { name: "Cat", description: "A small domesticated carnivorous mammal with soft fur, a short snout, and retractable claws." },
    { name: "Tree", description: "A perennial plant with an elongated stem, or trunk, supporting branches and leaves." },
    { name: "Car", description: "A road vehicle, typically with four wheels, powered by an internal combustion engine or electric motor." },
    { name: "House", description: "A building for human habitation, especially one that is lived in by a family or small group of people." },
    { name: "Sun", description: "The star around which the earth orbits, providing light and heat for the planet." },
    { name: "Book", description: "A written or printed work consisting of pages glued or sewn together along one side and bound in covers." },
    { name: "Fish", description: "A limbless cold-blooded vertebrate animal with gills and fins living wholly in water." },
    { name: "Mountain", description: "A large natural elevation of the earth's surface rising abruptly from the surrounding level." },
    { name: "Bicycle", description: "A vehicle composed of two wheels held in a frame one behind the other, propelled by pedals and steered with handlebars attached to the front wheel." },
    { name: "Flower", description: "The seed-bearing part of a plant, consisting of reproductive organs (stamens and carpels) that are typically surrounded by a brightly colored corolla (petals) and a green calyx (sepals)." },
    { name: "Dog", description: "A domesticated carnivorous mammal that typically has a long snout, an acute sense of smell, and a barking, howling, or whining voice." },
    { name: "Boat", description: "A small vessel for traveling over water, propelled by oars, sails, or an engine." },
    { name: "Pencil", description: "An instrument for writing or drawing, consisting of a thin stick of graphite or a similar substance encased in wood or held in a mechanical holder." },
    { name: "Computer", description: "An electronic device for storing and processing data, typically in binary form, according to instructions given to it in a variable program." },
    { name: "Phone", description: "A device that uses a series of electronic signals to transmit and receive sound, typically the human voice." },
    { name: "Chair", description: "A separate seat for one person, typically with a back and four legs." },
    { name: "Table", description: "A piece of furniture with a flat top and one or more legs, providing a level surface on which objects may be placed." },
    { name: "Plane", description: "A powered flying vehicle with fixed wings and a weight greater than that of the air it displaces; an airplane." },
    { name: "Clock", description: "A mechanical or electrical device for measuring time, typically by hands on a round dial or by displayed digits." },
    { name: "Lamp", description: "A device for giving light, either one consisting of an electric bulb together with its holder and shade or cover." },
    { name: "Tree", description: "A woody perennial plant, typically having a single stem or trunk growing to a considerable height and bearing lateral branches at some distance from the ground." },
    { name: "Guitar", description: "A stringed musical instrument, typically played with the fingers or a pick." },
    { name: "Pizza", description: "A dish of Italian origin consisting of a flat, round base of dough baked with a topping of tomato sauce and cheese, typically with added meat or vegetables." },
    { name: "Hat", description: "A shaped covering for the head, typically having a brim and a crown." },
    { name: "Cup", description: "A small bowl-shaped container for drinking from, typically having a handle." },
    { name: "Bird", description: "A warm-blooded egg-laying vertebrate animal distinguished by the possession of feathers, wings, and a beak and (typically) by being able to fly." },
    { name: "Elephant", description: "A large herbivorous mammal noted for its long trunk, columnar legs, and large head with temporal glands and wide, flat ears." },
    { name: "Rocket", description: "A missile, spacecraft, aircraft, or other vehicle that obtains thrust from a rocket engine." },
    { name: "Shoe", description: "A covering for the foot, typically made of leather, having a sturdy sole and not reaching above the ankle." },
    { name: "Watch", description: "A small timepiece worn typically on a strap on one's wrist." },
    { name: "Bed", description: "A piece of furniture for sleep or rest, typically a framework with a mattress." },
    { name: "Apple", description: "The round fruit of a tree of the rose family, which typically has thin red or green skin and crisp flesh." },
    { name: "Banana", description: "A long curved fruit that grows in clusters and has soft pulpy flesh and yellow skin when ripe." },
    { name: "Kite", description: "A toy consisting of a light frame with thin material stretched over it, flown in the wind at the end of a long string." },
    { name: "Train", description: "A series of connected vehicles that move along a track and transport people or goods." },
    { name: "Snowman", description: "A figure of a person made of packed snow, typically created by stacking large snowballs and decorated with simple objects for facial features." },
    { name: "Balloon", description: "A small bag made of thin rubber or other light material, typically filled with air or helium and often used as a toy or decoration." },
    { name: "Drum", description: "A percussion instrument sounded by being struck with sticks or the hands, typically cylindrical, barrel-shaped, or bowl-shaped with a taut membrane over one or both ends." }
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

async function populateCards() {
    try {
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        // Clear existing documents
        await collection.deleteMany({});
        console.log('Cleared existing documents');

        // Generate embeddings and insert new documents
        const cardsWithEmbeddings = await Promise.all(cards.map(async card => {
            const embedding = await generateEmbedding(card.description);
            return { ...card, descriptionEmbedding: embedding };
        }));

        const result = await collection.insertMany(cardsWithEmbeddings);
        console.log(`${result.insertedCount} documents inserted`);
    } catch (error) {
        console.error('Error populating cards:', error);
    } finally {
        await client.close();
        console.log('Disconnected from MongoDB');
    }
}

populateCards();