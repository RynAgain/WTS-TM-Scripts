// ==UserScript==
// @name         WTS CSRF Settings Module
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  CSRF token management and network interception for WTS
// @author       WTS-TM-Scripts
// @require      https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/beta/WTS-Shared.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function() {
    'use strict';
    
    // Wait for WTS shared utilities to be ready
    if (typeof window.WTS === 'undefined') {
        setTimeout(arguments.callee, 100);
        return;
    }
    
    // Private module scope
    let networkInterceptionActive = false;
    let originalXHRSetRequestHeader = null;
    let originalFetch = null;
    
    // Private functions
    function startNetworkInterception() {
        if (networkInterceptionActive) {
            WTS.shared.logger.warn('CSRFSettings', 'startNetworkInterception', 'Network interception already active');
            return;
        }
        
        WTS.shared.logger.log('CSRFSettings', 'startNetworkInterception', 'Starting network request interception for CSRF token capture');
        networkInterceptionActive = true;

        // Intercept XMLHttpRequest
        originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            if (name === 'anti-csrftoken-a2z' && value && value.length > 50) {
                WTS.shared.logger.log('CSRFSettings', 'XMLHttpRequest', `Captured CSRF token: ${value.substring(0, 20)}...`);
                captureToken(value);
            }
            return originalXHRSetRequestHeader.call(this, name, value);
        };

        // Intercept fetch requests
        originalFetch = window.fetch;
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
                    WTS.shared.logger.log('CSRFSettings', 'fetch', `Captured CSRF token: ${csrfToken.substring(0, 20)}...`);
                    captureToken(csrfToken);
                }
            }
            return originalFetch.apply(this, arguments);
        };

        WTS.shared.logger.log('CSRFSettings', 'startNetworkInterception', 'Network interception active - monitoring for CSRF tokens');
    }
    
    function stopNetworkInterception() {
        if (!networkInterceptionActive) {
            return;
        }
        
        // Restore original functions
        if (originalXHRSetRequestHeader) {
            XMLHttpRequest.prototype.setRequestHeader = originalXHRSetRequestHeader;
        }
        if (originalFetch) {
            window.fetch = originalFetch;
        }
        
        networkInterceptionActive = false;
        WTS.shared.logger.log('CSRFSettings', 'stopNetworkInterception', 'Network interception stopped');
    }
    
    function captureToken(token) {
        WTS.shared.state.csrf.capturedToken = token;
        WTS.shared.state.csrf.lastCaptured = Date.now();
        
        // Store in persistent storage
        WTS.shared.storage.set(WTS.shared.storage.keys.CSRF_TOKEN, token);
        WTS.shared.storage.set(WTS.shared.storage.keys.CSRF_TIMESTAMP, Date.now());
        
        // Emit event for other modules
        WTS.shared.events.emit('csrfTokenCaptured', {
            token: token,
            timestamp: Date.now()
        });
        
        WTS.shared.logger.log('CSRFSettings', 'captureToken', 'CSRF token captured and stored');
    }
    
    function extractCSRFTokenFromDOM() {
        WTS.shared.logger.log('CSRFSettings', 'extractCSRFTokenFromDOM', 'Starting DOM extraction');
        
        // Method 1: Meta tag approach
        const metaToken = WTS.shared.utils.querySelector('meta[name="anti-csrftoken-a2z"]');
        if (metaToken) {
            const token = metaToken.getAttribute('content');
            if (token && token.length > 50) {
                WTS.shared.logger.log('CSRFSettings', 'extractCSRFTokenFromDOM', 'Found token in meta tag');
                return token;
            }
        }

        // Method 2: Script content search with multiple regex patterns
        const scripts = WTS.shared.utils.querySelectorAll('script');
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
                WTS.shared.logger.debug('CSRFSettings', 'extractCSRFTokenFromDOM', `Script ${i + 1} contains 'anti-csrftoken-a2z'`);
                
                for (const {name, pattern} of regexPatterns) {
                    const matches = [...content.matchAll(pattern)];
                    if (matches.length > 0) {
                        const token = matches[0][1];
                        if (token && token.length > 50) {
                            WTS.shared.logger.log('CSRFSettings', 'extractCSRFTokenFromDOM', `Found token using pattern '${name}'`);
                            return token;
                        }
                    }
                }
            }
        }

        // Method 3: Data attribute approach
        const tokenElement = WTS.shared.utils.querySelector('[data-anti-csrftoken-a2z]');
        if (tokenElement) {
            const token = tokenElement.getAttribute('data-anti-csrftoken-a2z');
            if (token && token.length > 50) {
                WTS.shared.logger.log('CSRFSettings', 'extractCSRFTokenFromDOM', 'Found token in data attribute');
                return token;
            }
        }
        
        // Method 4: Window object search
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
                if (token && token.length > 50) {
                    WTS.shared.logger.log('CSRFSettings', 'extractCSRFTokenFromDOM', `Found token in ${name}`);
                    return token;
                }
            } catch (e) {
                WTS.shared.logger.debug('CSRFSettings', 'extractCSRFTokenFromDOM', `Error checking ${name}: ${e.message}`);
            }
        }

        // Method 5: Hidden input search
        const hiddenInputs = WTS.shared.utils.querySelectorAll('input[type="hidden"]');
        for (const input of hiddenInputs) {
            if (input.name && (input.name.includes('csrf') || input.name.includes('token'))) {
                if (input.name === 'anti-csrftoken-a2z' || input.name === 'csrfToken') {
                    const token = input.value;
                    if (token && token.length > 50) {
                        WTS.shared.logger.log('CSRFSettings', 'extractCSRFTokenFromDOM', 'Found token in hidden input');
                        return token;
                    }
                }
            }
        }

        WTS.shared.logger.warn('CSRFSettings', 'extractCSRFTokenFromDOM', 'No CSRF token found using any DOM method');
        return null;
    }
    
    async function extractTokenWithRetry(maxRetries = 3, delayMs = 1000) {
        WTS.shared.logger.log('CSRFSettings', 'extractTokenWithRetry', 'Starting token extraction with retry logic');
        
        // Priority 1: Check for recently captured token from network requests
        const capturedToken = getCapturedToken();
        if (capturedToken) {
            WTS.shared.logger.log('CSRFSettings', 'extractTokenWithRetry', 'Using recently captured token from network requests');
            return capturedToken;
        }
        
        // Priority 2: Try DOM extraction with retries
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            WTS.shared.logger.log('CSRFSettings', 'extractTokenWithRetry', `DOM extraction attempt ${attempt}/${maxRetries}`);
            
            const token = extractCSRFTokenFromDOM();
            if (token) {
                WTS.shared.logger.log('CSRFSettings', 'extractTokenWithRetry', `Token found via DOM extraction on attempt ${attempt}`);
                return token;
            }
            
            if (attempt < maxRetries) {
                WTS.shared.logger.log('CSRFSettings', 'extractTokenWithRetry', `Retrying DOM extraction in ${delayMs}ms`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        
        WTS.shared.logger.warn('CSRFSettings', 'extractTokenWithRetry', `All ${maxRetries} DOM extraction attempts failed`);
        
        // Priority 3: Check if fallback is enabled
        if (WTS.shared.state.csrf.useFallback) {
            WTS.shared.logger.log('CSRFSettings', 'extractTokenWithRetry', 'Using fallback token');
            return WTS.shared.state.csrf.fallbackToken;
        }
        
        return null;
    }
    
    function getCapturedToken() {
        const token = WTS.shared.storage.get(WTS.shared.storage.keys.CSRF_TOKEN, null);
        const timestamp = WTS.shared.storage.get(WTS.shared.storage.keys.CSRF_TIMESTAMP, 0);
        const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
        
        if (token && ageHours < 24) { // Token is less than 24 hours old
            WTS.shared.logger.log('CSRFSettings', 'getCapturedToken', `Using captured CSRF token (${ageHours.toFixed(1)}h old)`);
            return token;
        }
        
        if (token) {
            WTS.shared.logger.warn('CSRFSettings', 'getCapturedToken', `Captured token is ${ageHours.toFixed(1)}h old, may be expired`);
        }
        
        return null;
    }
    
    function validateToken(token) {
        if (!token || typeof token !== 'string') {
            return false;
        }
        
        // Check token format (base64-like)
        const isValidFormat = /^[A-Za-z0-9+/]+=*$/.test(token);
        const isValidLength = token.length > 50;
        
        return isValidFormat && isValidLength;
    }
    
    function showSettingsModal() {
        const modal = WTS.shared.utils.createElement('div', {}, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: '10000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        });

        const modalContent = WTS.shared.utils.createElement('div', {}, {
            backgroundColor: '#fff',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            maxWidth: '500px',
            width: '90%',
            fontFamily: 'sans-serif'
        });

        const currentFallbackToken = WTS.shared.state.csrf.fallbackToken;
        const useFallback = WTS.shared.state.csrf.useFallback;
        
        // Get captured token info
        const capturedToken = WTS.shared.storage.get(WTS.shared.storage.keys.CSRF_TOKEN, null);
        const capturedTimestamp = WTS.shared.storage.get(WTS.shared.storage.keys.CSRF_TIMESTAMP, 0);
        const capturedAge = capturedTimestamp ? (Date.now() - capturedTimestamp) / (1000 * 60 * 60) : null;
        
        let capturedTokenStatus = '';
        if (capturedToken) {
            const ageText = capturedAge < 1 ? `${Math.round(capturedAge * 60)}m` : `${capturedAge.toFixed(1)}h`;
            const statusColor = capturedAge < 24 ? '#28a745' : '#ffc107';
            capturedTokenStatus = `
                <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 15px;">
                    <strong>🌐 Network Captured Token:</strong><br>
                    <span style="font-family: monospace; font-size: 11px; word-break: break-all;">${capturedToken.substring(0, 40)}...</span><br>
                    <small style="color: ${statusColor};">Captured ${ageText} ago ${capturedAge < 24 ? '(Fresh)' : '(May be expired)'}</small>
                </div>
            `;
        } else {
            capturedTokenStatus = `
                <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 15px;">
                    <strong>🌐 Network Captured Token:</strong><br>
                    <small style="color: #666;">No token captured yet. Browse Whole Foods pages to automatically capture tokens from network requests.</small>
                </div>
            `;
        }

        modalContent.innerHTML = `
            <h3 style="margin-top: 0;">CSRF Token Settings</h3>
            
            ${capturedTokenStatus}
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">
                    <input type="checkbox" id="useFallbackCheckbox" ${useFallback ? 'checked' : ''}>
                    Enable fallback CSRF token when extraction fails
                </label>
                <small style="color: #666;">When enabled, uses the fallback token if network capture and DOM extraction both fail</small>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">Fallback CSRF Token:</label>
                <textarea id="fallbackTokenInput" style="width: 100%; height: 80px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-family: monospace; font-size: 12px; box-sizing: border-box;">${currentFallbackToken}</textarea>
                <small style="color: #666;">Backup token used when network capture and DOM extraction fail. Keep this updated!</small>
            </div>
            
            <div style="margin-bottom: 15px;">
                <button id="resetTokenBtn" style="padding: 8px 12px; background: #ffc107; color: #000; border: none; border-radius: 4px; cursor: pointer;">Reset to Default</button>
                <button id="testTokenBtn" style="padding: 8px 12px; background: #17a2b8; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-left: 8px;">Test Token Format</button>
                <button id="clearCapturedBtn" style="padding: 8px 12px; background: #dc3545; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-left: 8px;">Clear Captured</button>
            </div>
            
            <div style="text-align: right;">
                <button id="cancelBtn" style="padding: 8px 12px; background: #6c757d; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin-right: 8px;">Cancel</button>
                <button id="saveBtn" style="padding: 8px 12px; background: #28a745; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Save</button>
            </div>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Event handlers
        document.getElementById('resetTokenBtn').addEventListener('click', () => {
            document.getElementById('fallbackTokenInput').value = 'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw==';
        });

        document.getElementById('testTokenBtn').addEventListener('click', () => {
            const token = document.getElementById('fallbackTokenInput').value.trim();
            const isValid = validateToken(token);
            alert(isValid ? '✅ Token format appears valid' : '❌ Token format appears invalid');
        });

        document.getElementById('clearCapturedBtn').addEventListener('click', () => {
            WTS.shared.storage.delete(WTS.shared.storage.keys.CSRF_TOKEN);
            WTS.shared.storage.delete(WTS.shared.storage.keys.CSRF_TIMESTAMP);
            WTS.shared.state.csrf.capturedToken = null;
            WTS.shared.state.csrf.lastCaptured = null;
            alert('✅ Captured token cleared');
            document.body.removeChild(modal);
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        document.getElementById('saveBtn').addEventListener('click', () => {
            const newToken = document.getElementById('fallbackTokenInput').value.trim();
            const usesFallback = document.getElementById('useFallbackCheckbox').checked;
            
            if (newToken && !validateToken(newToken)) {
                alert('❌ Invalid token format. Token should be base64 encoded.');
                return;
            }
            
            WTS.shared.state.csrf.fallbackToken = newToken;
            WTS.shared.state.csrf.useFallback = usesFallback;
            
            WTS.shared.storage.set(WTS.shared.storage.keys.CSRF_FALLBACK, newToken);
            WTS.shared.storage.set(WTS.shared.storage.keys.CSRF_USE_FALLBACK, usesFallback);
            
            WTS.shared.events.emit('csrfSettingsUpdated', {
                fallbackToken: newToken,
                useFallback: usesFallback
            });
            
            alert('✅ CSRF settings saved successfully');
            document.body.removeChild(modal);
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        WTS.shared.logger.log('CSRFSettings', 'showSettingsModal', 'CSRF settings modal displayed');
    }
    
    // Public API
    WTS.modules.CSRFSettings = {
        // Start network interception
        startInterception: function() {
            startNetworkInterception();
        },
        
        // Stop network interception
        stopInterception: function() {
            stopNetworkInterception();
        },
        
        // Get captured token with age validation
        getCapturedToken: function() {
            return getCapturedToken();
        },
        
        // Extract token from DOM with retry logic
        extractToken: function(maxRetries = 3, delayMs = 1000) {
            return extractTokenWithRetry(maxRetries, delayMs);
        },
        
        // Validate token format
        validateToken: function(token) {
            return validateToken(token);
        },
        
        // Show settings modal
        showSettingsModal: function() {
            showSettingsModal();
        },
        
        // Get current settings
        getSettings: function() {
            return {
                fallbackToken: WTS.shared.state.csrf.fallbackToken,
                useFallback: WTS.shared.state.csrf.useFallback,
                capturedToken: WTS.shared.state.csrf.capturedToken,
                lastCaptured: WTS.shared.state.csrf.lastCaptured
            };
        },
        
        // Update settings
        updateSettings: function(settings) {
            if (settings.fallbackToken !== undefined) {
                WTS.shared.state.csrf.fallbackToken = settings.fallbackToken;
                WTS.shared.storage.set(WTS.shared.storage.keys.CSRF_FALLBACK, settings.fallbackToken);
            }
            if (settings.useFallback !== undefined) {
                WTS.shared.state.csrf.useFallback = settings.useFallback;
                WTS.shared.storage.set(WTS.shared.storage.keys.CSRF_USE_FALLBACK, settings.useFallback);
            }
            
            WTS.shared.events.emit('csrfSettingsUpdated', settings);
        }
    };
    
    // Module initialization
    WTS.modules.CSRFSettings.init = function() {
        WTS.shared.logger.log('CSRFSettings', 'init', 'Initializing CSRF Settings module');
        
        // Load settings from storage
        WTS.shared.state.csrf.fallbackToken = WTS.shared.storage.get(
            WTS.shared.storage.keys.CSRF_FALLBACK,
            'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw=='
        );
        WTS.shared.state.csrf.useFallback = WTS.shared.storage.get(WTS.shared.storage.keys.CSRF_USE_FALLBACK, true);
        
        // Load captured token if available
        const capturedToken = WTS.shared.storage.get(WTS.shared.storage.keys.CSRF_TOKEN, null);
        const capturedTimestamp = WTS.shared.storage.get(WTS.shared.storage.keys.CSRF_TIMESTAMP, 0);
        
        if (capturedToken && capturedTimestamp) {
            WTS.shared.state.csrf.capturedToken = capturedToken;
            WTS.shared.state.csrf.lastCaptured = capturedTimestamp;
        }
        
        // Start network interception immediately
        startNetworkInterception();
        
        WTS.shared.logger.log('CSRFSettings', 'init', 'CSRF Settings module initialized successfully');
        WTS.shared.events.emit('csrfSettingsReady');
    };
    
    // Auto-initialize when shared utilities are ready
    if (WTS.shared && WTS.shared.logger) {
        WTS.modules.CSRFSettings.init();
    } else {
        WTS.shared.events.on('sharedReady', WTS.modules.CSRFSettings.init);
    }
    
    WTS.shared.logger.log('CSRFSettings', 'load', 'CSRF Settings module loaded successfully');
})();