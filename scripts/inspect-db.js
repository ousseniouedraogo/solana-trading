const mongoose = require('mongoose');
require('dotenv').config();

const inspectDatabase = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in .env');
        }

        console.log('Connecting to MongoDB...');
        // Append a default DB name if missing to ensure we connect to *some* DB, 
        // but let's see what the connection object says first.
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`Connected to database: ${conn.connection.name}`);

        const collections = await conn.connection.db.listCollections().toArray();
        console.log(`Found ${collections.length} collections:`);

        for (const col of collections) {
            const count = await conn.connection.db.collection(col.name).countDocuments();
            console.log(`- ${col.name}: ${count} documents`);
        }

    } catch (error) {
        console.error('Error inspecting database:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
};

inspectDatabase();
