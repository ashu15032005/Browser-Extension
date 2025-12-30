// --- CONFIGURATION ---
const PROJECT_ID = "barcode-sync-af05a"; 
const API_KEY = "AIzaSyCBt90FwYp9Qsxa_ByzgbfDbEcPIXY43bA";
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

// --- RIGHT CLICK LISTENER (Deep Scan) ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "scanLink") {
    
    // Notification: Scanning
    chrome.notifications.create({
      type: "basic",
      iconUrl: "scam.png", 
      title: "Guardian Scanning...",
      message: "Checking the link against multiple security databases."
    });

    const isSafe = await runDeepScan(info.linkUrl);

    // Notification: Result
    if (isSafe) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "scam.png",
        title: "✅ Link Appears Safe",
        message: "No threats found in Global Security Databases."
      });
    } else {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "scam.png",
        title: "⛔ DANGER DETECTED",
        message: "This link is flagged as unsafe! Do not visit."
      });
    }
  }
});

// MESSAGE LISTENER (For Hover Scan) 
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scanUrl") {
    handleScanRequest(request.url, sendResponse);
    return true; 
  }
});

async function handleScanRequest(url, sendResponse) {
  const isSafe = await runDeepScan(url);
  sendResponse({ isSafe: isSafe });
}

// SCANNING LOGIC 
async function runDeepScan(url) {
  let urlObj;
  try { 
    urlObj = new URL(url); 
  } catch(e) { 
    return false; 
  }
  
  if (urlObj.protocol === "http:") {
    return false;
  }

  const hostname = urlObj.hostname;

  // Local Database Check
  const storage = await chrome.storage.local.get("scam_db");
  const localList = storage.scam_db || [];
  const cleanHost = hostname.replace(/^www\./, "");
  if (localList.some(scam => cleanHost.includes(scam))) return false;

  // Google Safe Browsing
  if (await checkGoogleSafeBrowsing(url)) return false;

  //  VirusTotal
  if (await checkVirusTotal(url)) return false;

  return true;
}

// SYNC FUNCTIONS 
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

// SYNC SCAM LIST FROM FIREBASE

async function syncScamList() {
  try {
    const endpoint = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/reports?key=${API_KEY}`;
    const response = await fetch(endpoint);
    if (!response.ok) {
        console.error("Firebase Error (Quota?):", response.statusText);
        return;
    }

    const data = await response.json();

    const approvedScams = [];
    if (data.documents) {
      data.documents.forEach(doc => {
        const fields = doc.fields;
        if (fields.status && fields.status.stringValue === "approved") {
          if (fields.url && fields.url.stringValue) {
            
            const rawUrl = fields.url.stringValue;
            
            try {
                const hostname = new URL(rawUrl).hostname.replace(/^www\./, "");
                approvedScams.push(hostname);
            } catch (e) {
                approvedScams.push(rawUrl);
            }
          }
        }
      });
    }
    
    // Ab Clean List ko save karo
    console.log("Scam DB Updated. Total Sites:", approvedScams.length);
    await chrome.storage.local.set({ scam_db: approvedScams });
    
  } catch (error) {
    console.error("Sync failed:", error);
  }
}

// --- PROTECTION LOGIC (Tab Update) ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && !tab.url.startsWith("chrome://")) {
    checkUrlSafety(tab.url, tabId);
  }
});

async function checkUrlSafety(url, tabId) {
  let urlObj;
  try { urlObj = new URL(url); } 
  catch(e) { return; }
  const hostname = urlObj.hostname;

  const storage = await chrome.storage.local.get(["scam_db", "whitelist"]);
  const whitelist = storage.whitelist || [];
  if (whitelist.includes(hostname)) return; 

  if (urlObj.protocol === "http:") {
    blockSite(tabId, url, "Insecure Connection (HTTP Blocked)");
    return;
  }

  const localList = storage.scam_db || [];
  const cleanHost = hostname.replace(/^www\./, "");
  if (localList.some(scam => cleanHost.includes(scam))) {
    blockSite(tabId, url, "Community Reported Scam");
    return;
  }

  if (await checkGoogleSafeBrowsing(url)) {
    blockSite(tabId, url, "Google Safe Browsing Alert");
    return;
  }
}

function blockSite(tabId, originalUrl, reason) {
  const warningUrl = chrome.runtime.getURL(`warning.html?reason=${encodeURIComponent(reason)}&url=${encodeURIComponent(originalUrl)}`);
  chrome.tabs.update(tabId, { url: warningUrl });
}

// --- API IMPLEMENTATIONS ---

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
  } catch (e) { 
    return false; 
  }
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
  } catch (e) { 
    return false; 
  }
  return false;
}