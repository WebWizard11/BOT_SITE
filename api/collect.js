const { MongoClient } = require("mongodb");

let client;

module.exports = async function handler(req, res) {

  // Health check route
  if (req.method === "GET") {
    return res.status(200).json({
      status: "Clickstream collector running"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {

    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB || "clickstreamdb";

    if (!uri) {
      console.error("collector error: MONGODB_URI missing");

      return res.status(500).json({
        error: "Server misconfiguration: database URL missing"
      });
    }

    if (!client) {
      client = new MongoClient(uri);
      await client.connect();
    }

    const db = client.db(dbName);

    let body;

    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    } catch {
      return res.status(400).json({
        error: "Invalid JSON payload"
      });
    }

    if (!body || !body.sessionId) {
      return res.status(400).json({
        error: "Invalid session payload"
      });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket?.remoteAddress ||
      "unknown";

    const userAgent =
      req.headers["user-agent"] || "unknown";

    await db.collection("clickstream").insertOne({
      ...body,
      ipAddress: ip,
      userAgent,
      createdAt: new Date()
    });

    return res.status(204).end();

  } catch (err) {

    console.error("collector error:", err);

    return res.status(500).json({
      error: "Database error: " + err.message
    });

  }
};
