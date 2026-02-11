const mongoose = require('mongoose');
require('dotenv').config();

const clearDatabase = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in .env');
        }

        console.log('Connecting to MongoDB...');
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`Connected to database: ${conn.connection.name}`);

        const collectionsToClear = ['trackedwallets', 'snipetargets'];

        for (const colName of collectionsToClear) {
            const collection = conn.connection.db.collection(colName);
            const countBefore = await collection.countDocuments();
            console.log(`Found ${countBefore} documents in ${colName}.`);

            if (countBefore > 0) {
                console.log(`Deleting documents from ${colName}...`);
                const result = await collection.deleteMany({});
                console.log(`Deleted ${result.deletedCount} documents from ${colName}.`);
            } else {
                console.log(`No documents to clear in ${colName}.`);
            }
        }

    } catch (error) {
        console.error('Error clearing database:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
        process.exit(0);
    }
};

clearDatabase();
