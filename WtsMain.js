// ==UserScript==
// @name         Whole Foods ASIN Exporter with Store Mapping
// @namespace    http://tampermonkey.net/
// @version      1.3.008
// @description  Export ASIN, Name, Section from visible cards on Whole Foods page with store mapping and SharePoint item database functionality
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
// @grant        GM_xmlhttpRequest
// @connect      share.amazon.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// ==/UserScript==

(function () {
    'use strict';
    
    // Enhanced debug logging for troubleshooting
    console.log('🚀 WTS Tools script starting...');
    console.log('📍 Current URL:', window.location.href);
    console.log('📍 Document ready state:', document.readyState);
    console.log('📍 Timestamp:', new Date().toISOString());
    
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

    // Network request interception to capture CSRF tokens and store info - START IMMEDIATELY
    let capturedCSRFToken = null;
    let currentStoreInfo = null;
    let networkInterceptionActive = false;

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
        try {
            console.log('🔧 Creating WTS Tools panel...');
            console.log('📍 Document ready state:', document.readyState);
            console.log('📍 Body element exists:', !!document.body);
            
            // Ensure document body exists
            if (!document.body) {
                throw new Error('Document body not available yet');
            }
            
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

        // XLSX parsing function for item database with performance optimizations
        async function parseXLSX(arrayBuffer) {
            try {
                console.log('📊 Starting XLSX parsing...');
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
                console.log(`📊 Processing ${totalRows} rows...`);
                
                // Warn about large datasets
                if (totalRows > 100000) {
                    const proceed = confirm(`⚠️ Large dataset detected: ${totalRows} rows\n\nThis may take a while and could slow down your browser.\n\nDo you want to continue?`);
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
                
                const items = [];
                const errors = [];
                
                // Process data in batches to prevent browser freezing
                const BATCH_SIZE = 1000;
                const totalBatches = Math.ceil((jsonData.length - 1) / BATCH_SIZE);
                
                console.log(`📊 Processing in ${totalBatches} batches of ${BATCH_SIZE} rows each...`);
                
                // Process batches with async delays
                for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                    const startRow = batchIndex * BATCH_SIZE + 1; // +1 to skip header
                    const endRow = Math.min(startRow + BATCH_SIZE, jsonData.length);
                    
                    console.log(`📊 Processing batch ${batchIndex + 1}/${totalBatches} (rows ${startRow}-${endRow - 1})`);
                    
                    for (let i = startRow; i < endRow; i++) {
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
                    
                    // Allow browser to breathe between batches for large datasets
                    if (totalRows > 50000 && batchIndex < totalBatches - 1) {
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                }
                
                const processingTime = (Date.now() - startTime) / 1000;
                console.log(`✅ Processed ${items.length} items in ${processingTime.toFixed(2)} seconds`);
                
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

        // Save item database to storage with chunking for large datasets
        function saveItemDatabase() {
            try {
                console.log(`💾 Saving ${itemDatabase.length} items to storage...`);
                const startTime = Date.now();
                
                const jsonString = JSON.stringify(itemDatabase);
                const jsonSize = new Blob([jsonString]).size;
                console.log(`📊 Database JSON size: ${(jsonSize / 1024 / 1024).toFixed(2)} MB`);
                
                // Check if data is too large for single storage (Tampermonkey limit is ~5MB per key)
                const MAX_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks to be safe
                
                if (jsonSize > MAX_CHUNK_SIZE) {
                    console.log('📦 Large dataset detected, using chunked storage...');
                    
                    // Clear any existing chunks
                    let chunkIndex = 0;
                    while (GM_getValue(`itemDatabase_chunk_${chunkIndex}`, null) !== null) {
                        GM_deleteValue(`itemDatabase_chunk_${chunkIndex}`);
                        chunkIndex++;
                    }
                    
                    // Split into chunks
                    const chunks = [];
                    for (let i = 0; i < jsonString.length; i += MAX_CHUNK_SIZE) {
                        chunks.push(jsonString.slice(i, i + MAX_CHUNK_SIZE));
                    }
                    
                    // Save chunks
                    chunks.forEach((chunk, index) => {
                        GM_setValue(`itemDatabase_chunk_${index}`, chunk);
                    });
                    
                    // Save metadata
                    GM_setValue('itemDatabase_chunks', chunks.length);
                    GM_setValue('itemDatabase_size', itemDatabase.length);
                    GM_deleteValue('itemDatabase'); // Remove old single storage
                    
                    console.log(`✅ Saved ${chunks.length} chunks in ${(Date.now() - startTime)}ms`);
                } else {
                    // Small enough for single storage
                    GM_setValue('itemDatabase', jsonString);
                    GM_deleteValue('itemDatabase_chunks'); // Clean up any old chunks
                    console.log(`✅ Saved single database in ${(Date.now() - startTime)}ms`);
                }
                
                GM_setValue('itemDatabaseTimestamp', Date.now());
                
            } catch (error) {
                console.error('❌ Error saving item database:', error);
                alert(`❌ Failed to save item database: ${error.message}\n\nThe database may be too large for storage. Try using a smaller dataset.`);
            }
        }

        // Load item database from storage with chunking support
        function loadItemDatabase() {
            try {
                console.log('📂 Loading item database from storage...');
                const startTime = Date.now();
                
                const timestamp = GM_getValue('itemDatabaseTimestamp', 0);
                const chunkCount = GM_getValue('itemDatabase_chunks', 0);
                
                if (chunkCount > 0) {
                    // Load chunked data
                    console.log(`📦 Loading ${chunkCount} chunks...`);
                    let jsonString = '';
                    
                    for (let i = 0; i < chunkCount; i++) {
                        const chunk = GM_getValue(`itemDatabase_chunk_${i}`, '');
                        if (!chunk) {
                            throw new Error(`Missing chunk ${i} of ${chunkCount}`);
                        }
                        jsonString += chunk;
                    }
                    
                    itemDatabase = JSON.parse(jsonString);
                    console.log(`✅ Loaded ${itemDatabase.length} items from ${chunkCount} chunks in ${(Date.now() - startTime)}ms`);
                } else {
                    // Load single storage (legacy or small datasets)
                    const storedData = GM_getValue('itemDatabase', '[]');
                    itemDatabase = JSON.parse(storedData);
                    
                    if (itemDatabase.length > 0) {
                        console.log(`✅ Loaded ${itemDatabase.length} items from single storage in ${(Date.now() - startTime)}ms`);
                    }
                }
                
                if (itemDatabase.length > 0) {
                    const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
                    console.log(`📊 Database age: ${ageHours.toFixed(1)} hours`);
                }
                
            } catch (error) {
                console.error('❌ Error loading item database:', error);
                console.log('🔄 Resetting item database due to load error');
                itemDatabase = [];
                
                // Clean up corrupted storage
                GM_deleteValue('itemDatabase');
                GM_deleteValue('itemDatabase_chunks');
                let chunkIndex = 0;
                while (GM_getValue(`itemDatabase_chunk_${chunkIndex}`, null) !== null) {
                    GM_deleteValue(`itemDatabase_chunk_${chunkIndex}`);
                    chunkIndex++;
                }
            }
        }

        // Search items in database with performance optimizations
        function searchItems(query, searchType = 'all') {
            if (!query || itemDatabase.length === 0) return [];
            
            const searchTerm = query.toLowerCase().trim();
            const results = [];
            const MAX_RESULTS = 50; // Limit results for performance
            
            // For large datasets, stop searching once we have enough results
            for (let i = 0; i < itemDatabase.length && results.length < MAX_RESULTS; i++) {
                const item = itemDatabase[i];
                let matches = false;
                
                switch (searchType) {
                    case 'asin':
                        matches = item.asin && item.asin.toLowerCase().includes(searchTerm);
                        break;
                    case 'name':
                        matches = item.item_name && item.item_name.toLowerCase().includes(searchTerm);
                        break;
                    case 'sku':
                        matches = item.sku && item.sku.toLowerCase().includes(searchTerm);
                        break;
                    case 'store':
                        matches = (item.store_name && item.store_name.toLowerCase().includes(searchTerm)) ||
                                 (item.store_acronym && item.store_acronym.toLowerCase().includes(searchTerm)) ||
                                 (item.store_tlc && item.store_tlc.toLowerCase().includes(searchTerm));
                        break;
                    case 'all':
                    default:
                        matches = (item.asin && item.asin.toLowerCase().includes(searchTerm)) ||
                                 (item.item_name && item.item_name.toLowerCase().includes(searchTerm)) ||
                                 (item.sku && item.sku.toLowerCase().includes(searchTerm)) ||
                                 (item.store_name && item.store_name.toLowerCase().includes(searchTerm)) ||
                                 (item.store_acronym && item.store_acronym.toLowerCase().includes(searchTerm)) ||
                                 (item.store_tlc && item.store_tlc.toLowerCase().includes(searchTerm));
                        break;
                }
                
                if (matches) {
                    results.push(item);
                }
            }
            
            return results;
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

                    // Update UI
                    updateStatus();

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

        // SharePoint data refresh functionality is now handled above
        // Old XLSX upload functionality has been replaced with SharePoint integration

        // Load saved panel position or use default
        const savedPosition = GM_getValue('wts_panel_position', { x: 10, y: 10 });
        
        const panel = document.createElement('div');
        panel.id = 'wts-panel'; // FIXED: Add unique ID for reliable detection
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

        // SharePoint data refresh functionality
        const sharePointUrl = 'https://share.amazon.com/sites/WFM_eComm_ABI/_layouts/15/download.aspx?SourceUrl=%2Fsites%2FWFM%5FeComm%5FABI%2FShared%20Documents%2FWFMOAC%2FDailyInventory%2FWFMOAC%20Inventory%20Data%2Exlsx';
        
        function fetchSharePointData() {
            console.log('🌐 Fetching data from SharePoint...');
            
            // Show loading feedback
            const originalButtonText = refreshDataBtn.textContent;
            refreshDataBtn.textContent = '🔄 Fetching...';
            refreshDataBtn.disabled = true;
            
            GM_xmlhttpRequest({
                method: 'GET',
                url: sharePointUrl,
                headers: {
                    'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                },
                responseType: 'arraybuffer',
                withCredentials: true,
                onload: function(response) {
                    console.log('📡 SharePoint response status:', response.status);
                    
                    if (response.status === 200) {
                        console.log('✅ SharePoint file downloaded successfully');
                        handleSharePointData(response.response);
                    } else if (response.status === 302 || response.status === 401) {
                        // Authentication required - open in new tab for user to authenticate
                        console.log('🔐 Authentication required, opening SharePoint in new tab...');
                        window.open(sharePointUrl, '_blank');
                        alert('🔐 Authentication required!\n\nA new tab has been opened to SharePoint. Please:\n1. Sign in if prompted\n2. The file should download automatically\n3. Come back and try "Refresh Data" again');
                    } else {
                        console.error('❌ Failed to fetch SharePoint file:', response);
                        alert(`❌ Failed to fetch data from SharePoint.\n\nStatus: ${response.status}\nCheck console for details.`);
                    }
                    
                    // Restore button state
                    refreshDataBtn.textContent = originalButtonText;
                    refreshDataBtn.disabled = false;
                },
                onerror: function(error) {
                    console.error('❌ Error accessing SharePoint:', error);
                    alert('❌ Error accessing SharePoint data.\n\nThis might be due to:\n- Network connectivity issues\n- Authentication problems\n- SharePoint access restrictions\n\nCheck console for details.');
                    
                    // Restore button state
                    refreshDataBtn.textContent = originalButtonText;
                    refreshDataBtn.disabled = false;
                }
            });
        }
        
        async function handleSharePointData(arrayBuffer) {
            try {
                console.log('📊 Processing SharePoint data...');
                
                // Show processing message for large files
                const processingAlert = document.createElement('div');
                processingAlert.style.position = 'fixed';
                processingAlert.style.top = '50%';
                processingAlert.style.left = '50%';
                processingAlert.style.transform = 'translate(-50%, -50%)';
                processingAlert.style.background = '#fff';
                processingAlert.style.border = '2px solid #007bff';
                processingAlert.style.borderRadius = '8px';
                processingAlert.style.padding = '20px';
                processingAlert.style.zIndex = '10001';
                processingAlert.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                processingAlert.innerHTML = `
                    <div style="text-align: center;">
                        <div style="font-size: 16px; margin-bottom: 10px;">📊 Processing SharePoint data...</div>
                        <div style="font-size: 14px; color: #666;">This may take a moment for large files</div>
                    </div>
                `;
                document.body.appendChild(processingAlert);
                
                // Allow UI to update
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const newItems = await parseXLSX(arrayBuffer);
                
                // Remove processing message
                // FIXED: Safe processing message removal
                try {
                    if (processingAlert && document.body.contains(processingAlert)) {
                        document.body.removeChild(processingAlert);
                        console.log("🐛 OVERLAY REMOVAL DEBUG - Successfully removed processing overlay");
                    }
                } catch (removeError) {
                    console.error("🐛 OVERLAY REMOVAL DEBUG - ERROR removing overlay:", removeError);
                }
                
                // Update the item database
                itemDatabase = newItems;
                
                // Save to persistent storage
                saveItemDatabase();
                
                // Update UI
                updateItemDatabaseStatus();

                alert(`✅ Successfully loaded ${itemDatabase.length} items from SharePoint!\n\nData is now available for searching and has been saved locally.`);
                
            } catch (error) {
                // Remove processing message if it exists
                console.log("🐛 OVERLAY REMOVAL DEBUG - Error handler attempting to remove processing overlay");
                const processingAlert = document.querySelector('div[style*="Processing SharePoint data"]');
                console.log("🐛 OVERLAY REMOVAL DEBUG - Found processing alert element:", !!processingAlert);
                if (processingAlert) {
                    console.log("🐛 OVERLAY REMOVAL DEBUG - Parent element:", processingAlert.parentElement);
                    console.log("🐛 OVERLAY REMOVAL DEBUG - Parent in DOM:", processingAlert.parentElement ? document.body.contains(processingAlert.parentElement) : false);
                    try {
                        document.body.removeChild(processingAlert.parentElement);
                        console.log("🐛 OVERLAY REMOVAL DEBUG - Successfully removed processing overlay");
                    } catch (removeError) {
                        console.error("🐛 OVERLAY REMOVAL DEBUG - ERROR removing overlay:", removeError);
                    }
                }
                console.error('❌ Error processing SharePoint data:', error);
                alert(`❌ Error processing SharePoint data: ${error.message}\n\nCheck console for details.`);
            }
        }

        // Create SharePoint data refresh button
        const refreshDataBtn = document.createElement('button');
        refreshDataBtn.textContent = '🔄 Refresh Data from SharePoint';
        refreshDataBtn.style.padding = '10px';
        refreshDataBtn.style.backgroundColor = '#20c997';
        refreshDataBtn.style.color = '#fff';
        refreshDataBtn.style.border = 'none';
        refreshDataBtn.style.borderRadius = '5px';
        refreshDataBtn.style.cursor = 'pointer';

        refreshDataBtn.addEventListener('click', fetchSharePointData);

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

        // Create status display for item database
        const itemDatabaseStatusDiv = document.createElement('div');
        itemDatabaseStatusDiv.style.fontSize = '12px';
        itemDatabaseStatusDiv.style.color = '#666';
        itemDatabaseStatusDiv.style.textAlign = 'center';
        itemDatabaseStatusDiv.style.marginTop = '4px';
        itemDatabaseStatusDiv.textContent = 'No item database loaded';

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

        // Debug info button for troubleshooting
        const debugBtn = document.createElement('button');
        debugBtn.textContent = '🐛 Debug Info';
        debugBtn.style.padding = '8px';
        debugBtn.style.backgroundColor = '#e83e8c';
        debugBtn.style.color = '#fff';
        debugBtn.style.border = 'none';
        debugBtn.style.borderRadius = '4px';
        debugBtn.style.cursor = 'pointer';
        debugBtn.style.fontSize = '12px';
        debugBtn.style.marginTop = '4px';

        debugBtn.addEventListener('click', () => {
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
                itemDatabase: itemDatabase.length,
                capturedToken: !!getCapturedToken(),
                storeInfo: getCurrentStoreInfo()
            };
            
            console.log('🐛 WTS Tools Debug Info:', debugInfo);
            
            const debugText = Object.entries(debugInfo)
                .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                .join('\n');
                
            alert(`🐛 WTS Tools Debug Info:\n\n${debugText}\n\nCheck console for detailed logs.`);
        });

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

        // Function to update item database status and UI visibility
        const updateItemDatabaseStatus = () => {
            if (itemDatabase.length === 0) {
                itemDatabaseStatusDiv.textContent = 'No item database loaded';
                itemDatabaseStatusDiv.style.color = '#666';
                // Only hide search container if it exists
                if (typeof itemSearchContainer !== 'undefined') {
                    itemSearchContainer.style.display = 'none';
                }
            } else {
                const timestamp = GM_getValue('itemDatabaseTimestamp', 0);
                const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
                const ageText = ageHours < 1 ? `${Math.round(ageHours * 60)}m` : `${ageHours.toFixed(1)}h`;
                
                itemDatabaseStatusDiv.textContent = `${itemDatabase.length} items loaded (${ageText} ago)`;
                itemDatabaseStatusDiv.style.color = '#28a745';
                // Only show search container if it exists
                if (typeof itemSearchContainer !== 'undefined') {
                    itemSearchContainer.style.display = 'block';
                    // Update current store display when database is loaded
                    updateCurrentStoreDisplay();
                }
            }
        };

        // Note: File upload handlers (handleCSVUpload and handleXLSXUpload)
        // automatically update their respective status displays

        // Note: Initialization will be done after all UI elements are created

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
        
        // Item Search Feature
        const itemSearchContainer = document.createElement('div');
        itemSearchContainer.style.marginTop = '8px';
        itemSearchContainer.style.display = 'none'; // Hidden by default until database is loaded
        
        const itemSearchLabel = document.createElement('div');
        itemSearchLabel.textContent = 'Search Items:';
        itemSearchLabel.style.fontSize = '12px';
        itemSearchLabel.style.color = '#333';
        itemSearchLabel.style.marginBottom = '4px';
        
        // Current store display
        const currentStoreDisplayDiv = document.createElement('div');
        currentStoreDisplayDiv.style.fontSize = '11px';
        currentStoreDisplayDiv.style.color = '#666';
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
        storeFilterLabel.style.color = '#666';
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
        itemSearchInput.style.padding = '8px';
        itemSearchInput.style.border = '1px solid #ccc';
        itemSearchInput.style.borderRadius = '4px';
        itemSearchInput.style.fontSize = '12px';
        itemSearchInput.style.boxSizing = 'border-box';
        itemSearchInput.style.marginBottom = '4px';
        
        const searchResultsContainer = document.createElement('div');
        searchResultsContainer.style.maxHeight = '200px';
        searchResultsContainer.style.overflowY = 'auto';
        searchResultsContainer.style.border = '1px solid #ddd';
        searchResultsContainer.style.borderRadius = '4px';
        searchResultsContainer.style.backgroundColor = '#f8f9fa';
        searchResultsContainer.style.display = 'none';
        
        // Search functionality
        function performSearch() {
            const query = itemSearchInput.value.trim();
            const searchType = searchTypeSelect.value;
            
            if (!query) {
                searchResultsContainer.style.display = 'none';
                return;
            }
            
            let results = searchItems(query, searchType);
            
            // Apply store filtering if enabled
            if (storeFilterCheckbox.checked) {
                const currentStoreTLC = getCurrentStoreTLC();
                if (currentStoreTLC) {
                    results = results.filter(item => item.store_tlc === currentStoreTLC);
                }
            }
            
            displaySearchResults(results);
        }
        
        function displaySearchResults(results) {
            searchResultsContainer.innerHTML = '';
            
            if (results.length === 0) {
                const noResults = document.createElement('div');
                noResults.textContent = 'No items found';
                noResults.style.padding = '8px';
                noResults.style.color = '#666';
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
                    resultItem.style.backgroundColor = '#e8f5e8';
                    resultItem.style.borderLeft = '3px solid #28a745';
                }
                
                const storeIndicator = isCurrentStore ? '🏪 ' : '';
                const storeColor = isCurrentStore ? '#28a745' : '#666';
                
                resultItem.innerHTML = `
                    <div style="font-weight: bold; color: #007bff;">${item.item_name}</div>
                    <div style="color: #666;">ASIN: ${item.asin} | SKU: ${item.sku}</div>
                    <div style="color: ${storeColor};">${storeIndicator}Store: ${item.store_name} (${item.store_tlc})</div>
                `;
                
                resultItem.addEventListener('mouseenter', () => {
                    if (!isCurrentStore) {
                        resultItem.style.backgroundColor = '#e9ecef';
                    }
                });
                
                resultItem.addEventListener('mouseleave', () => {
                    if (isCurrentStore) {
                        resultItem.style.backgroundColor = '#e8f5e8';
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
                moreResults.style.color = '#666';
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
                            currentStoreDisplayDiv.style.color = '#28a745';
                        } else {
                            currentStoreDisplayDiv.textContent = `Current Store: ${storeInfo.displayName} (ID: ${storeInfo.storeId})`;
                            currentStoreDisplayDiv.style.color = '#ffc107';
                        }
                    } else {
                        currentStoreDisplayDiv.textContent = 'Store info not available';
                        currentStoreDisplayDiv.style.color = '#666';
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
        contentContainer.appendChild(itemSearchContainer);
        
        contentContainer.appendChild(uploadBtn);
        contentContainer.appendChild(refreshDataBtn);
        contentContainer.appendChild(statusDiv);
        contentContainer.appendChild(itemDatabaseStatusDiv);
        contentContainer.appendChild(csrfSettingsBtn);
        contentContainer.appendChild(debugBtn);
        contentContainer.appendChild(storeSelectContainer);
        contentContainer.appendChild(fileInput);
        document.body.appendChild(panel);
        
        // Initialize status after all UI elements are created
        loadItemDatabase(); // Load stored item database
        updateStatus();
        updateItemDatabaseStatus();
        
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
        try {
            console.log(`🔄 Initializing WTS Tools (attempt ${initializationAttempts + 1}/${maxInitializationAttempts})...`);
            console.log('📍 Current URL:', window.location.href);
            console.log('📍 Document ready state:', document.readyState);
            
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
        }
    }

    // Clean up any existing panels
    function cleanupExistingPanel() {
        console.log('🧹 Cleaning up existing panels...');
        
        // Clear any existing retry timeout
        if (initializationRetryTimeout) {
            clearTimeout(initializationRetryTimeout);
            initializationRetryTimeout = null;
        }
        
        // Remove existing panels
        const existingPanels = document.querySelectorAll('body > div[style*="position: fixed"][style*="z-index: 9999"]');
        existingPanels.forEach((panel, index) => {
            console.log(`🗑️ Removing existing panel ${index + 1}`);
            panel.remove();
        });
        
        // Reset state
        wtsPanel = null;
        isInitialized = false;
        
        // Stop existing persistence monitoring
        if (persistenceCheckInterval) {
            clearInterval(persistenceCheckInterval);
            persistenceCheckInterval = null;
        }
    }

    // Add dynamic card counter to the panel
    function addCardCounter() {
        try {
            if (!wtsPanel) return;
            
            const counter = document.createElement('div');
            counter.id = 'asin-card-counter';
            counter.style.fontSize = '13px';
            counter.style.color = '#333';
            counter.style.marginTop = '8px';
            counter.style.padding = '4px 0';
            counter.style.borderTop = '1px solid #dee2e6';
            counter.style.textAlign = 'center';
            
            // Find the content container and append counter
            const contentContainer = wtsPanel.querySelector('div:last-child');
            if (contentContainer) {
                contentContainer.appendChild(counter);
                console.log('✅ Counter added to panel');
                
                // CRITICAL BUG: Unbounded interval - never cleared!
                console.log("🐛 INTERVAL DEBUG - Creating card counter interval (potential memory leak)");
                cardCounterInterval = setInterval(() => {
                    try {
                        if (document.body.contains(counter)) {
                            const { data, emptyCount } = extractDataFromCards();
                            counter.textContent = `Visible ASINs: ${data.length} | Empty cards: ${emptyCount}`;
                        } else {
                            console.log("🐛 INTERVAL DEBUG - Counter element removed, clearing interval");
                            if (cardCounterInterval) {
                                clearInterval(cardCounterInterval);
                                cardCounterInterval = null;
                            }
                        }
                    } catch (error) {
                        console.error('Error updating counter:', error);
                    }
                }, 1000);
                console.log("🐛 INTERVAL DEBUG - Card counter interval ID:", cardCounterInterval);
            } else {
                console.warn('⚠️ Could not find content container for counter');
            }
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
        
        // Trigger 1: DOM Content Loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                console.log('🎯 DOMContentLoaded triggered');
                setTimeout(initializeWTSTools, 500);
            });
        }
        
        // Trigger 2: Window Load
        if (document.readyState !== 'complete') {
            window.addEventListener('load', () => {
                console.log('🎯 Window load triggered');
                setTimeout(initializeWTSTools, 1000);
            });
        }
        
        // Trigger 3: Immediate if document is already ready
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            console.log('🎯 Document already ready, initializing immediately');
            setTimeout(initializeWTSTools, 100);
        }
        
        // Trigger 4: Fallback timer
        setTimeout(() => {
            if (!isInitialized) {
                console.log('🎯 Fallback timer triggered');
                initializeWTSTools();
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
        
        // Method 2: URL polling as backup
        // CRITICAL BUG: Unbounded interval - never cleared!
        console.log("🐛 INTERVAL DEBUG - Creating URL polling interval (potential memory leak)");
        urlPollingInterval = setInterval(() => {
            handleUrlChange();
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
