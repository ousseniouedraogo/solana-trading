const mongoose = require("mongoose");
const config = require("../config");

const connectDB = async () => {
  try {
    const mongoUri = config.mongodb.uri;

    if (!mongoUri) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }

    // Optimized MongoDB connection settings for speed
    await mongoose.connect(mongoUri, {
      maxPoolSize: 10,          // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000,   // Close sockets after 45 seconds of inactivity
      family: 4 // Use IPv4, skip IPv6
    });

    // Set default query options for speed
    // This prevents the "buffering timed out" error by failing immediately if not connected
    mongoose.set('bufferCommands', false);

    console.log("✅ MongoDB connected successfully");
    return true;
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    console.error("💡 Tip: Make sure your MongoDB server is running or MONGODB_URI in .env is correct.");
    return false;
  }
};

module.exports = connectDB;
