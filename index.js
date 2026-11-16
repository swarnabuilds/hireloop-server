import express, { application } from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

const myLogger = (req, res, next) => {
  next();
};

const client = new MongoClient(process.env.MONGO_URI);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const connectedClient = await connectToMongoDB();
const database = connectedClient.db("hireloopdb");
const users = database.collection("user");
const sessions = database.collection("session");

const jobsCollection = database.collection("jobs");
const applicationaCollection = database.collection("applications");
const paymentsCollection = database.collection("payments");

//middlewre
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  // console.log(authHeader)

  //check header exist or not
  if (!authHeader) {
    res.status(401).send({ message: "Unauthorized" });
    return;
  }

  const token = authHeader.split(" ")[1];
  // console.log(token)
  if (!token) {
    res.status(401).send({ message: "Unauthorized" });
    return;
  }

  const query = { token };
  const session = await sessions.findOne(query);
  if (!session) {
    res.status(401).send({ message: "Unauthorized" });
    return;
  }

  const userId = session.userId;
  const userQuery = { _id: new ObjectId(userId) }
  const user = await users.findOne(userQuery)

  if(!user){
    res.status(401).send({ message: "Unauthorized" });
    return;
  }

  req.user = user;

  next()
};

//jobs related api
//create job
app.post("/jobs", async (req, res) => {
  try {
    const jobData = req.body;

    // ডেডলাইন চেক করে ডাইনামিকালি স্ট্যাটাস নির্ধারণ (যদি ডেডলাইন পার হয়ে যায় তবে Expired, নতুবা Active)
    const isExpired = jobData.deadline
      ? new Date(jobData.deadline) < new Date()
      : false;

    const newJob = {
      ...jobData,
      status: jobData.status || (isExpired ? "Expired" : "Active"), // ফ্রন্টএন্ড থেকে না আসলেও ডাটাবেজে সেভ হবে
      createdAt: new Date().toISOString(),
    };

    const result = await jobsCollection.insertOne(newJob);

    res.status(201).send({
      success: true,
      message: "Job created successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Create Job Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to create job",
    });
  }
});

app.get("/jobs", async (req, res) => {
  try {
    // 1. Extract query parameters from the request URL
    const { search, category, jobType, location, isRemote } = req.query;

    // 2. Initialize an empty query object
    const query = {};

    // 3. If a search keyword is provided, apply global search across multiple fields using $or
    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      query.$or = [
        { title: searchRegex },
        { qualifications: searchRegex },
        { location: searchRegex },
        { companyName: searchRegex },
      ];
    }

    if (req.query.recruiterId) {
      query.recruiterId = req.query.recruiterId;
    }

    // 4. If category filter is provided, add it to the query
    if (category) {
      query.category = { $regex: category, $options: "i" };
    }

    // 5. If jobType filter is provided, add it to the query
    if (jobType) {
      query.jobType = { $regex: jobType, $options: "i" };
    }

    // 6. If location filter is provided, add it to the query
    if (location) {
      query.location = { $regex: location, $options: "i" };
    }

    // 7. If isRemote filter is provided, convert string to boolean and add to query
    if (isRemote !== undefined && isRemote !== "") {
      query.isRemote = isRemote === "true";
    }

    // 💡 এখানে ম্যাজিক হয়:
    // যদি কোনো সার্চ বা ফিল্টার না থাকে, তবে query অবজেক্টটি খালি ({}) থাকবে।
    // ফলে jobsCollection.find({}) ডাটাবেজের সব জব একসাথে ফেচ করে নিয়ে আসবে!
    const cursor = jobsCollection.find(query);
    const result = await cursor.toArray();

    // 8. Send the result back to the client
    res.send(result);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    res.status(500).send({ error: "Failed to fetch jobs" });
  }
});

// job delete
app.delete("/jobs/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const query = { _id: new ObjectId(id) };
    const result = await jobsCollection.deleteOne(query);

    res.send(result);
  } catch (error) {
    console.error("Error deleting job:", error);
    res.status(500).send({ error: "Failed to delete job" });
  }
});

//job edit
app.patch("/jobs/:id", async (req, res) => {
  const id = req.params.id;
  const updatedData = req.body;

  try {
    const filter = { _id: new ObjectId(id) };

    // একদম শর্টকাটে সরাসরি req.body সেট করে দেওয়া
    const updateDoc = { $set: updatedData };

    const result = await jobsCollection.updateOne(filter, updateDoc);
    res.send(result);
  } catch (error) {
    console.error("Error updating job:", error);
    res.status(500).send({ error: "Failed to update job" });
  }
});

//jobs details
app.get("/jobs/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await jobsCollection.findOne(query);
  res.send(result);
});

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/users", async (req, res) => {
  const cursor = users.find({});
  const result = await cursor.toArray();
  res.send(result);
});

// application related api
app.post("/applications", async (req, res) => {
  try {
    const application = req.body;
    let foundJob = null;

    // ১. jobId দিয়ে জব খোঁজা (ObjectId অথবা String উভয় ফরম্যাট সাপোর্ট করার জন্য)
    try {
      foundJob = await jobsCollection.findOne({
        _id: new ObjectId(application.jobId),
      });
    } catch (err) {
      foundJob = await jobsCollection.findOne({
        _id: application.jobId,
      });
    }

    // ২. নতুন অ্যাপ্লিকেশন অবজেক্ট তৈরি যেখানে recruiterId বাধ্যতামূলকভাবে থাকবে
    const newApplication = {
      ...application,
      recruiterId: foundJob
        ? foundJob.recruiterId || foundJob.employerId || null
        : null,
      appliedAt: new Date(),
    };

    const result = await applicationaCollection.insertOne(newApplication);
    res.send(result);
  } catch (error) {
    console.error("Apply Error:", error);
    res.status(500).send({ success: false, message: error.message });
  }
});

// Get applications by userId or recruiterId
app.get("/applications", verifyToken, async (req, res) => {
  try {
    const { userId, recruiterId, jobId } = req.query;
    let query = {};

    if (userId) {
      query.userId = userId;
    }

    if (jobId) {
      const jobQuery = { _id: new ObjectId(jobId) };
      const job = await jobsCollection.findOne(jobQuery);
      
      // ভিডিওর আদলে সিকিউরিটি চেক
      if (job && job.recruiterId !== req.user._id.toString() && req.user.role !== 'admin') {
        res.status(403).send({ message: 'Forbidden' });
        return;
      }
      
      query.jobId = jobId;
    }

    // যদি রিক্রুটার আইডি দিয়ে কুয়েরি করা হয়
    if (recruiterId) {
      // রিক্রুটারের জন্য এক্সট্রা সিকিউরিটি চেক
      if (recruiterId !== req.user._id.toString() && req.user.role !== 'admin') {
        res.status(403).send({ message: 'Forbidden' });
        return;
      }

      // ১. প্রথমে দেখে নাও এই রিক্রুটার কোন কোন জবগুলো পোস্ট করেছে
      const recruiterJobs = await jobsCollection.find({ recruiterId: recruiterId }).toArray();
      const jobIds = recruiterJobs.map(job => job._id.toString()); // অথবা শুধু job._id যদি স্ট্রিং হয়

      // ২. এখন অ্যাপ্লিকেশন কালেকশন থেকে এমন সব অ্যাপ্লিকেশন খোঁজো যেগুলো এই জবগুলোর আন্ডারে পড়েছে 
      // অথবা সরাসরি অ্যাপ্লিকেশনের ভেতরে recruiterId ম্যাচ করে
      query = {
        $or: [
          { recruiterId: recruiterId },
          { jobId: { $in: jobIds } }
        ]
      };
    }

    const applications = await applicationaCollection.find(query).toArray();
    res.send(applications);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});



//  application status update API
app.patch("/applications/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res
        .status(400)
        .send({ success: false, message: "Status is required" });
    }

    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: { status: status },
    };

    const result = await applicationaCollection.updateOne(filter, updateDoc);

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .send({ success: false, message: "Application not found" });
    }

    res.send({
      success: true,
      message: "Status updated successfully",
      result,
    });
  } catch (error) {
    console.error("Update Application Status Error:", error);
    res
      .status(500)
      .send({ success: false, message: "Failed to update status" });
  }
});

//count application job
app.get("/applications/count", async (req, res) => {
  const { userId } = req.query;
  const query = userId ? { userId } : {};
  const count = await applicationaCollection.countDocuments(query);
  res.send({ count });
});

//payment related api
app.post("/payments/checkout-verify", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.send({ success: false, message: "Session ID is required" });
  }

  const { status, payment_status, customer_email, metadata, payment_intent } =
    await stripe.checkout.sessions.retrieve(sessionId);

  if (status === "complete" && payment_status === "paid") {
    const sessionQuery = { sessionId };
    const existingPayment = await paymentsCollection.findOne(sessionQuery);

    if (existingPayment) {
      return res.send({ success: false, message: "Payment Aleady Verified" });
    }

    const payment = {
      sessionId,
      status,
      payment_status,
      customer_email,
      userId: metadata.userId,
      paayment_date: new Date(),
      payment_intent,
    };

    const result = await paymentsCollection.insertOne(payment);

    //updte the user table
    const query = { _id: new ObjectId(metadata.userId) };

    const updatedDoc = {
      $set: {
        premium: true,
      },
    };

    const updatedResult = await users.updateOne(query, updatedDoc);
    res.send({ success: true, result, updatedResult });
    return;
  }

  res.send({ success: false, message: "Payment Veification Faield" });
});

//for one user payment one
app.get("/users/:id/premium", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await users.findOne(query, { projection: { premium: 1 } });
  res.send(result);
});

//user role select for admin pannel
app.patch("/users/:id/role", async (req, res) => {
  const id = req.params.id;
  const { role } = req.body;
  const query = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: {
      role: role,
    },
  };
  const result = await users.updateOne(query, updateDoc);
  res.send(result);
});

app.listen(port, () => {
  console.log(`server running on port ${port}`);
});
