// ==UserScript==
// @name         Whole Foods ASIN Exporter with Store Mapping
// @namespace    http://tampermonkey.net/
// @version      1.3.030
// @description  Export ASIN, Name, Section from visible cards on Whole Foods page with store mapping and SharePoint item database functionality
// @author       WTS-TM-Scripts
// @homepage     https://github.com/RynAgain/WTS-TM-Scripts
// @homepageURL  https://github.com/RynAgain/WTS-TM-Scripts
// @supportURL   https://github.com/RynAgain/WTS-TM-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/WtsMain.user.js
// @downloadURL  https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/WtsMain.user.js
// @match        https://*.wholefoodsmarket.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @require      https://cdn.jsdelivr.net/npm/dexie@3/dist/dexie.min.js
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ULTRA-AGGRESSIVE VISIBILITY TEST - Multiple methods to ensure we see this
    console.log('🚨🚨🚨 WTS TOOLS SCRIPT LOADED - If you see this, the script is running! 🚨🚨🚨');
    console.error('🚨 WTS TOOLS ERROR LOG TEST - This should be RED and visible!');
    console.warn('🚨 WTS TOOLS WARN LOG TEST - This should be YELLOW and visible!');
    console.info('🚨 WTS TOOLS INFO LOG TEST - This should be BLUE and visible!');

    // Try to create a visible alert as well
    try {
        // Create a temporary visual indicator
        const indicator = document.createElement('div');
        indicator.style.position = 'fixed';
        indicator.style.top = '0';
        indicator.style.left = '0';
        indicator.style.zIndex = '999999';
        indicator.style.background = 'red';
        indicator.style.color = 'white';
        indicator.style.padding = '10px';
        indicator.style.fontSize = '16px';
        indicator.style.fontWeight = 'bold';
        //indicator.textContent = '🚨 WTS TOOLS SCRIPT IS RUNNING! 🚨';

        // Add to page immediately if body exists
        if (document.body) {
            document.body.appendChild(indicator);
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 3000);
        }
    } catch (e) {
        console.error('Failed to create visual indicator:', e);
    }

    console.log('🚨 Timestamp:', new Date().toISOString());
    console.log('🚨 User Agent:', navigator.userAgent);
    console.log('🚨 Tampermonkey Version Check:', typeof GM_info !== 'undefined' ? GM_info.version : 'GM_info not available');

    // Enhanced debug logging for troubleshooting
    console.log('🚀 WTS Tools script starting...');
    console.log('📍 Current URL:', window.location.href);
    console.log('📍 Document ready state:', document.readyState);
    console.log('📍 Timestamp:', new Date().toISOString());
    console.log('📍 Body exists:', !!document.body);
    console.log('📍 Script run-at changed to document-idle for better DOM readiness');

    // Test if we're on the right domain
    if (!window.location.hostname.includes('wholefoodsmarket.com')) {
        console.warn('⚠️ Script running on non-Whole Foods domain:', window.location.hostname);
    } else {
        console.log('✅ Script running on correct domain');
    }

    // Simple test to verify script execution
    try {
        console.log('🧪 Testing basic functionality...');
        console.log('🧪 Tampermonkey GM functions available:', {
            GM_setValue: typeof GM_setValue,
            GM_getValue: typeof GM_getValue,
            GM_xmlhttpRequest: typeof GM_xmlhttpRequest
        });

        // Test basic DOM access
        console.log('🧪 DOM access test:', {
            document: typeof document,
            body: !!document.body,
            querySelector: typeof document.querySelector
        });

        console.log('✅ Basic functionality test passed');
    } catch (error) {
        console.error('❌ Basic functionality test failed:', error);
        alert('❌ WTS Tools script failed basic tests. Check console for details.');
    }

    // Check if XLSX library is loaded
    if (typeof XLSX === 'undefined') {
        console.error('❌ XLSX library not loaded! Script may not work properly.');
        alert('❌ XLSX library failed to load. Some features may not work. Please refresh the page.');
    } else {
        console.log('✅ XLSX library loaded successfully');
    }

    // Global variables for persistence management
    let wtsPanel = null;
    let initializationAttempts = 0;
    let maxInitializationAttempts = 10;
    let persistenceCheckInterval = null;
    let lastUrl = window.location.href;
    let isInitialized = false;
    let initializationRetryTimeout = null;

    // FIXED: Add interval tracking for proper cleanup
    let cardCounterInterval = null;
    let urlPollingInterval = null;
    let versionCheckInterval = null;

    // FIXED: Add initialization guard to prevent overlapping runs
    let _initializing = false;

    // Version checking variables
    const CURRENT_VERSION = '1.3.030';
    const GITHUB_VERSION_URL = 'https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/WtsMain.user.js';
    const VERSION_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    // Network request interception to capture CSRF tokens and store info - START IMMEDIATELY
    let capturedCSRFToken = null;
    let currentStoreInfo = null;
    let networkInterceptionActive = false;

    // IndexedDB setup with Dexie
    const db = new Dexie('wts_items');
    // Primary key ++id, plus indexes you query on
    db.version(1).stores({
        items: '++id, asin, sku, store_tlc, store_acronym, store_name, item_nameLower'
    });

    // Request persistent storage to reduce eviction risk
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then(persisted => {
            console.log('[WTS] Storage persisted:', persisted);
        });
    }

    function startNetworkInterception() {
        if (networkInterceptionActive) {
            console.log("🌐 Network interception already active");
            return;
        }

        console.log("🌐 Starting network request interception for CSRF token capture...");
        console.log("📍 Timestamp:", new Date().toISOString());
        networkInterceptionActive = true;

        // Intercept XMLHttpRequest
        const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            if (name === 'anti-csrftoken-a2z' && value && value.length > 50) {
                console.log("🎯 Captured CSRF token from XMLHttpRequest:", value);
                capturedCSRFToken = value;
                GM_setValue('lastCapturedCSRFToken', value);
                GM_setValue('lastCapturedTimestamp', Date.now());
            }
            return originalXHRSetRequestHeader.call(this, name, value);
        };

        // Intercept fetch requests
        const originalFetch = window.fetch;
        window.fetch = function(url, options) {
            console.log("🌐 FETCH INTERCEPTOR DEBUG - Input type:", typeof url, url instanceof Request ? "Request object" : "String/other");

            // Capture CSRF tokens
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
                    capturedCSRFToken = csrfToken;
                    GM_setValue('lastCapturedCSRFToken', csrfToken);
                    GM_setValue('lastCapturedTimestamp', Date.now());
                }
            }

            // Intercept summary requests to capture store info
            const fetchPromise = originalFetch.apply(this, arguments);

            // FIXED: Robust URL extraction that safely handles Request objects
            let urlString = '';
            try {
                if (typeof url === 'string') {
                    urlString = url;
                } else if (url instanceof Request) {
                    urlString = url.url;
                } else {
                    urlString = String(url);
                }
                console.log("🌐 FETCH INTERCEPTOR DEBUG - Extracted URL:", urlString);
            } catch (error) {
                console.error("❌ FETCH INTERCEPTOR ERROR - Failed to extract URL:", error);
                return fetchPromise; // Return early to prevent crash
            }

            if (urlString && urlString.includes('summary')) {
                console.log("🏪 Intercepting summary request:", urlString);
                fetchPromise.then(response => {
                    if (response.ok) {
                        response.clone().json().then(data => {
                            if (data && data.storeId) {
                                console.log("🏪 Captured store info:", data);
                                currentStoreInfo = {
                                    storeId: data.storeId,
                                    token: data.token,
                                    displayName: data.displayName,
                                    status: data.status,
                                    phone: data.phone,
                                    bu: data.bu
                                };
                                GM_setValue('currentStoreInfo', JSON.stringify(currentStoreInfo));
                                GM_setValue('storeInfoTimestamp', Date.now());

                                // Update UI if it exists
                                try {
                                    updateCurrentStoreDisplay();
                                } catch (error) {
                                    console.error('❌ Error updating store display from network interception:', error);
                                }
                            }
                        }).catch(err => {
                            console.log("Error parsing summary response:", err);
                        });
                    }
                }).catch(err => {
                    console.log("Error processing summary response:", err);
                });
            }

            return fetchPromise;
        };

        console.log("✅ Network interception active - monitoring for CSRF tokens");
    }

    function getCapturedToken() {
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
    }

    function getCurrentStoreInfo() {
        const storeInfo = GM_getValue('currentStoreInfo', null);
        const timestamp = GM_getValue('storeInfoTimestamp', 0);
        const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);

        if (storeInfo && ageHours < 24) { // Store info is less than 24 hours old
            try {
                const parsed = JSON.parse(storeInfo);
                console.log(`🏪 Using captured store info (${ageHours.toFixed(1)}h old):`, parsed);
                return parsed;
            } catch (error) {
                console.error('Error parsing stored store info:', error);
                return null;
            }
        }

        if (storeInfo) {
            console.log(`⚠️ Captured store info is ${ageHours.toFixed(1)}h old, may be expired`);
        }

        return currentStoreInfo; // Return current session info if available
    }

    // Enhanced error handling and recovery
    function handleScriptError(error, context) {
        console.error(`❌ WTS Tools Error in ${context}:`, error);
        console.error('Stack trace:', error.stack);

        // Log additional context
        console.log('📍 Current URL:', window.location.href);
        console.log('📍 Document ready state:', document.readyState);
        console.log('📍 Panel exists:', !!wtsPanel);
        console.log('📍 Panel in DOM:', wtsPanel ? document.body.contains(wtsPanel) : false);
        console.log('📍 Initialization state:', isInitialized);

        // Attempt recovery for certain errors
        if (context === 'initialization' && initializationAttempts < maxInitializationAttempts) {
            console.log('🔄 Attempting error recovery...');
            setTimeout(() => {
                initializeWTSTools();
            }, 3000);
        }
    }

    // Graceful cleanup on page unload
    function cleanup() {
        console.log('🧹 Cleaning up WTS Tools...');

        if (persistenceCheckInterval) {
            clearInterval(persistenceCheckInterval);
            persistenceCheckInterval = null;
        }

        if (initializationRetryTimeout) {
            clearTimeout(initializationRetryTimeout);
            initializationRetryTimeout = null;
        }

        // FIXED: Clear tracked intervals to prevent memory leaks
        if (cardCounterInterval) {
            console.log('🧹 Clearing card counter interval:', cardCounterInterval);
            clearInterval(cardCounterInterval);
            cardCounterInterval = null;
        }

        if (urlPollingInterval) {
            console.log('🧹 Clearing URL polling interval:', urlPollingInterval);
            clearInterval(urlPollingInterval);
            urlPollingInterval = null;
        }

        if (versionCheckInterval) {
            console.log('🧹 Clearing version check interval:', versionCheckInterval);
            clearInterval(versionCheckInterval);
            versionCheckInterval = null;
        }

        isInitialized = false;
        wtsPanel = null;
    }

    // Setup cleanup handlers
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('unload', cleanup);

    function getStoreTLCFromStoreId(storeId, storeMappingData) {
        // Find the store_tlc that matches this storeId
        for (const [tlc, id] of storeMappingData.entries()) {
            if (id === storeId) {
                return tlc;
            }
        }
        return null;
    }

    // Version checking functionality
    async function checkForUpdates(showNoUpdateMessage = false) {
        try {
            console.log('🔍 Checking for script updates...');
            
            const lastCheck = GM_getValue('lastVersionCheck', 0);
            const now = Date.now();
            
            // Don't check too frequently unless explicitly requested
            if (!showNoUpdateMessage && (now - lastCheck) < VERSION_CHECK_INTERVAL) {
                console.log('⏭️ Version check skipped - checked recently');
                return;
            }
            
            // Use GM_xmlhttpRequest to bypass CORS restrictions
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: GITHUB_VERSION_URL,
                    headers: {
                        'Cache-Control': 'no-cache',
                        'User-Agent': 'WTS-Tools-Userscript'
                    },
                    onload: function(response) {
                        try {
                            if (response.status !== 200) {
                                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                            }
                            
                            const scriptContent = response.responseText;
                            
                            // Extract version from the script content
                            const versionMatch = scriptContent.match(/@version\s+([^\s]+)/);
                            if (!versionMatch) {
                                throw new Error('Could not extract version from GitHub script');
                            }
                            
                            const latestVersion = versionMatch[1].trim();
                            console.log(`📋 Current version: ${CURRENT_VERSION}`);
                            console.log(`📋 Latest version: ${latestVersion}`);
                            
                            // Update last check timestamp
                            GM_setValue('lastVersionCheck', now);
                            
                            // Compare versions
                            if (isNewerVersion(latestVersion, CURRENT_VERSION)) {
                                console.log('🆕 New version available!');
                                showUpdateNotification(latestVersion);
                            } else {
                                console.log('✅ Script is up to date');
                                if (showNoUpdateMessage) {
                                    alert(`✅ You're running the latest version!\n\nCurrent: ${CURRENT_VERSION}\nLatest: ${latestVersion}`);
                                }
                            }
                            
                            resolve();
                        } catch (error) {
                            console.error('❌ Error processing version check response:', error);
                            if (showNoUpdateMessage) {
                                alert(`❌ Failed to check for updates: ${error.message}\n\nPlease check your internet connection or try again later.`);
                            }
                            reject(error);
                        }
                    },
                    onerror: function(error) {
                        console.error('❌ Network error checking for updates:', error);
                        const errorMessage = 'Network error occurred while checking for updates';
                        if (showNoUpdateMessage) {
                            alert(`❌ Failed to check for updates: ${errorMessage}\n\nPlease check your internet connection or try again later.`);
                        }
                        reject(new Error(errorMessage));
                    },
                    ontimeout: function() {
                        console.error('❌ Timeout error checking for updates');
                        const errorMessage = 'Request timed out while checking for updates';
                        if (showNoUpdateMessage) {
                            alert(`❌ Failed to check for updates: ${errorMessage}\n\nPlease try again later.`);
                        }
                        reject(new Error(errorMessage));
                    },
                    timeout: 10000 // 10 second timeout
                });
            });
            
        } catch (error) {
            console.error('❌ Error checking for updates:', error);
            if (showNoUpdateMessage) {
                alert(`❌ Failed to check for updates: ${error.message}\n\nPlease check your internet connection or try again later.`);
            }
        }
    }
    
    function isNewerVersion(latest, current) {
        // Simple version comparison - assumes format like "1.3.012"
        const latestParts = latest.split('.').map(part => parseInt(part, 10));
        const currentParts = current.split('.').map(part => parseInt(part, 10));
        
        // Pad arrays to same length
        const maxLength = Math.max(latestParts.length, currentParts.length);
        while (latestParts.length < maxLength) latestParts.push(0);
        while (currentParts.length < maxLength) currentParts.push(0);
        
        // Compare each part
        for (let i = 0; i < maxLength; i++) {
            if (latestParts[i] > currentParts[i]) {
                return true;
            } else if (latestParts[i] < currentParts[i]) {
                return false;
            }
        }
        
        return false; // Versions are equal
    }
    
    function showUpdateNotification(latestVersion) {
        const updateModal = document.createElement('div');
        updateModal.style.position = 'fixed';
        updateModal.style.top = '0';
        updateModal.style.left = '0';
        updateModal.style.width = '100%';
        updateModal.style.height = '100%';
        updateModal.style.backgroundColor = 'rgba(0,0,0,0.7)';
        updateModal.style.zIndex = '2147483647';
        updateModal.style.display = 'flex';
        updateModal.style.alignItems = 'center';
        updateModal.style.justifyContent = 'center';
        updateModal.style.fontFamily = 'sans-serif';
        
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = '#fff';
        modalContent.style.padding = '30px';
        modalContent.style.borderRadius = '12px';
        modalContent.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)';
        modalContent.style.maxWidth = '500px';
        modalContent.style.width = '90%';
        modalContent.style.textAlign = 'center';
        modalContent.style.border = '3px solid #28a745';
        
        modalContent.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 20px;">🆕</div>
            <h2 style="margin: 0 0 15px 0; color: #28a745; font-size: 24px;">Update Available!</h2>
            <p style="margin: 0 0 20px 0; font-size: 16px; color: #333; line-height: 1.5;">
                A new version of WTS Tools is available on GitHub.
            </p>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 25px;">
                <div style="font-size: 14px; color: #666; margin-bottom: 8px;">
                    <strong>Current Version:</strong> ${CURRENT_VERSION}
                </div>
                <div style="font-size: 14px; color: #28a745;">
                    <strong>Latest Version:</strong> ${latestVersion}
                </div>
            </div>
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button id="updateNowBtn" style="
                    padding: 12px 24px;
                    background: #28a745;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                    transition: background-color 0.2s;
                ">Update Now</button>
                <button id="remindLaterBtn" style="
                    padding: 12px 24px;
                    background: #6c757d;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                ">Remind Later</button>
                <button id="skipVersionBtn" style="
                    padding: 12px 24px;
                    background: #dc3545;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                ">Skip This Version</button>
            </div>
            <p style="margin: 20px 0 0 0; font-size: 12px; color: #666;">
                Updates include bug fixes, new features, and improvements.
            </p>
        `;
        
        updateModal.appendChild(modalContent);
        document.body.appendChild(updateModal);
        
        // Add hover effects
        const updateBtn = document.getElementById('updateNowBtn');
        const remindBtn = document.getElementById('remindLaterBtn');
        const skipBtn = document.getElementById('skipVersionBtn');
        
        updateBtn.addEventListener('mouseenter', () => {
            updateBtn.style.backgroundColor = '#218838';
        });
        updateBtn.addEventListener('mouseleave', () => {
            updateBtn.style.backgroundColor = '#28a745';
        });
        
        // Event handlers
        updateBtn.addEventListener('click', () => {
            window.open('https://github.com/RynAgain/WTS-TM-Scripts', '_blank');
            document.body.removeChild(updateModal);
        });
        
        remindBtn.addEventListener('click', () => {
            // Reset last check time to allow checking again sooner
            GM_setValue('lastVersionCheck', 0);
            document.body.removeChild(updateModal);
        });
        
        skipBtn.addEventListener('click', () => {
            // Mark this version as skipped
            GM_setValue('skippedVersion', latestVersion);
            document.body.removeChild(updateModal);
        });
        
        // Close on background click
        updateModal.addEventListener('click', (e) => {
            if (e.target === updateModal) {
                document.body.removeChild(updateModal);
            }
        });
    }
    
    function startVersionChecking() {
        console.log('🔍 Starting automatic version checking...');
        
        // Check immediately on startup (but don't show "no update" message)
        setTimeout(() => {
            checkForUpdates(false);
        }, 5000); // Wait 5 seconds after startup
        
        // Set up periodic checking
        versionCheckInterval = setInterval(() => {
            checkForUpdates(false);
        }, VERSION_CHECK_INTERVAL);
        
        console.log('✅ Version checking initialized');
    }

    // Start network interception immediately
    startNetworkInterception();
    
    // Start version checking
    startVersionChecking();

    function extractDataFromCards() {
        const cards = document.querySelectorAll('[data-csa-c-type="item"][data-csa-c-item-type="asin"]');
        const emptyCards = document.querySelectorAll('li.a-carousel-card.a-carousel-card-empty');
        const data = [];

        cards.forEach(card => {
            const asin = card.getAttribute('data-csa-c-item-id') || '';
            const nameElement = card.querySelector('.a-truncate-full') || card.querySelector('.a-truncate-cut');
            const section = card.closest('[data-cel-widget]')?.getAttribute('data-cel-widget') || 'Unknown';
            const name = nameElement?.textContent?.trim() || '[No Name]';

            data.push({ ASIN: asin, Name: name, Section: section });
        });

        return { data, emptyCount: emptyCards.length };
    }

    // Enhanced carousel data extraction from JSON without navigation
    function extractShovelerCarousels() {
        console.log('🎠 Starting shoveler carousel extraction from JSON data...');
        
        const carousels = document.querySelectorAll('[data-a-carousel-options]');
        console.log(`🎠 Found ${carousels.length} carousels with data-a-carousel-options`);
        
        const shovelerData = [];
        
        for (let i = 0; i < carousels.length; i++) {
            const carousel = carousels[i];
            console.log(`🎠 Processing carousel ${i + 1}/${carousels.length}`);
            
            try {
                const carouselData = extractCarouselData(carousel, i);
                if (carouselData && carouselData.asins.length > 0) {
                    shovelerData.push(carouselData);
                }
            } catch (error) {
                console.error(`❌ Error processing carousel ${i + 1}:`, error);
            }
        }
        
        console.log(`✅ Extracted data from ${shovelerData.length} shovelers`);
        return shovelerData;
    }

    // Extract data from individual carousel
    function extractCarouselData(carousel, index) {
        const carouselOptions = carousel.getAttribute('data-a-carousel-options');
        if (!carouselOptions) {
            console.log(`⚠️ Carousel ${index + 1}: No carousel options found`);
            return null;
        }
        
        console.log(`🎠 Carousel ${index + 1}: Extracting data from options`);
        
        // Find carousel title
        const carouselContainer = carousel.closest('[data-cel-widget]') || carousel.closest('.a-carousel-container') || carousel.parentElement;
        let title = 'Unknown Shoveler';
        
        if (carouselContainer) {
            // Look for title in various locations
            const titleSelectors = [
                'h2', 'h3', 'h4',
                '.a-size-large', '.a-size-medium',
                '[data-testid*="title"]',
                '.s-size-large', '.s-size-medium'
            ];
            
            for (const selector of titleSelectors) {
                const titleElement = carouselContainer.querySelector(selector);
                if (titleElement && titleElement.textContent.trim()) {
                    title = titleElement.textContent.trim();
                    break;
                }
            }
        }
        
        // Clean title
        title = cleanCarouselTitle(title);
        
        // Extract ASINs using comprehensive parsing
        const asins = extractASINsFromCarouselOptions(carouselOptions, index);
        
        if (asins.length === 0) {
            console.log(`⚠️ Carousel ${index + 1}: No ASINs extracted`);
            return null;
        }
        
        console.log(`✅ Carousel ${index + 1}: "${title}" - ${asins.length} ASINs`);
        
        return {
            title: title,
            asinCount: asins.length,
            asins: asins,
            carouselIndex: index + 1
        };
    }

    // Clean carousel titles
    function cleanCarouselTitle(title) {
        if (!title) return 'Unknown Shoveler';
        
        // Remove common unwanted phrases
        const cleanPatterns = [
            /\s*see\s+more\s*/gi,
            /\s*shop\s+all\s*/gi,
            /\s*view\s+all\s*/gi,
            /\s*browse\s+all\s*/gi,
            /\s*explore\s+more\s*/gi,
            /\s*discover\s+more\s*/gi,
            /\s*learn\s+more\s*/gi,
            /\s*show\s+more\s*/gi,
            /\s*more\s+items?\s*/gi,
            /\s*additional\s+items?\s*/gi
        ];
        
        let cleaned = title;
        cleanPatterns.forEach(pattern => {
            cleaned = cleaned.replace(pattern, '');
        });
        
        return cleaned.trim() || 'Unknown Shoveler';
    }

    // Comprehensive ASIN extraction from carousel options
    function extractASINsFromCarouselOptions(carouselOptions, carouselIndex) {
        console.log(`🔍 Carousel ${carouselIndex + 1}: Starting comprehensive ASIN extraction`);
        
        let parsedOptions = null;
        try {
            parsedOptions = JSON.parse(carouselOptions);
            console.log(`✅ Carousel ${carouselIndex + 1}: Successfully parsed JSON options`);
        } catch (error) {
            console.error(`❌ Carousel ${carouselIndex + 1}: Failed to parse JSON:`, error);
            return [];
        }
        
        const allAsins = new Set();
        
        // Method 1: Direct id_list in root
        if (parsedOptions.id_list && Array.isArray(parsedOptions.id_list)) {
            console.log(`🎯 Carousel ${carouselIndex + 1}: Method 1 - Found id_list in root (${parsedOptions.id_list.length} items)`);
            parsedOptions.id_list.forEach(item => {
                const asin = extractASINFromItem(item);
                if (asin) allAsins.add(asin);
            });
            console.log(`✅ Carousel ${carouselIndex + 1}: Method 1 extracted ${allAsins.size} ASINs`);
        }
        
        // Method 2: Ajax parameters
        if (parsedOptions.ajax && parsedOptions.ajax.params) {
            console.log(`🎯 Carousel ${carouselIndex + 1}: Method 2 - Checking ajax parameters`);
            const params = parsedOptions.ajax.params;
            
            if (params.id_list && Array.isArray(params.id_list)) {
                console.log(`🎯 Carousel ${carouselIndex + 1}: Method 2a - Found ajax.params.id_list (${params.id_list.length} items)`);
                params.id_list.forEach(item => {
                    const asin = extractASINFromItem(item);
                    if (asin) allAsins.add(asin);
                });
            }
            
            if (params.asins && Array.isArray(params.asins)) {
                console.log(`🎯 Carousel ${carouselIndex + 1}: Method 2b - Found ajax.params.asins (${params.asins.length} items)`);
                params.asins.forEach(item => {
                    const asin = extractASINFromItem(item);
                    if (asin) allAsins.add(asin);
                });
            }
            
            console.log(`✅ Carousel ${carouselIndex + 1}: Method 2 total ASINs: ${allAsins.size}`);
        }
        
        // Method 3: Exhaustive array search
        console.log(`🎯 Carousel ${carouselIndex + 1}: Method 3 - Exhaustive array search`);
        const arrays = findAllArraysInObject(parsedOptions, 15);
        console.log(`🔍 Carousel ${carouselIndex + 1}: Found ${arrays.length} arrays in JSON structure`);
        
        let bestArray = null;
        let bestScore = 0;
        
        arrays.forEach((arr, index) => {
            if (!Array.isArray(arr) || arr.length === 0) return;
            
            let asinCount = 0;
            const tempAsins = new Set();
            
            arr.forEach(item => {
                const asin = extractASINFromItem(item);
                if (asin) {
                    tempAsins.add(asin);
                    asinCount++;
                }
            });
            
            const score = asinCount;
            console.log(`🔍 Carousel ${carouselIndex + 1}: Array ${index + 1} - ${arr.length} items, ${asinCount} ASINs, score: ${score}`);
            
            if (score > bestScore) {
                bestScore = score;
                bestArray = arr;
                console.log(`🏆 Carousel ${carouselIndex + 1}: New best array found with score ${score}`);
            }
        });
        
        if (bestArray) {
            console.log(`✅ Carousel ${carouselIndex + 1}: Method 3 - Processing best array with ${bestArray.length} items`);
            bestArray.forEach(item => {
                const asin = extractASINFromItem(item);
                if (asin) allAsins.add(asin);
            });
        }
        
        console.log(`✅ Carousel ${carouselIndex + 1}: Method 3 total ASINs: ${allAsins.size}`);
        
        // Method 4: Regex extraction from JSON string
        console.log(`🎯 Carousel ${carouselIndex + 1}: Method 4 - Regex extraction from JSON string`);
        const jsonString = JSON.stringify(parsedOptions);
        
        // Primary ASIN pattern (10 characters)
        const primaryPattern = /\b[A-Z0-9]{10}\b/g;
        const primaryMatches = [...jsonString.matchAll(primaryPattern)];
        console.log(`🔍 Carousel ${carouselIndex + 1}: Primary pattern found ${primaryMatches.length} potential ASINs`);
        
        primaryMatches.forEach(match => {
            const asin = match[0];
            if (isValidASIN(asin)) {
                allAsins.add(asin);
            }
        });
        
        // Fallback pattern (8-15 characters) if primary didn't find enough
        if (allAsins.size < 5) {
            console.log(`🔍 Carousel ${carouselIndex + 1}: Using fallback pattern (8-15 chars)`);
            const fallbackPattern = /\b[A-Z0-9]{8,15}\b/g;
            const fallbackMatches = [...jsonString.matchAll(fallbackPattern)];
            console.log(`🔍 Carousel ${carouselIndex + 1}: Fallback pattern found ${fallbackMatches.length} potential ASINs`);
            
            fallbackMatches.forEach(match => {
                const asin = match[0];
                if (isValidASIN(asin)) {
                    allAsins.add(asin);
                }
            });
        }
        
        console.log(`✅ Carousel ${carouselIndex + 1}: Method 4 total ASINs: ${allAsins.size}`);
        
        // Method 5: Raw string extraction as last resort
        if (allAsins.size === 0) {
            console.log(`🎯 Carousel ${carouselIndex + 1}: Method 5 - Raw string extraction (last resort)`);
            const rawPattern = /\b[A-Z0-9]{10}\b/g;
            const rawMatches = [...carouselOptions.matchAll(rawPattern)];
            console.log(`🔍 Carousel ${carouselIndex + 1}: Raw string found ${rawMatches.length} potential ASINs`);
            
            rawMatches.forEach(match => {
                const asin = match[0];
                if (isValidASIN(asin)) {
                    allAsins.add(asin);
                }
            });
            
            console.log(`✅ Carousel ${carouselIndex + 1}: Method 5 total ASINs: ${allAsins.size}`);
        }
        
        const finalAsins = Array.from(allAsins);
        console.log(`🎉 Carousel ${carouselIndex + 1}: Final extraction complete - ${finalAsins.length} unique ASINs`);
        
        if (finalAsins.length > 0) {
            console.log(`📋 Carousel ${carouselIndex + 1}: Sample ASINs:`, finalAsins.slice(0, 5));
        }
        
        return finalAsins;
    }

    // Helper function to find all arrays in an object
    function findAllArraysInObject(obj, maxDepth = 10, currentDepth = 0, visited = new Set()) {
        if (currentDepth >= maxDepth || !obj || typeof obj !== 'object') {
            return [];
        }
        
        // Prevent infinite loops with circular references
        if (visited.has(obj)) {
            return [];
        }
        visited.add(obj);
        
        const arrays = [];
        
        try {
            if (Array.isArray(obj)) {
                arrays.push(obj);
            }
            
            for (const key in obj) {
                if (obj.hasOwnProperty && obj.hasOwnProperty(key)) {
                    const value = obj[key];
                    if (Array.isArray(value)) {
                        arrays.push(value);
                    } else if (value && typeof value === 'object') {
                        const nestedArrays = findAllArraysInObject(value, maxDepth, currentDepth + 1, visited);
                        arrays.push(...nestedArrays);
                    }
                }
            }
        } catch (error) {
            console.error('Error traversing object:', error);
        }
        
        visited.delete(obj);
        return arrays;
    }

    // Helper function to extract ASIN from various item formats
    function extractASINFromItem(item) {
        if (!item) return null;
        
        // If item is already a string and looks like an ASIN
        if (typeof item === 'string') {
            return isValidASIN(item) ? item : null;
        }
        
        // If item is an object, look for ASIN in various properties
        if (typeof item === 'object') {
            const asinProperties = ['asin', 'ASIN', 'id', 'ID', 'itemId', 'productId'];
            
            for (const prop of asinProperties) {
                if (item[prop] && typeof item[prop] === 'string') {
                    const asin = item[prop];
                    if (isValidASIN(asin)) {
                        return asin;
                    }
                }
            }
        }
        
        return null;
    }

    // Helper function to validate ASIN format
    function isValidASIN(asin) {
        if (!asin || typeof asin !== 'string') return false;
        
        // Standard ASIN: 10 alphanumeric characters
        if (/^[A-Z0-9]{10}$/i.test(asin)) return true;
        
        // Extended validation: 8-15 alphanumeric characters (for flexibility)
        if (/^[A-Z0-9]{8,15}$/i.test(asin)) return true;
        
        return false;
    }

    // Enhanced data extraction that combines visible cards and carousel data
    function extractAllData() {
        console.log('🚀 Starting comprehensive data extraction...');
        
        // Extract visible cards (existing functionality)
        const cardData = extractDataFromCards();
        console.log(`📦 Visible cards: ${cardData.data.length} ASINs, ${cardData.emptyCount} empty cards`);
        
        // Extract carousel/shoveler data (new functionality)
        const shovelerData = extractShovelerCarousels();
        console.log(`🎠 Shoveler data: ${shovelerData.length} carousels`);
        
        // Combine data
        const combinedData = {
            visibleCards: cardData.data,
            emptyCards: cardData.emptyCount,
            shovelers: shovelerData,
            totalVisibleASINs: cardData.data.length,
            totalShovelerASINs: shovelerData.reduce((sum, shoveler) => sum + shoveler.asinCount, 0),
            totalShovelers: shovelerData.length
        };
        
        console.log('✅ Comprehensive data extraction complete:', {
            visibleASINs: combinedData.totalVisibleASINs,
            shovelerASINs: combinedData.totalShovelerASINs,
            totalShovelers: combinedData.totalShovelers,
            totalASINsExcludingShovelers: combinedData.totalVisibleASINs // Only count visible cards in total
        });
        
        return combinedData;
    }

    // Enhanced XLSX download function that creates separate sheets for visible cards and shoveler data
    function downloadXLSX(combinedData) {
        console.log('📦 Starting XLSX export with separate sheets...');
        
        // If legacy format (array of rows), convert to new format
        if (Array.isArray(combinedData) && combinedData.length > 0 && combinedData[0].ASIN) {
            console.log('📦 Converting legacy format to new format');
            combinedData = {
                visibleCards: combinedData,
                emptyCards: 0,
                shovelers: [],
                totalVisibleASINs: combinedData.length,
                totalShovelerASINs: 0,
                totalShovelers: 0
            };
        }
        
        // Create workbook
        const workbook = XLSX.utils.book_new();
        
        // Sheet 1: Visible Cards
        const visibleCardsData = [];
        if (combinedData.visibleCards && combinedData.visibleCards.length > 0) {
            console.log(`📦 Adding ${combinedData.visibleCards.length} visible cards to Visible Cards sheet`);
            
            // Add headers
            visibleCardsData.push(['ASIN', 'Name', 'Section']);
            
            // Add data rows
            combinedData.visibleCards.forEach(card => {
                visibleCardsData.push([
                    card.ASIN || '',
                    card.Name || '',
                    card.Section || ''
                ]);
            });
        } else {
            // Add headers even if no data
            visibleCardsData.push(['ASIN', 'Name', 'Section']);
        }
        
        const visibleCardsSheet = XLSX.utils.aoa_to_sheet(visibleCardsData);
        XLSX.utils.book_append_sheet(workbook, visibleCardsSheet, 'Visible Cards');
        
        // Sheet 2: Shoveler Data
        const shovelerData = [];
        if (combinedData.shovelers && combinedData.shovelers.length > 0) {
            console.log(`📦 Adding ${combinedData.shovelers.length} shovelers to Shoveler Data sheet`);
            
            // Add headers
            shovelerData.push(['ASIN', 'Name', 'Section', 'ShovelerTitle', 'ShovelerIndex']);
            
            // Add data rows
            combinedData.shovelers.forEach(shoveler => {
                if (shoveler.asins && shoveler.asins.length > 0) {
                    shoveler.asins.forEach(asin => {
                        shovelerData.push([
                            asin,
                            `[From Shoveler: ${shoveler.title}]`,
                            'Shoveler Carousel',
                            shoveler.title,
                            shoveler.carouselIndex.toString()
                        ]);
                    });
                }
            });
        } else {
            // Add headers even if no data
            shovelerData.push(['ASIN', 'Name', 'Section', 'ShovelerTitle', 'ShovelerIndex']);
        }
        
        const shovelerSheet = XLSX.utils.aoa_to_sheet(shovelerData);
        XLSX.utils.book_append_sheet(workbook, shovelerSheet, 'Shoveler Data');
        
        // Generate and download the file
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'wholefoods_data_separated.xlsx';
        a.click();
        URL.revokeObjectURL(url);
        
        console.log(`✅ XLSX export complete with separate sheets`);
        console.log(`📊 Export summary: ${combinedData.totalVisibleASINs} visible ASINs (Visible Cards sheet), ${combinedData.totalShovelerASINs} shoveler ASINs (Shoveler Data sheet)`);
    }

    function createExportButton() {
        try {
            console.log('🔧 Creating WTS Tools panel...');
            console.log('📍 Document ready state:', document.readyState);
            console.log('📍 Body element exists:', !!document.body);

            // Ensure document body exists
            if (!document.body) {
                throw new Error('Document body not available yet');
            }

            let lastExtractedData = [];
            let storeMappingData = new Map(); // Store mapping: Acro -> StoreId
            let itemDatabase = []; // Item database from XLSX: Array of item objects

        // Load stored mappings from Tampermonkey storage
        function loadStoredMappings() {
            try {
                const storedData = GM_getValue('storeMappingData', '{}');
                const parsedData = JSON.parse(storedData);
                storeMappingData.clear();
                Object.entries(parsedData).forEach(([acro, storeId]) => {
                    storeMappingData.set(acro, storeId);
                });
            } catch (error) {
                console.error('Error loading stored mappings:', error);
                storeMappingData.clear();
            }
        }

        // Save mappings to Tampermonkey storage
        function saveStoredMappings() {
            try {
                const dataToStore = Object.fromEntries(storeMappingData);
                GM_setValue('storeMappingData', JSON.stringify(dataToStore));
            } catch (error) {
                console.error('Error saving mappings:', error);
            }
        }

        // Load existing mappings on initialization
        loadStoredMappings();


        // XLSX parsing function for store mapping
        function parseXLSXForStoreMapping(arrayBuffer) {
            try {
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                
                if (!sheetName) {
                    throw new Error('No sheets found in XLSX file');
                }

                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (jsonData.length < 2) {
                    throw new Error('XLSX file must contain at least a header row and one data row');
                }

                const header = jsonData[0].map(col => col ? col.toString().trim() : '');
                const acroIndex = header.findIndex(col => col.toLowerCase() === 'acro');
                const storeIdIndex = header.findIndex(col => col.toLowerCase() === 'storeid');

                if (acroIndex === -1 || storeIdIndex === -1) {
                    throw new Error('XLSX must contain "Acro" and "StoreId" columns');
                }

                const mappings = new Map();
                const errors = [];

                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];

                    if (!row || row.length < Math.max(acroIndex, storeIdIndex) + 1) {
                        errors.push(`Row ${i + 1}: Insufficient columns`);
                        continue;
                    }

                    const acro = row[acroIndex] ? row[acroIndex].toString().trim() : '';
                    const storeId = row[storeIdIndex] ? row[storeIdIndex].toString().trim() : '';

                    // Validate Acro (3 characters)
                    if (!acro || acro.length !== 3) {
                        errors.push(`Row ${i + 1}: Acro must be exactly 3 characters (got: "${acro}")`);
                        continue;
                    }

                    // Validate StoreId (numeric)
                    if (!storeId || isNaN(storeId) || !Number.isInteger(Number(storeId))) {
                        errors.push(`Row ${i + 1}: StoreId must be a valid integer (got: "${storeId}")`);
                        continue;
                    }

                    mappings.set(acro.toUpperCase(), parseInt(storeId, 10));
                }

                if (errors.length > 0) {
                    throw new Error(`Validation errors:\n${errors.join('\n')}`);
                }

                if (mappings.size === 0) {
                    throw new Error('No valid store mappings found in the file');
                }

                return mappings;
            } catch (error) {
                if (error.message.includes('Unsupported file')) {
                    throw new Error('Invalid XLSX file format. Please ensure the file is a valid Excel (.xlsx) file.');
                }
                throw error;
            }
        }

        // XLSX parsing function with true streaming - never holds full dataset in memory
        async function parseXLSXStreaming(arrayBuffer) {
            try {
                console.log('📊 Starting XLSX streaming parse...');
                const startTime = Date.now();

                const workbook = XLSX.read(arrayBuffer, { type: 'array' });

                // Look for the specific sheet "WFMOAC Inventory Data"
                const targetSheetName = "WFMOAC Inventory Data";
                let sheetName = targetSheetName;

                if (!workbook.SheetNames.includes(targetSheetName)) {
                    console.warn(`Sheet "${targetSheetName}" not found. Available sheets:`, workbook.SheetNames);
                    // Fallback to first sheet if target sheet not found
                    sheetName = workbook.SheetNames[0];
                    if (!sheetName) {
                        throw new Error('No sheets found in XLSX file');
                    }
                }

                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (jsonData.length < 2) {
                    throw new Error('XLSX file must contain at least a header row and one data row');
                }

                const totalRows = jsonData.length - 1; // Exclude header
                console.log(`📊 Streaming ${totalRows} rows directly to IndexedDB...`);

                // Warn about large datasets
                if (totalRows > 100000) {
                    const proceed = confirm(`⚠️ Large dataset detected: ${totalRows} rows\n\nThis will be streamed directly to IndexedDB to avoid memory issues.\n\nDo you want to continue?`);
                    if (!proceed) {
                        throw new Error('Processing cancelled by user');
                    }
                }

                const headers = jsonData[0].map(h => h ? h.toString().trim() : '');
                const requiredColumns = ['store_name', 'store_acronym', 'store_tlc', 'item_name', 'sku', 'asin'];
                const columnIndices = {};

                // Map column headers to indices (case insensitive)
                requiredColumns.forEach(col => {
                    const index = headers.findIndex(h => h.toLowerCase() === col.toLowerCase());
                    if (index === -1) {
                        throw new Error(`Required column "${col}" not found in XLSX file`);
                    }
                    columnIndices[col] = index;
                });

                // Optional columns
                const optionalColumns = ['quantity', 'listing_status', 'event_date', 'sku_wo_chck_dgt', 'rnk', 'eod_our_price', 'offering_start_datetime', 'offering_end_datetime', 'merchant_customer_id', 'encrypted_merchant_i'];
                optionalColumns.forEach(col => {
                    const index = headers.findIndex(h => h.toLowerCase() === col.toLowerCase());
                    if (index !== -1) {
                        columnIndices[col] = index;
                    }
                });

                // Clear existing data first
                await db.items.clear();

                let savedCount = 0;
                let errorCount = 0;
                const BATCH_SIZE = 500; // Smaller batches for memory efficiency
                let batch = [];

                // Stream process rows directly to IndexedDB without building large arrays
                for (let i = 1; i < jsonData.length; i++) { // Start at 1 to skip header
                    const row = jsonData[i];

                    if (!row || row.length === 0) continue; // Skip empty rows

                    const item = {};
                    let hasError = false;

                    // Process required columns
                    requiredColumns.forEach(col => {
                        const value = row[columnIndices[col]];
                        if (value === undefined || value === null || value === '') {
                            errorCount++;
                            hasError = true;
                            return;
                        }
                        item[col] = value.toString().trim();
                    });

                    if (hasError) continue;

                    // Validate and normalize data
                    if (item.asin && !/^[A-Z0-9]{10}$/i.test(item.asin)) {
                        errorCount++;
                    }
                    if (item.store_tlc && item.store_tlc.length !== 3) {
                        errorCount++;
                    }

                    // Process optional columns
                    optionalColumns.forEach(col => {
                        if (columnIndices[col] !== undefined) {
                            const value = row[columnIndices[col]];
                            item[col] = value !== undefined && value !== null ? value.toString().trim() : '';
                        }
                    });

                    // Normalize data
                    item.asin = (item.asin || '').toUpperCase();
                    item.store_tlc = (item.store_tlc || '').toUpperCase();
                    item.item_nameLower = (item.item_name || '').toLowerCase();

                    // Add to batch
                    batch.push({
                        asin: item.asin,
                        sku: item.sku || '',
                        store_tlc: item.store_tlc,
                        store_acronym: item.store_acronym || '',
                        store_name: item.store_name || '',
                        item_nameLower: item.item_nameLower,
                        item_name: item.item_name || '',
                        quantity: item.quantity || '',
                        listing_status: item.listing_status || '',
                        event_date: item.event_date || '',
                        sku_wo_chck_dgt: item.sku_wo_chck_dgt || '',
                        rnk: item.rnk || '',
                        eod_our_price: item.eod_our_price || '',
                        offering_start_datetime: item.offering_start_datetime || '',
                        offering_end_datetime: item.offering_end_datetime || '',
                        merchant_customer_id: item.merchant_customer_id || '',
                        encrypted_merchant_i: item.encrypted_merchant_i || ''
                    });

                    // Save batch when it reaches size limit
                    if (batch.length >= BATCH_SIZE) {
                        await db.items.bulkAdd(batch);
                        savedCount += batch.length;
                        batch = []; // Clear batch

                        // Progress update every 10k items
                        if (savedCount % 10000 === 0) {
                            console.log(`📦 Streamed ${savedCount.toLocaleString()}/${totalRows.toLocaleString()} items to IndexedDB...`);
                        }

                        // Allow UI to breathe
                        if (savedCount % 5000 === 0) {
                            await new Promise(resolve => setTimeout(resolve, 10));
                        }
                    }
                }

                // Save any remaining items in the final batch
                if (batch.length > 0) {
                    await db.items.bulkAdd(batch);
                    savedCount += batch.length;
                }

                // Save timestamp
                GM_setValue('itemDatabaseTimestamp', Date.now());

                const processingTime = (Date.now() - startTime) / 1000;
                console.log(`✅ Streamed ${savedCount.toLocaleString()} items to IndexedDB in ${processingTime.toFixed(2)} seconds`);
                
                if (errorCount > 0) {
                    console.warn(`⚠️ Skipped ${errorCount} rows due to validation errors`);
                }

                return savedCount;

            } catch (error) {
                if (error.message.includes('Unsupported file')) {
                    throw new Error('Invalid XLSX file format. Please ensure the file is a valid Excel (.xlsx) file.');
                }
                throw error;
            }
        }

        // Legacy function for compatibility
        async function parseXLSX(arrayBuffer) {
            // For large files, use streaming directly
            return await parseXLSXStreaming(arrayBuffer);
        }

        // Stream items directly to IndexedDB without holding in memory
        async function saveItemDatabaseStreaming(items) {
            try {
                console.log(`💾 Streaming ${items.length} items to IndexedDB...`);
                const startTime = Date.now();

                // Clear existing data
                await db.items.clear();

                let savedCount = 0;
                const BATCH_SIZE = 1000; // Smaller batches for large datasets
                const totalBatches = Math.ceil(items.length / BATCH_SIZE);

                for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                    const startIdx = batchIndex * BATCH_SIZE;
                    const endIdx = Math.min(startIdx + BATCH_SIZE, items.length);
                    
                    // Process batch without storing in memory
                    const batch = [];
                    for (let i = startIdx; i < endIdx; i++) {
                        const item = items[i];
                        batch.push({
                            asin: (item.asin || '').toUpperCase(),
                            sku: (item.sku || ''),
                            store_tlc: (item.store_tlc || '').toUpperCase(),
                            store_acronym: item.store_acronym || '',
                            store_name: item.store_name || '',
                            item_nameLower: (item.item_name || '').toLowerCase(),
                            item_name: item.item_name || '',
                            // Include optional fields if they exist
                            quantity: item.quantity || '',
                            listing_status: item.listing_status || '',
                            event_date: item.event_date || '',
                            sku_wo_chck_dgt: item.sku_wo_chck_dgt || '',
                            rnk: item.rnk || '',
                            eod_our_price: item.eod_our_price || '',
                            offering_start_datetime: item.offering_start_datetime || '',
                            offering_end_datetime: item.offering_end_datetime || '',
                            merchant_customer_id: item.merchant_customer_id || '',
                            encrypted_merchant_i: item.encrypted_merchant_i || ''
                        });
                    }

                    await db.items.bulkAdd(batch);
                    savedCount += batch.length;
                    
                    console.log(`📦 Streamed batch ${batchIndex + 1}/${totalBatches} (${savedCount.toLocaleString()}/${items.length.toLocaleString()} items)`);
                    
                    // Allow UI to breathe between batches
                    if (batchIndex % 10 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                }

                // Save timestamp to GM storage (keep small metadata in GM)
                GM_setValue('itemDatabaseTimestamp', Date.now());

                console.log(`✅ Streamed ${savedCount.toLocaleString()} items to IndexedDB in ${(Date.now() - startTime)}ms`);
                return savedCount;

            } catch (error) {
                console.error('❌ Error streaming item database to IndexedDB:', error);
                alert(`❌ Failed to save item database: ${error.message}\n\nCheck console for details.`);
                throw error;
            }
        }

        // Legacy function for compatibility - now just calls streaming version
        async function saveItemDatabase() {
            if (itemDatabase.length === 0) return;
            return await saveItemDatabaseStreaming(itemDatabase);
        }

        // Get database status without loading everything into memory
        async function getItemDatabaseStatus() {
            try {
                const count = await db.items.count();
                const timestamp = GM_getValue('itemDatabaseTimestamp', 0);
                
                return {
                    count,
                    timestamp,
                    ageHours: timestamp ? (Date.now() - timestamp) / (1000 * 60 * 60) : null
                };
            } catch (error) {
                console.error('❌ Error getting database status:', error);
                return { count: 0, timestamp: 0, ageHours: null };
            }
        }

        // Legacy function for compatibility - now just sets itemDatabase to empty array
        function loadItemDatabase() {
            console.log('📂 Legacy loadItemDatabase called - using IndexedDB instead');
            itemDatabase = []; // Don't load everything into memory anymore
        }

        // Search items using IndexedDB with fast indexes
        async function searchItems(query, searchType = 'all', currentStoreTLC = null, limit = 50) {
            const q = (query || '').trim();
            if (!q) return [];
            const qU = q.toUpperCase();
            const qL = q.toLowerCase();

            let coll;

            try {
                switch (searchType) {
                    case 'asin':
                        // exact or prefix: use index
                        coll = db.items.where('asin').startsWith(qU);
                        break;
                    case 'sku':
                        coll = db.items.where('sku').startsWith(q);
                        break;
                    case 'store':
                        // fast filter on indexed store_tlc first; acronyms/names can be fallback
                        coll = db.items.where('store_tlc').startsWith(qU);
                        break;
                    case 'name':
                        // substring: no native index; do a filtered scan on item_nameLower with contains
                        coll = db.items.filter(it => it.item_nameLower.includes(qL));
                        break;
                    default:
                        // mixed mode: try indexed fields first, then merge with limited name contains
                        const asinHits = await db.items.where('asin').startsWith(qU).limit(limit).toArray();
                        if (asinHits.length >= limit) return asinHits;
                        const skuHits = await db.items.where('sku').startsWith(q).limit(limit - asinHits.length).toArray();
                        let results = asinHits.concat(skuHits);
                        if (results.length < limit) {
                            const nameHits = await db.items
                                .filter(it => it.item_nameLower.includes(qL))
                                .limit(limit - results.length).toArray();
                            results = results.concat(nameHits);
                        }
                        if (currentStoreTLC) {
                            results = results.filter(r => r.store_tlc === currentStoreTLC);
                        }
                        return results.slice(0, limit);
                }

                // Apply store filter and cap
                let arr = await coll.limit(limit * 2).toArray();
                if (currentStoreTLC) arr = arr.filter(r => r.store_tlc === currentStoreTLC);
                return arr.slice(0, limit);

            } catch (error) {
                console.error('❌ Error searching IndexedDB:', error);
                return [];
            }
        }

        // Store switching functionality
        async function switchToStore(acro, buttonEl) {
            const storeId = storeMappingData.get(acro);
            if (!storeId) {
                alert(`❌ Store acro ${acro} not found in mappings`);
                return;
            }

            // Enhanced CSRF token extraction with comprehensive debugging
            function extractCSRFToken() {
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
            }

            // Fallback CSRF token from working example
            function getFallbackToken() {
                const fallbackToken = GM_getValue('fallbackCSRFToken', 'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw==');
                console.log("🔄 Using fallback CSRF token:", fallbackToken);
                console.log("Token length:", fallbackToken.length);
                console.log("Token format valid:", /^[A-Za-z0-9+/]+=*$/.test(fallbackToken));
                return fallbackToken;
            }

            // Enhanced token extraction with network capture, retry logic and fallback
            async function extractTokenWithRetry(maxRetries = 3, delayMs = 1000) {
                console.log(`\n🔄 CSRF Token Extraction Starting...`);

                // Priority 1: Check for recently captured token from network requests
                const capturedToken = getCapturedToken();
                if (capturedToken) {
                    console.log("✅ Using recently captured token from network requests");
                    return capturedToken;
                }

                // Priority 2: Try DOM extraction with retries
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    console.log(`\n🔄 DOM Extraction Attempt ${attempt}/${maxRetries}`);

                    const token = extractCSRFToken();
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
                    return getFallbackToken();
                }

                return null;
            }

            const csrfToken = await extractTokenWithRetry();
            if (!csrfToken) {
                alert('❌ Unable to find CSRF token after multiple attempts and fallback is disabled.\n\nEnable fallback token in settings or refresh the page and try again.\n\nCheck the browser console for detailed debugging information.');
                return;
            }

            // Show loading feedback
            const originalButtonText = buttonEl?.textContent ?? '🔄 Switching...';
            if (buttonEl) {
                buttonEl.textContent = '🔄 Switching...';
                buttonEl.disabled = true;
            }

            try {
                // Use the exact fetch pattern from StoreChangeExample.js
                const response = await fetch("https://www.wholefoodsmarket.com/store-affinity", {
                    headers: {
                        "accept": "*/*",
                        "accept-language": "en-US,en;q=0.9",
                        "anti-csrftoken-a2z": csrfToken,
                        "content-type": "text/plain;charset=UTF-8",
                        "device-memory": "8",
                        "downlink": "10",
                        "dpr": "1.5",
                        "ect": "4g",
                        "rtt": "100",
                        "sec-ch-device-memory": "8",
                        "sec-ch-dpr": "1.5",
                        "sec-ch-ua": "\"Not)A;Brand\";v=\"8\", \"Chromium\";v=\"138\", \"Google Chrome\";v=\"138\"",
                        "sec-ch-ua-mobile": "?0",
                        "sec-ch-ua-platform": "\"Windows\"",
                        "sec-ch-viewport-width": "448",
                        "sec-fetch-dest": "empty",
                        "sec-fetch-mode": "cors",
                        "sec-fetch-site": "same-origin",
                        "viewport-width": "448"
                    },
                    referrer: "https://www.wholefoodsmarket.com/",
                    body: JSON.stringify({"storeId": storeId.toString()}),
                    method: "PUT",
                    mode: "cors",
                    credentials: "include"
                });

                // Check if the request was successful
                if (response.ok) {
                    alert(`✅ Successfully switched to store ${acro} (ID: ${storeId})`);

                    // Wait a moment for the server to process the change, then refresh
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                } else {
                    throw new Error(`Server responded with status: ${response.status} ${response.statusText}`);
                }

            } catch (error) {
                console.error('Store switch error:', error);

                // Provide user-friendly error messages
                let errorMessage = '❌ Failed to switch store. ';
                if (error.name === 'TypeError' && error.message.includes('fetch')) {
                    errorMessage += 'Network error - please check your connection and try again.';
                } else if (error.message.includes('status:')) {
                    errorMessage += error.message;
                } else {
                    errorMessage += 'Please try again or refresh the page.';
                }

                alert(errorMessage);
            } finally {
                // Restore button state
                if (buttonEl) {
                    buttonEl.textContent = originalButtonText;
                    buttonEl.disabled = false;
                }
            }
        }

        // File upload handler for XLSX store mappings
        function handleXLSXUpload(file) {
            if (!file) return;

            const fileName = file.name.toLowerCase();
            if (!fileName.endsWith('.xlsx')) {
                alert('Please select an XLSX file (.xlsx extension required)');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const arrayBuffer = e.target.result;
                    const newMappings = parseXLSXForStoreMapping(arrayBuffer);

                    // Update the store mapping data
                    storeMappingData.clear();
                    newMappings.forEach((storeId, acro) => {
                        storeMappingData.set(acro, storeId);
                    });

                    // Save to persistent storage
                    saveStoredMappings();

                    // Update UI
                    updateStatus();

                    alert(`✅ Successfully loaded ${storeMappingData.size} store mappings from ${file.name}`);
                } catch (error) {
                    alert(`❌ Error parsing XLSX file: ${error.message}`);
                }
            };

            reader.onerror = function() {
                alert('❌ Error reading XLSX file. Please try again.');
            };

            reader.readAsArrayBuffer(file);
        }

        // SharePoint data refresh functionality is now handled above
        // Old XLSX upload functionality has been replaced with SharePoint integration

        // Fixed panel position (top-right corner)
        const isMinimized = GM_getValue('wts_panel_minimized', false);

        const panel = document.createElement('div');
        panel.id = 'wts-panel';
        panel.style.position = 'fixed';
        panel.style.top = '20px';
        panel.style.right = '20px';
        panel.style.zIndex = '2147483647';
        panel.style.background = '#ffffff';
        panel.style.border = '2px solid #00704A';
        panel.style.borderRadius = '12px';
        panel.style.boxShadow = '0 8px 24px rgba(0, 112, 74, 0.15)';
        panel.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        panel.style.userSelect = 'none';
        // Remove cursor: 'move' from panel - will be added only to header
        
        // Set initial size based on minimized state with responsive sizing
        if (isMinimized) {
            // Minimized state: improved left-side tab
            panel.style.left = '0';
            panel.style.top = '50%';
            panel.style.right = 'auto';
            panel.style.transform = 'translateY(-50%)';
            panel.style.width = '60px';
            panel.style.height = '180px';
            panel.style.padding = '0';
            panel.style.borderRadius = '0 16px 16px 0';
            panel.style.boxShadow = '2px 0 12px rgba(0, 112, 74, 0.3)';
        } else {
            // Responsive sizing that adapts to viewport
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Calculate responsive width (20-25% of viewport, with min/max constraints)
            const responsiveWidth = Math.min(Math.max(viewportWidth * 0.22, 320), 400);
            
            panel.style.width = `${responsiveWidth}px`;
            panel.style.maxWidth = `${Math.min(viewportWidth * 0.4, 450)}px`;
            panel.style.minWidth = '320px';
            panel.style.maxHeight = `${Math.min(viewportHeight * 0.85, 700)}px`;
            panel.style.padding = '0';
            panel.style.display = 'flex';
            panel.style.flexDirection = 'column';
            panel.style.transform = 'none';
        }

        // Create professional header
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.padding = '12px 16px';
        header.style.background = 'linear-gradient(135deg, #00704A 0%, #005A3C 100%)';
        header.style.borderRadius = isMinimized ? '0 16px 16px 0' : '10px 10px 0 0';
        header.style.fontSize = '16px';
        header.style.fontWeight = '600';
        header.style.color = '#ffffff';
        header.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        header.style.cursor = 'move'; // Add drag cursor only to header
        
        // Special styling for minimized state
        if (isMinimized) {
            header.style.flexDirection = 'column';
            header.style.justifyContent = 'center';
            header.style.padding = '16px 8px';
            header.style.height = '100%';
            header.style.borderRadius = '0 16px 16px 0';
            header.style.writingMode = 'vertical-rl';
            header.style.textOrientation = 'mixed';
            header.style.whiteSpace = 'nowrap';
            header.style.overflow = 'hidden';
        }

        const headerLeft = document.createElement('div');
        headerLeft.style.display = 'flex';
        headerLeft.style.alignItems = 'center';
        headerLeft.style.gap = '12px';

        const brandIcon = document.createElement('span');
        brandIcon.textContent = '🛒';
        brandIcon.style.fontSize = '18px';

        const headerTitle = document.createElement('span');
        headerTitle.textContent = 'WTS Tools';
        headerTitle.style.fontSize = isMinimized ? '14px' : '16px';
        headerTitle.style.fontWeight = '600';
        headerTitle.style.letterSpacing = '0.5px';
        headerTitle.style.textAlign = 'center';
        headerTitle.style.lineHeight = isMinimized ? '1.2' : 'normal';
        
        // Hide title in minimized state to save space
        if (isMinimized) {
            headerTitle.style.display = 'none';
        }

        const headerRight = document.createElement('div');
        headerRight.style.display = 'flex';
        headerRight.style.alignItems = 'center';
        headerRight.style.gap = '8px';

        const versionBadge = document.createElement('span');
        versionBadge.textContent = `v${CURRENT_VERSION}`;
        versionBadge.style.fontSize = '11px';
        versionBadge.style.padding = '4px 10px';
        versionBadge.style.background = 'rgba(255,255,255,0.15)';
        versionBadge.style.borderRadius = '16px';
        versionBadge.style.color = '#ffffff';
        versionBadge.style.fontWeight = '500';
        versionBadge.style.border = '1px solid rgba(255,255,255,0.2)';

        // Create help icon next to version badge
        const helpIcon = document.createElement('button');
        helpIcon.textContent = '?';
        helpIcon.style.background = 'rgba(255,255,255,0.15)';
        helpIcon.style.border = '1px solid rgba(255,255,255,0.2)';
        helpIcon.style.borderRadius = '50%';
        helpIcon.style.color = '#ffffff';
        helpIcon.style.cursor = 'pointer';
        helpIcon.style.padding = '4px 8px';
        helpIcon.style.fontSize = '12px';
        helpIcon.style.fontWeight = '600';
        helpIcon.style.width = '24px';
        helpIcon.style.height = '24px';
        helpIcon.style.display = 'flex';
        helpIcon.style.alignItems = 'center';
        helpIcon.style.justifyContent = 'center';
        helpIcon.style.transition = 'all 0.2s ease';
        helpIcon.title = 'Show Help & Usage Instructions';

        helpIcon.addEventListener('mouseenter', () => {
            helpIcon.style.background = 'rgba(255,255,255,0.25)';
            helpIcon.style.transform = 'scale(1.05)';
        });
        helpIcon.addEventListener('mouseleave', () => {
            helpIcon.style.background = 'rgba(255,255,255,0.15)';
            helpIcon.style.transform = 'scale(1)';
        });

        // Create minimize/maximize button
        const minimizeBtn = document.createElement('button');
        minimizeBtn.textContent = isMinimized ? '📋' : '➖';
        minimizeBtn.style.background = 'rgba(255,255,255,0.15)';
        minimizeBtn.style.border = '1px solid rgba(255,255,255,0.2)';
        minimizeBtn.style.borderRadius = isMinimized ? '8px' : '6px';
        minimizeBtn.style.color = '#ffffff';
        minimizeBtn.style.cursor = 'pointer';
        minimizeBtn.style.padding = isMinimized ? '12px 8px' : '6px 10px';
        minimizeBtn.style.fontSize = isMinimized ? '18px' : '12px';
        minimizeBtn.style.fontWeight = '500';
        minimizeBtn.style.width = isMinimized ? '100%' : 'auto';
        minimizeBtn.style.marginTop = isMinimized ? '8px' : '0';
        minimizeBtn.title = isMinimized ? 'Expand Panel' : 'Minimize Panel';

        minimizeBtn.addEventListener('mouseenter', () => {
            minimizeBtn.style.background = 'rgba(255,255,255,0.25)';
        });
        minimizeBtn.addEventListener('mouseleave', () => {
            minimizeBtn.style.background = 'rgba(255,255,255,0.15)';
        });

        if (isMinimized) {
            // Minimized layout: vertical stack
            const minimizedContent = document.createElement('div');
            minimizedContent.style.display = 'flex';
            minimizedContent.style.flexDirection = 'column';
            minimizedContent.style.alignItems = 'center';
            minimizedContent.style.justifyContent = 'center';
            minimizedContent.style.height = '100%';
            minimizedContent.style.gap = '12px';
            
            const minimizedTitle = document.createElement('div');
            minimizedTitle.textContent = 'WTS';
            minimizedTitle.style.fontSize = '14px';
            minimizedTitle.style.fontWeight = '700';
            minimizedTitle.style.color = '#ffffff';
            minimizedTitle.style.textAlign = 'center';
            minimizedTitle.style.letterSpacing = '1px';
            
            const minimizedSubtitle = document.createElement('div');
            minimizedSubtitle.textContent = 'TOOLS';
            minimizedSubtitle.style.fontSize = '10px';
            minimizedSubtitle.style.fontWeight = '500';
            minimizedSubtitle.style.color = 'rgba(255,255,255,0.8)';
            minimizedSubtitle.style.textAlign = 'center';
            minimizedSubtitle.style.letterSpacing = '0.5px';
            
            minimizedContent.appendChild(minimizedTitle);
            minimizedContent.appendChild(minimizedSubtitle);
            minimizedContent.appendChild(minimizeBtn);
            header.appendChild(minimizedContent);
        } else {
            // Normal layout: horizontal
            headerLeft.appendChild(brandIcon);
            headerLeft.appendChild(headerTitle);
            headerRight.appendChild(versionBadge);
            headerRight.appendChild(helpIcon);
            headerRight.appendChild(minimizeBtn);
            header.appendChild(headerLeft);
            header.appendChild(headerRight);
        }

        // Add help icon click handler
        helpIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            showHelpModal();
        });

        // Create content container
        const contentContainer = document.createElement('div');
        contentContainer.style.padding = '12px 16px'; // Reduced from 20px
        contentContainer.style.display = isMinimized ? 'none' : 'flex';
        contentContainer.style.flexDirection = 'column';
        contentContainer.style.gap = '10px'; // Reduced from 16px
        contentContainer.style.background = '#ffffff';
        contentContainer.style.borderRadius = '0 0 10px 10px';

        // Minimize/Maximize functionality
        const toggleMinimize = () => {
            const currentlyMinimized = contentContainer.style.display === 'none';
            
            if (currentlyMinimized) {
                // Expand from left-side tab
                contentContainer.style.display = 'flex';
                
                // Recalculate responsive dimensions
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const responsiveWidth = Math.min(Math.max(viewportWidth * 0.22, 320), 400);
                
                panel.style.left = 'auto';
                panel.style.top = '20px';
                panel.style.right = '20px';
                panel.style.transform = 'none';
                panel.style.width = `${responsiveWidth}px`;
                panel.style.height = '';
                panel.style.minWidth = '320px';
                panel.style.maxWidth = `${Math.min(viewportWidth * 0.4, 450)}px`;
                panel.style.maxHeight = `${Math.min(viewportHeight * 0.85, 700)}px`;
                panel.style.borderRadius = '12px';
                panel.style.boxShadow = '0 8px 24px rgba(0, 112, 74, 0.15)';
                
                // Restore normal header layout
                header.style.flexDirection = 'row';
                header.style.justifyContent = 'space-between';
                header.style.padding = '12px 16px';
                header.style.height = 'auto';
                header.style.borderRadius = '10px 10px 0 0';
                
                // Rebuild header content for normal state
                header.innerHTML = '';
                
                // Recreate header left section
                const newHeaderLeft = document.createElement('div');
                newHeaderLeft.style.display = 'flex';
                newHeaderLeft.style.alignItems = 'center';
                newHeaderLeft.style.gap = '12px';
                
                const newBrandIcon = document.createElement('span');
                newBrandIcon.textContent = '🛒';
                newBrandIcon.style.fontSize = '18px';
                
                const newHeaderTitle = document.createElement('span');
                newHeaderTitle.textContent = 'WTS Tools';
                newHeaderTitle.style.fontSize = '16px';
                newHeaderTitle.style.fontWeight = '600';
                newHeaderTitle.style.letterSpacing = '0.5px';
                
                newHeaderLeft.appendChild(newBrandIcon);
                newHeaderLeft.appendChild(newHeaderTitle);
                
                // Recreate header right section
                const newHeaderRight = document.createElement('div');
                newHeaderRight.style.display = 'flex';
                newHeaderRight.style.alignItems = 'center';
                newHeaderRight.style.gap = '8px';
                
                const newVersionBadge = document.createElement('span');
                newVersionBadge.textContent = `v${CURRENT_VERSION}`;
                newVersionBadge.style.fontSize = '11px';
                newVersionBadge.style.padding = '4px 10px';
                newVersionBadge.style.background = 'rgba(255,255,255,0.15)';
                newVersionBadge.style.borderRadius = '16px';
                newVersionBadge.style.color = '#ffffff';
                newVersionBadge.style.fontWeight = '500';
                newVersionBadge.style.border = '1px solid rgba(255,255,255,0.2)';
                
                // Update minimize button for normal state
                minimizeBtn.textContent = '➖';
                minimizeBtn.title = 'Minimize Panel';
                minimizeBtn.style.borderRadius = '6px';
                minimizeBtn.style.padding = '6px 10px';
                minimizeBtn.style.fontSize = '12px';
                minimizeBtn.style.width = 'auto';
                minimizeBtn.style.marginTop = '0';
                
                newHeaderRight.appendChild(newVersionBadge);
                newHeaderRight.appendChild(minimizeBtn);
                
                header.appendChild(newHeaderLeft);
                header.appendChild(newHeaderRight);
                
                GM_setValue('wts_panel_minimized', false);
            } else {
                // Minimize to improved left-side tab
                contentContainer.style.display = 'none';
                panel.style.left = '0';
                panel.style.top = '50%';
                panel.style.right = 'auto';
                panel.style.transform = 'translateY(-50%)';
                panel.style.width = '60px';
                panel.style.height = '180px';
                panel.style.minWidth = '';
                panel.style.maxWidth = '';
                panel.style.borderRadius = '0 16px 16px 0';
                panel.style.boxShadow = '2px 0 12px rgba(0, 112, 74, 0.3)';
                
                // Update header for minimized state
                header.style.flexDirection = 'column';
                header.style.justifyContent = 'center';
                header.style.padding = '16px 8px';
                header.style.height = '100%';
                header.style.borderRadius = '0 16px 16px 0';
                
                // Rebuild header content for minimized state
                header.innerHTML = '';
                const minimizedContent = document.createElement('div');
                minimizedContent.style.display = 'flex';
                minimizedContent.style.flexDirection = 'column';
                minimizedContent.style.alignItems = 'center';
                minimizedContent.style.justifyContent = 'center';
                minimizedContent.style.height = '100%';
                minimizedContent.style.gap = '12px';
                
                const minimizedTitle = document.createElement('div');
                minimizedTitle.textContent = 'WTS';
                minimizedTitle.style.fontSize = '14px';
                minimizedTitle.style.fontWeight = '700';
                minimizedTitle.style.color = '#ffffff';
                minimizedTitle.style.textAlign = 'center';
                minimizedTitle.style.letterSpacing = '1px';
                
                const minimizedSubtitle = document.createElement('div');
                minimizedSubtitle.textContent = 'TOOLS';
                minimizedSubtitle.style.fontSize = '10px';
                minimizedSubtitle.style.fontWeight = '500';
                minimizedSubtitle.style.color = 'rgba(255,255,255,0.8)';
                minimizedSubtitle.style.textAlign = 'center';
                minimizedSubtitle.style.letterSpacing = '0.5px';
                
                // Update minimize button for minimized state
                minimizeBtn.textContent = '📋';
                minimizeBtn.title = 'Expand Panel';
                minimizeBtn.style.borderRadius = '8px';
                minimizeBtn.style.padding = '12px 8px';
                minimizeBtn.style.fontSize = '18px';
                minimizeBtn.style.width = '100%';
                minimizeBtn.style.marginTop = '8px';
                
                minimizedContent.appendChild(minimizedTitle);
                minimizedContent.appendChild(minimizedSubtitle);
                minimizedContent.appendChild(minimizeBtn);
                header.appendChild(minimizedContent);
                
                GM_setValue('wts_panel_minimized', true);
            }
        };

        minimizeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMinimize();
        });

        panel.appendChild(header);
        panel.appendChild(contentContainer);

        // Add basic drag functionality
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            // Prevent text selection during drag
            e.preventDefault();
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            const x = e.clientX - dragOffset.x;
            const y = e.clientY - dragOffset.y;
            
            // Keep panel within viewport bounds
            const maxX = window.innerWidth - panel.offsetWidth;
            const maxY = window.innerHeight - panel.offsetHeight;
            
            panel.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
            panel.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
            panel.style.right = 'auto'; // Remove right positioning when dragging
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
            }
        });

        // Add responsive resize handling
        const handleResize = () => {
            const currentlyMinimized = contentContainer.style.display === 'none';
            if (!currentlyMinimized) {
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                
                // Recalculate responsive dimensions
                const responsiveWidth = Math.min(Math.max(viewportWidth * 0.22, 320), 400);
                
                panel.style.width = `${responsiveWidth}px`;
                panel.style.maxWidth = `${Math.min(viewportWidth * 0.4, 450)}px`;
                panel.style.maxHeight = `${Math.min(viewportHeight * 0.85, 700)}px`;
                
                // Ensure panel stays within viewport bounds
                const rect = panel.getBoundingClientRect();
                if (rect.right > viewportWidth) {
                    panel.style.left = `${viewportWidth - rect.width - 20}px`;
                    panel.style.right = 'auto';
                }
                if (rect.bottom > viewportHeight) {
                    panel.style.top = `${viewportHeight - rect.height - 20}px`;
                }
            } else {
                // Keep minimized tab centered vertically on resize
                panel.style.top = '50%';
                panel.style.transform = 'translateY(-50%)';
            }
        };

        // Debounced resize handler to avoid excessive calls
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(handleResize, 150);
        });

        // Helper function to adjust color brightness
        const adjustBrightness = (color, factor) => {
            // Simple brightness adjustment for hex colors
            if (color.startsWith('#')) {
                const hex = color.slice(1);
                const num = parseInt(hex, 16);
                const r = Math.min(255, Math.max(0, (num >> 16) + Math.round(factor * 255)));
                const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + Math.round(factor * 255)));
                const b = Math.min(255, Math.max(0, (num & 0x0000FF) + Math.round(factor * 255)));
                return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
            }
            return color;
        };

        // Helper function to create professional buttons
        const createButton = (text, color, onClick, options = {}) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.style.padding = '8px 12px'; // Reduced from 10px 16px
            btn.style.background = color;
            btn.style.color = '#ffffff';
            btn.style.border = 'none';
            btn.style.borderRadius = '6px';
            btn.style.cursor = 'pointer'; // Ensure buttons have pointer cursor, not move
            btn.style.fontSize = '13px';
            btn.style.fontWeight = '500';
            btn.style.transition = 'all 0.2s ease';
            btn.style.width = options.fullWidth ? '100%' : 'auto';
            btn.style.textAlign = 'center';
            
            // Professional hover effects (color only)
            btn.addEventListener('mouseenter', () => {
                btn.style.backgroundColor = adjustBrightness(color, 0.1);
                btn.style.cursor = 'pointer'; // Ensure cursor stays as pointer on hover
            });
            
            btn.addEventListener('mouseleave', () => {
                btn.style.backgroundColor = color;
                btn.style.cursor = 'pointer'; // Ensure cursor stays as pointer
            });
            
            btn.addEventListener('click', onClick);
            return btn;
        };

        // Helper function to create section headers
        const createSectionHeader = (title) => {
            const header = document.createElement('div');
            header.textContent = title;
            header.style.fontSize = '12px';
            header.style.fontWeight = '600';
            header.style.color = '#495057'; // Improved contrast
            header.style.textTransform = 'uppercase';
            header.style.letterSpacing = '0.5px';
            header.style.marginTop = '10px'; // Reduced from 16px
            header.style.marginBottom = '6px'; // Reduced from 8px
            header.style.paddingBottom = '4px';
            header.style.borderBottom = '1px solid #00704A';
            return header;
        };

        // Helper function to create button groups
        const createButtonGroup = (buttons, columns = 1) => {
            const group = document.createElement('div');
            group.style.display = 'grid';
            group.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
            group.style.gap = '6px'; // Reduced from 8px
            group.style.marginBottom = '6px'; // Reduced from 8px
            
            buttons.forEach(btn => group.appendChild(btn));
            return group;
        };

        // MAIN ACTIONS SECTION - Compact Two-Column Layout
        const actionsHeader = createSectionHeader('Actions');
        
        const exportBtn = createButton('📦 Export Data', '#00704A', () => {
            console.log('📦 Export button clicked - using comprehensive data extraction');
            
            const comprehensiveData = extractAllData();
            
            const summary = `📊 Data Extraction Complete!\n\n` +
                `Visible Cards: ${comprehensiveData.totalVisibleASINs} ASINs\n` +
                `Empty Cards: ${comprehensiveData.emptyCards}\n` +
                `Shoveler Carousels: ${comprehensiveData.totalShovelers}\n` +
                `Shoveler ASINs: ${comprehensiveData.totalShovelerASINs}\n\n` +
                `Total ASINs (Visible Cards Only): ${comprehensiveData.totalVisibleASINs}`;
            
            alert(summary);
            
            if (comprehensiveData.totalVisibleASINs === 0 && comprehensiveData.totalShovelerASINs === 0) {
                alert('No ASIN data found. Try scrolling or navigating through carousels.');
                return;
            }
            
            lastExtractedData = comprehensiveData;
            downloadXLSX(comprehensiveData);
        });

        const refreshBtn = createButton('🔄 Refresh Data', '#00704A', () => {
            console.log('🔄 Refresh button clicked - using comprehensive data extraction');
            
            lastExtractedData = [];
            const comprehensiveData = extractAllData();
            
            const summary = `🔄 Data Refresh Complete!\n\n` +
                `Visible Cards: ${comprehensiveData.totalVisibleASINs} ASINs\n` +
                `Empty Cards: ${comprehensiveData.emptyCards}\n` +
                `Shoveler Carousels: ${comprehensiveData.totalShovelers}\n` +
                `Shoveler ASINs: ${comprehensiveData.totalShovelerASINs}\n\n` +
                `Total ASINs (Visible Cards Only): ${comprehensiveData.totalVisibleASINs}`;
            
            alert(summary);
            lastExtractedData = comprehensiveData;
        });

        const uploadBtn = createButton('📁 Upload XLSX', '#00704A', () => {
            fileInput.click();
        });
        uploadBtn.title = 'Upload XLSX file with Acro and StoreId columns for store mapping';

        const versionCheckBtn = createButton('🔍 Updates', '#00704A', async () => {
            versionCheckBtn.textContent = '🔄 Checking...';
            versionCheckBtn.disabled = true;
            
            try {
                await checkForUpdates(true);
            } catch (error) {
                console.error('❌ Error in version check button:', error);
                alert(`❌ Version check failed: ${error.message}`);
            } finally {
                versionCheckBtn.textContent = '🔍 Updates';
                versionCheckBtn.disabled = false;
            }
        });

        // Create two-column layout for main actions
        const actionsGroup = createButtonGroup([exportBtn, refreshBtn, uploadBtn, versionCheckBtn], 2);

        // NAVIGATION SECTION
        const navigationHeader = createSectionHeader('Navigation');

        // Create store switching dropdown
        const storeSelectContainer = document.createElement('div');
        storeSelectContainer.style.display = 'none'; // Hidden by default
        storeSelectContainer.style.marginTop = '8px';

        const storeSelectLabel = document.createElement('div');
        storeSelectLabel.textContent = 'Switch Store:';
        storeSelectLabel.style.fontSize = '12px';
        storeSelectLabel.style.color = '#333';
        storeSelectLabel.style.marginBottom = '4px';

        const storeSelect = document.createElement('select');
        storeSelect.style.width = '100%';
        storeSelect.style.padding = '6px';
        storeSelect.style.borderRadius = '4px';
        storeSelect.style.border = '1px solid #ccc';
        storeSelect.style.fontSize = '12px';

        const switchBtn = document.createElement('button');
        switchBtn.textContent = '🔄 Switch Store';
        switchBtn.style.width = '100%';
        switchBtn.style.padding = '8px';
        switchBtn.style.backgroundColor = '#00704A';
        switchBtn.style.color = '#fff';
        switchBtn.style.border = 'none';
        switchBtn.style.borderRadius = '4px';
        switchBtn.style.cursor = 'pointer';
        switchBtn.style.marginTop = '4px';
        switchBtn.style.fontSize = '12px';

        switchBtn.addEventListener('click', () => {
            const selectedAcro = storeSelect.value;
            if (selectedAcro) {
                switchToStore(selectedAcro, switchBtn);
            } else {
                alert('Please select a store to switch to');
            }
        });

        storeSelectContainer.appendChild(storeSelectLabel);
        storeSelectContainer.appendChild(storeSelect);
        storeSelectContainer.appendChild(switchBtn);

        // Create status display for store mappings
        const statusDiv = document.createElement('div');
        statusDiv.style.fontSize = '13px';
        statusDiv.style.color = '#6c757d';
        statusDiv.style.textAlign = 'center';
        statusDiv.style.marginTop = '6px'; // Reduced from 8px
        statusDiv.style.padding = '6px 10px'; // Reduced from 8px 12px
        statusDiv.style.background = 'rgba(0, 112, 74, 0.05)';
        statusDiv.style.borderRadius = '8px';
        statusDiv.style.border = '1px solid rgba(0, 112, 74, 0.2)';
        statusDiv.style.fontWeight = '500';
        statusDiv.textContent = 'No store mappings loaded';


        // Create CSRF settings button
        const csrfSettingsBtn = document.createElement('button');
        csrfSettingsBtn.textContent = '⚙️ CSRF Settings';
        csrfSettingsBtn.style.padding = '8px 12px'; // Reduced from 10px 16px
        csrfSettingsBtn.style.background = '#6c757d';
        csrfSettingsBtn.style.color = '#fff';
        csrfSettingsBtn.style.border = 'none';
        csrfSettingsBtn.style.borderRadius = '8px';
        csrfSettingsBtn.style.cursor = 'pointer';
        csrfSettingsBtn.style.fontSize = '13px';
        csrfSettingsBtn.style.fontWeight = '500';
        csrfSettingsBtn.style.marginTop = '6px'; // Reduced from 8px
        csrfSettingsBtn.style.boxShadow = 'none';
        csrfSettingsBtn.style.cursor = 'pointer'; // Ensure button has pointer cursor
        
        // Professional hover effects (color only)
        csrfSettingsBtn.addEventListener('mouseenter', () => {
            csrfSettingsBtn.style.background = '#5a6268';
            csrfSettingsBtn.style.cursor = 'pointer'; // Ensure cursor stays as pointer
        });
        
        csrfSettingsBtn.addEventListener('mouseleave', () => {
            csrfSettingsBtn.style.background = '#6c757d';
            csrfSettingsBtn.style.cursor = 'pointer'; // Ensure cursor stays as pointer
        });

        // CSRF Settings Modal
        function showCSRFSettings() {
            const modal = document.createElement('div');
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            modal.style.zIndex = '10000';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';

            const modalContent = document.createElement('div');
            modalContent.style.backgroundColor = '#fff';
            modalContent.style.padding = '20px';
            modalContent.style.borderRadius = '8px';
            modalContent.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            modalContent.style.maxWidth = '500px';
            modalContent.style.width = '90%';
            modalContent.style.fontFamily = 'sans-serif';

            const currentFallbackToken = GM_getValue('fallbackCSRFToken', 'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw==');
            const useFallback = GM_getValue('useFallbackCSRF', true);

            // Get captured token info
            const capturedToken = GM_getValue('lastCapturedCSRFToken', null);
            const capturedTimestamp = GM_getValue('lastCapturedTimestamp', 0);
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
                const isValid = /^[A-Za-z0-9+/]+=*$/.test(token) && token.length > 50;
                alert(isValid ? '✅ Token format appears valid' : '❌ Token format appears invalid');
            });

            document.getElementById('clearCapturedBtn').addEventListener('click', () => {
                GM_deleteValue('lastCapturedCSRFToken');
                GM_deleteValue('lastCapturedTimestamp');
                capturedCSRFToken = null;
                alert('✅ Captured token cleared');
                document.body.removeChild(modal);
            });

            document.getElementById('cancelBtn').addEventListener('click', () => {
                document.body.removeChild(modal);
            });

            document.getElementById('saveBtn').addEventListener('click', () => {
                const newToken = document.getElementById('fallbackTokenInput').value.trim();
                const usesFallback = document.getElementById('useFallbackCheckbox').checked;

                if (newToken && !/^[A-Za-z0-9+/]+=*$/.test(newToken)) {
                    alert('❌ Invalid token format. Token should be base64 encoded.');
                    return;
                }

                GM_setValue('fallbackCSRFToken', newToken);
                GM_setValue('useFallbackCSRF', usesFallback);

                alert('✅ CSRF settings saved successfully');
                document.body.removeChild(modal);
            });

            // Close on background click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                }
            });
        }

        csrfSettingsBtn.addEventListener('click', showCSRFSettings);

        // Comprehensive Help Modal Function
        function showHelpModal() {
            const modal = document.createElement('div');
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0,0,0,0.6)';
            modal.style.zIndex = '2147483648';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            modal.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

            const modalContent = document.createElement('div');
            modalContent.style.backgroundColor = '#ffffff';
            modalContent.style.borderRadius = '12px';
            modalContent.style.boxShadow = '0 12px 40px rgba(0, 112, 74, 0.3)';
            modalContent.style.maxWidth = '800px';
            modalContent.style.width = '90%';
            modalContent.style.maxHeight = '85vh';
            modalContent.style.display = 'flex';
            modalContent.style.flexDirection = 'column';
            modalContent.style.border = '2px solid #00704A';
            modalContent.style.overflow = 'hidden';

            // Modal Header
            const modalHeader = document.createElement('div');
            modalHeader.style.background = 'linear-gradient(135deg, #00704A 0%, #005A3C 100%)';
            modalHeader.style.color = '#ffffff';
            modalHeader.style.padding = '20px 24px';
            modalHeader.style.display = 'flex';
            modalHeader.style.alignItems = 'center';
            modalHeader.style.justifyContent = 'space-between';
            modalHeader.style.borderRadius = '10px 10px 0 0';

            const modalTitle = document.createElement('h2');
            modalTitle.textContent = '🛒 WTS Tools - Complete Usage Guide';
            modalTitle.style.margin = '0';
            modalTitle.style.fontSize = '20px';
            modalTitle.style.fontWeight = '600';
            modalTitle.style.letterSpacing = '0.5px';

            const closeButton = document.createElement('button');
            closeButton.textContent = '✕';
            closeButton.style.background = 'rgba(255,255,255,0.15)';
            closeButton.style.border = '1px solid rgba(255,255,255,0.3)';
            closeButton.style.borderRadius = '50%';
            closeButton.style.color = '#ffffff';
            closeButton.style.cursor = 'pointer';
            closeButton.style.padding = '8px 12px';
            closeButton.style.fontSize = '16px';
            closeButton.style.fontWeight = '600';
            closeButton.style.width = '36px';
            closeButton.style.height = '36px';
            closeButton.style.display = 'flex';
            closeButton.style.alignItems = 'center';
            closeButton.style.justifyContent = 'center';
            closeButton.style.transition = 'all 0.2s ease';
            closeButton.title = 'Close Help';

            closeButton.addEventListener('mouseenter', () => {
                closeButton.style.background = 'rgba(255,255,255,0.25)';
                closeButton.style.transform = 'scale(1.05)';
            });
            closeButton.addEventListener('mouseleave', () => {
                closeButton.style.background = 'rgba(255,255,255,0.15)';
                closeButton.style.transform = 'scale(1)';
            });

            modalHeader.appendChild(modalTitle);
            modalHeader.appendChild(closeButton);

            // Modal Body (Scrollable)
            const modalBody = document.createElement('div');
            modalBody.style.padding = '24px';
            modalBody.style.overflowY = 'auto';
            modalBody.style.flex = '1';
            modalBody.style.fontSize = '14px';
            modalBody.style.lineHeight = '1.6';
            modalBody.style.color = '#333';

            // Comprehensive Help Content
            modalBody.innerHTML = `
                <div style="margin-bottom: 24px;">
                    <h3 style="color: #00704A; margin: 0 0 12px 0; font-size: 18px; font-weight: 600; border-bottom: 2px solid #00704A; padding-bottom: 8px;">📦 Export Data</h3>
                    <p style="margin: 0 0 8px 0;"><strong>Purpose:</strong> Export ASIN data from visible product cards and carousel shovelers to Excel format.</p>
                    <p style="margin: 0 0 8px 0;"><strong>How to use:</strong> Click the "📦 Export Data" button to extract all visible ASINs and shoveler data.</p>
                    <p style="margin: 0 0 8px 0;"><strong>Output:</strong> Downloads an Excel file with two sheets:</p>
                    <ul style="margin: 8px 0 0 20px; padding: 0;">
                        <li><strong>Visible Cards:</strong> ASINs from product cards currently visible on the page</li>
                        <li><strong>Shoveler Data:</strong> ASINs from carousel/shoveler components with titles and indices</li>
                    </ul>
                    <p style="margin: 8px 0 0 0; padding: 12px; background: #f0f8f0; border-left: 4px solid #00704A; border-radius: 4px;"><strong>💡 Tip:</strong> Scroll through the page and navigate carousels to capture more ASINs before exporting.</p>
                </div>

                <div style="margin-bottom: 24px;">
                    <h3 style="color: #00704A; margin: 0 0 12px 0; font-size: 18px; font-weight: 600; border-bottom: 2px solid #00704A; padding-bottom: 8px;">🔄 Refresh Data</h3>
                    <p style="margin: 0 0 8px 0;"><strong>Purpose:</strong> Re-scan the current page for updated ASIN data without exporting.</p>
                    <p style="margin: 0 0 8px 0;"><strong>How to use:</strong> Click "🔄 Refresh Data" to update the counter and prepare fresh data for export.</p>
                    <p style="margin: 0 0 8px 0;"><strong>When to use:</strong> After navigating through carousels, scrolling, or when page content changes.</p>
                    <p style="margin: 8px 0 0 0; padding: 12px; background: #f0f8f0; border-left: 4px solid #00704A; border-radius: 4px;"><strong>💡 Tip:</strong> Use this before exporting to ensure you capture the most recent data.</p>
                </div>

                <div style="margin-bottom: 24px;">
                    <h3 style="color: #00704A; margin: 0 0 12px 0; font-size: 18px; font-weight: 600; border-bottom: 2px solid #00704A; padding-bottom: 8px;">📁 Upload XLSX</h3>
                    <p style="margin: 0 0 8px 0;"><strong>Purpose:</strong> Upload store mapping XLSX files to enable store switching functionality.</p>
                    <p style="margin: 0 0 8px 0;"><strong>How to use:</strong> Click "📁 Upload XLSX" and select an XLSX file with Acro and StoreId columns.</p>
                    <p style="margin: 0 0 8px 0;"><strong>Required format:</strong></p>
                    <ul style="margin: 8px 0 0 20px; padding: 0;">
                        <li>XLSX file with headers: <code style="background: #f8f9fa; padding: 2px 4px; border-radius: 3px;">Acro,StoreId</code></li>
                        <li>Acro: 3-character store codes (e.g., "WFM", "ABC")</li>
                        <li>StoreId: Numeric store identifiers</li>
                        <li>Additional columns are ignored</li>
                    </ul>
                    <p style="margin: 8px 0 0 0; padding: 12px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;"><strong>⚠️ Note:</strong> Store mappings are saved locally and persist between sessions.</p>
                </div>

                <div style="margin-bottom: 24px;">
                    <h3 style="color: #00704A; margin: 0 0 12px 0; font-size: 18px; font-weight: 600; border-bottom: 2px solid #00704A; padding-bottom: 8px;">🔍 Updates</h3>
                    <p style="margin: 0 0 8px 0;"><strong>Purpose:</strong> Check for available script updates from GitHub.</p>
                    <p style="margin: 0 0 8px 0;"><strong>How to use:</strong> Click "🔍 Updates" to manually check for new versions.</p>
                    <p style="margin: 0 0 8px 0;"><strong>Important:</strong> This button only <strong>checks</strong> for updates - it does <strong>not</strong> automatically update the script.</p>
                    <p style="margin: 0 0 8px 0;"><strong>Automatic checking:</strong> The script automatically checks for updates every 24 hours.</p>
                    <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; border-radius: 4px; margin: 12px 0;">
                        <p style="margin: 0 0 8px 0; font-weight: 600; color: #856404;">⚠️ To Actually Update the Script:</p>
                        <p style="margin: 0 0 8px 0;">You must use <strong>Tampermonkey</strong> to perform the actual update:</p>
                        <ol style="margin: 8px 0 0 20px; padding: 0; color: #856404;">
                            <li>Open Tampermonkey dashboard (click the Tampermonkey icon → Dashboard)</li>
                            <li>Find "Whole Foods ASIN Exporter with Store Mapping" in the list</li>
                            <li>Click the "Last updated" column or the script name</li>
                            <li>Click "Update" tab in the script editor</li>
                            <li>Click "Update" button to download and install the latest version</li>
                            <li>Refresh the Whole Foods page to use the updated script</li>
                        </ol>
                        <p style="margin: 8px 0 0 0; font-size: 12px; color: #856404;"><strong>Alternative:</strong> You can also enable automatic updates in Tampermonkey settings.</p>
                    </div>
                    <p style="margin: 8px 0 0 0; padding: 12px; background: #f0f8f0; border-left: 4px solid #00704A; border-radius: 4px;"><strong>💡 Tip:</strong> Updates include bug fixes, new features, and performance improvements.</p>
                </div>

                <div style="margin-bottom: 24px;">
                    <h3 style="color: #00704A; margin: 0 0 12px 0; font-size: 18px; font-weight: 600; border-bottom: 2px solid #00704A; padding-bottom: 8px;">🔗 Go to Item</h3>
                    <p style="margin: 0 0 8px 0;"><strong>Purpose:</strong> Navigate directly to a specific product page using its ASIN.</p>
                    <p style="margin: 0 0 8px 0;"><strong>How to use:</strong></p>
                    <ol style="margin: 8px 0 0 20px; padding: 0;">
                        <li>Enter a 10-character ASIN in the input field (e.g., B08N5WRWNW)</li>
                        <li>Click "🔗 Go to Item" or press Enter</li>
                        <li>The product page opens in a new tab</li>
                    </ol>
                    <p style="margin: 8px 0 0 0; padding: 12px; background: #f0f8f0; border-left: 4px solid #00704A; border-radius: 4px;"><strong>💡 Tip:</strong> ASINs are automatically validated for correct format before navigation.</p>
                </div>

                <div style="margin-bottom: 24px;">
                    <h3 style="color: #00704A; margin: 0 0 12px 0; font-size: 18px; font-weight: 600; border-bottom: 2px solid #00704A; padding-bottom: 8px;">🔍 Item Search *Disabled*</h3>
                    <p style="margin: 0 0 8px 0;"><strong>Purpose:</strong> Search the loaded item database by ASIN, name, SKU, or store.</p>
                    <p style="margin: 0 0 8px 0;"><strong>How to use:</strong></p>
                    <ol style="margin: 8px 0 0 20px; padding: 0;">
                        <li>Select search type from dropdown (All Fields, ASIN, Name, SKU, Store)</li>
                        <li>Enter search term in the input field</li>
                        <li>Results appear automatically as you type</li>
                        <li>Click on any result to navigate to that item</li>
                    </ol>
                    <p style="margin: 0 0 8px 0;"><strong>Features:</strong></p>
                    <ul style="margin: 8px 0 0 20px; padding: 0;">
                        <li><strong>Store filtering:</strong> Check "Filter to current store only" to limit results</li>
                        <li><strong>Auto-switching:</strong> Option to switch stores when selecting items from different stores</li>
                        <li><strong>Current store highlighting:</strong> Items from your current store are highlighted in green</li>
                    </ul>
                    <p style="margin: 8px 0 0 0; padding: 12px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;"><strong>⚠️ Note:</strong> Search is only available when an item database is loaded via SharePoint integration.</p>
                </div>

                <div style="margin-bottom: 24px;">
                    <h3 style="color: #00704A; margin: 0 0 12px 0; font-size: 18px; font-weight: 600; border-bottom: 2px solid #00704A; padding-bottom: 8px;">⚙️ Settings</h3>
                    <p style="margin: 0 0 8px 0;"><strong>CSRF Settings:</strong> Configure authentication tokens for store switching.</p>
                    <ul style="margin: 8px 0 0 20px; padding: 0;">
                        <li><strong>Network capture:</strong> Automatically captures tokens from browser requests</li>
                        <li><strong>Fallback token:</strong> Backup token when automatic capture fails</li>
                        <li><strong>Token validation:</strong> Test token format and clear captured tokens</li>
                    </ul>
                    <p style="margin: 0 0 8px 0;"><strong>Debug Info:</strong> View technical information for troubleshooting.</p>
                    <p style="margin: 8px 0 0 0; padding: 12px; background: #f0f8f0; border-left: 4px solid #00704A; border-radius: 4px;"><strong>💡 Tip:</strong> Most users won't need to modify CSRF settings as they're managed automatically.</p>
                </div>

                <div style="margin-bottom: 24px;">
                    <h3 style="color: #00704A; margin: 0 0 12px 0; font-size: 18px; font-weight: 600; border-bottom: 2px solid #00704A; padding-bottom: 8px;">🏪 Store Management</h3>
                    <p style="margin: 0 0 8px 0;"><strong>Purpose:</strong> Switch between different Whole Foods store locations.</p>
                    <p style="margin: 0 0 8px 0;"><strong>How to use:</strong></p>
                    <ol style="margin: 8px 0 0 20px; padding: 0;">
                        <li>Upload a store mapping CSV file (see Upload CSV section)</li>
                        <li>Select a store from the dropdown menu</li>
                        <li>Click "🔄 Switch Store" to change your active store</li>
                        <li>The page will refresh with the new store context</li>
                    </ol>
                    <p style="margin: 0 0 8px 0;"><strong>Current store display:</strong> Shows your currently active store in the search section.</p>
                    <p style="margin: 8px 0 0 0; padding: 12px; background: #f0f8f0; border-left: 4px solid #00704A; border-radius: 4px;"><strong>💡 Tip:</strong> Store switching requires valid CSRF tokens and proper store mappings.</p>
                </div>

                <div style="margin-bottom: 24px;">
                    <h3 style="color: #00704A; margin: 0 0 12px 0; font-size: 18px; font-weight: 600; border-bottom: 2px solid #00704A; padding-bottom: 8px;">🖱️ Panel Controls</h3>
                    <p style="margin: 0 0 8px 0;"><strong>Drag to move:</strong> Click and drag the header to reposition the panel anywhere on screen.</p>
                    <p style="margin: 0 0 8px 0;"><strong>Minimize/Maximize:</strong> Click the "➖" button to minimize to a side tab, or "📋" to expand.</p>
                    <p style="margin: 0 0 8px 0;"><strong>Responsive design:</strong> Panel automatically adjusts size based on your screen dimensions.</p>
                    <p style="margin: 0 0 8px 0;"><strong>Persistent position:</strong> Panel remembers its minimized state between page loads.</p>
                </div>

                <div style="margin-bottom: 24px;">
                    <h3 style="color: #00704A; margin: 0 0 12px 0; font-size: 18px; font-weight: 600; border-bottom: 2px solid #00704A; padding-bottom: 8px;">📊 Live Counter</h3>
                    <p style="margin: 0 0 8px 0;"><strong>Purpose:</strong> Real-time display of detected ASINs and empty cards on the current page.</p>
                    <p style="margin: 0 0 8px 0;"><strong>Display format:</strong> "Shovelers: X || Cards: Y | Empty: Z | Total: Y"</p>
                    <ul style="margin: 8px 0 0 20px; padding: 0;">
                        <li><strong>Shovelers:</strong> ASINs found in carousel/shoveler components</li>
                        <li><strong>Cards:</strong> ASINs from visible product cards</li>
                        <li><strong>Empty:</strong> Empty card slots detected</li>
                        <li><strong>Total:</strong> Total count of visible card ASINs (excludes shovelers)</li>
                    </ul>
                    <p style="margin: 8px 0 0 0; padding: 12px; background: #f0f8f0; border-left: 4px solid #00704A; border-radius: 4px;"><strong>💡 Tip:</strong> Counter updates automatically every second to reflect page changes.</p>
                </div>

                <div style="margin-bottom: 16px;">
                    <h3 style="color: #00704A; margin: 0 0 12px 0; font-size: 18px; font-weight: 600; border-bottom: 2px solid #00704A; padding-bottom: 8px;">🚀 Best Practices & Tips</h3>
                    <ul style="margin: 8px 0 0 20px; padding: 0;">
                        <li><strong>Data Collection:</strong> Scroll through pages and navigate carousels before exporting to capture maximum ASINs</li>
                        <li><strong>Store Switching:</strong> Always upload current store mappings for accurate store switching</li>
                        <li><strong>Performance:</strong> The tool handles large datasets efficiently using IndexedDB for item search</li>
                        <li><strong>Updates:</strong> Keep the script updated for latest features and bug fixes</li>
                        <li><strong>Troubleshooting:</strong> Use Debug Info in settings if you encounter issues</li>
                        <li><strong>Browser Compatibility:</strong> Works best in Chrome, Firefox, and Edge with Tampermonkey</li>
                    </ul>
                </div>

                <div style="background: linear-gradient(135deg, #00704A 0%, #005A3C 100%); color: white; padding: 16px; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; font-weight: 600;">🛒 WTS Tools v${CURRENT_VERSION}</p>
                    <p style="margin: 8px 0 0 0; font-size: 12px; opacity: 0.9;">Professional ASIN extraction and store management for Whole Foods Market</p>
                </div>
            `;

            modalContent.appendChild(modalHeader);
            modalContent.appendChild(modalBody);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);

            // Event handlers
            const closeModal = () => {
                document.body.removeChild(modal);
            };

            closeButton.addEventListener('click', closeModal);

            // Close on background click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            });

            // Close on Escape key
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    closeModal();
                    document.removeEventListener('keydown', handleKeyDown);
                }
            };
            document.addEventListener('keydown', handleKeyDown);

            // Focus management for accessibility
            closeButton.focus();
        }

        // Version check button - removed duplicate declaration, using the one from tools section


        // Reset Item DB button - REMOVED per user request

        // Function to update store dropdown options
        const updateStoreDropdown = () => {
            storeSelect.innerHTML = '<option value="">Select a store...</option>';

            // Sort store codes alphabetically
            const sortedStores = Array.from(storeMappingData.entries()).sort((a, b) => a[0].localeCompare(b[0]));

            sortedStores.forEach(([acro, storeId]) => {
                const option = document.createElement('option');
                option.value = acro;
                option.textContent = `${acro} (ID: ${storeId})`;
                storeSelect.appendChild(option);
            });
        };

        // Function to update status display and UI visibility
        const updateStatus = () => {
            if (storeMappingData.size === 0) {
                statusDiv.textContent = 'No store mappings loaded';
                statusDiv.style.color = '#495057'; // Improved contrast
                storeSelectContainer.style.display = 'none';
            } else {
                statusDiv.textContent = `${storeMappingData.size} store mappings loaded`;
                statusDiv.style.color = '#00704A';
                storeSelectContainer.style.display = 'block';
                updateStoreDropdown();
            }
        };


        // Note: File upload handlers (handleCSVUpload and handleXLSXUpload)
        // automatically update their respective status displays

        // Note: Initialization will be done after all UI elements are created

        // ASIN Input Feature (moved to Navigation section)
        const asinInputContainer = document.createElement('div');
        asinInputContainer.style.marginTop = '6px'; // Reduced from 8px

        const asinInput = document.createElement('input');
        asinInput.type = 'text';
        asinInput.placeholder = 'Enter ASIN (e.g., B08N5WRWNW)';
        asinInput.style.width = '100%';
        asinInput.style.padding = '8px';
        asinInput.style.border = '1px solid #ccc';
        asinInput.style.borderRadius = '4px';
        asinInput.style.fontSize = '12px';
        asinInput.style.boxSizing = 'border-box';
        asinInput.style.marginBottom = '4px';
        asinInput.style.cursor = 'text'; // Ensure input has text cursor

        const goToItemBtn = createButton('🔗 Go to Item', '#00704A', () => {
            const asin = asinInput.value;
            if (!asin.trim()) {
                alert('❌ Please enter an ASIN');
                asinInput.focus();
                return;
            }
            navigateToItem(asin);
        }, { fullWidth: true });

        // ASIN validation function
        function validateASIN(asin) {
            // Remove whitespace and convert to uppercase
            const cleanASIN = asin.trim().toUpperCase();

            // Check if ASIN is exactly 10 characters and alphanumeric
            const asinRegex = /^[A-Z0-9]{10}$/;
            return asinRegex.test(cleanASIN);
        }

        // Navigation function
        function navigateToItem(asin) {
            const cleanASIN = asin.trim().toUpperCase();

            if (!validateASIN(cleanASIN)) {
                alert('❌ Invalid ASIN format. ASINs must be exactly 10 alphanumeric characters (e.g., B08N5WRWNW)');
                return;
            }

            try {
                // Construct Whole Foods item URL
                const itemURL = `https://www.wholefoodsmarket.com/name/dp/${cleanASIN}`;

                // Open in new tab
                window.open(itemURL, '_blank');

                // Clear input after successful navigation
                asinInput.value = '';

                // Provide success feedback
                setTimeout(() => {
                    alert(`✅ Opened item page for ASIN: ${cleanASIN}`);
                }, 500);

            } catch (error) {
                console.error('Navigation error:', error);
                alert('❌ Failed to open item page. Please try again.');
            }
        }


        // Allow Enter key to trigger navigation
        asinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const asin = asinInput.value;
                if (!asin.trim()) {
                    alert('❌ Please enter an ASIN');
                    return;
                }
                navigateToItem(asin);
            }
        });

        asinInputContainer.appendChild(asinInput);
        asinInputContainer.appendChild(goToItemBtn);

        // Item Search Feature (removed separate "Search" section header)
        const itemSearchContainer = document.createElement('div');
        itemSearchContainer.style.marginTop = '10px'; // Reduced from 16px
        itemSearchContainer.style.display = 'none'; // Hidden by default until database is loaded

        const itemSearchLabel = document.createElement('div');
        itemSearchLabel.textContent = 'Search Items:';
        itemSearchLabel.style.fontSize = '12px';
        itemSearchLabel.style.color = '#212529'; // Improved contrast
        itemSearchLabel.style.marginBottom = '4px';

        // Current store display
        const currentStoreDisplayDiv = document.createElement('div');
        currentStoreDisplayDiv.style.fontSize = '11px';
        currentStoreDisplayDiv.style.color = '#495057'; // Improved contrast
        currentStoreDisplayDiv.style.marginBottom = '4px';
        currentStoreDisplayDiv.style.padding = '4px 8px';
        currentStoreDisplayDiv.style.backgroundColor = '#f8f9fa';
        currentStoreDisplayDiv.style.border = '1px solid #dee2e6';
        currentStoreDisplayDiv.style.borderRadius = '4px';
        currentStoreDisplayDiv.textContent = 'Store info not available';

        // Store filter toggle
        const storeFilterContainer = document.createElement('div');
        storeFilterContainer.style.marginBottom = '4px';
        storeFilterContainer.style.display = 'flex';
        storeFilterContainer.style.alignItems = 'center';
        storeFilterContainer.style.gap = '8px';

        const storeFilterCheckbox = document.createElement('input');
        storeFilterCheckbox.type = 'checkbox';
        storeFilterCheckbox.id = 'storeFilterCheckbox';
        storeFilterCheckbox.checked = false;

        const storeFilterLabel = document.createElement('label');
        storeFilterLabel.htmlFor = 'storeFilterCheckbox';
        storeFilterLabel.textContent = 'Filter to current store only';
        storeFilterLabel.style.fontSize = '11px';
        storeFilterLabel.style.color = '#495057'; // Improved contrast
        storeFilterLabel.style.cursor = 'pointer';

        storeFilterContainer.appendChild(storeFilterCheckbox);
        storeFilterContainer.appendChild(storeFilterLabel);

        const searchTypeSelect = document.createElement('select');
        searchTypeSelect.style.width = '100%';
        searchTypeSelect.style.padding = '6px';
        searchTypeSelect.style.borderRadius = '4px';
        searchTypeSelect.style.border = '1px solid #ccc';
        searchTypeSelect.style.fontSize = '12px';
        searchTypeSelect.style.marginBottom = '4px';
        searchTypeSelect.style.cursor = 'pointer'; // Ensure select has pointer cursor

        const searchOptions = [
            { value: 'all', text: 'Search All Fields' },
            { value: 'asin', text: 'Search by ASIN' },
            { value: 'name', text: 'Search by Item Name' },
            { value: 'sku', text: 'Search by SKU' },
            { value: 'store', text: 'Search by Store' }
        ];

        searchOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.text;
            searchTypeSelect.appendChild(optionElement);
        });

        const itemSearchInput = document.createElement('input');
        itemSearchInput.type = 'text';
        itemSearchInput.placeholder = 'Enter search term...';
        itemSearchInput.style.width = '100%';
        itemSearchInput.style.padding = '12px 16px';
        itemSearchInput.style.border = '2px solid #00704A';
        itemSearchInput.style.borderRadius = '8px';
        itemSearchInput.style.fontSize = '14px';
        itemSearchInput.style.fontWeight = '500';
        itemSearchInput.style.boxSizing = 'border-box';
        itemSearchInput.style.marginBottom = '8px';
        itemSearchInput.style.background = '#ffffff';
        itemSearchInput.style.color = '#495057';
        itemSearchInput.style.cursor = 'text'; // Ensure input has text cursor
        
        // Professional focus effects (no animations)
        itemSearchInput.addEventListener('focus', () => {
            itemSearchInput.style.border = '2px solid #005A3C';
            itemSearchInput.style.outline = 'none';
            itemSearchInput.style.cursor = 'text'; // Ensure cursor stays as text
        });
        
        itemSearchInput.addEventListener('blur', () => {
            itemSearchInput.style.border = '2px solid #00704A';
            itemSearchInput.style.cursor = 'text'; // Ensure cursor stays as text
        });

        const searchResultsContainer = document.createElement('div');
        searchResultsContainer.style.maxHeight = '200px';
        searchResultsContainer.style.overflowY = 'auto';
        searchResultsContainer.style.border = '1px solid #00704A';
        searchResultsContainer.style.borderRadius = '8px';
        searchResultsContainer.style.background = '#ffffff';
        searchResultsContainer.style.boxShadow = '0 2px 8px rgba(0, 112, 74, 0.1)';
        searchResultsContainer.style.display = 'none';
        searchResultsContainer.style.marginTop = '8px';

        // Search functionality - now async
        async function performSearch() {
            const query = itemSearchInput.value.trim();
            const searchType = searchTypeSelect.value;

            if (!query) {
                searchResultsContainer.style.display = 'none';
                return;
            }

            // Get current store for filtering
            const currentStoreTLC = storeFilterCheckbox.checked ? getCurrentStoreTLC() : null;

            try {
                const results = await searchItems(query, searchType, currentStoreTLC);
                displaySearchResults(results);
            } catch (error) {
                console.error('❌ Search error:', error);
                searchResultsContainer.innerHTML = '<div style="padding: 8px; color: #dc3545; text-align: center;">Search error occurred</div>';
                searchResultsContainer.style.display = 'block';
            }
        }

        function displaySearchResults(results) {
            searchResultsContainer.innerHTML = '';

            if (results.length === 0) {
                const noResults = document.createElement('div');
                noResults.textContent = 'No items found';
                noResults.style.padding = '8px';
                noResults.style.color = '#495057'; // Improved contrast
                noResults.style.textAlign = 'center';
                searchResultsContainer.appendChild(noResults);
                searchResultsContainer.style.display = 'block';
                return;
            }

            // Limit results to first 10 for performance
            const limitedResults = results.slice(0, 10);

            const currentStoreTLC = getCurrentStoreTLC();

            limitedResults.forEach(item => {
                const resultItem = document.createElement('div');
                resultItem.style.padding = '8px';
                resultItem.style.borderBottom = '1px solid #dee2e6';
                resultItem.style.cursor = 'pointer';
                resultItem.style.fontSize = '11px';

                // Highlight current store items
                const isCurrentStore = currentStoreTLC && item.store_tlc === currentStoreTLC;
                if (isCurrentStore) {
                    resultItem.style.backgroundColor = '#f0f8f0';
                    resultItem.style.borderLeft = '3px solid #00704A';
                }

                const storeIndicator = isCurrentStore ? '🏪 ' : '';
                const storeColor = isCurrentStore ? '#00704A' : '#666';

                resultItem.innerHTML = `
                    <div style="font-weight: bold; color: #00704A;">${item.item_name}</div>
                    <div style="color: #495057;">ASIN: ${item.asin} | SKU: ${item.sku}</div>
                    <div style="color: ${storeColor};">${storeIndicator}Store: ${item.store_name} (${item.store_tlc})</div>
                `;

                resultItem.addEventListener('mouseenter', () => {
                    if (!isCurrentStore) {
                        resultItem.style.backgroundColor = '#e9ecef';
                    }
                });

                resultItem.addEventListener('mouseleave', () => {
                    if (isCurrentStore) {
                        resultItem.style.backgroundColor = '#f0f8f0';
                    } else {
                        resultItem.style.backgroundColor = 'transparent';
                    }
                });

                resultItem.addEventListener('click', () => {
                    selectItem(item);
                });

                searchResultsContainer.appendChild(resultItem);
            });

            if (results.length > 10) {
                const moreResults = document.createElement('div');
                moreResults.textContent = `... and ${results.length - 10} more results`;
                moreResults.style.padding = '8px';
                moreResults.style.color = '#495057'; // Improved contrast
                moreResults.style.textAlign = 'center';
                moreResults.style.fontStyle = 'italic';
                searchResultsContainer.appendChild(moreResults);
            }

            searchResultsContainer.style.display = 'block';
        }

        function selectItem(item) {
            // Auto-switch to store if different from current
            const currentStoreTLC = getCurrentStoreTLC();
            if (item.store_tlc && item.store_tlc !== currentStoreTLC && storeMappingData.has(item.store_tlc)) {
                const switchStore = confirm(`This item is from store ${item.store_tlc}. Would you like to switch to that store first?`);
                if (switchStore) {
                    switchToStore(item.store_tlc).then(() => {
                        // After store switch, navigate to item
                        setTimeout(() => {
                            navigateToItemWithContext(item);
                        }, 2000); // Wait for store switch to complete
                    });
                    return;
                }
            }

            // Navigate to item directly
            navigateToItemWithContext(item);
        }

        function getCurrentStoreTLC() {
            const storeInfo = getCurrentStoreInfo();
            if (storeInfo && storeInfo.storeId) {
                const tlc = getStoreTLCFromStoreId(storeInfo.storeId, storeMappingData);
                if (tlc) {
                    console.log(`🏪 Current store TLC: ${tlc} (${storeInfo.displayName})`);
                    return tlc;
                }
            }
            return null;
        }

        function updateCurrentStoreDisplay() {
            try {
                // Update store display if UI elements exist
                if (typeof currentStoreDisplayDiv !== 'undefined' && currentStoreDisplayDiv && document.body.contains(currentStoreDisplayDiv)) {
                    const storeInfo = getCurrentStoreInfo();
                    if (storeInfo) {
                        const tlc = getStoreTLCFromStoreId(storeInfo.storeId, storeMappingData);
                        if (tlc) {
                            currentStoreDisplayDiv.textContent = `Current Store: ${storeInfo.displayName} (${tlc})`;
                            currentStoreDisplayDiv.style.color = '#00704A';
                        } else {
                            currentStoreDisplayDiv.textContent = `Current Store: ${storeInfo.displayName} (ID: ${storeInfo.storeId})`;
                            currentStoreDisplayDiv.style.color = '#ffc107';
                        }
                    } else {
                        currentStoreDisplayDiv.textContent = 'Store info not available';
                        currentStoreDisplayDiv.style.color = '#495057'; // Improved contrast
                    }
                }
            } catch (error) {
                console.error('❌ Error updating current store display:', error);
            }
        }

        function navigateToItemWithContext(item) {
            const itemURL = `https://www.wholefoodsmarket.com/name/dp/${item.asin}`;
            window.open(itemURL, '_blank');

            // Clear search
            itemSearchInput.value = '';
            searchResultsContainer.style.display = 'none';

            // Show success message with item details
            setTimeout(() => {
                alert(`✅ Opened ${item.item_name}\nASIN: ${item.asin}\nStore: ${item.store_name} (${item.store_tlc})`);
            }, 500);
        }

        // Event listeners for search
        itemSearchInput.addEventListener('input', () => {
            clearTimeout(itemSearchInput.searchTimeout);
            itemSearchInput.searchTimeout = setTimeout(performSearch, 300); // Debounce search
        });

        searchTypeSelect.addEventListener('change', performSearch);

        // Store filter checkbox event listener
        storeFilterCheckbox.addEventListener('change', performSearch);

        itemSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        // Click outside to close results
        document.addEventListener('click', (e) => {
            if (!itemSearchContainer.contains(e.target)) {
                searchResultsContainer.style.display = 'none';
            }
        });

        itemSearchContainer.appendChild(itemSearchLabel);
        itemSearchContainer.appendChild(currentStoreDisplayDiv);
        itemSearchContainer.appendChild(storeFilterContainer);
        itemSearchContainer.appendChild(searchTypeSelect);
        itemSearchContainer.appendChild(itemSearchInput);
        itemSearchContainer.appendChild(searchResultsContainer);

        // SETTINGS SECTION - Collapsible
        const settingsHeader = createSectionHeader('Settings');
        
        // Create collapsible settings container
        const settingsContainer = document.createElement('div');
        settingsContainer.style.marginTop = '6px'; // Reduced from 8px
        
        // Settings toggle button
        const settingsToggleBtn = createButton('⚙️ Show Settings', '#6c757d', () => {
            const isHidden = settingsContent.style.display === 'none';
            if (isHidden) {
                settingsContent.style.display = 'block';
                settingsToggleBtn.textContent = '⚙️ Hide Settings';
                GM_setValue('wts_settings_expanded', true);
            } else {
                settingsContent.style.display = 'none';
                settingsToggleBtn.textContent = '⚙️ Show Settings';
                GM_setValue('wts_settings_expanded', false);
            }
        }, { fullWidth: true });

        // Settings content container
        const settingsContent = document.createElement('div');
        const settingsExpanded = GM_getValue('wts_settings_expanded', false);
        settingsContent.style.display = settingsExpanded ? 'block' : 'none';
        settingsContent.style.marginTop = '6px'; // Reduced from 8px
        settingsContent.style.padding = '8px'; // Reduced from 12px
        settingsContent.style.background = 'rgba(0, 112, 74, 0.05)';
        settingsContent.style.borderRadius = '8px';
        settingsContent.style.border = '1px solid rgba(0, 112, 74, 0.2)';

        // Update toggle button text based on initial state
        if (settingsExpanded) {
            settingsToggleBtn.textContent = '⚙️ Hide Settings';
        }

        // File input for XLSX uploads
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.xlsx';
        fileInput.style.display = 'none';
        fileInput.style.cursor = 'pointer'; // Ensure file input has pointer cursor when visible

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleXLSXUpload(file);
            }
            fileInput.value = '';
        });

        // Debug info button for troubleshooting
        const debugBtn = createButton('🐛 Debug Info', '#e83e8c', async () => {
            const status = await getItemDatabaseStatus();
            const debugInfo = {
                timestamp: new Date().toISOString(),
                url: window.location.href,
                documentState: document.readyState,
                panelExists: !!wtsPanel,
                panelInDOM: wtsPanel ? document.body.contains(wtsPanel) : false,
                isInitialized: isInitialized,
                initAttempts: initializationAttempts,
                networkInterceptionActive: networkInterceptionActive,
                storeMappings: storeMappingData.size,
                itemDatabaseCount: status.count,
                capturedToken: !!getCapturedToken(),
                storeInfo: getCurrentStoreInfo()
            };

            console.log('🐛 WTS Tools Debug Info:', debugInfo);

            const debugText = Object.entries(debugInfo)
                .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                .join('\n');

            alert(`🐛 WTS Tools Debug Info:\n\n${debugText}\n\nCheck console for detailed logs.`);
        }, { fullWidth: true });

        // Add settings items to settings content
        settingsContent.appendChild(csrfSettingsBtn);
        settingsContent.appendChild(debugBtn);
        
        settingsContainer.appendChild(settingsToggleBtn);
        settingsContainer.appendChild(settingsContent);

        // STORE MANAGEMENT SECTION
        const storeHeader = createSectionHeader('Store Management');

        // Assemble all content sections in compact layout
        contentContainer.appendChild(actionsHeader);
        contentContainer.appendChild(actionsGroup);
        
        contentContainer.appendChild(navigationHeader);
        contentContainer.appendChild(asinInputContainer);
        contentContainer.appendChild(itemSearchContainer);
        
        contentContainer.appendChild(settingsHeader);
        contentContainer.appendChild(settingsContainer);
        
        contentContainer.appendChild(storeHeader);
        contentContainer.appendChild(statusDiv);
        contentContainer.appendChild(storeSelectContainer);
        contentContainer.appendChild(fileInput);
        document.body.appendChild(panel);

        // Initialize status after all UI elements are created
        loadItemDatabase(); // Legacy compatibility - no longer loads into memory
        updateStatus();

        // Initialize current store display
        updateCurrentStoreDisplay();

        console.log('✅ WTS Tools panel created and added to DOM');

        // Add panel identification for easier detection
        panel.setAttribute('data-wts-panel', 'true');
        panel.setAttribute('data-wts-version', '1.3.006');
        panel.setAttribute('data-wts-created', Date.now().toString());

        // FIXED: Return panel element for reliable detection
        return panel;

        } catch (error) {
            console.error('❌ Error creating WTS Tools panel:', error);
            throw error; // Re-throw to be handled by initialization logic
        }
    }

    // Enhanced initialization function with retry logic
    function initializeWTSTools() {
        // FIXED: Prevent overlapping initialization runs
        if (_initializing) {
            console.log('🔄 Initialization already in progress, skipping...');
            return false;
        }
        _initializing = true;

        try {
            console.log(`🔄 Initializing WTS Tools (attempt ${initializationAttempts + 1}/${maxInitializationAttempts})...`);
            console.log('📍 Current URL:', window.location.href);
            console.log('📍 Document ready state:', document.readyState);
            console.log('📍 Body exists:', !!document.body);
            console.log('📍 Body children count:', document.body ? document.body.children.length : 0);

            // Check if already initialized and panel exists
            if (isInitialized && wtsPanel && document.body.contains(wtsPanel)) {
                console.log('✅ WTS Tools already initialized and panel exists');
                return true;
            }

            // Clean up any existing panel first
            cleanupExistingPanel();

            // Create the main panel
            const createdPanel = createExportButton();

            // FIXED: Use the returned panel directly instead of searching DOM again
            console.log("🐛 PANEL DETECTION DEBUG - Using returned panel directly");
            wtsPanel = createdPanel;
            console.log("🐛 PANEL DETECTION DEBUG - Panel assigned:", !!wtsPanel);

            if (wtsPanel) {
                console.log('✅ WTS Tools panel created successfully');
                console.log("🐛 PANEL DETECTION DEBUG - Panel element:", wtsPanel);

                // Add dynamic card count display
                addCardCounter();

                // Mark as initialized
                isInitialized = true;
                initializationAttempts = 0;

                // Start persistence monitoring
                startPersistenceMonitoring();

                return true;
            } else {
                throw new Error('Panel creation failed - element not found');
            }

        } catch (error) {
            console.error(`❌ Error initializing WTS Tools (attempt ${initializationAttempts + 1}):`, error);
            initializationAttempts++;

            if (initializationAttempts < maxInitializationAttempts) {
                console.log(`🔄 Retrying initialization in 2 seconds...`);
                initializationRetryTimeout = setTimeout(() => {
                    initializeWTSTools();
                }, 2000);
            } else {
                console.error('❌ Max initialization attempts reached. WTS Tools failed to initialize.');
                alert(`❌ WTS Tools failed to initialize after ${maxInitializationAttempts} attempts.\n\nError: ${error.message}\n\nPlease refresh the page or check the console for details.`);
            }
            return false;
        } finally {
            // FIXED: Always clear the initialization guard
            _initializing = false;
        }
    }

    // Clean up any existing panels
    function cleanupExistingPanel() {
        console.log('🧹 Cleaning up existing panels...');

        // FIXED: Only remove our own panel, not all fixed elements
        document.querySelectorAll('#wts-panel').forEach(panel => {
            console.log('🗑️ Removing existing WTS panel');
            panel.remove();
        });

        // FIXED: Clear all leftover timers created by prior runs
        if (initializationRetryTimeout) {
            clearTimeout(initializationRetryTimeout);
            initializationRetryTimeout = null;
        }
        if (persistenceCheckInterval) {
            clearInterval(persistenceCheckInterval);
            persistenceCheckInterval = null;
        }
        if (cardCounterInterval) {
            clearInterval(cardCounterInterval);
            cardCounterInterval = null;
        }
        if (urlPollingInterval) {
            clearInterval(urlPollingInterval);
            urlPollingInterval = null;
        }
        if (versionCheckInterval) {
            clearInterval(versionCheckInterval);
            versionCheckInterval = null;
        }

        // Reset state
        wtsPanel = null;
        isInitialized = false;
    }

    // Add dynamic card counter to the panel
    function addCardCounter() {
        try {
            if (!wtsPanel) return;

            const counter = document.createElement('div');
            counter.id = 'asin-card-counter';
            counter.style.fontSize = '13px';
            counter.style.color = '#495057';
            counter.style.padding = '12px 16px';
            counter.style.borderTop = '1px solid rgba(108, 117, 125, 0.2)';
            counter.style.textAlign = 'center';
            counter.style.background = 'rgba(0, 112, 74, 0.05)';
            counter.style.borderRadius = '0 0 10px 10px';
            counter.style.fontWeight = '500';
            counter.style.letterSpacing = '0.3px';
            counter.style.position = 'relative';
            counter.style.marginTop = '0';
            counter.style.cursor = 'default'; // Ensure counter has default cursor, not move

            // Append counter directly to the panel (after content container)
            wtsPanel.appendChild(counter);
            console.log('✅ Counter added to bottom of panel');

            // FIXED: Properly managed interval with cleanup
            console.log("🐛 INTERVAL DEBUG - Creating card counter interval with proper cleanup");
            cardCounterInterval = setInterval(() => {
                try {
                    if (document.body.contains(counter) && document.body.contains(wtsPanel)) {
                        // Use comprehensive data extraction for counter
                        const comprehensiveData = extractAllData();
                        // Total now only counts visible cards, not shovelers //finding tag 1
                        counter.textContent = `Shovelers: ${comprehensiveData.totalShovelerASINs} || Cards: ${comprehensiveData.totalVisibleASINs} | Empty: ${comprehensiveData.emptyCards} | Total: ${comprehensiveData.totalVisibleASINs} `;
                    } else {
                        console.log("🐛 INTERVAL DEBUG - Counter or panel element removed, clearing interval");
                        if (cardCounterInterval) {
                            clearInterval(cardCounterInterval);
                            cardCounterInterval = null;
                        }
                    }
                } catch (error) {
                    console.error('Error updating counter:', error);
                    // Clear interval on persistent errors
                    if (cardCounterInterval) {
                        clearInterval(cardCounterInterval);
                        cardCounterInterval = null;
                    }
                }
            }, 1000);
            console.log("🐛 INTERVAL DEBUG - Card counter interval ID:", cardCounterInterval);
        } catch (error) {
            console.error('❌ Error adding card counter:', error);
        }
    }

    // Persistence monitoring to detect when UI disappears
    function startPersistenceMonitoring() {
        console.log('👁️ Starting persistence monitoring...');

        // Stop any existing monitoring
        if (persistenceCheckInterval) {
            clearInterval(persistenceCheckInterval);
        }

        persistenceCheckInterval = setInterval(() => {
            try {
                // Check if panel still exists in DOM
                if (!wtsPanel || !document.body.contains(wtsPanel)) {
                    console.warn('⚠️ WTS Tools panel disappeared from DOM, reinitializing...');
                    isInitialized = false;
                    initializationAttempts = 0;

                    // Attempt to reinitialize
                    setTimeout(() => {
                        initializeWTSTools();
                    }, 1000);

                    // Stop current monitoring (will restart after successful init)
                    clearInterval(persistenceCheckInterval);
                    persistenceCheckInterval = null;
                }
            } catch (error) {
                console.error('❌ Error in persistence monitoring:', error);
            }
        }, 3000); // Check every 3 seconds
    }

    // Handle URL changes for SPA navigation
    function handleUrlChange() {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            console.log('🔄 URL changed detected:', lastUrl, '->', currentUrl);
            lastUrl = currentUrl;

            // Reset initialization state for new page
            isInitialized = false;
            initializationAttempts = 0;

            // Delay initialization to allow page to load
            setTimeout(() => {
                console.log('🔄 Reinitializing WTS Tools for new page...');
                initializeWTSTools();
            }, 2000);
        }
    }

    // Multiple initialization triggers for better reliability
    function setupInitializationTriggers() {
        console.log('🎯 Setting up initialization triggers...');
        console.log('📍 Document ready state at setup:', document.readyState);
        console.log('📍 Body exists at setup:', !!document.body);

        // Trigger 1: DOM Content Loaded
        if (document.readyState === 'loading') {
            console.log('🎯 Document still loading, setting up DOMContentLoaded listener');
            document.addEventListener('DOMContentLoaded', () => {
                console.log('🎯 DOMContentLoaded triggered');
                setTimeout(initializeWTSTools, 500);
            });
        }

        // Trigger 2: Window Load
        if (document.readyState !== 'complete') {
            console.log('🎯 Document not complete, setting up window load listener');
            window.addEventListener('load', () => {
                console.log('🎯 Window load triggered');
                setTimeout(initializeWTSTools, 1000);
            });
        }

        // Trigger 3: Immediate if document is already ready
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            console.log('🎯 Document already ready, initializing immediately');
            console.log('📍 Body exists for immediate init:', !!document.body);
            setTimeout(initializeWTSTools, 100);
        }

        // Trigger 4: Fallback timer with more logging
        setTimeout(() => {
            if (!isInitialized) {
                console.log('🎯 Fallback timer triggered - script may have failed to initialize');
                console.log('📍 Current state - Body exists:', !!document.body);
                console.log('📍 Current state - Document ready:', document.readyState);
                initializeWTSTools();
            } else {
                console.log('✅ Script already initialized, fallback timer not needed');
            }
        }, 5000);

        // SPA Navigation Detection
        // Method 1: History API monitoring
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function(...args) {
            originalPushState.apply(this, args);
            setTimeout(handleUrlChange, 100);
        };

        history.replaceState = function(...args) {
            originalReplaceState.apply(this, args);
            setTimeout(handleUrlChange, 100);
        };

        window.addEventListener('popstate', () => {
            console.log('🎯 Popstate event triggered');
            setTimeout(handleUrlChange, 100);
        });

        // Method 2: URL polling as backup with proper cleanup
        console.log("🐛 INTERVAL DEBUG - Creating URL polling interval with cleanup mechanism");
        urlPollingInterval = setInterval(() => {
            try {
                handleUrlChange();
                // Auto-cleanup if page becomes inactive or script is disabled
                if (!document.body || document.hidden) {
                    console.log("🐛 INTERVAL DEBUG - Page inactive, clearing URL polling interval");
                    if (urlPollingInterval) {
                        clearInterval(urlPollingInterval);
                        urlPollingInterval = null;
                    }
                    if (versionCheckInterval) {
                        clearInterval(versionCheckInterval);
                        versionCheckInterval = null;
                    }
                }
            } catch (error) {
                console.error('Error in URL polling:', error);
                // Clear interval on persistent errors
                if (urlPollingInterval) {
                    clearInterval(urlPollingInterval);
                    urlPollingInterval = null;
                }
            }
        }, 2000);
        console.log("🐛 INTERVAL DEBUG - URL polling interval ID:", urlPollingInterval);

        // Method 3: DOM mutation observer for major changes
        const observer = new MutationObserver((mutations) => {
            let significantChange = false;

            mutations.forEach((mutation) => {
                // Check for significant DOM changes that might indicate navigation
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (let node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE &&
                            (node.tagName === 'MAIN' || node.tagName === 'SECTION' ||
                             node.classList?.contains('page') || node.classList?.contains('content'))) {
                            significantChange = true;
                            break;
                        }
                    }
                }
            });

            if (significantChange) {
                console.log('🎯 Significant DOM change detected, checking initialization...');
                setTimeout(() => {
                    if (!isInitialized || !wtsPanel || !document.body.contains(wtsPanel)) {
                        console.log('🔄 Reinitializing due to DOM changes...');
                        initializeWTSTools();
                    }
                }, 1000);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('✅ All initialization triggers set up');
    }

    // Initialize the setup
    setupInitializationTriggers();
})();
