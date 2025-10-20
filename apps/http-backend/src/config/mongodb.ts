import mongoose from "mongoose";

const mongoUri = "mongodb://localhost:27017/Drawer";

export const connectToMongoDB = async () => {
    try {
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("Failed to connect to MongoDB", error);
        process.exit(1);
    }
}