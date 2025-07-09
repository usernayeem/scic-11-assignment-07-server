require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

// Use CORS
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect(); // Connect to the database
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // Simple route
    app.get("/", (req, res) => {
      res.send("Hello, EduManage");
    });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run().catch(console.dir);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
