// ==UserScript==
// @name         Whole Foods ASIN Exporter with Store Mapping
// @namespace    http://tampermonkey.net/
// @version      1.3.000
// @description  Export ASIN, Name, Section from visible cards on Whole Foods page with store mapping and XLSX item database functionality
// @author       WTS-TM-Scripts
// @homepage     https://github.com/RynAgain/WTS-TM-Scripts
// @homepageURL  https://github.com/RynAgain/WTS-TM-Scripts
// @supportURL   https://github.com/RynAgain/WTS-TM-Scripts/issues
// @updateURL    https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/WtsMain.js
// @downloadURL  https://raw.githubusercontent.com/RynAgain/WTS-TM-Scripts/main/WtsMain.js
// @match        *://*.wholefoodsmarket.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// ==/UserScript==

(function () {
    'use strict';

    // Network request interception to capture CSRF tokens - START IMMEDIATELY
    let capturedCSRFToken = null;
    let networkInterceptionActive = false;

    function startNetworkInterception() {
        if (networkInterceptionActive) return;
        
        console.log("🌐 Starting network request interception for CSRF token capture...");
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
            return originalFetch.apply(this, arguments);
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

    // Start network interception immediately
    startNetworkInterception();

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

    function downloadCSV(rows) {
        const header = ['ASIN', 'Name', 'Section'];
        const csvContent = [header.join(',')].concat(
            rows.map(row => header.map(h => '"' + (row[h] || '').replace(/"/g, '""') + '"').join(','))
        ).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'wholefoods_items.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    function createExportButton() {
        let lastExtractedData = [];
        let storeMappingData = new Map(); // Store mapping: StoreCode -> StoreId
        let itemDatabase = []; // Item database from XLSX: Array of item objects

        // Load stored mappings from Tampermonkey storage
        function loadStoredMappings() {
            try {
                const storedData = GM_getValue('storeMappingData', '{}');
                const parsedData = JSON.parse(storedData);
                storeMappingData.clear();
                Object.entries(parsedData).forEach(([storeCode, storeId]) => {
                    storeMappingData.set(storeCode, storeId);
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
        

        // CSV parsing function for store mapping
        function parseCSV(csvText) {
            const lines = csvText.trim().split('\n');
            if (lines.length < 2) {
                throw new Error('CSV file must contain at least a header row and one data row');
            }

            const header = lines[0].split(',').map(col => col.trim().replace(/"/g, ''));
            const storeCodeIndex = header.findIndex(col => col.toLowerCase() === 'storecode');
            const storeIdIndex = header.findIndex(col => col.toLowerCase() === 'storeid');

            if (storeCodeIndex === -1 || storeIdIndex === -1) {
                throw new Error('CSV must contain "StoreCode" and "StoreId" columns');
            }

            const mappings = new Map();
            const errors = [];

            for (let i = 1; i < lines.length; i++) {
                const row = lines[i].split(',').map(col => col.trim().replace(/"/g, ''));
                
                if (row.length < Math.max(storeCodeIndex, storeIdIndex) + 1) {
                    errors.push(`Row ${i + 1}: Insufficient columns`);
                    continue;
                }

                const storeCode = row[storeCodeIndex];
                const storeId = row[storeIdIndex];

                // Validate StoreCode (3 characters)
                if (!storeCode || storeCode.length !== 3) {
                    errors.push(`Row ${i + 1}: StoreCode must be exactly 3 characters (got: "${storeCode}")`);
                    continue;
                }

                // Validate StoreId (numeric)
                if (!storeId || isNaN(storeId) || !Number.isInteger(Number(storeId))) {
                    errors.push(`Row ${i + 1}: StoreId must be a valid integer (got: "${storeId}")`);
                    continue;
                }

                mappings.set(storeCode.toUpperCase(), parseInt(storeId, 10));
            }

            if (errors.length > 0) {
                throw new Error(`Validation errors:\n${errors.join('\n')}`);
            }

            if (mappings.size === 0) {
                throw new Error('No valid store mappings found in the file');
            }

            return mappings;
        }

        // XLSX parsing function for item database
        function parseXLSX(arrayBuffer) {
            try {
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
                
                const items = [];
                const errors = [];
                
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    
                    if (!row || row.length === 0) continue; // Skip empty rows
                    
                    const item = {};
                    let hasError = false;
                    
                    // Process required columns
                    requiredColumns.forEach(col => {
                        const value = row[columnIndices[col]];
                        if (value === undefined || value === null || value === '') {
                            errors.push(`Row ${i + 1}: Missing required value for "${col}"`);
                            hasError = true;
                            return;
                        }
                        item[col] = value.toString().trim();
                    });
                    
                    if (hasError) continue;
                    
                    // Validate ASIN format
                    if (item.asin && !/^[A-Z0-9]{10}$/i.test(item.asin)) {
                        errors.push(`Row ${i + 1}: Invalid ASIN format "${item.asin}" (must be 10 alphanumeric characters)`);
                        continue;
                    }
                    
                    // Validate store_tlc format
                    if (item.store_tlc && item.store_tlc.length !== 3) {
                        errors.push(`Row ${i + 1}: Invalid store_tlc format "${item.store_tlc}" (must be 3 characters)`);
                        continue;
                    }
                    
                    // Process optional columns
                    optionalColumns.forEach(col => {
                        if (columnIndices[col] !== undefined) {
                            const value = row[columnIndices[col]];
                            item[col] = value !== undefined && value !== null ? value.toString().trim() : '';
                        }
                    });
                    
                    // Normalize data
                    item.asin = item.asin.toUpperCase();
                    item.store_tlc = item.store_tlc.toUpperCase();
                    
                    items.push(item);
                }
                
                if (errors.length > 5) {
                    throw new Error(`Too many validation errors (${errors.length}). First 5 errors:\n${errors.slice(0, 5).join('\n')}`);
                } else if (errors.length > 0) {
                    console.warn('XLSX parsing warnings:', errors);
                }
                
                if (items.length === 0) {
                    throw new Error('No valid items found in the XLSX file');
                }
                
                return items;
                
            } catch (error) {
                if (error.message.includes('Unsupported file')) {
                    throw new Error('Invalid XLSX file format. Please ensure the file is a valid Excel (.xlsx) file.');
                }
                throw error;
            }
        }

        // Save item database to storage
        function saveItemDatabase() {
            try {
                GM_setValue('itemDatabase', JSON.stringify(itemDatabase));
                GM_setValue('itemDatabaseTimestamp', Date.now());
            } catch (error) {
                console.error('Error saving item database:', error);
            }
        }

        // Load item database from storage
        function loadItemDatabase() {
            try {
                const storedData = GM_getValue('itemDatabase', '[]');
                const timestamp = GM_getValue('itemDatabaseTimestamp', 0);
                itemDatabase = JSON.parse(storedData);
                
                if (itemDatabase.length > 0) {
                    const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
                    console.log(`Loaded ${itemDatabase.length} items from database (${ageHours.toFixed(1)}h old)`);
                }
            } catch (error) {
                console.error('Error loading item database:', error);
                itemDatabase = [];
            }
        }

        // Search items in database
        function searchItems(query, searchType = 'all') {
            if (!query || itemDatabase.length === 0) return [];
            
            const searchTerm = query.toLowerCase().trim();
            
            return itemDatabase.filter(item => {
                switch (searchType) {
                    case 'asin':
                        return item.asin && item.asin.toLowerCase().includes(searchTerm);
                    case 'name':
                        return item.item_name && item.item_name.toLowerCase().includes(searchTerm);
                    case 'sku':
                        return item.sku && item.sku.toLowerCase().includes(searchTerm);
                    case 'store':
                        return (item.store_name && item.store_name.toLowerCase().includes(searchTerm)) ||
                               (item.store_acronym && item.store_acronym.toLowerCase().includes(searchTerm)) ||
                               (item.store_tlc && item.store_tlc.toLowerCase().includes(searchTerm));
                    case 'all':
                    default:
                        return (item.asin && item.asin.toLowerCase().includes(searchTerm)) ||
                               (item.item_name && item.item_name.toLowerCase().includes(searchTerm)) ||
                               (item.sku && item.sku.toLowerCase().includes(searchTerm)) ||
                               (item.store_name && item.store_name.toLowerCase().includes(searchTerm)) ||
                               (item.store_acronym && item.store_acronym.toLowerCase().includes(searchTerm)) ||
                               (item.store_tlc && item.store_tlc.toLowerCase().includes(searchTerm));
                }
            });
        }

        // Store switching functionality
        async function switchToStore(storeCode) {
            const storeId = storeMappingData.get(storeCode);
            if (!storeId) {
                alert(`❌ Store code ${storeCode} not found in mappings`);
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
            const originalButtonText = switchBtn.textContent;
            switchBtn.textContent = '🔄 Switching...';
            switchBtn.disabled = true;

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
                    alert(`✅ Successfully switched to store ${storeCode} (ID: ${storeId})`);
                    
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
                switchBtn.textContent = originalButtonText;
                switchBtn.disabled = false;
            }
        }

        // File upload handler for CSV store mappings
        function handleCSVUpload(file) {
            if (!file) return;

            const fileName = file.name.toLowerCase();
            if (!fileName.endsWith('.csv')) {
                alert('Please select a CSV file (.csv extension required)');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const csvText = e.target.result;
                    const newMappings = parseCSV(csvText);
                    
                    // Update the store mapping data
                    storeMappingData.clear();
                    newMappings.forEach((storeId, storeCode) => {
                        storeMappingData.set(storeCode, storeId);
                    });

                    // Save to persistent storage
                    saveStoredMappings();

                    alert(`✅ Successfully loaded ${storeMappingData.size} store mappings from ${file.name}`);
                } catch (error) {
                    alert(`❌ Error parsing CSV file: ${error.message}`);
                }
            };

            reader.onerror = function() {
                alert('❌ Error reading CSV file. Please try again.');
            };

            reader.readAsText(file);
        }

        // File upload handler for XLSX item database
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
                    const newItems = parseXLSX(arrayBuffer);
                    
                    // Update the item database
                    itemDatabase = newItems;
                    
                    // Save to persistent storage
                    saveItemDatabase();
                    
                    // Update UI
                    updateItemDatabaseStatus();

                    alert(`✅ Successfully loaded ${itemDatabase.length} items from ${file.name}`);
                } catch (error) {
                    alert(`❌ Error parsing XLSX file: ${error.message}`);
                }
            };

            reader.onerror = function() {
                alert('❌ Error reading XLSX file. Please try again.');
            };

            reader.readAsArrayBuffer(file);
        }

        // Load saved panel position or use default
        const savedPosition = GM_getValue('wts_panel_position', { x: 10, y: 10 });
        
        const panel = document.createElement('div');
        panel.style.position = 'fixed';
        panel.style.top = savedPosition.y + 'px';
        panel.style.left = savedPosition.x + 'px';
        panel.style.zIndex = '9999';
        panel.style.background = '#f9f9f9';
        panel.style.border = '1px solid #ccc';
        panel.style.borderRadius = '8px';
        panel.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
        panel.style.padding = '0';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.fontFamily = 'sans-serif';
        panel.style.transition = 'box-shadow 0.2s ease';
        panel.style.userSelect = 'none';

        // Create drag handle header
        const dragHeader = document.createElement('div');
        dragHeader.style.display = 'flex';
        dragHeader.style.alignItems = 'center';
        dragHeader.style.padding = '8px 12px';
        dragHeader.style.background = '#e9ecef';
        dragHeader.style.borderRadius = '8px 8px 0 0';
        dragHeader.style.cursor = 'move';
        dragHeader.style.borderBottom = '1px solid #dee2e6';
        dragHeader.style.fontSize = '14px';
        dragHeader.style.fontWeight = 'bold';
        dragHeader.style.color = '#495057';

        const dragIcon = document.createElement('span');
        dragIcon.textContent = '≡';
        dragIcon.style.marginRight = '8px';
        dragIcon.style.fontSize = '16px';
        dragIcon.style.color = '#6c757d';

        const headerTitle = document.createElement('span');
        headerTitle.textContent = 'WTS Tools';

        dragHeader.appendChild(dragIcon);
        dragHeader.appendChild(headerTitle);

        // Create content container
        const contentContainer = document.createElement('div');
        contentContainer.style.padding = '12px';
        contentContainer.style.display = 'flex';
        contentContainer.style.flexDirection = 'column';
        contentContainer.style.gap = '8px';

        // Drag functionality variables
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };

        // Drag event handlers
        const handleMouseDown = (e) => {
            isDragging = true;
            const rect = panel.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            // Visual feedback
            panel.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';
            panel.style.transform = 'scale(1.02)';
            dragHeader.style.background = '#dee2e6';
            document.body.style.cursor = 'move';
            
            e.preventDefault();
        };

        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            let newX = e.clientX - dragOffset.x;
            let newY = e.clientY - dragOffset.y;
            
            // Boundary constraints
            const panelRect = panel.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Keep panel within viewport bounds
            newX = Math.max(0, Math.min(newX, viewportWidth - panelRect.width));
            newY = Math.max(0, Math.min(newY, viewportHeight - panelRect.height));
            
            panel.style.left = newX + 'px';
            panel.style.top = newY + 'px';
            
            e.preventDefault();
        };

        const handleMouseUp = () => {
            if (!isDragging) return;
            
            isDragging = false;
            
            // Save position
            const rect = panel.getBoundingClientRect();
            const position = { x: rect.left, y: rect.top };
            GM_setValue('wts_panel_position', position);
            
            // Reset visual feedback
            panel.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
            panel.style.transform = 'scale(1)';
            dragHeader.style.background = '#e9ecef';
            document.body.style.cursor = '';
        };

        // Add event listeners
        dragHeader.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // Handle window resize to keep panel in bounds
        window.addEventListener('resize', () => {
            const rect = panel.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            let newX = rect.left;
            let newY = rect.top;
            
            // Adjust position if panel is outside viewport
            if (rect.right > viewportWidth) {
                newX = viewportWidth - rect.width;
            }
            if (rect.bottom > viewportHeight) {
                newY = viewportHeight - rect.height;
            }
            
            newX = Math.max(0, newX);
            newY = Math.max(0, newY);
            
            if (newX !== rect.left || newY !== rect.top) {
                panel.style.left = newX + 'px';
                panel.style.top = newY + 'px';
                GM_setValue('wts_panel_position', { x: newX, y: newY });
            }
        });

        panel.appendChild(dragHeader);
        panel.appendChild(contentContainer);

        const exportBtn = document.createElement('button');
        exportBtn.textContent = '📦 Export ASIN Data';
        exportBtn.style.padding = '10px';
        exportBtn.style.backgroundColor = '#28a745';
        exportBtn.style.color = '#fff';
        exportBtn.style.border = 'none';
        exportBtn.style.borderRadius = '5px';
        exportBtn.style.cursor = 'pointer';

        exportBtn.addEventListener('click', () => {
            if (lastExtractedData.length === 0) {
                const { data, emptyCount } = extractDataFromCards();
                lastExtractedData = data;
                alert(`${data.length} ASIN(s) found. ${emptyCount} empty card(s) detected.`);

                if (data.length === 0) {
                    alert('No ASIN cards found. Try scrolling or navigating through carousels.');
                    return;
                }
            }
            downloadCSV(lastExtractedData);
        });

        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = '🔄 Refresh Data';
        refreshBtn.style.padding = '10px';
        refreshBtn.style.backgroundColor = '#007bff';
        refreshBtn.style.color = '#fff';
        refreshBtn.style.border = 'none';
        refreshBtn.style.borderRadius = '5px';
        refreshBtn.style.cursor = 'pointer';

        const refreshData = () => {
            lastExtractedData = [];
            const { data, emptyCount } = extractDataFromCards();
            lastExtractedData = data;
            alert(`🔄 Refreshed: ${data.length} ASIN(s) found. ${emptyCount} empty card(s) detected.`);
        };

        refreshBtn.addEventListener('click', refreshData);

        // Create CSV file upload button and input
        const uploadBtn = document.createElement('button');
        uploadBtn.textContent = '📁 Upload Store Mapping (CSV)';
        uploadBtn.style.padding = '10px';
        uploadBtn.style.backgroundColor = '#6f42c1';
        uploadBtn.style.color = '#fff';
        uploadBtn.style.border = 'none';
        uploadBtn.style.borderRadius = '5px';
        uploadBtn.style.cursor = 'pointer';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.csv';
        fileInput.style.display = 'none';

        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleCSVUpload(file);
            }
            // Reset the input so the same file can be selected again
            fileInput.value = '';
        });

        // Create XLSX file upload button and input
        const xlsxUploadBtn = document.createElement('button');
        xlsxUploadBtn.textContent = '📊 Upload Item Database (XLSX)';
        xlsxUploadBtn.style.padding = '10px';
        xlsxUploadBtn.style.backgroundColor = '#20c997';
        xlsxUploadBtn.style.color = '#fff';
        xlsxUploadBtn.style.border = 'none';
        xlsxUploadBtn.style.borderRadius = '5px';
        xlsxUploadBtn.style.cursor = 'pointer';

        const xlsxFileInput = document.createElement('input');
        xlsxFileInput.type = 'file';
        xlsxFileInput.accept = '.xlsx';
        xlsxFileInput.style.display = 'none';

        xlsxUploadBtn.addEventListener('click', () => {
            xlsxFileInput.click();
        });

        xlsxFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                handleXLSXUpload(file);
            }
            // Reset the input so the same file can be selected again
            xlsxFileInput.value = '';
        });

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
        switchBtn.style.backgroundColor = '#17a2b8';
        switchBtn.style.color = '#fff';
        switchBtn.style.border = 'none';
        switchBtn.style.borderRadius = '4px';
        switchBtn.style.cursor = 'pointer';
        switchBtn.style.marginTop = '4px';
        switchBtn.style.fontSize = '12px';

        switchBtn.addEventListener('click', () => {
            const selectedStoreCode = storeSelect.value;
            if (selectedStoreCode) {
                switchToStore(selectedStoreCode);
            } else {
                alert('Please select a store to switch to');
            }
        });

        storeSelectContainer.appendChild(storeSelectLabel);
        storeSelectContainer.appendChild(storeSelect);
        storeSelectContainer.appendChild(switchBtn);

        // Create status display for store mappings
        const statusDiv = document.createElement('div');
        statusDiv.style.fontSize = '12px';
        statusDiv.style.color = '#666';
        statusDiv.style.textAlign = 'center';
        statusDiv.style.marginTop = '4px';
        statusDiv.textContent = 'No store mappings loaded';

        // Create CSRF settings button
        const csrfSettingsBtn = document.createElement('button');
        csrfSettingsBtn.textContent = '⚙️ CSRF Settings';
        csrfSettingsBtn.style.padding = '8px';
        csrfSettingsBtn.style.backgroundColor = '#6c757d';
        csrfSettingsBtn.style.color = '#fff';
        csrfSettingsBtn.style.border = 'none';
        csrfSettingsBtn.style.borderRadius = '4px';
        csrfSettingsBtn.style.cursor = 'pointer';
        csrfSettingsBtn.style.fontSize = '12px';
        csrfSettingsBtn.style.marginTop = '8px';

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

        // Function to update store dropdown options
        const updateStoreDropdown = () => {
            storeSelect.innerHTML = '<option value="">Select a store...</option>';
            
            // Sort store codes alphabetically
            const sortedStores = Array.from(storeMappingData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
            
            sortedStores.forEach(([storeCode, storeId]) => {
                const option = document.createElement('option');
                option.value = storeCode;
                option.textContent = `${storeCode} (ID: ${storeId})`;
                storeSelect.appendChild(option);
            });
        };

        // Function to update status display and UI visibility
        const updateStatus = () => {
            if (storeMappingData.size === 0) {
                statusDiv.textContent = 'No store mappings loaded';
                statusDiv.style.color = '#666';
                storeSelectContainer.style.display = 'none';
            } else {
                statusDiv.textContent = `${storeMappingData.size} store mappings loaded`;
                statusDiv.style.color = '#28a745';
                storeSelectContainer.style.display = 'block';
                updateStoreDropdown();
            }
        };

        // Override the handleFileUpload to update status
        const originalHandleUpload = handleFileUpload;
        handleFileUpload = function(file) {
            originalHandleUpload(file);
            // Update status after a short delay to allow for processing
            setTimeout(updateStatus, 100);
        };

        // Initialize status on load
        updateStatus();

        contentContainer.appendChild(exportBtn);
        contentContainer.appendChild(refreshBtn);
        
        // ASIN Input Feature
        const asinInputContainer = document.createElement('div');
        asinInputContainer.style.marginTop = '8px';
        
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
        
        const goToItemBtn = document.createElement('button');
        goToItemBtn.textContent = '🔗 Go to Item';
        goToItemBtn.style.padding = '10px';
        goToItemBtn.style.backgroundColor = '#fd7e14';
        goToItemBtn.style.color = '#fff';
        goToItemBtn.style.border = 'none';
        goToItemBtn.style.borderRadius = '5px';
        goToItemBtn.style.cursor = 'pointer';
        goToItemBtn.style.width = '100%';
        
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
            
            // Show loading feedback
            const originalButtonText = goToItemBtn.textContent;
            goToItemBtn.textContent = '🔄 Opening...';
            goToItemBtn.disabled = true;
            
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
            } finally {
                // Restore button state
                setTimeout(() => {
                    goToItemBtn.textContent = originalButtonText;
                    goToItemBtn.disabled = false;
                }, 1000);
            }
        }
        
        // Event listeners
        goToItemBtn.addEventListener('click', () => {
            const asin = asinInput.value;
            if (!asin.trim()) {
                alert('❌ Please enter an ASIN');
                asinInput.focus();
                return;
            }
            navigateToItem(asin);
        });
        
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
        contentContainer.appendChild(asinInputContainer);
        
        contentContainer.appendChild(uploadBtn);
        contentContainer.appendChild(statusDiv);
        contentContainer.appendChild(csrfSettingsBtn);
        contentContainer.appendChild(storeSelectContainer);
        contentContainer.appendChild(fileInput);
        document.body.appendChild(panel);
    }

    window.addEventListener('load', () => {
        createExportButton();

        // Dynamic card count display
        const counter = document.createElement('div');
        counter.id = 'asin-card-counter';
        counter.style.fontSize = '13px';
        counter.style.color = '#333';
        counter.style.marginTop = '8px';
        counter.style.padding = '4px 0';
        counter.style.borderTop = '1px solid #dee2e6';
        counter.style.textAlign = 'center';
        
        // Find the panel and append to its content container
        const panel = document.querySelector('body > div[style*="position: fixed"]');
        const contentContainer = panel?.querySelector('div:last-child');
        contentContainer?.appendChild(counter);

        setInterval(() => {
            const { data, emptyCount } = extractDataFromCards();
            counter.textContent = `Visible ASINs: ${data.length} | Empty cards: ${emptyCount}`;
        }, 1000);
    });
})();
