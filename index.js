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

    // Get database and collection
    const database = client.db("edu-manage");
    const usersCollection = database.collection("users");

    // Simple route
    app.get("/", (req, res) => {
      res.send("Hello, EduManage");
    });

    // User registration endpoint
    app.post("/users", async (req, res) => {
      try {
        const { uid, name, email, photoURL } = req.body;

        // Validate required fields
        if (!uid || !name || !email) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields: uid, name, email",
          });
        }

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ uid });
        if (existingUser) {
          return res.status(409).json({
            success: false,
            message: "User already exists",
          });
        }

        // Create user document with student role
        const userDoc = {
          uid,
          name,
          email,
          photoURL: photoURL || "",
          role: "student",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Insert user into database
        const result = await usersCollection.insertOne(userDoc);

        res.status(201).json({
          success: true,
          message: "User registered successfully",
          userId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Get user by UID endpoint
    app.get("/users/:uid", async (req, res) => {
      try {
        const { uid } = req.params;
        const user = await usersCollection.findOne({ uid });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        res.json({
          success: true,
          user,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
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
