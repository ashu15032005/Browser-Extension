//  CONFIGURATION
const PROJECT_ID = "barcode-sync-af05a";
const API_KEY = "AIzaSyCBt90FwYp9Qsxa_ByzgbfDbEcPIXY43bA";
const GEMINI_API_KEY = "AIzaSyCwsHeh5_Q70DaB3ugnMLZYWGBNsfd_bJU";

//ELEMENTS
const reportForm = document.getElementById("report-form");
const showFormBtn = document.getElementById("showFormBtn");
const cancelReportBtn = document.getElementById("cancelReportBtn");
const submitBtn = document.getElementById("submitReportBtn");
const hostnameDisplay = document.getElementById("hostname");
const reasonInput = document.getElementById("reasonInput");
const toast = document.getElementById("toast");
const toastMsg = document.getElementById("toast-message");
const toastIcon = document.getElementById("toast-icon");
const statusText = document.querySelector(".site-status");
const userPointsDisplay = document.getElementById("userPoints");

// Whitelist Elements
const whitelistDrawer = document.getElementById("whitelist-drawer");
const openWhitelistBtn = document.getElementById("openWhitelistBtn");
const closeWhitelistBtn = document.getElementById("closeWhitelistBtn");
const whitelistContainer = document.getElementById("whitelist-container");

//CHATBOT ELEMENTS
const chatDrawer = document.getElementById("chat-drawer");
const openChatBtn = document.getElementById("openChatBtn");
const closeChatBtn = document.getElementById("closeChatBtn");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chatInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");

//REPORT TEXT BOX : RESTRICT SPECIAL CHARACTERS
if (reasonInput) {
  reasonInput.addEventListener("input", function () {
    this.value = this.value.replace(/[<>{}[\]/\\'";:]/g, "");
  });
}

// USER POINTS
async function loadUserPoints() {
  const data = await chrome.storage.local.get("userPoints");
  if (userPointsDisplay) userPointsDisplay.innerText = data.userPoints || 0;
}
loadUserPoints();

// URL
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  if (tabs[0] && tabs[0].url) {
    try {
      const urlObj = new URL(tabs[0].url);
      if (hostnameDisplay) hostnameDisplay.innerText = urlObj.hostname;

      const storage = await chrome.storage.local.get(["scam_db", "whitelist"]);
      const bannedList = storage.scam_db || [];
      const whitelist = storage.whitelist || [];
      const cleanHost = urlObj.hostname.replace(/^www\./, "");

      const isBanned = bannedList.some((scam) => cleanHost.includes(scam));
      const isWhitelisted = whitelist.includes(urlObj.hostname);
      const isWarningPage = tabs[0].url.includes("warning.html");

      if (isWhitelisted) {
        if (statusText) {
          statusText.innerText = "🛡️ User Trusted Site";
          statusText.style.color = "#3b82f6";
        }
      } else if (isBanned || isWarningPage) {
        if (statusText) {
          statusText.innerText = "This Website is Unsafe!";
          statusText.style.color = "#ef4444";
          statusText.style.fontWeight = "bold";
        }
      }
    } catch (e) {
      if (hostnameDisplay) hostnameDisplay.innerText = "System Page";
    }
  }
});

// Report Form
if (showFormBtn) {
  showFormBtn.addEventListener("click", () => {
    if (reportForm) reportForm.classList.add("open");
    setTimeout(() => {
      if (reasonInput) reasonInput.focus();
    }, 100);
  });
}

if (cancelReportBtn) {
  cancelReportBtn.addEventListener("click", () => {
    if (reportForm) reportForm.classList.remove("open");
  });
}

// WHITELIST
if (openWhitelistBtn) {
  openWhitelistBtn.addEventListener("click", async () => {
    if (whitelistDrawer) whitelistDrawer.classList.add("open");
    renderWhitelist();
  });
}

if (closeWhitelistBtn) {
  closeWhitelistBtn.addEventListener("click", () => {
    if (whitelistDrawer) whitelistDrawer.classList.remove("open");
  });
}

async function renderWhitelist() {
  const data = await chrome.storage.local.get("whitelist");
  const whitelist = data.whitelist || [];
  whitelistContainer.innerHTML = "";

  if (whitelist.length === 0) {
    whitelistContainer.innerHTML = `<li class="empty-msg">No trusted sites yet.</li>`;
    return;
  }

  whitelist.forEach((domain) => {
    const li = document.createElement("li");
    li.className = "whitelist-item";

    const domainSpan = document.createElement("span");
    domainSpan.className = "whitelist-domain";
    domainSpan.innerText = domain;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.innerText = "Remove";
    removeBtn.onclick = () => removeSite(domain);

    li.appendChild(domainSpan);
    li.appendChild(removeBtn);
    whitelistContainer.appendChild(li);
  });
}

async function removeSite(domainToRemove) {
  const data = await chrome.storage.local.get("whitelist");
  let whitelist = data.whitelist || [];
  whitelist = whitelist.filter((domain) => domain !== domainToRemove);
  await chrome.storage.local.set({ whitelist: whitelist });
  renderWhitelist();
  showToast("Site removed from trust list", "🗑️");
}

// SUBMIT REPORT
if (submitBtn) {
  submitBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    let url = tab && tab.url ? tab.url : "unknown";

    const reasonText = reasonInput.value.trim();
    if (!reasonText) return showToast("Enter a reason", "⚠️");

    const { userId } = await chrome.storage.local.get("userId");

    submitBtn.innerText = "Sending...";
    submitBtn.disabled = true;

    try {
      const endpoint = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/reports?key=${API_KEY}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            url: { stringValue: url },
            reason: { stringValue: reasonText },
            status: { stringValue: "pending" },
            reporterId: { stringValue: userId || "anonymous" },
            timestamp: { stringValue: new Date().toISOString() },
          },
        }),
      });

      if (!response.ok) throw new Error("Net Error");

      showToast("Report Sent! Pending Review", "✅");

      setTimeout(() => {
        reportForm.classList.remove("open");
        reasonInput.value = "";
        submitBtn.innerText = "Submit Report";
        submitBtn.disabled = false;
      }, 1500);
    } catch (e) {
      showToast("Failed to connect", "❌");
      submitBtn.innerText = "Submit Report";
      submitBtn.disabled = false;
    }
  });
}

function showToast(text, icon) {
  toastMsg.innerText = text;
  toastIcon.innerText = icon;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

//AI CHATBOT LOGIC

// AI Chat Open/Close
if (openChatBtn) {
  openChatBtn.addEventListener("click", () => {
    if (chatDrawer) {
      chatDrawer.classList.add("open");
      setTimeout(() => chatInput.focus(), 100);
    }
  });
}

if (closeChatBtn) {
  closeChatBtn.addEventListener("click", () => {
    if (chatDrawer) chatDrawer.classList.remove("open");
  });
}

// AI Send Message
if (sendMessageBtn) {
  sendMessageBtn.addEventListener("click", processAiMessage);
}

if (chatInput) {
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") processAiMessage();
  });
}

// AI Message Processing
async function processAiMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  // User Message
  addChatBubble(text, "user-msg");
  chatInput.value = "";

  // Thinking Animation
  const loadingBubble = addChatBubble("🤖 AI is analyzing...", "bot-msg");

  // -CHECK FOR LINKS (Guardian Scanner) ---
  const extractedUrl = extractUrlFromText(text);
  let scanHtml = `<span class="report-line">• No link found to scan.</span>`;
  let domain = "Analysis";

  if (extractedUrl) {
    try {
      domain = new URL(extractedUrl).hostname;

      // Background Script (VirusTotal/SafeBrowsing) Check
      const scanResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "scanUrl", url: extractedUrl },
          resolve
        );
      });

      if (scanResponse && !scanResponse.isSafe) {
        scanHtml = `<span class="report-line">• <span class="cyan-text">LINK CHECK:</span> 🚨 <b style="color:#ef4444">DANGEROUS!</b> Link flagged in security database.</span>`;
        speakAlert(`सावधान! यह वेबसाइट खतरनाक है। कृपया लिंक ओपन ना करें।`);
      } else {
        scanHtml = `<span class="report-line">• <span class="cyan-text">LINK CHECK:</span> The link "${domain}" appears technically safe.</span>`;
      }
    } catch (e) {
      scanHtml = `<span class="report-line">• <span class="cyan-text">LINK CHECK:</span> Invalid URL format.</span>`;
    }
  }

  // GEMINI AI ---
  const aiAnalysis = await askGeminiAI(text);

  //  RESULTS
  let finalHtml = `
    <span class="report-header">🛡️ Guardian Report:</span>
    ${scanHtml}
    <span class="report-line">• <span class="purple-text">AI ANALYSIS:</span> ${aiAnalysis}</span>
  `;

  // Update Message
  loadingBubble.innerHTML = finalHtml;
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

//  Gemini 2.0 Backup
async function askGeminiAI(userText) {
  const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `
    You are a cybersecurity expert. Analyze this text for scam indicators.
    Text: "${userText}"
    Task: Is this a scam? Start with YES, NO, or MAYBE. Give 1 short reason. Keep it under 25 words.
  `;

  try {
    const response = await fetch(googleUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const data = await response.json();

    // CHECK: Quota Error or Block
    if (data.error) {
      // console.warn("Google Error, switching to backup...");
      return await askPollinationsBackup(userText); //backup ai
    }

    if (data.candidates && data.candidates.length > 0) {
      return data.candidates[0].content.parts[0].text;
    }
  } catch (error) {
    return await askPollinationsBackup(userText);
  }

  return await askPollinationsBackup(userText);
}

//POLLINATIONS AI (Backup) ---
async function askPollinationsBackup(userText) {
  const prompt = `
    You are Guardian AI. Is this text a scam? "${userText}"
    Answer with YES/NO/MAYBE and 1 short reason (max 20 words).
  `;

  const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Backup Busy");
    const text = await response.text();
    return text;
  } catch (error) {
    return "MAYBE. AI is busy, please check links manually.";
  }
}

// Extract URL ---
function extractUrlFromText(text) {
  const match = text.match(/(https?:\/\/[^\s]+)/);
  return match ? match[0] : null;
}

function addChatBubble(text, className) {
  const div = document.createElement("div");
  div.className = `message ${className}`;

  div.innerHTML = text;

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

//VOICE ALER
function speakAlert(text) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();

    const msg = new SpeechSynthesisUtterance(text);
    // msg.lang = 'en-US';
    msg.lang = "hi-IN";
    msg.rate = 0.9;
    msg.pitch = 1; //
    msg.volume = 1;

    window.speechSynthesis.speak(msg);
  }
}
