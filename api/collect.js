const { MongoClient } = require("mongodb");

// Reuse client across invocations in a serverless environment.
// (In Vercel, module scope may be reused between requests.)
let client;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB || "clickstreamdb";

    if (!uri) {
      console.error("collector error: MONGODB_URI is not set");
      return res
        .status(500)
        .json({ error: "Server misconfiguration: database URL missing" });
    }

    if (!client) {
      const nextClient = new MongoClient(uri);
      try {
        await nextClient.connect();
        client = nextClient;
      } catch (err) {
        try {
          await nextClient.close();
        } catch (e) {}
        throw err;
      }
    }

    const db = client.db(dbName);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    await db.collection("clickstream").insertOne({
      ...body,
      createdAt: new Date(),
    });

    return res.status(204).end();
  } catch (err) {
    console.error("collector error:", err);
    return res.status(500).json({ error: "Database error: " + err.message });
  }
};