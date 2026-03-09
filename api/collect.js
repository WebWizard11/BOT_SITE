import { MongoClient } from "mongodb";

let cachedClient = null;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const uri = process.env.MONGODB_URI;

    if (!cachedClient) {
      cachedClient = new MongoClient(uri);
      await cachedClient.connect();
    }

    const db = cachedClient.db(process.env.MONGODB_DB || "clickstreamdb");

    const data = req.body;

    await db.collection("clickstream").insertOne({
      ...data,
      createdAt: new Date(),
    });

    res.status(204).end();
  } catch (err) {
    console.error("collector error", err);
    res.status(500).json({ error: err.message });
  }
}