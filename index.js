import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
const port = process.env.PORT ||  5000;

//middleware
app.use(cors())
app.use(express.json())

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
const database = connectedClient.db('hireloopdb');
const users = database.collection("user")

const jobsCollection = database.collection("jobs")

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

app.get('/jobs', async(req, res) => {
  const cursor = jobsCollection.find({})
    const result = await cursor.toArray()
  res.send(result);
});

// job delete
app.delete('/jobs/:id', async (req, res) => {
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
app.patch('/jobs/:id', async (req, res) => {
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
app.get('/jobs/:id', async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await jobsCollection.findOne(query);
  res.send(result);
});





app.get('/', (req, res) => {
  res.send('Hello World!');
});


app.get('/users', async(req, res) => {
    const cursor = users.find({})
    const result = await cursor.toArray()
  res.send(result);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});