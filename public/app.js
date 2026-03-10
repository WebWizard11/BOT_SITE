
// Frontend collector script
const sessionId = crypto.randomUUID ? crypto.randomUUID() : ('s-' + Math.random().toString(36).slice(2));
document.getElementById('sessionId').innerText = sessionId;

let events = [];
let lastEventTs = Date.now();
let sessionStart = Date.now();
let mouseMoves = 0;
let pathLength = 0;
let lastX = null, lastY = null;
let clickCount = 0;
let clickIntervals = [];
let lastClickTime = null;
let scrollCount = 0;
let maxScroll = 0;
let hoverStart = null;
let hoverTime = 0;
let activeTime = 0;
let inactivityTimer = null;
let eventCountEl = document.getElementById('eventCount');
let statusEl = document.getElementById('status');
let toastEl = document.getElementById('toast');
let toastTimeout;

function pushEvent(e){
  events.push(e);
  eventCountEl.innerText = events.length;
}

function showToast(message){
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(()=>{
    toastEl.classList.remove('show');
  }, 3000);
}

// Activity / idle tracking
function setActive(){
  lastEventTs = Date.now();
  if(inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(()=>{}, 10000);
}

document.addEventListener('mousemove', (e)=>{
  mouseMoves++;
  setActive();
  if(lastX !== null){
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    pathLength += dist;
  }
  lastX = e.clientX; lastY = e.clientY;
  pushEvent({type:'mousemove', ts: Date.now(), x: e.clientX, y: e.clientY});
});

document.addEventListener('scroll', ()=>{
  scrollCount++;
  maxScroll = Math.max(maxScroll, window.scrollY);
  setActive();
  pushEvent({type:'scroll', ts: Date.now(), scrollY: window.scrollY});
});

document.addEventListener('click', (e)=>{
  clickCount++;
  const now = Date.now();
  const interval = lastClickTime ? now - lastClickTime : 0;
  if(lastClickTime) clickIntervals.push(interval);
  lastClickTime = now;
  setActive();
  pushEvent({type:'click', ts: now, x: e.clientX, y: e.clientY, interval});
});

document.querySelectorAll('.ad').forEach(ad=>{
  ad.addEventListener('mouseenter', ()=>{
    hoverStart = Date.now();
    pushEvent({type:'hover_start', ts: Date.now(), id: ad.innerText});
  });
  ad.addEventListener('mouseleave', ()=>{
    if(hoverStart) hoverTime += Date.now() - hoverStart;
    pushEvent({type:'hover_end', ts: Date.now(), id: ad.innerText});
  });
  ad.addEventListener('click', ()=>{
    pushEvent({type:'ad_click', ts: Date.now(), id: ad.innerText});
  });
});

window.addEventListener('visibilitychange', ()=>{
  pushEvent({type:'visibility', ts: Date.now(), state: document.visibilityState});
});

function computeFeatures(){
  const sessionEnd = Date.now();
  const duration = sessionEnd - sessionStart;
  // active time approximation: duration - idle gap (>10s) sum
  // simplistic: activeTime as duration - time since lastEvent
  activeTime = duration - Math.max(0, (Date.now() - lastEventTs));
  const clicksPerMinute = (clickCount / (duration/60000)) || 0;
  const avgClickInterval = clickIntervals.length ? (clickIntervals.reduce((a,b)=>a+b,0)/clickIntervals.length) : 0;

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
      activeTimeRatio: activeTime / duration
    },
    behavior: {
      mouseMovementCount: mouseMoves,
      mousePathLength: pathLength,
      hoverTime,
      scrollCount,
      scrollDepth: maxScroll,
      lastCursor: {x:lastX, y:lastY}
    },
    traffic: {
      pagesVisited: 1,
      dwellTime: duration,
      adImpressions: document.querySelectorAll('.ad').length,
      clickThroughRate: document.querySelectorAll('.ad').length ? (clickCount / document.querySelectorAll('.ad').length) : 0,
      referrer: document.referrer,
      landingPage: window.location.href
    },
    events // raw events
  };
}

function sendData(){
  const payload = computeFeatures();
  if (statusEl) {
    statusEl.textContent = "Sending data to server...";
  }
  fetch('/api/collect', {
    method:'POST',
    body: JSON.stringify(payload),
    headers:{'Content-Type':'application/json'}
  })
    .then(async (res)=>{
      if (res.ok) {
        if (statusEl) statusEl.textContent = "Last sync just now";
        showToast("Session data saved to database");
      } else {
        let details = "";
        try {
          const text = await res.text();
          details = text ? ` (${text.slice(0, 120)})` : "";
        } catch(e) {}
        if (statusEl) statusEl.textContent = `Save failed: HTTP ${res.status}${details}`;
      }
    })
    .catch(()=>{
      if (statusEl) statusEl.textContent = "Unable to reach server";
    });
}

function flushOnUnload(){
  const payload = computeFeatures();
  try {
    navigator.sendBeacon('/api/collect', JSON.stringify(payload));
  } catch(e){
    // ignore
  }
}

// Consent handling
const consentBox = document.getElementById('consent');
const content = document.getElementById('content');
document.getElementById('btn-accept').addEventListener('click', ()=>{
  consentBox.classList.add('hidden');
  content.classList.remove('hidden');
  if (statusEl) statusEl.textContent = "Collecting interaction data";
});
document.getElementById('btn-decline').addEventListener('click', ()=>{
  consentBox.innerHTML = '<p>Consent declined. You may close this tab.</p>';
  content.classList.add('hidden');
  if (statusEl) statusEl.textContent = "Collection disabled";
});

// Send data on unload
window.addEventListener('beforeunload', flushOnUnload);

// also send data every 20 seconds
setInterval(sendData, 20000);