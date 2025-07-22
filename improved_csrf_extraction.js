// Improved CSRF Token Extraction with Comprehensive Debugging
// This is a drop-in replacement for the extractCSRFToken() function in WtsMain.js

function extractCSRFTokenImproved() {
    console.log("=== CSRF Token Extraction Debug (Improved) ===");
    console.log("Page readyState:", document.readyState);
    console.log("URL:", window.location.href);
    console.log("Timestamp:", new Date().toISOString());
    
    // Method 1: Meta tag approach
    console.log("\n--- Method 1: Meta Tag Search ---");
    const metaToken = document.querySelector('meta[name="anti-csrftoken-a2z"]');
    if (metaToken) {
        const token = metaToken.getAttribute('content');
        console.log("✅ Found token in meta tag:", token);
        console.log("Token length:", token.length);
        console.log("Token format valid:", /^[A-Za-z0-9+/]+=*$/.test(token));
        return token;
    } else {
        console.log("❌ No meta tag found with name='anti-csrftoken-a2z'");
    }

    // Method 2: Enhanced script content search with multiple regex patterns
    console.log("\n--- Method 2: Script Content Search ---");
    const scripts = document.querySelectorAll('script');
    console.log("Total scripts found:", scripts.length);
    
    const regexPatterns = [
        {
            name: "Standard object notation",
            pattern: /["']anti-csrftoken-a2z["']\s*:\s*["']([^"']+)["']/g
        },
        {
            name: "Flexible quotes and spacing",
            pattern: /["']anti-csrftoken-a2z["']\s*:\s*["']([^"']*?)["']/g
        },
        {
            name: "With escaped characters",
            pattern: /["']anti-csrftoken-a2z["']\s*:\s*["']([^"'\\]*(?:\\.[^"'\\]*)*)["']/g
        },
        {
            name: "Window object assignment",
            pattern: /window\.[^=]*["']anti-csrftoken-a2z["']\s*:\s*["']([^"']+)["']/g
        },
        {
            name: "Variable assignment",
            pattern: /(?:var|let|const)\s+[^=]*=\s*[^{]*["']anti-csrftoken-a2z["']\s*:\s*["']([^"']+)["']/g
        },
        {
            name: "Direct property access",
            pattern: /\.["']anti-csrftoken-a2z["']\s*=\s*["']([^"']+)["']/g
        }
    ];
    
    for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        const content = script.textContent || script.innerText;
        
        if (content.includes('anti-csrftoken-a2z')) {
            console.log(`Script ${i + 1} contains 'anti-csrftoken-a2z'`);
            console.log("Script source:", script.src || "inline");
            console.log("Content preview:", content.substring(0, 200) + "...");
            
            for (const {name, pattern} of regexPatterns) {
                const matches = [...content.matchAll(pattern)];
                if (matches.length > 0) {
                    const token = matches[0][1];
                    console.log(`✅ Found token using pattern '${name}':`, token);
                    console.log("Token length:", token.length);
                    console.log("Token format valid:", /^[A-Za-z0-9+/]+=*$/.test(token));
                    return token;
                }
            }
        }
    }
    console.log("❌ No token found in any script content");

    // Method 3: Data attribute approach
    console.log("\n--- Method 3: Data Attribute Search ---");
    const tokenElement = document.querySelector('[data-anti-csrftoken-a2z]');
    if (tokenElement) {
        const token = tokenElement.getAttribute('data-anti-csrftoken-a2z');
        console.log("✅ Found token in data attribute:", token);
        console.log("Element:", tokenElement.tagName, tokenElement.id || tokenElement.className);
        console.log("Token length:", token.length);
        console.log("Token format valid:", /^[A-Za-z0-9+/]+=*$/.test(token));
        return token;
    } else {
        console.log("❌ No element found with data-anti-csrftoken-a2z attribute");
    }
    
    // Method 4: Window object search
    console.log("\n--- Method 4: Window Object Search ---");
    const windowChecks = [
        {
            name: "window.WholeFoodsConfig",
            check: () => window.WholeFoodsConfig && window.WholeFoodsConfig['anti-csrftoken-a2z']
        },
        {
            name: "window.csrfToken",
            check: () => window.csrfToken
        },
        {
            name: "window['anti-csrftoken-a2z']",
            check: () => window['anti-csrftoken-a2z']
        },
        {
            name: "window.App.csrfToken",
            check: () => window.App && window.App.csrfToken
        },
        {
            name: "window.config.csrfToken",
            check: () => window.config && window.config.csrfToken
        }
    ];
    
    for (const {name, check} of windowChecks) {
        try {
            const token = check();
            if (token) {
                console.log(`✅ Found token in ${name}:`, token);
                console.log("Token length:", token.length);
                console.log("Token format valid:", /^[A-Za-z0-9+/]+=*$/.test(token));
                return token;
            } else {
                console.log(`❌ ${name} not found or empty`);
            }
        } catch (e) {
            console.log(`❌ Error checking ${name}:`, e.message);
        }
    }

    // Method 5: DOM traversal for hidden inputs
    console.log("\n--- Method 5: Hidden Input Search ---");
    const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
    console.log("Hidden inputs found:", hiddenInputs.length);
    
    for (const input of hiddenInputs) {
        if (input.name && input.name.includes('csrf') || input.name.includes('token')) {
            console.log("Found potential CSRF input:", input.name, "=", input.value);
            if (input.name === 'anti-csrftoken-a2z' || input.name === 'csrfToken') {
                const token = input.value;
                console.log("✅ Found token in hidden input:", token);
                console.log("Token length:", token.length);
                console.log("Token format valid:", /^[A-Za-z0-9+/]+=*$/.test(token));
                return token;
            }
        }
    }

    // Method 6: Check for token in cookies
    console.log("\n--- Method 6: Cookie Search ---");
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name && (name.includes('csrf') || name.includes('token'))) {
            console.log("Found potential CSRF cookie:", name, "=", value);
            if (name === 'anti-csrftoken-a2z' || name === 'csrfToken') {
                console.log("✅ Found token in cookie:", value);
                console.log("Token length:", value.length);
                console.log("Token format valid:", /^[A-Za-z0-9+/]+=*$/.test(value));
                return value;
            }
        }
    }

    console.log("\n=== EXTRACTION FAILED ===");
    console.log("❌ No CSRF token found using any method");
    console.log("Suggestions:");
    console.log("1. Check if page is fully loaded");
    console.log("2. Try again after a delay");
    console.log("3. Check browser network tab for token in requests");
    console.log("4. Inspect page source manually for token location");
    
    return null;
}

// Enhanced version with retry logic and timing
function extractCSRFTokenWithRetry(maxRetries = 3, delayMs = 1000) {
    return new Promise((resolve) => {
        let attempts = 0;
        
        function attemptExtraction() {
            attempts++;
            console.log(`\n🔄 CSRF Token Extraction Attempt ${attempts}/${maxRetries}`);
            
            const token = extractCSRFTokenImproved();
            
            if (token) {
                console.log(`✅ Token found on attempt ${attempts}`);
                resolve(token);
            } else if (attempts < maxRetries) {
                console.log(`⏳ Retrying in ${delayMs}ms...`);
                setTimeout(attemptExtraction, delayMs);
            } else {
                console.log(`❌ All ${maxRetries} attempts failed`);
                resolve(null);
            }
        }
        
        attemptExtraction();
    });
}

// Usage examples:
// 
// Immediate extraction:
// const token = extractCSRFTokenImproved();
//
// With retry logic:
// extractCSRFTokenWithRetry(3, 1000).then(token => {
//     if (token) {
//         console.log("Token ready:", token);
//         // Proceed with API call
//     } else {
//         console.log("Failed to get token");
//     }
// });

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        extractCSRFTokenImproved,
        extractCSRFTokenWithRetry
    };
}