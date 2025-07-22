require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

// Use CORS
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

// JWT middleware to verify token
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    req.decoded = decoded;
    next();
  });
};

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

    // JWT token creation endpoint
    app.post("/jwt", async (req, res) => {
      try {
        const { email } = req.body;

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        // Create JWT token with email as payload
        const token = jwt.sign({ email }, process.env.JWT_SECRET, {
          expiresIn: "7d", // Token expires in 7 days
        });

        res.status(200).json({ token });
      } catch (error) {
        res.status(500).json({ message: "Failed to create token" });
      }
    });

    // Verify JWT token endpoint
    app.get("/verify-jwt", verifyJWT, (req, res) => {
      res.status(200).json({
        message: "Token is valid",
        email: req.decoded.email,
      });
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
    app.post("/teacher-applications", verifyJWT, async (req, res) => {
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
    app.get("/users/:uid", verifyJWT, async (req, res) => {
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
    app.get("/teacher-applications", verifyJWT, async (req, res) => {
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
    app.patch("/teacher-applications/:id", verifyJWT, async (req, res) => {
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
    app.patch("/users/:uid", verifyJWT, async (req, res) => {
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
    app.get("/users", verifyJWT, async (req, res) => {
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

    // Create a new class endpoint
    app.post("/classes", verifyJWT, async (req, res) => {
      try {
        const {
          title,
          teacherName,
          teacherEmail,
          teacherUid,
          price,
          description,
          image,
        } = req.body;

        // Get classes collection
        const classesCollection = database.collection("classes");

        // Create class document
        const classDoc = {
          title,
          teacherName,
          teacherEmail,
          teacherUid,
          price: parseFloat(price),
          description,
          image,
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
          enrolledStudents: [],
        };

        // Insert class into database
        const result = await classesCollection.insertOne(classDoc);

        res.status(201).json({
          success: true,
          message: "Class created successfully and awaiting approval",
          classId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating class:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Get all classes endpoint
    app.get("/classes", verifyJWT, async (req, res) => {
      try {
        const classesCollection = database.collection("classes");
        const classes = await classesCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.json({
          success: true,
          classes,
        });
      } catch (error) {
        console.error("Error fetching classes:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Get classes by teacher UID
    app.get("/classes/teacher/:uid", verifyJWT, async (req, res) => {
      try {
        const { uid } = req.params;
        const classesCollection = database.collection("classes");
        const classes = await classesCollection
          .find({ teacherUid: uid })
          .sort({ createdAt: -1 })
          .toArray();

        res.json({
          success: true,
          classes,
        });
      } catch (error) {
        console.error("Error fetching teacher classes:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Update class status (for admin approval/rejection)
    app.patch("/classes/:id", verifyJWT, async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        // Validate status
        if (!["approved", "rejected", "pending"].includes(status)) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid status. Must be 'approved', 'rejected', or 'pending'",
          });
        }

        const classesCollection = database.collection("classes");

        const result = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Class not found",
          });
        }

        res.json({
          success: true,
          message: `Class ${status} successfully`,
        });
      } catch (error) {
        console.error("Error updating class:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Delete class endpoint
    app.delete("/classes/:id", verifyJWT, async (req, res) => {
      try {
        const { id } = req.params;
        const classesCollection = database.collection("classes");

        const result = await classesCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Class not found",
          });
        }

        res.json({
          success: true,
          message: "Class deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting class:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Update class content (for teachers)
    app.patch("/classes/:id/content", verifyJWT, async (req, res) => {
      try {
        const { id } = req.params;
        const { title, price, description, image } = req.body;

        // Validate required fields
        if (!title || price === undefined || !description || !image) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields",
          });
        }

        const classesCollection = database.collection("classes");

        const result = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              title,
              price: parseFloat(price),
              description,
              image,
              updatedAt: new Date(),
            },
          }
        );

        res.json({
          success: true,
          message: "Class updated successfully",
        });
      } catch (error) {
        console.error("Error updating class content:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Get single class by ID
    app.get("/classes/:id", verifyJWT, async (req, res) => {
      try {
        const { id } = req.params;

        // Validate ObjectId format
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid class ID format",
          });
        }

        const classesCollection = database.collection("classes");
        const classData = await classesCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!classData) {
          return res.status(404).json({
            success: false,
            message: "Class not found",
          });
        }

        res.json({
          success: true,
          class: classData,
        });
      } catch (error) {
        console.error("Error fetching class details:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Process payment and enroll student
    app.post("/payments", verifyJWT, async (req, res) => {
      try {
        const {
          classId,
          studentUid,
          studentName,
          studentEmail,
          amount,
          paymentMethodId,
          transactionId,
        } = req.body;

        // Validate required fields
        if (!classId || !studentUid || !amount || !transactionId) {
          return res.status(400).json({
            success: false,
            message: "Missing required payment fields",
          });
        }

        // Check if class exists and is approved
        const classesCollection = database.collection("classes");
        const classData = await classesCollection.findOne({
          _id: new ObjectId(classId),
        });

        if (!classData) {
          return res.status(404).json({
            success: false,
            message: "Class not found",
          });
        }

        if (classData.status !== "approved") {
          return res.status(400).json({
            success: false,
            message: "Class is not available for enrollment",
          });
        }

        // Check if student is already enrolled
        if (
          classData.enrolledStudents &&
          classData.enrolledStudents.includes(studentUid)
        ) {
          return res.status(409).json({
            success: false,
            message: "Student is already enrolled in this class",
          });
        }

        // Store payment transaction
        const paymentsCollection = database.collection("payments");
        const paymentDoc = {
          transactionId,
          classId,
          studentUid,
          studentName,
          studentEmail,
          amount: parseFloat(amount),
          paymentMethod: "stripe",
          paymentMethodId: paymentMethodId || null,
          status: "completed",
          createdAt: new Date(),
        };

        const paymentResult = await paymentsCollection.insertOne(paymentDoc);

        // Add student to class enrollment
        await classesCollection.updateOne(
          { _id: new ObjectId(classId) },
          {
            $addToSet: { enrolledStudents: studentUid },
            $set: { updatedAt: new Date() },
          }
        );

        res.status(201).json({
          success: true,
          message: "Payment successful and enrolled in class",
          paymentId: paymentResult.insertedId,
          transactionId,
        });
      } catch (error) {
        console.error("Error processing payment:", error);
        res.status(500).json({
          success: false,
          message: "Payment processing failed",
        });
      }
    });

    // Get enrolled classes for a student
    app.get("/students/:uid/enrolled-classes", verifyJWT, async (req, res) => {
      try {
        const { uid } = req.params;
        const classesCollection = database.collection("classes");

        // Find all classes where the student is enrolled
        const enrolledClasses = await classesCollection
          .find({
            enrolledStudents: uid,
            status: "approved",
          })
          .sort({ updatedAt: -1 })
          .toArray();

        res.json({
          success: true,
          classes: enrolledClasses,
        });
      } catch (error) {
        console.error("Error fetching enrolled classes:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Get payment history for a student
    app.get("/students/:uid/payments", verifyJWT, async (req, res) => {
      try {
        const { uid } = req.params;
        const paymentsCollection = database.collection("payments");

        const payments = await paymentsCollection
          .find({ studentUid: uid })
          .sort({ createdAt: -1 })
          .toArray();

        res.json({
          success: true,
          payments,
        });
      } catch (error) {
        console.error("Error fetching payment history:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      try {
        const { amount, currency = "usd", classId, studentUid } = req.body;

        const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100), // Stripe expects cents
          currency: currency,
          metadata: {
            classId: classId,
            studentUid: studentUid,
          },
        });

        res.json({
          success: true,
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
        });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).json({
          success: false,
          message: "Failed to create payment intent",
        });
      }
    });

    // Process enrollment after payment confirmation
    app.post("/process-enrollment", verifyJWT, async (req, res) => {
      try {
        const {
          paymentIntentId,
          classId,
          studentUid,
          studentName,
          studentEmail,
          amount,
        } = req.body;

        // Validate required fields
        if (!paymentIntentId || !classId || !studentUid || !amount) {
          return res.status(400).json({
            success: false,
            message: "Missing required enrollment fields",
          });
        }

        // Verify payment intent exists and was successful (optional but recommended)
        try {
          const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
          const paymentIntent = await stripe.paymentIntents.retrieve(
            paymentIntentId
          );

          if (paymentIntent.status !== "succeeded") {
            return res.status(400).json({
              success: false,
              message: "Payment was not successful",
            });
          }
        } catch (stripeError) {
          console.error("Error verifying payment intent:", stripeError);
          return res.status(400).json({
            success: false,
            message: "Unable to verify payment",
          });
        }

        // Check if class exists and is approved
        const classesCollection = database.collection("classes");
        const classData = await classesCollection.findOne({
          _id: new ObjectId(classId),
        });

        if (!classData) {
          return res.status(404).json({
            success: false,
            message: "Class not found",
          });
        }

        if (classData.status !== "approved") {
          return res.status(400).json({
            success: false,
            message: "Class is not available for enrollment",
          });
        }

        // Check if student is already enrolled
        if (
          classData.enrolledStudents &&
          classData.enrolledStudents.includes(studentUid)
        ) {
          return res.status(200).json({
            success: true,
            message: "Student is already enrolled in this class",
          });
        }

        // Store payment transaction
        const paymentsCollection = database.collection("payments");

        // Check if payment record already exists
        const existingPayment = await paymentsCollection.findOne({
          $or: [
            { stripePaymentIntentId: paymentIntentId },
            { transactionId: paymentIntentId },
          ],
        });

        if (!existingPayment) {
          const paymentDoc = {
            stripePaymentIntentId: paymentIntentId,
            transactionId: paymentIntentId,
            classId,
            studentUid,
            studentName: studentName || "",
            studentEmail: studentEmail || "",
            amount: parseFloat(amount),
            paymentMethod: "stripe",
            status: "completed",
            createdAt: new Date(),
            source: "direct_enrollment",
          };

          await paymentsCollection.insertOne(paymentDoc);
        }

        // Add student to class enrollment
        await classesCollection.updateOne(
          { _id: new ObjectId(classId) },
          {
            $addToSet: { enrolledStudents: studentUid },
            $set: { updatedAt: new Date() },
          }
        );

        res.status(200).json({
          success: true,
          message: "Enrollment completed successfully",
          paymentIntentId,
        });
      } catch (error) {
        console.error("Error processing enrollment:", error);
        res.status(500).json({
          success: false,
          message: "Enrollment processing failed",
        });
      }
    });

    // Create assignment
    app.post("/assignments", verifyJWT, async (req, res) => {
      try {
        const { classId, teacherUid, title, deadline, description, createdAt } =
          req.body;

        // Validate required fields
        if (!classId || !teacherUid || !title || !deadline || !description) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields",
          });
        }

        const assignmentsCollection = database.collection("assignments");

        const assignmentDoc = {
          classId,
          teacherUid,
          title,
          deadline: new Date(deadline),
          description,
          createdAt: new Date(createdAt),
          updatedAt: new Date(),
        };

        const result = await assignmentsCollection.insertOne(assignmentDoc);

        res.status(201).json({
          success: true,
          message: "Assignment created successfully",
          assignmentId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating assignment:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Get assignments for a class
    app.get("/assignments/class/:classId", verifyJWT, async (req, res) => {
      try {
        const { classId } = req.params;
        const assignmentsCollection = database.collection("assignments");

        const assignments = await assignmentsCollection
          .find({ classId })
          .sort({ createdAt: -1 })
          .toArray();

        res.json({
          success: true,
          assignments,
        });
      } catch (error) {
        console.error("Error fetching assignments:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Get submissions for a class
    app.get("/submissions/class/:classId", verifyJWT, async (req, res) => {
      try {
        const { classId } = req.params;
        const submissionsCollection = database.collection("submissions");

        const submissions = await submissionsCollection
          .find({ classId })
          .sort({ submittedAt: -1 })
          .toArray();

        res.json({
          success: true,
          submissions,
        });
      } catch (error) {
        console.error("Error fetching submissions:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Get submissions for a specific student in a specific class
    app.get(
      "/submissions/student/:uid/class/:classId",
      verifyJWT,
      async (req, res) => {
        try {
          const { uid, classId } = req.params;
          const submissionsCollection = database.collection("submissions");

          const submissions = await submissionsCollection
            .find({
              studentUid: uid,
              classId: classId,
            })
            .sort({ submittedAt: -1 })
            .toArray();

          res.json({
            success: true,
            submissions,
          });
        } catch (error) {
          console.error("Error fetching student submissions:", error);
          res.status(500).json({
            success: false,
            message: "Internal server error",
          });
        }
      }
    );

    // Create a new assignment submission
    app.post("/submissions", verifyJWT, async (req, res) => {
      try {
        const {
          assignmentId,
          classId,
          studentUid,
          studentName,
          studentEmail,
          submissionText,
          submittedAt,
        } = req.body;

        // Validate required fields
        if (!assignmentId || !classId || !studentUid || !submissionText) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields",
          });
        }

        const submissionsCollection = database.collection("submissions");

        // Check if student has already submitted this assignment
        const existingSubmission = await submissionsCollection.findOne({
          assignmentId,
          studentUid,
        });

        if (existingSubmission) {
          return res.status(409).json({
            success: false,
            message: "You have already submitted this assignment",
          });
        }

        // Create submission document
        const submissionDoc = {
          assignmentId,
          classId,
          studentUid,
          studentName: studentName || "",
          studentEmail: studentEmail || "",
          submissionText,
          submittedAt: new Date(submittedAt),
          status: "submitted",
        };

        const result = await submissionsCollection.insertOne(submissionDoc);

        res.status(201).json({
          success: true,
          message: "Assignment submitted successfully",
          submissionId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating submission:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Create a new teaching evaluation
    app.post("/teaching-evaluations", verifyJWT, async (req, res) => {
      try {
        const {
          classId,
          teacherUid,
          studentUid,
          studentName,
          studentEmail,
          rating,
          description,
          submittedAt,
        } = req.body;

        // Validate required fields
        if (!classId || !teacherUid || !studentUid || !rating || !description) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields",
          });
        }

        // Validate rating range
        if (rating < 1 || rating > 5) {
          return res.status(400).json({
            success: false,
            message: "Rating must be between 1 and 5",
          });
        }

        const teachingEvaluationsCollection = database.collection(
          "teaching-evaluations"
        );

        // Check if student has already submitted evaluation for this class
        const existingEvaluation = await teachingEvaluationsCollection.findOne({
          classId,
          studentUid,
        });

        if (existingEvaluation) {
          return res.status(409).json({
            success: false,
            message: "You have already submitted an evaluation for this class",
          });
        }

        // Create evaluation document
        const evaluationDoc = {
          classId,
          teacherUid,
          studentUid,
          studentName: studentName || "",
          studentEmail: studentEmail || "",
          rating: parseInt(rating),
          description,
          submittedAt: new Date(submittedAt),
          createdAt: new Date(),
        };

        const result = await teachingEvaluationsCollection.insertOne(
          evaluationDoc
        );

        res.status(201).json({
          success: true,
          message: "Teaching evaluation submitted successfully",
          evaluationId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating teaching evaluation:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.get("/popular-classes", async (req, res) => {
      try {
        const classesCollection = database.collection("classes");
        const popularClasses = await classesCollection
          .aggregate([
            { $match: { status: "approved" } },
            {
              $addFields: {
                enrollmentCount: {
                  $size: { $ifNull: ["$enrolledStudents", []] },
                },
              },
            },
            { $sort: { enrollmentCount: -1 } },
            { $limit: 6 },
          ])
          .toArray();

        res.json({
          success: true,
          classes: popularClasses,
        });
      } catch (error) {
        console.error("Error fetching popular classes:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Get all teaching evaluations (for feedback display)
    app.get("/teaching-evaluations", async (req, res) => {
      try {
        const teachingEvaluationsCollection = database.collection(
          "teaching-evaluations"
        );
        const classesCollection = database.collection("classes");
        const usersCollection = database.collection("users");

        const evaluations = await teachingEvaluationsCollection
          .find({})
          .sort({ submittedAt: -1 })
          .toArray();

        // Enrich evaluations with class titles and student profile pictures
        const enrichedEvaluations = await Promise.all(
          evaluations.map(async (evaluation) => {
            try {
              // Get class title
              const classData = await classesCollection.findOne({
                _id: new ObjectId(evaluation.classId),
              });

              // Get student profile picture
              const studentData = await usersCollection.findOne({
                uid: evaluation.studentUid,
              });

              return {
                ...evaluation,
                classTitle: classData ? classData.title : "EduManage Course",
                studentPhotoURL: studentData ? studentData.photoURL : null,
              };
            } catch (error) {
              return {
                ...evaluation,
                classTitle: "EduManage Course",
                studentPhotoURL: null,
              };
            }
          })
        );

        res.json({
          success: true,
          evaluations: enrichedEvaluations,
        });
      } catch (error) {
        console.error("Error fetching teaching evaluations:", error);
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
