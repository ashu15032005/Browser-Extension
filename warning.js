// Get Params from URL
const params = new URLSearchParams(window.location.search);
const reason = params.get("reason") || "Dangerous Website Detected";
const blockedUrl = params.get("url"); // From background.js

// Display Reason
document.getElementById("reason").innerText = reason;

// SAFETY BUTTON (Go to Google)
document.getElementById("safetyBtn").addEventListener("click", () => {
    window.location.replace("https://www.google.com");
});

// TRUST BUTTON (Add to Whitelist)
document.getElementById("trustBtn").addEventListener("click", async () => {
    if (!blockedUrl) {
        alert("Error: Could not determine original URL.");
        return;
    }

    try {
        const hostname = new URL(blockedUrl).hostname;
        
        // Confirmation Dialog
        const confirmed = confirm(
            `WARNING:\n\nAre you sure you want to visit ${hostname}?\n\nThis will add it to your Whitelist and bypass future checks.`
        );

        if (confirmed) {
            // current whitelist
            const data = await chrome.storage.local.get("whitelist");
            const whitelist = data.whitelist || [];

            // Push to Whitelist
            if (!whitelist.includes(hostname)) {
                whitelist.push(hostname);
                await chrome.storage.local.set({ whitelist: whitelist });
            }

            // Redirect user back to the blocked site
            window.location.replace(blockedUrl);
        }
    } catch (e) {
        alert("Invalid URL format.");
    }
});