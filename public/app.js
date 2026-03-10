// ===============================
// SESSION INITIALIZATION
// ===============================

const sessionId = crypto.randomUUID();
document.getElementById("sessionId").innerText = sessionId;

let consentGranted = false;

let events = [];
let lastEventTs = Date.now();
let sessionStart = Date.now();

let mouseMoves = 0;
let pathLength = 0;
let lastX = null;
let lastY = null;

let clickCount = 0;
let clickIntervals = [];
let lastClickTime = null;

let scrollCount = 0;
let maxScroll = 0;

let hoverStart = null;
let hoverTime = 0;

let activeTime = 0;

let eventCountEl = document.getElementById("eventCount");
let statusEl = document.getElementById("status");
let toastEl = document.getElementById("toast");

let toastTimeout;

// ===============================
// EVENT STORAGE
// ===============================

function pushEvent(e) {
  if (!consentGranted) return;

  events.push(e);

  if (eventCountEl) {
    eventCountEl.innerText = events.length;
  }

  // limit event memory
  if (events.length > 500) {
    events.shift();
  }
}

// ===============================
// TOAST NOTIFICATION
// ===============================

function showToast(message) {
  if (!toastEl) return;

  toastEl.textContent = message;
  toastEl.classList.add("show");

  if (toastTimeout) clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 3000);
}

// ===============================
// ACTIVITY TRACKING
// ===============================

function setActive() {
  lastEventTs = Date.now();
}

// ===============================
// MOUSE TRACKING (THROTTLED)
// ===============================

let lastMove = 0;

document.addEventListener("mousemove", (e) => {
  if (!consentGranted) return;

  const now = Date.now();
  if (now - lastMove < 100) return;

  lastMove = now;

  mouseMoves++;
  setActive();

  if (lastX !== null) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;

    const dist = Math.sqrt(dx * dx + dy * dy);

    pathLength += dist;
  }

  lastX = e.clientX;
  lastY = e.clientY;

  pushEvent({
    type: "mousemove",
    ts: now,
    x: e.clientX,
    y: e.clientY,
  });
});

// ===============================
// SCROLL TRACKING
// ===============================

document.addEventListener("scroll", () => {
  if (!consentGranted) return;

  scrollCount++;

  maxScroll = Math.max(
    maxScroll,
    window.scrollY + window.innerHeight
  );

  setActive();

  pushEvent({
    type: "scroll",
    ts: Date.now(),
    scrollY: window.scrollY,
  });
});

// ===============================
// CLICK TRACKING
// ===============================

document.addEventListener("click", (e) => {
  if (!consentGranted) return;

  clickCount++;

  const now = Date.now();

  const interval = lastClickTime
    ? now - lastClickTime
    : 0;

  if (lastClickTime) {
    clickIntervals.push(interval);
  }

  lastClickTime = now;

  setActive();

  pushEvent({
    type: "click",
    ts: now,
    x: e.clientX,
    y: e.clientY,
    interval,
  });
});

// ===============================
// AD INTERACTION
// ===============================

document.querySelectorAll(".ad").forEach((ad) => {
  ad.addEventListener("mouseenter", () => {
    hoverStart = Date.now();

    pushEvent({
      type: "hover_start",
      ts: Date.now(),
      id: ad.innerText,
    });
  });

  ad.addEventListener("mouseleave", () => {
    if (hoverStart) {
      hoverTime += Date.now() - hoverStart;
    }

    pushEvent({
      type: "hover_end",
      ts: Date.now(),
      id: ad.innerText,
    });
  });

  ad.addEventListener("click", () => {
    pushEvent({
      type: "ad_click",
      ts: Date.now(),
      id: ad.innerText,
    });
  });
});

// ===============================
// TAB VISIBILITY
// ===============================

window.addEventListener("visibilitychange", () => {
  pushEvent({
    type: "visibility",
    ts: Date.now(),
    state: document.visibilityState,
  });
});

// ===============================
// FEATURE COMPUTATION
// ===============================

function computeFeatures() {
  const sessionEnd = Date.now();

  const duration = sessionEnd - sessionStart;

  activeTime =
    duration - Math.max(0, Date.now() - lastEventTs);

  const clicksPerMinute =
    clickCount / (duration / 60000) || 0;

  const avgClickInterval =
    clickIntervals.length > 0
      ? clickIntervals.reduce((a, b) => a + b) /
        clickIntervals.length
      : 0;

  return {
    sessionId,

    temporal: {
      sessionStart,
      sessionEnd,
      sessionDuration: duration,
      clickFrequency: clickCount,
      clicksPerMinute,
      clickIntervals,
      avgClickInterval,
      activeTime,
      activeTimeRatio: activeTime / duration,
    },

    behavior: {
      mouseMovementCount: mouseMoves,
      mousePathLength: pathLength,
      hoverTime,
      scrollCount,
      scrollDepth: maxScroll,
      lastCursor: { x: lastX, y: lastY },
    },

    traffic: {
      pagesVisited: 1,
      dwellTime: duration,
      adImpressions: document.querySelectorAll(".ad")
        .length,
      clickThroughRate:
        document.querySelectorAll(".ad").length > 0
          ? clickCount /
            document.querySelectorAll(".ad").length
          : 0,
      referrer: document.referrer,
      landingPage: window.location.href,
    },

    events: events.slice(-200), // limit payload size
  };
}

// ===============================
// SEND DATA
// ===============================

async function sendData() {
  if (!consentGranted) return;

  if (events.length === 0) return;

  const payload = computeFeatures();

  if (statusEl) {
    statusEl.textContent = "Sending data...";
  }

  try {
    const res = await fetch("/api/collect", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      if (statusEl) {
        statusEl.textContent = "Last sync just now";
      }

      showToast("Session data saved");

      events = [];
    } else {
      const text = await res.text();

      if (statusEl) {
        statusEl.textContent =
          "Save failed: " + res.status;
      }
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent =
        "Unable to reach server";
    }
  }
}

// ===============================
// SEND DATA ON TAB CLOSE
// ===============================

function flushOnUnload() {
  if (!consentGranted) return;

  const payload = computeFeatures();

  try {
    const blob = new Blob(
      [JSON.stringify(payload)],
      { type: "application/json" }
    );

    navigator.sendBeacon("/api/collect", blob);
  } catch (e) {}
}

window.addEventListener("beforeunload", flushOnUnload);

// ===============================
// CONSENT SYSTEM
// ===============================

const consentBox = document.getElementById("consent");
const content = document.getElementById("content");

document
  .getElementById("btn-accept")
  .addEventListener("click", () => {
    consentGranted = true;

    consentBox.classList.add("hidden");
    content.classList.remove("hidden");

    if (statusEl) {
      statusEl.textContent =
        "Collecting interaction data";
    }
  });

document
  .getElementById("btn-decline")
  .addEventListener("click", () => {
    consentBox.innerHTML =
      "<p>Consent declined. You may close this tab.</p>";

    content.classList.add("hidden");

    if (statusEl) {
      statusEl.textContent =
        "Collection disabled";
    }
  });

// ===============================
// PERIODIC SYNC
// ===============================

setInterval(sendData, 20000);