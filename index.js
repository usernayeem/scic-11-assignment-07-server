require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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

    // Teacher applications endpoint
    app.post("/teacher-applications", async (req, res) => {
      try {
        const { uid, name, email, photoURL, title, experience, category } =
          req.body;

        // Validate required fields
        if (!uid || !name || !email || !title || !experience || !category) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields",
          });
        }

        // Get teacher applications collection
        const teacherApplicationsCollection = database.collection(
          "teacher-applications"
        );

        // Check if user already has a pending or approved application
        const existingApplication = await teacherApplicationsCollection.findOne(
          {
            uid,
          }
        );
        if (existingApplication) {
          return res.status(409).json({
            success: false,
            message: "You have already submitted a teaching application",
          });
        }

        // Create application document
        const applicationDoc = {
          uid,
          name,
          email,
          photoURL: photoURL || "",
          title,
          experience,
          category,
          status: "pending",
          appliedAt: new Date(),
          reviewedAt: null,
          reviewedBy: null,
        };

        // Insert application into database
        const result = await teacherApplicationsCollection.insertOne(
          applicationDoc
        );

        res.status(201).json({
          success: true,
          message: "Teaching application submitted successfully",
          applicationId: result.insertedId,
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

    // Get all teacher applications
    app.get("/teacher-applications", async (req, res) => {
      try {
        const teacherApplicationsCollection = database.collection(
          "teacher-applications"
        );
        const applications = await teacherApplicationsCollection
          .find({})
          .sort({ appliedAt: -1 })
          .toArray();

        res.json({
          success: true,
          applications,
        });
      } catch (error) {
        console.error("Error fetching teacher applications:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Update teacher application status
    app.patch("/teacher-applications/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        // Validate status
        if (!["approved", "rejected"].includes(status)) {
          return res.status(400).json({
            success: false,
            message: "Invalid status. Must be 'approved' or 'rejected'",
          });
        }

        const teacherApplicationsCollection = database.collection(
          "teacher-applications"
        );

        const result = await teacherApplicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
              reviewedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Application not found",
          });
        }

        res.json({
          success: true,
          message: `Application ${status} successfully`,
        });
      } catch (error) {
        console.error("Error updating application:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Update user role
    app.patch("/users/:uid", async (req, res) => {
      try {
        const { uid } = req.params;
        const { role } = req.body;

        // Validate role
        if (!["student", "teacher", "admin"].includes(role)) {
          return res.status(400).json({
            success: false,
            message: "Invalid role",
          });
        }

        const result = await usersCollection.updateOne(
          { uid },
          {
            $set: {
              role,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        res.json({
          success: true,
          message: "User role updated successfully",
        });
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Get all users endpoint
    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.json({
          success: true,
          users,
        });
      } catch (error) {
        console.error("Error fetching users:", error);
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
