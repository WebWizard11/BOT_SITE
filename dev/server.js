// Local express server for testing (not used on Vercel)

const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const geoip = require("geoip-lite");
const UAParser = require("ua-parser-js");
const { v4: uuidv4 } = require("uuid");
const { MongoClient } = require("mongodb");

require("dotenv").config();

const app = express();

app.use(bodyParser.json({ limit: "2mb" }));
app.use(express.static("public"));

const MONGO_URI = process.env.MONGODB_URI || "";
const MONGO_DB = process.env.MONGODB_DB || "clickstreamdb";

let mongoClient;

// ===============================
// DATABASE CONNECTION
// ===============================

async function getDb() {
  if (!mongoClient) {
    const nextClient = new MongoClient(MONGO_URI);

    try {
      await nextClient.connect();
      mongoClient = nextClient;
      console.log("MongoDB connected");
    } catch (err) {
      try {
        await nextClient.close();
      } catch (e) {}

      throw err;
    }
  }

  return mongoClient.db(MONGO_DB);
}

// ===============================
// DEVICE PARSING
// ===============================

function parseDevice(req) {
  const ua = new UAParser(req.headers["user-agent"]);
  const result = ua.getResult();

  return {
    userAgent: req.headers["user-agent"],
    browser: result.browser.name || "unknown",
    os: result.os.name || "unknown",
    deviceType: result.device.type || "desktop",
  };
}

// ===============================
// CLICKSTREAM HANDLER
// ===============================

async function collectHandler(req, res) {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      "";

    const geo = geoip.lookup(ip);

    const device = parseDevice(req);

    const payload = req.body;

    const record = {
      _id: uuidv4(),
      receivedAt: Date.now(),
      ipAddress: ip,
      geoLocation: geo ? geo.country : "unknown",
      device,
      payload,
    };

    // Save locally for debugging
    fs.mkdirSync("data", { recursive: true });

    fs.appendFileSync(
      "data/clickstream.jsonl",
      JSON.stringify(record) + "\n"
    );

    // Save to MongoDB
    if (MONGO_URI) {
      const db = await getDb();
      await db.collection("clickstream").insertOne(record);
    }

    res.status(204).end();
  } catch (err) {
    console.error("Collector error:", err);

    res.status(500).json({
      error: "server error",
    });
  }
}

// ===============================
// ROUTES
// ===============================

app.post("/collect", collectHandler);
app.post("/api/collect", collectHandler);

app.get("/", (req, res) => {
  res.send("Clickstream collector running");
});

// ===============================
// LOCAL SERVER START
// ===============================

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Local server running at http://localhost:${PORT}`);
  });
}

// Export for serverless environments
module.exports = app;