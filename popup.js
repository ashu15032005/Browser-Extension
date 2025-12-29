const PROJECT_ID = "barcode-sync-af05a"; 
const API_KEY = "AIzaSyCBt90FwYp9Qsxa_ByzgbfDbEcPIXY43bA";

// Elements
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

// --- 1. LOAD POINTS ---
async function loadUserPoints() {
  const data = await chrome.storage.local.get("userPoints");
  if(userPointsDisplay) userPointsDisplay.innerText = data.userPoints || 0;
}
loadUserPoints();

// --- 2. CHECK STATUS & HOSTNAME ---
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  if (tabs[0] && tabs[0].url) {
    try {
      const urlObj = new URL(tabs[0].url);
      if(hostnameDisplay) hostnameDisplay.innerText = urlObj.hostname;

      const storage = await chrome.storage.local.get(["scam_db", "whitelist"]);
      const bannedList = storage.scam_db || [];
      const whitelist = storage.whitelist || [];
      const cleanHost = urlObj.hostname.replace(/^www\./, "");
      
      const isBanned = bannedList.some(scam => cleanHost.includes(scam));
      const isWhitelisted = whitelist.includes(urlObj.hostname);
      const isWarningPage = tabs[0].url.includes("warning.html");

      if (isWhitelisted) {
        if(statusText) {
          statusText.innerText = "🛡️ User Trusted Site";
          statusText.style.color = "#3b82f6"; // Blue
        }
      } else if (isBanned || isWarningPage) {
        if(statusText) {
          statusText.innerText = "This Website is Unsafe!";
          statusText.style.color = "#ef4444"; 
          statusText.style.fontWeight = "bold";
        }
      }
    } catch (e) {
      if(hostnameDisplay) hostnameDisplay.innerText = "System Page";
    }
  }
});

// --- 3. UI ANIMATIONS (Report Form) ---
if (showFormBtn) {
  showFormBtn.addEventListener("click", () => {
    if(reportForm) reportForm.classList.add("open");
    setTimeout(() => { if(reasonInput) reasonInput.focus(); }, 100);
  });
}

if (cancelReportBtn) {
  cancelReportBtn.addEventListener("click", () => {
    if(reportForm) reportForm.classList.remove("open");
  });
}

// --- 4. WHITELIST MANAGER LOGIC (NEW) ---

// Open Drawer & Load List
if (openWhitelistBtn) {
  openWhitelistBtn.addEventListener("click", async () => {
    if(whitelistDrawer) whitelistDrawer.classList.add("open");
    renderWhitelist();
  });
}

// Close Drawer
if (closeWhitelistBtn) {
  closeWhitelistBtn.addEventListener("click", () => {
    if(whitelistDrawer) whitelistDrawer.classList.remove("open");
  });
}

// Render the list of trusted sites
async function renderWhitelist() {
  const data = await chrome.storage.local.get("whitelist");
  const whitelist = data.whitelist || [];
  whitelistContainer.innerHTML = ""; // Clear existing

  if (whitelist.length === 0) {
    whitelistContainer.innerHTML = `<li class="empty-msg">No trusted sites yet.</li>`;
    return;
  }

  whitelist.forEach(domain => {
    const li = document.createElement("li");
    li.className = "whitelist-item";
    
    const domainSpan = document.createElement("span");
    domainSpan.className = "whitelist-domain";
    domainSpan.innerText = domain;
    
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.innerText = "Remove";
    removeBtn.onclick = () => removeSite(domain); // Attach removal logic

    li.appendChild(domainSpan);
    li.appendChild(removeBtn);
    whitelistContainer.appendChild(li);
  });
}

// Remove site logic
async function removeSite(domainToRemove) {
  const data = await chrome.storage.local.get("whitelist");
  let whitelist = data.whitelist || [];
  
  // Filter out the domain
  whitelist = whitelist.filter(domain => domain !== domainToRemove);
  
  // Save back to storage
  await chrome.storage.local.set({ whitelist: whitelist });
  
  // Refresh the UI list
  renderWhitelist();
  showToast("Site removed from trust list", "🗑️");
}

// --- 5. SUBMIT REPORT ---
if (submitBtn) {
  submitBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let url = tab && tab.url ? tab.url : "unknown";
    
    const reasonText = reasonInput.value.trim();
    if (!reasonText) return showToast("Enter a reason", "⚠️");

    // Get User ID
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
            timestamp: { stringValue: new Date().toISOString() }
          }
        })
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