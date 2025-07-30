// ==UserScript==
// @name         WTS CSRF Manager
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  CSRF token management for WTS scripts
// @author       WTS-TM-Scripts
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';

    // CSRF Token Management Module
    window.WTSCSRFManager = {
        capturedCSRFToken: null,
        networkInterceptionActive: false,

        // Start network interception to capture CSRF tokens
        startNetworkInterception() {
            if (this.networkInterceptionActive) return;
            
            console.log("🌐 Starting network request interception for CSRF token capture...");
            this.networkInterceptionActive = true;

            // Intercept XMLHttpRequest
            const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
            XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
                if (name === 'anti-csrftoken-a2z' && value && value.length > 50) {
                    console.log("🎯 Captured CSRF token from XMLHttpRequest:", value);
                    window.WTSCSRFManager.capturedCSRFToken = value;
                    GM_setValue('lastCapturedCSRFToken', value);
                    GM_setValue('lastCapturedTimestamp', Date.now());
                }
                return originalXHRSetRequestHeader.call(this, name, value);
            };

            // Intercept fetch requests
            const originalFetch = window.fetch;
            window.fetch = function(url, options) {
                if (options && options.headers) {
                    const headers = options.headers;
                    let csrfToken = null;
                    
                    // Check different header formats
                    if (headers['anti-csrftoken-a2z']) {
                        csrfToken = headers['anti-csrftoken-a2z'];
                    } else if (headers.get && typeof headers.get === 'function') {
                        csrfToken = headers.get('anti-csrftoken-a2z');
                    }
                    
                    if (csrfToken && csrfToken.length > 50) {
                        console.log("🎯 Captured CSRF token from fetch request:", csrfToken);
                        window.WTSCSRFManager.capturedCSRFToken = csrfToken;
                        GM_setValue('lastCapturedCSRFToken', csrfToken);
                        GM_setValue('lastCapturedTimestamp', Date.now());
                    }
                }
                return originalFetch.apply(this, arguments);
            };

            console.log("✅ Network interception active - monitoring for CSRF tokens");
        },

        // Get captured token from storage
        getCapturedToken() {
            const token = GM_getValue('lastCapturedCSRFToken', null);
            const timestamp = GM_getValue('lastCapturedTimestamp', 0);
            const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
            
            if (token && ageHours < 24) { // Token is less than 24 hours old
                console.log(`🎯 Using captured CSRF token (${ageHours.toFixed(1)}h old):`, token);
                return token;
            }
            
            if (token) {
                console.log(`⚠️ Captured token is ${ageHours.toFixed(1)}h old, may be expired`);
            }
            
            return null;
        },

        // Enhanced CSRF token extraction with comprehensive debugging
        extractCSRFToken() {
            console.log("=== CSRF Token Extraction Debug ===");
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

            // Method 5: Hidden input search
            console.log("\n--- Method 5: Hidden Input Search ---");
            const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
            console.log("Hidden inputs found:", hiddenInputs.length);
            
            for (const input of hiddenInputs) {
                if (input.name && (input.name.includes('csrf') || input.name.includes('token'))) {
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

            console.log("\n=== EXTRACTION FAILED ===");
            console.log("❌ No CSRF token found using any method");
            console.log("Suggestions:");
            console.log("1. Check if page is fully loaded");
            console.log("2. Try again after a delay");
            console.log("3. Check browser network tab for token in requests");
            console.log("4. Inspect page source manually for token location");
            
            return null;
        },

        // Fallback CSRF token from working example
        getFallbackToken() {
            const fallbackToken = GM_getValue('fallbackCSRFToken', 'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw==');
            console.log("🔄 Using fallback CSRF token:", fallbackToken);
            console.log("Token length:", fallbackToken.length);
            console.log("Token format valid:", /^[A-Za-z0-9+/]+=*$/.test(fallbackToken));
            return fallbackToken;
        },

        // Enhanced token extraction with network capture, retry logic and fallback
        async extractTokenWithRetry(maxRetries = 3, delayMs = 1000) {
            console.log(`\n🔄 CSRF Token Extraction Starting...`);
            
            // Priority 1: Check for recently captured token from network requests
            const capturedToken = this.getCapturedToken();
            if (capturedToken) {
                console.log("✅ Using recently captured token from network requests");
                return capturedToken;
            }
            
            // Priority 2: Try DOM extraction with retries
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                console.log(`\n🔄 DOM Extraction Attempt ${attempt}/${maxRetries}`);
                
                const token = this.extractCSRFToken();
                if (token) {
                    console.log(`✅ Token found via DOM extraction on attempt ${attempt}`);
                    return token;
                }
                
                if (attempt < maxRetries) {
                    console.log(`⏳ Retrying DOM extraction in ${delayMs}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
            
            console.log(`❌ All ${maxRetries} DOM extraction attempts failed`);
            
            // Priority 3: Check if fallback is enabled
            const useFallback = GM_getValue('useFallbackCSRF', true);
            if (useFallback) {
                console.log("🔄 Attempting fallback token...");
                return this.getFallbackToken();
            }
            
            return null;
        },

        // Initialize the CSRF manager
        init() {
            this.startNetworkInterception();
        }
    };

    // Auto-initialize when loaded
    window.WTSCSRFManager.init();

})();