// background.js

// --- CONFIGURATION ---
const PROJECT_ID = "barcode-sync-af05a"; 
const API_KEY = "AIzaSyCBt90FwYp9Qsxa_ByzgbfDbEcPIXY43bA";

// 🟢 FINAL API KEYS (Only Google & VirusTotal):
const GOOGLE_API_KEY = "AIzaSyAoYeGxp8RCNbRandPrwjlI8LlYgyf3-ss";
const VT_API_KEY = "3752bcc9bb311421d676fa2cb7a43ca08b6d64b1b0ac0b30cd629078ad01d0d3";

// --- INITIALIZATION ---
chrome.runtime.onInstalled.addListener(async () => {
  console.log("Guardian Installed.");
  
  const data = await chrome.storage.local.get("userId");
  if (!data.userId) {
    const newId = 'user_' + Math.random().toString(36).substr(2, 9);
    await chrome.storage.local.set({ userId: newId, userPoints: 0 });
  }

  syncScamList();
  syncUserPoints();
  
  // Sync checks every 1 minute
  chrome.alarms.create("syncDatabase", { periodInMinutes: 1/60 });

  chrome.contextMenus.create({
    id: "scanLink",
    title: "🛡️ Scan Link with Guardian",
    contexts: ["link"]
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "syncDatabase") {
    syncScamList();
    syncUserPoints();
  }
});

// --- SYNC POINTS ---
async function syncUserPoints() {
  const { userId } = await chrome.storage.local.get("userId");
  if (!userId) return;

  try {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${userId}?key=${API_KEY}`;
    const response = await fetch(endpoint);
    if (response.ok) {
      const data = await response.json();
      const serverPoints = parseInt(data.fields?.points?.integerValue || 0);
      await chrome.storage.local.set({ userPoints: serverPoints });
    }
  } catch (e) {}
}

// --- RIGHT CLICK LISTENER (Deep Scan) ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "scanLink") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "y1.jpg",
      title: "Guardian Scanning...",
      message: "Checking Google Safe Browsing & VirusTotal."
    });

    const isSafe = await runDeepScan(info.linkUrl);

    if (isSafe) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "scam.jpg",
        title: "✅ Link Appears Safe",
        message: "No threats found in Global Security Databases."
      });
    } else {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "scam.jpg",
        title: "⛔ DANGER DETECTED",
        message: "This link is flagged as unsafe! Do not visit."
      });
    }
  }
});

// --- MAIN SCANNING LOGIC ---
async function runDeepScan(url) {
  let urlObj;
  try { urlObj = new URL(url); } catch(e) { return false; }
  const hostname = urlObj.hostname;

  // 1. Local Database Check
  const storage = await chrome.storage.local.get("scam_db");
  const localList = storage.scam_db || [];
  const cleanHost = hostname.replace(/^www\./, "");
  if (localList.some(scam => cleanHost.includes(scam))) return false;

  // 2. Google Safe Browsing
  if (await checkGoogleSafeBrowsing(url)) return false;

  // 3. VirusTotal
  if (await checkVirusTotal(url)) return false;

  return true;
}

// --- SYNC SCAM LIST ---
async function syncScamList() {
  try {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/reports?key=${API_KEY}`;
    const response = await fetch(endpoint);
    const data = await response.json();

    const approvedScams = [];
    if (data.documents) {
      data.documents.forEach(doc => {
        const fields = doc.fields;
        if (fields.status && fields.status.stringValue === "approved") {
          if (fields.url && fields.url.stringValue) {
            approvedScams.push(fields.url.stringValue);
          }
        }
      });
    }
    await chrome.storage.local.set({ scam_db: approvedScams });
  } catch (error) {
    console.error("Sync failed:", error);
  }
}

// --- PROTECTION LOGIC (On Tab Update) ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && !tab.url.startsWith("chrome://")) {
    checkUrlSafety(tab.url, tabId);
  }
});

async function checkUrlSafety(url, tabId) {
  let urlObj;
  try { urlObj = new URL(url); } catch(e) { return; }
  const hostname = urlObj.hostname;

  // 1. Whitelist Check
  const storage = await chrome.storage.local.get("whitelist");
  const whitelist = storage.whitelist || [];
  if (whitelist.includes(hostname)) return; 

  // 2. HTTP Check
  if (urlObj.protocol === "http:") {
    blockSite(tabId, url, "Insecure Connection (HTTP Blocked)");
    return;
  }

  // 3. Local Scam DB
  const data = await chrome.storage.local.get("scam_db");
  const localList = data.scam_db || [];
  const cleanHost = hostname.replace(/^www\./, "");
  if (localList.some(scam => cleanHost.includes(scam))) {
    blockSite(tabId, url, "Community Reported Scam");
    return;
  }

  // 4. Google Safe Browsing (Fastest API check)
  if (await checkGoogleSafeBrowsing(url)) {
    blockSite(tabId, url, "Google Safe Browsing Alert");
    return;
  }
}

function blockSite(tabId, originalUrl, reason) {
  const warningUrl = chrome.runtime.getURL(`warning.html?reason=${encodeURIComponent(reason)}&url=${encodeURIComponent(originalUrl)}`);
  chrome.tabs.update(tabId, { url: warningUrl });
}

// --- API IMPLEMENTATIONS (Google & VirusTotal Only) ---

async function checkGoogleSafeBrowsing(url) {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY.includes("YOUR_")) return false;
  const apiUrl = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${GOOGLE_API_KEY}`;
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client: { clientId: "guardian-ext", clientVersion: "1.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url: url }]
        }
      })
    });
    const data = await response.json();
    return data.matches && data.matches.length > 0;
  } catch (e) { return false; }
}

async function checkVirusTotal(url) {
  if (!VT_API_KEY || VT_API_KEY.includes("YOUR_")) return false;
  const urlId = btoa(url).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  try {
    const response = await fetch(`https://www.virustotal.com/api/v3/urls/${urlId}`, {
      headers: { "x-apikey": VT_API_KEY }
    });
    const data = await response.json();
    if (data.data && data.data.attributes) {
      const stats = data.data.attributes.last_analysis_stats;
      return (stats.malicious + stats.suspicious) > 0;
    }
  } catch (e) { return false; }
  return false;
}