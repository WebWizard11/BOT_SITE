const { MongoClient } = require("mongodb");

let client;
let clientPromise;

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "clickstreamdb";

if (!uri) {
  throw new Error("Please add MONGODB_URI to Vercel environment variables");
}

// Global Mongo connection (good for serverless)
if (!clientPromise) {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}


// ===============================
// BOT DETECTION
// ===============================

function detectBot(payload){

  const behavior = payload.behavior || {};
  const temporal = payload.temporal || {};

  const mouseMoves = behavior.mouseMovementCount || 0;
  const activeRatio = temporal.activeTimeRatio || 0;
  const clickInterval = temporal.avgClickInterval || 0;

  if(mouseMoves < 5) return "bot";

  if(activeRatio < 0.15) return "bot";

  if(clickInterval < 50 && clickInterval !== 0) return "bot";

  return "human";
}


// ===============================
// RAGE CLICK DETECTION
// ===============================

function detectRageClicks(events){

  let rageClicks = 0;

  for(let i=1;i<events.length;i++){

    const e1 = events[i-1];
    const e2 = events[i];

    if(e1.type==="click" && e2.type==="click"){

      const dt = e2.ts - e1.ts;

      if(dt < 200){
        rageClicks++;
      }

    }

  }

  return rageClicks;
}


// ===============================
// ENGAGEMENT SCORE
// ===============================

function computeEngagement(payload){

  const temporal = payload.temporal || {};
  const behavior = payload.behavior || {};

  const duration = temporal.sessionDuration || 0;
  const scroll = behavior.scrollDepth || 0;
  const path = behavior.mousePathLength || 0;
  const clicks = temporal.clickFrequency || 0;

  const score =
    0.3 * duration +
    0.3 * scroll +
    0.2 * path +
    0.2 * clicks;

  return Math.round(score);
}


// ===============================
// API HANDLER
// ===============================

module.exports = async function handler(req, res) {

  // Health check
  if (req.method === "GET") {
    return res.status(200).json({
      status: "Clickstream collector running"
    });
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {

    const client = await clientPromise;
    const db = client.db(dbName);

    let body;

    try {
      body = typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body;
    } catch {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    if (!body || !body.sessionId) {
      return res.status(400).json({ error: "Invalid session payload" });
    }

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket?.remoteAddress ||
      "unknown";

    const userAgent = req.headers["user-agent"] || "unknown";

    const events = body.events || [];

    // ===============================
    // ANALYTICS FEATURES
    // ===============================

    const botType = detectBot(body);
    const rageClicks = detectRageClicks(events);
    const engagementScore = computeEngagement(body);


    await db.collection("clickstream").insertOne({
      ...body,
      botType,
      rageClicks,
      engagementScore,
      ipAddress: ip,
      userAgent,
      createdAt: new Date()
    });

    return res.status(204).end();

  } catch (err) {

    console.error("collector error:", err);

    return res.status(500).json({
      error: err.message
    });

  }
};
