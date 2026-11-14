import express, { application } from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

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

const jobsCollection = database.collection("jobs");
const applicationaCollection = database.collection("applications")

//jobs related api

//create job
app.post("/jobs", async (req, res) => {
  try {
    const jobData = req.body;

    const result = await jobsCollection.insertOne(jobData);

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



app.get('/jobs', async (req, res) => {
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
        { companyName: searchRegex }
      ];
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


//application related api
app.post('/applications', async (req, res) => {
  const application = req.body;
  
  // কোন ইউজার কোন জবে আবেদন করেছে সেই তথ্য যুক্ত করা
  const newApplication = {
    ...application,
    appliedAt: new Date()
  };

  const result = await applicationaCollection.insertOne(newApplication);
  res.send(result);
});


// Get applications by userId
app.get('/applications', async (req, res) => {
  try {
    const userId = req.query.userId;
    let query = {};
    if (userId) {
      query = { userId: userId };
    }
    const applications = await applicationaCollection.find(query).toArray();
    res.send(applications);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


//count application job
app.get('/applications/count', async (req, res) => {
  try {
    const jobId = req.query.jobId;
    let query = {};
    
    if (jobId) {
      query = { jobId: jobId };
    }

    const count = await applicationaCollection.countDocuments(query);
    res.send({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
