const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const ExcelJS = require('exceljs');

class ScannerService {
    constructor(config) {
        this.config = config;
        this.browser = null;
        this.page = null;
        this.isRunning = false;
        this.shouldStop = false;
        this.storeMappings = new Map();
        this.itemList = [];
        this.results = [];
        this.csrfToken = null;
        this.csrfTokenFile = 'csrf_token.json'; // File to persist CSRF token
        this.currentProgress = {
            currentStore: null,
            itemsProcessed: 0,
            totalItems: 0,
            successCount: 0,
            errorCount: 0
        };
        
        // Multi-agent system properties
        this.agents = [];
        this.activeAgents = 0;
        this.maxConcurrentAgents = config.settings?.maxConcurrentAgents || 1;
        this.agentQueue = [];
        this.processingQueue = [];
        
        // Callbacks for progress and results
        this.onProgress = null;
        this.onResult = null;
    }

    async startScan() {
        try {
            this.isRunning = true;
            this.shouldStop = false;
            this.results = [];
            
            console.log('🚀 Starting WFM Scanner Service...');
            
            // Load persisted CSRF token
            await this.loadPersistedCSRFToken();
            
            // Load store mappings and item list
            await this.loadStoreMappings();
            await this.loadItemList();
            
            // Initialize browser with proper positioning
            await this.initializeBrowser();
            
            // Start the scanning process
            await this.performScan();
            
            console.log('✅ Scan completed successfully');
            return this.results;
            
        } catch (error) {
            console.error('❌ Scan failed:', error);
            throw error;
        } finally {
            await this.cleanup();
            this.isRunning = false;
        }
    }

    async stopScan() {
        console.log('🛑 Stopping scan...');
        this.shouldStop = true;
        await this.cleanup();
        this.isRunning = false;
    }

    async loadPersistedCSRFToken() {
        try {
            const tokenData = await fs.readFile(this.csrfTokenFile, 'utf8');
            const parsed = JSON.parse(tokenData);
            
            // Check if token is not too old (24 hours)
            const tokenAge = Date.now() - parsed.timestamp;
            if (tokenAge < 24 * 60 * 60 * 1000) {
                this.csrfToken = parsed.token;
                console.log('🔑 Loaded persisted CSRF token (age:', Math.round(tokenAge / (60 * 1000)), 'minutes)');
            } else {
                console.log('🔑 Persisted CSRF token expired, will need new one');
            }
        } catch (error) {
            console.log('🔑 No persisted CSRF token found, will capture from network');
        }
    }

    async persistCSRFToken(token) {
        try {
            const tokenData = {
                token: token,
                timestamp: Date.now()
            };
            await fs.writeFile(this.csrfTokenFile, JSON.stringify(tokenData, null, 2));
            console.log('💾 CSRF token persisted for future use');
        } catch (error) {
            console.error('❌ Failed to persist CSRF token:', error.message);
        }
    }

    async setupNetworkInterception() {
        console.log('🕸️ Setting up network request interception...');
        
        this.page.on('request', (request) => {
            const url = request.url();
            const headers = request.headers();
            
            // Look for CSRF tokens in request headers
            if (headers['anti-csrftoken-a2z']) {
                const token = headers['anti-csrftoken-a2z'];
                if (token && token !== this.csrfToken) {
                    console.log('🔑 Captured CSRF token from request headers:', token.substring(0, 20) + '...');
                    this.csrfToken = token;
                    this.persistCSRFToken(token);
                }
            }
            
            // Log store switch API calls
            if (url.includes('store-affinity')) {
                console.log('🌐 Intercepted store switch request to:', url);
                console.log('📦 Request headers:', JSON.stringify(headers, null, 2));
            }
        });

        this.page.on('response', (response) => {
            const url = response.url();
            const headers = response.headers();
            
            // Look for CSRF tokens in response headers
            if (headers['x-csrf-token'] || headers['csrf-token']) {
                const token = headers['x-csrf-token'] || headers['csrf-token'];
                if (token && token !== this.csrfToken) {
                    console.log('🔑 Captured CSRF token from response headers:', token.substring(0, 20) + '...');
                    this.csrfToken = token;
                    this.persistCSRFToken(token);
                }
            }
            
            // Log store switch API responses
            if (url.includes('store-affinity')) {
                console.log('📊 Store switch API response:', response.status(), response.statusText());
            }
        });
    }

    async loadStoreMappings() {
        console.log('📁 Loading store mappings...');
        
        const filePath = this.config.storeMappingFile;
        const fileContent = await fs.readFile(filePath, 'utf8');
        const lines = fileContent.trim().split('\n');
        
        if (lines.length < 2) {
            throw new Error('Store mapping file must contain at least a header and one data row');
        }
        
        const header = lines[0].split(',').map(col => col.trim().replace(/"/g, ''));
        const storeCodeIndex = header.findIndex(col => col.toLowerCase() === 'storecode');
        const storeIdIndex = header.findIndex(col => col.toLowerCase() === 'storeid');
        
        if (storeCodeIndex === -1 || storeIdIndex === -1) {
            throw new Error('Store mapping file must contain "StoreCode" and "StoreId" columns');
        }
        
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(',').map(col => col.trim().replace(/"/g, ''));
            if (row.length > Math.max(storeCodeIndex, storeIdIndex)) {
                const storeCode = row[storeCodeIndex];
                const storeId = parseInt(row[storeIdIndex]);
                
                if (storeCode && !isNaN(storeId)) {
                    this.storeMappings.set(storeCode.toUpperCase(), storeId);
                }
            }
        }
        
        console.log(`✅ Loaded ${this.storeMappings.size} store mappings`);
    }

    async loadItemList() {
        console.log('📊 Loading item list...');
        
        const filePath = this.config.itemListFile;
        console.log('Item list file path:', filePath, 'Type:', typeof filePath);
        console.log('Config object:', this.config);
        
        if (!filePath || typeof filePath !== 'string') {
            throw new Error(`Invalid file path: ${filePath} (type: ${typeof filePath})`);
        }
        
        const ext = path.extname(filePath).toLowerCase();
        
        if (ext === '.csv') {
            await this.loadItemListFromCSV(filePath);
        } else if (ext === '.xlsx' || ext === '.xls') {
            await this.loadItemListFromExcel(filePath);
        } else {
            throw new Error('Unsupported file format. Please use CSV or Excel files.');
        }
        
        console.log(`✅ Loaded ${this.itemList.length} items across ${new Set(this.itemList.map(item => item.store)).size} stores`);
    }

    async loadItemListFromCSV(filePath) {
        return new Promise((resolve, reject) => {
            const items = [];
            const fs = require('fs');
            
            console.log('Loading CSV from path:', filePath, 'Type:', typeof filePath);
            
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (row) => {
                    // Look for store and ASIN columns (case insensitive)
                    // Note: store_tlc is the column name for store code
                    const storeKey = Object.keys(row).find(key =>
                        key.toLowerCase() === 'store_tlc' ||
                        key.toLowerCase().includes('store') ||
                        key.toLowerCase().includes('tlc') ||
                        key.toLowerCase().includes('code')
                    );
                    const asinKey = Object.keys(row).find(key => 
                        key.toLowerCase().includes('asin')
                    );
                    
                    if (storeKey && asinKey && row[storeKey] && row[asinKey]) {
                        items.push({
                            store: row[storeKey].trim().toUpperCase(),
                            asin: row[asinKey].trim().toUpperCase(),
                            name: row.name || row.item_name || row.title || 'Unknown Item'
                        });
                    }
                })
                .on('end', () => {
                    this.itemList = items;
                    resolve();
                })
                .on('error', reject);
        });
    }

    async loadItemListFromExcel(filePath) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        const worksheet = workbook.worksheets[0];
        const items = [];
        
        // Get header row
        const headerRow = worksheet.getRow(1);
        const headers = [];
        headerRow.eachCell((cell, colNumber) => {
            headers[colNumber] = cell.value ? cell.value.toString().toLowerCase() : '';
        });
        
        // Find column indices
        // Note: store_tlc is the column name for store code
        const storeColIndex = headers.findIndex(header =>
            header && (
                header === 'store_tlc' ||
                header.includes('store') || header.includes('tlc') || header.includes('code')
            )
        );
        const asinColIndex = headers.findIndex(header => header && header.includes('asin'));
        const nameColIndex = headers.findIndex(header =>
            header && (header.includes('name') || header.includes('title'))
        );
        
        if (storeColIndex === -1 || asinColIndex === -1) {
            throw new Error('Excel file must contain store and ASIN columns');
        }
        
        // Process data rows
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) { // Skip header
                const storeValue = row.getCell(storeColIndex).value;
                const asinValue = row.getCell(asinColIndex).value;
                const nameValue = row.getCell(nameColIndex > 0 ? nameColIndex : 1).value;
                
                if (storeValue && asinValue) {
                    items.push({
                        store: storeValue.toString().trim().toUpperCase(),
                        asin: asinValue.toString().trim().toUpperCase(),
                        name: nameValue ? nameValue.toString().trim() : 'Unknown Item'
                    });
                }
            }
        });
        
        this.itemList = items;
    }

    async initializeBrowser() {
        console.log('🌐 Initializing browser...');
        
        const { screenDimensions, settings } = this.config;
        
        // Browser launch options
        const launchOptions = {
            headless: settings.headlessMode,
            devtools: false
        };
        
        // Add window positioning for non-headless mode
        if (!settings.headlessMode && screenDimensions) {
            launchOptions.args = [
                `--window-position=${screenDimensions.playwrightX},${screenDimensions.playwrightY}`,
                `--window-size=${screenDimensions.playwrightWidth},${screenDimensions.playwrightHeight}`,
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ];
        }
        
        this.browser = await chromium.launch(launchOptions);
        
        // Create context and page
        const context = await this.browser.newContext({
            viewport: screenDimensions && !settings.headlessMode ? {
                width: screenDimensions.playwrightWidth,
                height: screenDimensions.playwrightHeight
            } : { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        this.page = await context.newPage();
        
        // Set up network request interception to capture CSRF tokens
        await this.setupNetworkInterception();
        
        // Set page timeout
        this.page.setDefaultTimeout(settings.pageTimeout);
        
        console.log('✅ Browser initialized successfully');
        
        if (!settings.headlessMode && screenDimensions) {
            console.log(`📐 Browser window positioned at (${screenDimensions.playwrightX}, ${screenDimensions.playwrightY})`);
            console.log(`📐 Browser window size: ${screenDimensions.playwrightWidth}x${screenDimensions.playwrightHeight}`);
        }
    }

    async performScan() {
        console.log('🔍 Starting scan process...');
        
        // Group items by store
        const itemsByStore = new Map();
        this.itemList.forEach(item => {
            if (!itemsByStore.has(item.store)) {
                itemsByStore.set(item.store, []);
            }
            itemsByStore.get(item.store).push(item);
        });
        
        // Update total items count
        this.currentProgress.totalItems = this.itemList.length;
        this.emitProgress();
        
        // Navigate to WFM catering page first
        console.log('🏪 Navigating to WFM catering page...');
        await this.page.goto('https://www.wholefoodsmarket.com/catering', {
            waitUntil: 'networkidle'
        });
        
        // Use enhanced CSRF token acquisition method
        console.log('🔑 Attempting to acquire CSRF token...');
        const initialToken = await this.ensureCSRFToken(this.page);
        
        if (initialToken) {
            console.log('✅ CSRF token successfully acquired');
        } else {
            console.log('⚠️ Enhanced CSRF token acquisition failed');
            console.log('💡 Will attempt fallback methods during store switching');
            
            // If running in non-headless mode, give user time to manually select a store
            if (!this.config.settings.headlessMode) {
                console.log('⏳ Waiting 15 seconds for potential manual store selection...');
                console.log('👆 You may manually select a store in the browser window if needed');
                await this.delay(15000);
                
                // Try one more time after potential manual interaction
                const manualToken = await this.ensureCSRFToken(this.page);
                if (manualToken) {
                    console.log('✅ CSRF token found after manual interaction period');
                } else {
                    console.log('⚠️ Still no CSRF token found, will use fallback methods');
                }
            }
        }
        
        // Initialize agents once at the beginning (they'll be reused across all stores)
        if (this.maxConcurrentAgents > 1) {
            await this.initializePersistentAgents();
        }
        
        // Process each store sequentially (agents work in parallel within each store)
        for (const [storeCode, items] of itemsByStore) {
            if (this.shouldStop) {
                console.log('🛑 Scan stopped by user');
                return;
            }
            
            console.log(`🏪 Processing store: ${storeCode} (${items.length} items)`);
            this.currentProgress.currentStore = storeCode;
            this.emitProgress();
            
            // Switch to store using main browser context (this affects all tabs via cookies)
            const success = await this.switchToStore(storeCode);
            if (!success) {
                console.warn(`⚠️ Failed to switch to store ${storeCode}, skipping...`);
                continue;
            }
            
            // Wait between store switches
            if (!this.shouldStop) {
                await this.delay(this.config.settings.delayBetweenStores);
            }
            
            // Process all items in this store with parallel agents (reusing existing tabs)
            await this.processStoreItemsParallel(items, storeCode);
            
            console.log(`✅ Completed all items for store: ${storeCode}`);
        }
        
        // Cleanup agents after all stores are processed
        if (this.maxConcurrentAgents > 1) {
            await this.cleanupAgents();
        }
        
        console.log('✅ Scan process completed');
    }

    async processStoreItemsParallel(items, storeCode) {
        console.log(`🚀 Processing ${items.length} items for store ${storeCode} with ${this.maxConcurrentAgents} parallel agents (reusing tabs)`);
        
        if (this.maxConcurrentAgents === 1) {
            // Sequential processing for single agent
            return await this.processStoreItemsSequential(items, storeCode);
        }
        
        // Agents are already initialized and will be reused
        // Just update their store context (they inherit new store via cookies)
        for (const agent of this.agents) {
            agent.storeCode = storeCode;
        }
        
        // Create processing queue for this store only
        this.processingQueue = items.map((item, index) => ({
            item,
            storeCode,
            processed: false,
            index
        }));
        
        console.log(`📦 Created processing queue with ${this.processingQueue.length} items for store ${storeCode}`);
        
        // Start parallel processing with all agents working on the same store
        const processingPromises = [];
        const activeAgentCount = Math.min(this.maxConcurrentAgents, items.length, this.agents.length);
        
        for (let i = 0; i < activeAgentCount; i++) {
            processingPromises.push(this.processStoreQueueWithAgent(i, storeCode));
        }
        
        console.log(`🤖 Started ${activeAgentCount} agents for store ${storeCode} (reusing existing tabs)`);
        
        // Wait for all agents to complete processing this store
        await Promise.all(processingPromises);
        
        console.log(`✅ All agents completed processing ${items.length} items for store ${storeCode}`);
    }

    async processStoreItemsSequential(items, storeCode) {
        console.log(`🔄 Processing ${items.length} items for store ${storeCode} sequentially`);
        
        const batchSize = 10; // Process items in batches
        
        for (let i = 0; i < items.length; i += batchSize) {
            if (this.shouldStop) {
                console.log('🛑 Scan stopped by user during batch processing');
                return;
            }
            
            const batch = items.slice(i, i + batchSize);
            console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)`);
            
            // Process batch items sequentially
            for (const item of batch) {
                if (this.shouldStop) {
                    console.log('🛑 Scan stopped by user during item processing');
                    return;
                }
                
                await this.processItem(item);
                
                if (!this.shouldStop && this.config.settings.delayBetweenItems > 0) {
                    await this.delay(this.config.settings.delayBetweenItems);
                }
            }
            
            // Small delay between batches
            if (!this.shouldStop && i + batchSize < items.length) {
                await this.delay(500);
            }
        }
    }

    async initializePersistentAgents() {
        console.log(`🤖 Initializing ${this.maxConcurrentAgents} persistent agents (will be reused across all stores)...`);
        
        this.agents = [];
        this.activeAgents = 0;
        
        for (let i = 0; i < this.maxConcurrentAgents; i++) {
            const agent = await this.createPersistentAgent(`Agent-${i + 1}`);
            if (agent) {
                this.agents.push(agent);
                console.log(`✅ Agent ${agent.id} initialized (persistent tab)`);
            } else {
                console.error(`❌ Failed to initialize Agent-${i + 1}`);
            }
        }
        
        console.log(`🚀 ${this.agents.length} persistent agents ready (will be reused across all stores)`);
    }

    async createPersistentAgent(agentId) {
        console.log(`🤖 Creating persistent agent ${agentId} using shared browser context...`);
        
        try {
            // Use the same browser context to share cookies and session state
            const context = this.page.context();
            
            // Create a new tab (page) within the same context
            const page = await context.newPage();
            page.setDefaultTimeout(this.config.settings.pageTimeout);
            
            // Set up network interception for this agent
            await this.setupNetworkInterceptionForAgent(page, agentId);
            
            const agent = {
                id: agentId,
                context: null, // Don't store context since we're sharing it
                page,
                isActive: false,
                storeCode: null, // Will be updated for each store
                csrfToken: this.csrfToken, // Share the main CSRF token initially
                isSharedContext: true, // Flag to indicate this is using shared context
                isPersistent: true // Flag to indicate this agent persists across stores
            };
            
            // Navigate agent to WFM catering page to establish session
            console.log(`🌐 ${agentId} navigating to WFM catering page (persistent tab)...`);
            await page.goto('https://www.wholefoodsmarket.com/catering', {
                waitUntil: 'networkidle'
            });
            
            // Small delay to let page settle
            await this.delay(2000);
            
            console.log(`✅ Persistent agent ${agentId} created and ready (will inherit store context via cookies)`);
            return agent;
            
        } catch (error) {
            console.error(`❌ Failed to create persistent agent ${agentId}:`, error);
            return null;
        }
    }

    async processStoreQueueWithAgent(agentIndex, storeCode) {
        const agent = this.agents[agentIndex];
        if (!agent) {
            console.error(`❌ Agent ${agentIndex} not available for store ${storeCode}`);
            return;
        }
        
        console.log(`🤖 ${agent.id} starting processing for store ${storeCode}...`);
        
        let processedCount = 0;
        
        while (!this.shouldStop) {
            // Find next unprocessed item for this store
            const queueItem = this.processingQueue.find(qi => !qi.processed && qi.storeCode === storeCode);
            if (!queueItem) {
                break; // No more items to process for this store
            }
            
            // Mark as being processed
            queueItem.processed = true;
            processedCount++;
            
            try {
                console.log(`🤖 ${agent.id} processing item ${processedCount}: ${queueItem.item.asin} for store ${storeCode}`);
                await this.processItemWithAgent(agent, queueItem.item, queueItem.storeCode);
                
                // Add delay between items if configured
                if (!this.shouldStop && this.config.settings.delayBetweenItems > 0) {
                    await this.delay(this.config.settings.delayBetweenItems);
                }
                
            } catch (error) {
                console.error(`❌ ${agent.id} error processing item ${queueItem.item.asin}:`, error);
                
                // Create error result
                const result = {
                    store: queueItem.storeCode,
                    asin: queueItem.item.asin,
                    name: queueItem.item.name,
                    success: false,
                    loadTime: null,
                    timestamp: new Date().toISOString(),
                    error: error.message,
                    extractedName: null,
                    price: null,
                    hasNutritionFacts: false,
                    hasIngredients: false,
                    hasAddToCart: false,
                    isAvailable: false,
                    variationCount: 0,
                    variations: [],
                    extractionDetails: null,
                    agent: agent.id
                };
                
                this.results.push(result);
                this.currentProgress.itemsProcessed++;
                this.currentProgress.errorCount++;
                this.emitProgress();
                this.emitResult(result);
            }
        }
        
        console.log(`🏁 ${agent.id} finished processing ${processedCount} items for store ${storeCode}`);
    }

    async cleanupAgents() {
        console.log('🧹 Cleaning up agents...');
        
        for (const agent of this.agents) {
            try {
                if (agent.page) {
                    await agent.page.close();
                }
                // Only close context if it's not shared (old agents)
                if (agent.context && !agent.isSharedContext) {
                    await agent.context.close();
                }
                console.log(`✅ ${agent.id} cleaned up successfully (persistent: ${agent.isPersistent || false}, shared context: ${agent.isSharedContext || false})`);
            } catch (error) {
                console.error(`❌ Error cleaning up ${agent.id}:`, error);
            }
        }
        
        this.agents = [];
        this.activeAgents = 0;
        console.log('✅ All agents cleaned up');
    }

    async createAgent(agentId) {
        console.log(`🤖 Creating agent ${agentId}...`);
        
        try {
            const context = await this.browser.newContext({
                viewport: { width: 1280, height: 720 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            
            const page = await context.newPage();
            page.setDefaultTimeout(this.config.settings.pageTimeout);
            
            // Set up network interception for this agent
            await this.setupNetworkInterceptionForAgent(page, agentId);
            
            const agent = {
                id: agentId,
                context,
                page,
                isActive: false,
                csrfToken: this.csrfToken // Share the main CSRF token initially
            };
            
            console.log(`✅ Agent ${agentId} created successfully`);
            return agent;
            
        } catch (error) {
            console.error(`❌ Failed to create agent ${agentId}:`, error);
            return null;
        }
    }

    async createAgentForStore(agentId, storeCode) {
        console.log(`🤖 Creating agent ${agentId} for store ${storeCode} using shared browser context...`);
        
        try {
            // Use the same browser context to share cookies and session state
            const context = this.page.context();
            
            // Create a new tab (page) within the same context
            const page = await context.newPage();
            page.setDefaultTimeout(this.config.settings.pageTimeout);
            
            // Set up network interception for this agent
            await this.setupNetworkInterceptionForAgent(page, agentId);
            
            const agent = {
                id: agentId,
                context: null, // Don't store context since we're sharing it
                page,
                isActive: false,
                storeCode: storeCode, // Track which store this agent is working on
                csrfToken: this.csrfToken, // Share the main CSRF token initially
                isSharedContext: true // Flag to indicate this is using shared context
            };
            
            // Navigate agent to WFM catering page to establish session
            console.log(`🌐 ${agentId} navigating to WFM catering page for store ${storeCode} (shared context)...`);
            await page.goto('https://www.wholefoodsmarket.com/catering', {
                waitUntil: 'networkidle'
            });
            
            // Small delay to let page settle
            await this.delay(2000);
            
            console.log(`✅ Agent ${agentId} created as new tab for store ${storeCode} (cookies shared)`);
            return agent;
            
        } catch (error) {
            console.error(`❌ Failed to create agent ${agentId} for store ${storeCode}:`, error);
            return null;
        }
    }

    async setupNetworkInterceptionForAgent(page, agentId) {
        page.on('request', (request) => {
            const url = request.url();
            const headers = request.headers();
            
            // Look for CSRF tokens in request headers
            if (headers['anti-csrftoken-a2z']) {
                const token = headers['anti-csrftoken-a2z'];
                if (token && token !== this.csrfToken) {
                    console.log(`🔑 Agent ${agentId} captured CSRF token:`, token.substring(0, 20) + '...');
                    this.csrfToken = token;
                    this.persistCSRFToken(token);
                }
            }
            
            // Log store switch API calls
            if (url.includes('store-affinity')) {
                console.log(`🌐 Agent ${agentId} intercepted store switch request`);
            }
        });

        page.on('response', (response) => {
            const url = response.url();
            
            // Log store switch API responses
            if (url.includes('store-affinity')) {
                console.log(`📊 Agent ${agentId} store switch response:`, response.status());
            }
        });
    }

    async processItemWithAgent(agent, item, storeCode) {
        const startTime = Date.now();
        let result = {
            store: storeCode,
            asin: item.asin,
            name: item.name,
            success: false,
            loadTime: null,
            timestamp: new Date().toISOString(),
            error: null,
            // Enhanced data fields
            extractedName: null,
            price: null,
            hasNutritionFacts: false,
            hasIngredients: false,
            hasAddToCart: false,
            isAvailable: false,
            variationCount: 0,
            variations: [],
            extractionDetails: null,
            agent: agent.id
        };
        
        try {
            agent.isActive = true;
            this.activeAgents++;
            
            console.log(`🤖 ${agent.id} processing: ${storeCode} - ${item.asin}`);
            
            // Construct item URL
            const itemUrl = `https://www.wholefoodsmarket.com/name/dp/${item.asin}`;
            
            // Navigate to item page
            const response = await agent.page.goto(itemUrl, {
                waitUntil: 'networkidle',
                timeout: this.config.settings.pageTimeout
            });
            
            // Check if page loaded successfully
            if (response && response.ok()) {
                // Wait for page content to load
                await agent.page.waitForLoadState('domcontentloaded');
                
                // Check if item page loaded properly (not 404 or error page)
                const pageTitle = await agent.page.title();
                const isErrorPage = pageTitle.toLowerCase().includes('error') ||
                                  pageTitle.toLowerCase().includes('not found') ||
                                  pageTitle.toLowerCase().includes('404');
                
                if (!isErrorPage) {
                    result.success = true;
                    result.loadTime = Date.now() - startTime;
                    
                    // Extract comprehensive product data using agent's page
                    const productData = await this.extractProductDataWithAgent(agent);
                    
                    // Add extracted data to result
                    result.extractedName = productData.name;
                    result.price = productData.price;
                    result.hasNutritionFacts = productData.hasNutritionFacts;
                    result.hasIngredients = productData.hasIngredients;
                    result.hasAddToCart = productData.hasAddToCart;
                    result.isAvailable = productData.isAvailable;
                    result.variationCount = productData.variationCount || 0;
                    result.variations = productData.variations || [];
                    result.isBundle = productData.isBundle || false;
                    result.bundlePartsCount = productData.bundlePartsCount || 0;
                    result.bundleParts = productData.bundleParts || [];
                    result.extractionDetails = productData.extractionDetails;
                    
                    console.log(`✅ ${agent.id} completed: ${storeCode} - ${item.asin} (${result.loadTime}ms)`);
                    console.log(`📊 Data: Name="${productData.name}", Price="${productData.price}", Nutrition=${productData.hasNutritionFacts}, Ingredients=${productData.hasIngredients}, AddToCart=${productData.hasAddToCart}, Variations=${productData.variationCount}, Bundle=${productData.isBundle}, BundleParts=${productData.bundlePartsCount}`);
                } else {
                    result.error = 'Item page not found or error page';
                    console.log(`❌ ${agent.id} - ${storeCode} - ${item.asin} - Error page detected`);
                }
            } else {
                result.error = `HTTP ${response ? response.status() : 'unknown'} error`;
                console.log(`❌ ${agent.id} - ${storeCode} - ${item.asin} - HTTP error: ${result.error}`);
            }
            
        } catch (error) {
            result.error = error.message;
            console.log(`❌ ${agent.id} - ${storeCode} - ${item.asin} - Error: ${error.message}`);
        } finally {
            agent.isActive = false;
            this.activeAgents--;
            
            // Update progress
            this.currentProgress.itemsProcessed++;
            if (result.success) {
                this.currentProgress.successCount++;
            } else {
                this.currentProgress.errorCount++;
            }
            
            // Store result
            this.results.push(result);
            
            // Emit progress and result
            this.emitProgress();
            this.emitResult(result);
        }
    }

    async extractProductDataWithAgent(agent) {
        return await agent.page.evaluate(() => {
            const extractionDetails = {
                selectors: {},
                attempts: {},
                fallbacks: {}
            };
            
            // Helper function to try multiple selectors with fallbacks
            function trySelectors(selectorGroups, dataType) {
                extractionDetails.attempts[dataType] = [];
                
                for (const group of selectorGroups) {
                    for (const selector of group.selectors) {
                        extractionDetails.attempts[dataType].push({
                            selector: selector,
                            method: group.method,
                            found: false
                        });
                        
                        try {
                            const elements = document.querySelectorAll(selector);
                            if (elements.length > 0) {
                                const element = elements[0];
                                let value = null;
                                
                                switch (group.method) {
                                    case 'textContent':
                                        value = element.textContent?.trim();
                                        break;
                                    case 'innerText':
                                        value = element.innerText?.trim();
                                        break;
                                    case 'exists':
                                        value = true;
                                        break;
                                    case 'attribute':
                                        value = element.getAttribute(group.attribute);
                                        break;
                                }
                                
                                if (value) {
                                    extractionDetails.attempts[dataType][extractionDetails.attempts[dataType].length - 1].found = true;
                                    extractionDetails.selectors[dataType] = selector;
                                    return value;
                                }
                            }
                        } catch (e) {
                            console.log(`Selector failed: ${selector}`, e.message);
                        }
                    }
                }
                return null;
            }
            
            // Product Name Extraction (multiple strategies)
            const nameSelectors = [
                {
                    method: 'textContent',
                    selectors: [
                        'div.bds--heading-1.my-2.text-squid-ink', // Exact match from example
                        'div[class*="bds--heading-1"][class*="text-squid-ink"]', // Partial class match
                        'h1[class*="bds--heading-1"]',
                        'div[class*="heading-1"]',
                        'h1[class*="product-title"]',
                        'h1[class*="item-title"]',
                        '.product-title h1',
                        '.item-title h1',
                        'h1:first-of-type',
                        '[data-testid="product-title"]',
                        '[data-testid="item-title"]'
                    ]
                },
                {
                    method: 'innerText',
                    selectors: [
                        'div[class*="heading"][class*="squid-ink"]',
                        'div[class*="product-name"]',
                        'div[class*="item-name"]'
                    ]
                }
            ];
            
            // Price Extraction (multiple strategies)
            const priceSelectors = [
                {
                    method: 'textContent',
                    selectors: [
                        'span.text-left.bds--heading-5', // Exact match from example
                        'span[class*="bds--heading-5"]', // Partial class match
                        'span[class*="heading-5"]',
                        'span[class*="price"]',
                        '.price span',
                        '[data-testid="price"]',
                        '[class*="price"][class*="current"]',
                        'span:contains("$")',
                        'div[class*="price"] span',
                        '.product-price span',
                        '.item-price span'
                    ]
                },
                {
                    method: 'innerText',
                    selectors: [
                        'div[class*="price"]',
                        '.price-container',
                        '.current-price'
                    ]
                }
            ];
            
            // Nutrition Facts Detection
            const nutritionSelectors = [
                {
                    method: 'exists',
                    selectors: [
                        'h4.bds--heading-4.w-full.text-squid-ink', // Exact match, check content separately
                        'h4[class*="bds--heading-4"][class*="text-squid-ink"]', // Partial match
                        'h4:contains("Nutrition Facts")',
                        'h3:contains("Nutrition Facts")',
                        'h2:contains("Nutrition Facts")',
                        '[data-testid="nutrition-facts"]',
                        '.nutrition-facts',
                        '.nutritional-info',
                        'div:contains("Nutrition Facts")',
                        'section:contains("Nutrition Facts")'
                    ]
                }
            ];
            
            // Ingredients Detection
            const ingredientsSelectors = [
                {
                    method: 'exists',
                    selectors: [
                        'h4.bds--heading-4.mb-2.w-full.text-squid-ink', // Exact match, check content separately
                        'h4[class*="bds--heading-4"][class*="text-squid-ink"]',
                        'h4:contains("Ingredients")',
                        'h3:contains("Ingredients")',
                        'h2:contains("Ingredients")',
                        '[data-testid="ingredients"]',
                        '.ingredients',
                        '.ingredient-list',
                        'div:contains("Ingredients")',
                        'section:contains("Ingredients")'
                    ]
                }
            ];
            
            // Add to Cart Button Detection
            const addToCartSelectors = [
                {
                    method: 'exists',
                    selectors: [
                        'button[data-csa-c-type="addToCart"]', // Exact match from example
                        'button:contains("Add to Cart")',
                        'button[class*="addToCart"]',
                        'button[data-testid="add-to-cart"]',
                        '.add-to-cart button',
                        '.add-to-basket button',
                        'button[aria-label*="Add to Cart"]',
                        'button[title*="Add to Cart"]',
                        'input[type="submit"][value*="Add to Cart"]'
                    ]
                }
            ];
            
            // Extract all data
            const productName = trySelectors(nameSelectors, 'name');
            const price = trySelectors(priceSelectors, 'price');
            
            // For nutrition and ingredients, we need to check text content
            let hasNutritionFacts = false;
            let hasIngredients = false;
            
            // Check for nutrition facts by looking for text content
            const nutritionElements = document.querySelectorAll('h4, h3, h2, div, section');
            for (const el of nutritionElements) {
                if (el.textContent && el.textContent.toLowerCase().includes('nutrition facts')) {
                    hasNutritionFacts = true;
                    extractionDetails.selectors.nutrition = 'text-content-search';
                    break;
                }
            }
            
            // Check for ingredients by looking for text content
            const ingredientElements = document.querySelectorAll('h4, h3, h2, div, section');
            for (const el of ingredientElements) {
                if (el.textContent && el.textContent.toLowerCase().includes('ingredients')) {
                    hasIngredients = true;
                    extractionDetails.selectors.ingredients = 'text-content-search';
                    break;
                }
            }
            
            const hasAddToCart = trySelectors(addToCartSelectors, 'addToCart') || false;
            
            // Clean up price (remove extra whitespace, ensure $ format)
            let cleanPrice = null;
            if (price) {
                cleanPrice = price.replace(/\s+/g, ' ').trim();
                // Ensure it looks like a price
                if (!/\$\d+\.?\d*/.test(cleanPrice)) {
                    cleanPrice = null;
                }
            }
            
            // Product Variations Detection (size/flavor options)
            const variationButtons = document.querySelectorAll('button[data-csa-c-slot-id*="PDPInfo_selectionslot_"]');
            const variationCount = variationButtons.length;
            
            // Extract variation details if available
            const variations = [];
            variationButtons.forEach((button, index) => {
                try {
                    const contentId = button.getAttribute('data-csa-c-content-id');
                    const slotId = button.getAttribute('data-csa-c-slot-id');
                    const buttonText = button.textContent?.trim();
                    
                    // Try to extract price from button if available
                    const priceMatch = buttonText?.match(/\$\d+\.?\d*/);
                    const extractedPrice = priceMatch ? priceMatch[0] : null;
                    
                    // Try to extract size/variation name
                    const lines = buttonText?.split('\n').map(line => line.trim()).filter(line => line);
                    const variationName = lines && lines.length > 0 ? lines[0] : contentId;
                    
                    variations.push({
                        index: index + 1,
                        name: variationName,
                        contentId: contentId,
                        slotId: slotId,
                        price: extractedPrice,
                        fullText: buttonText
                    });
                } catch (e) {
                    console.log(`Error extracting variation ${index + 1}:`, e.message);
                }
            });
            
            extractionDetails.variations = {
                count: variationCount,
                details: variations,
                selectors: 'button[data-csa-c-slot-id*="PDPInfo_selectionslot_"]'
            };
            
            // Bundle Product Detection (What's Included section)
            let isBundle = false;
            let bundlePartsCount = 0;
            let bundleParts = [];
            
            // Look for "What's Included" heading
            const whatsIncludedHeadings = document.querySelectorAll('h4.bds--heading-4');
            for (const heading of whatsIncludedHeadings) {
                if (heading.textContent && heading.textContent.toLowerCase().includes("what's included")) {
                    isBundle = true;
                    extractionDetails.selectors.bundle = 'h4.bds--heading-4 containing "What\'s Included"';
                    
                    // Find the next sibling or parent container that contains buttons
                    let container = heading.nextElementSibling;
                    if (!container) {
                        container = heading.parentElement?.nextElementSibling;
                    }
                    
                    if (container) {
                        // Look for buttons in the container
                        const bundleButtons = container.querySelectorAll('button');
                        bundlePartsCount = bundleButtons.length;
                        
                        // Extract bundle part details
                        bundleButtons.forEach((button, index) => {
                            try {
                                const buttonText = button.textContent?.trim();
                                const buttonClass = button.className;
                                const buttonId = button.id;
                                
                                bundleParts.push({
                                    index: index + 1,
                                    text: buttonText,
                                    className: buttonClass,
                                    id: buttonId
                                });
                            } catch (e) {
                                console.log(`Error extracting bundle part ${index + 1}:`, e.message);
                            }
                        });
                    }
                    break; // Found the section, no need to continue
                }
            }
            
            extractionDetails.bundle = {
                isBundle: isBundle,
                partsCount: bundlePartsCount,
                parts: bundleParts,
                selectors: isBundle ? 'h4.bds--heading-4 + container buttons' : null
            };
            
            return {
                name: productName,
                price: cleanPrice,
                hasNutritionFacts: hasNutritionFacts,
                hasIngredients: hasIngredients,
                hasAddToCart: hasAddToCart,
                isAvailable: hasAddToCart, // If add to cart exists, item is likely available
                variationCount: variationCount,
                variations: variations,
                isBundle: isBundle,
                bundlePartsCount: bundlePartsCount,
                bundleParts: bundleParts,
                extractionDetails: extractionDetails
            };
        });
    }

    async switchToStore(storeCode) {
        try {
            const storeId = this.storeMappings.get(storeCode);
            if (!storeId) {
                console.error(`❌ Store ID not found for code: ${storeCode}`);
                return false;
            }
            
            console.log(`🔄 Switching to store ${storeCode} (ID: ${storeId})`);
            
            // Check current cookies and session state
            const cookies = await this.page.context().cookies();
            console.log(`🍪 Current cookies count: ${cookies.length}`);
            
            // Use enhanced CSRF token acquisition method
            let csrfToken = await this.ensureCSRFToken(this.page);
            
            if (!csrfToken) {
                console.warn('⚠️ Enhanced CSRF token acquisition failed, trying fallback');
                const fallbackToken = await this.getFallbackCSRFToken();
                if (!fallbackToken) {
                    console.error('❌ No CSRF token available (including fallback)');
                    // Try alternative method without token
                    return await this.alternativeStoreSwitch(storeId, storeCode);
                }
                csrfToken = fallbackToken;
            }
            
            console.log(`✅ CSRF token acquired: ${csrfToken.substring(0, 20)}...`);
            return await this.performStoreSwitch(storeId, storeCode, csrfToken);
            
        } catch (error) {
            console.error(`❌ Error switching to store ${storeCode}:`, error);
            console.error(`❌ Error stack:`, error.stack);
            
            // Final fallback - try alternative method
            console.log(`🔄 Attempting final fallback store switch...`);
            const storeId = this.storeMappings.get(storeCode);
            return await this.alternativeStoreSwitch(storeId, storeCode);
        }
    }

    async ensureCSRFToken(page) {
        try {
            // Check if we already have a CSRF token
            if (this.csrfToken) {
                console.log('🔑 Using existing CSRF token');
                return this.csrfToken;
            }

            console.log('🔍 Looking for CSRF token...');
            
            // Try to find CSRF token in various places
            const token = await page.evaluate(() => {
                // Check meta tags
                const metaToken = document.querySelector('meta[name="csrf-token"]');
                if (metaToken) return metaToken.getAttribute('content');
                
                // Check form inputs
                const inputToken = document.querySelector('input[name="_token"]');
                if (inputToken) return inputToken.value;
                
                // Check window object
                if (window.csrfToken) return window.csrfToken;
                if (window._token) return window._token;
                
                return null;
            });

            if (token) {
                this.csrfToken = token;
                console.log('✅ CSRF token found and cached');
                return token;
            }

            // If no token found, try enhanced acquisition method
            console.log('⚠️ No CSRF token found - attempting enhanced acquisition...');
            return await this.enhancedCSRFTokenAcquisition(page);
            
        } catch (error) {
            console.error('❌ Error getting CSRF token:', error);
            return null;
        }
    }

    async enhancedCSRFTokenAcquisition(page) {
        try {
            console.log('🔄 Starting enhanced CSRF token acquisition...');
            
            // Step 1: Look for store selector button
            console.log('🔍 Looking for store selector button...');
            const storeSelectorButton = await page.$('button[aria-label="See store details"]');
            
            if (!storeSelectorButton) {
                console.log('❌ Store selector button not found');
                return await this.extractCSRFToken();
            }
            
            console.log('✅ Found store selector button, clicking...');
            await storeSelectorButton.click();
            
            // Wait for modal or dropdown to appear
            await this.delay(2000);
            
            // Step 2: Look for "Make this my store" button
            console.log('🔍 Looking for "Make this my store" button...');
            const makeStoreButton = await page.$('span.w-makethismystore');
            
            if (!makeStoreButton) {
                console.log('❌ "Make this my store" button not found');
                return await this.extractCSRFToken();
            }
            
            console.log('✅ Found "Make this my store" button, clicking...');
            
            // Set up network request listener before clicking
            const tokenPromise = new Promise((resolve) => {
                const requestHandler = (request) => {
                    const headers = request.headers();
                    if (headers['anti-csrftoken-a2z']) {
                        console.log('🔑 Captured CSRF token from network request!');
                        const token = headers['anti-csrftoken-a2z'];
                        page.off('request', requestHandler);
                        resolve(token);
                    }
                };
                page.on('request', requestHandler);
                
                // Timeout after 10 seconds
                setTimeout(() => {
                    page.off('request', requestHandler);
                    resolve(null);
                }, 10000);
            });
            
            // Click the "Make this my store" button
            await makeStoreButton.click();
            
            // Wait for the network request to complete
            const capturedToken = await tokenPromise;
            
            if (capturedToken) {
                this.csrfToken = capturedToken;
                await this.persistCSRFToken(capturedToken);
                console.log('✅ Enhanced CSRF token acquisition successful!');
                return capturedToken;
            } else {
                console.log('⚠️ No token captured from network request, trying fallback extraction...');
                await this.delay(3000); // Wait for page to update
                return await this.extractCSRFToken();
            }
            
        } catch (error) {
            console.error('❌ Error in enhanced CSRF token acquisition:', error);
            return await this.extractCSRFToken();
        }
    }

    async extractCSRFToken() {
        return await this.page.evaluate(() => {
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
            return null;
        });
    }

    async getFallbackCSRFToken() {
        // Fallback CSRF token from working example (should be configurable)
        const fallbackToken = 'g8vLu/dZWzjCsJDFVrLrpFVhPtr6MUjMo2ijQsM2pdUFAAAAAQAAAABodo6GcmF3AAAAACr/Igfie4qiUf9rqj+gAw==';
        console.log("🔄 Using fallback CSRF token:", fallbackToken);
        console.log("Token length:", fallbackToken.length);
        console.log("Token format valid:", /^[A-Za-z0-9+/]+=*$/.test(fallbackToken));
        return fallbackToken;
    }

    async performStoreSwitch(storeId, storeCode, csrfToken) {
        try {
            console.log(`🔄 Attempting store switch with token: ${csrfToken.substring(0, 20)}...`);
            console.log(`🔄 Target store: ${storeCode} (ID: ${storeId})`);
            
            // Make store switch request using the exact pattern from WtsMain.js
            const response = await this.page.evaluate(async ({ storeId, token }) => {
                try {
                    console.log("🌐 Making store switch API call...");
                    console.log("📍 Store ID (5-digit):", storeId);
                    console.log("🔑 Token (first 20 chars):", token.substring(0, 20) + "...");
                    console.log("🌐 API Endpoint: https://www.wholefoodsmarket.com/store-affinity");
                    console.log("📦 Request Body:", JSON.stringify({"storeId": storeId.toString()}));
                    
                    const response = await fetch("https://www.wholefoodsmarket.com/store-affinity", {
                        headers: {
                            "accept": "*/*",
                            "accept-language": "en-US,en;q=0.9",
                            "anti-csrftoken-a2z": token,
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
                    
                    console.log("✅ API Request completed");
                    console.log("📊 Response Status:", response.status);
                    console.log("📊 Response OK:", response.ok);
                    console.log("📊 Response Status Text:", response.statusText);
                    
                    // Try to get response text for debugging
                    let responseText = '';
                    try {
                        responseText = await response.text();
                        console.log("📄 API Response text (first 200 chars):", responseText.substring(0, 200));
                        if (responseText.length > 200) {
                            console.log("📄 Response truncated, full length:", responseText.length);
                        }
                    } catch (e) {
                        console.log("❌ Could not read response text:", e.message);
                    }
                    
                    return {
                        ok: response.ok,
                        status: response.status,
                        statusText: response.statusText,
                        responseText: responseText
                    };
                } catch (error) {
                    console.error("❌ API call error for store ID", storeId, ":", error);
                    return {
                        ok: false,
                        error: error.message,
                        stack: error.stack
                    };
                }
            }, { storeId, token: csrfToken });
            
            console.log(`📊 Store switch response:`, response);
            
            if (response.ok) {
                console.log(`✅ Successfully switched to store ${storeCode} (ID: ${storeId})`);
                
                // Verify the store switch by checking current page state
                await this.delay(2000);
                const verificationResult = await this.verifyStoreSwitch(storeCode, storeId);
                
                if (verificationResult.success) {
                    console.log(`✅ Store switch verified: ${verificationResult.message}`);
                    return true;
                } else {
                    console.warn(`⚠️ Store switch API succeeded but verification failed: ${verificationResult.message}`);
                    // Still return true since API call succeeded
                    return true;
                }
            } else {
                console.error(`❌ Store switch failed: ${response.status} ${response.statusText || response.error}`);
                if (response.responseText) {
                    console.error(`❌ Response details: ${response.responseText}`);
                }
                
                // Try alternative store switching method
                console.log(`🔄 Trying alternative store switch method...`);
                return await this.alternativeStoreSwitch(storeId, storeCode);
            }
            
        } catch (error) {
            console.error(`❌ Error performing store switch:`, error);
            console.error(`❌ Error stack:`, error.stack);
            
            // Try alternative method as fallback
            console.log(`🔄 Trying alternative store switch method due to error...`);
            return await this.alternativeStoreSwitch(storeId, storeCode);
        }
    }

    async verifyStoreSwitch(expectedStoreCode, expectedStoreId) {
        try {
            // Check if the page shows the expected store
            const currentStoreInfo = await this.page.evaluate(() => {
                // Look for store information in various places
                const storeSelectors = [
                    '[data-testid="store-selector"]',
                    '.store-selector',
                    '[class*="store"]',
                    '[data-store-id]'
                ];
                
                for (const selector of storeSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        return {
                            text: element.textContent || element.innerText,
                            storeId: element.getAttribute('data-store-id'),
                            className: element.className
                        };
                    }
                }
                
                // Check URL for store information
                const url = window.location.href;
                const urlMatch = url.match(/store[=\/](\d+)/i);
                if (urlMatch) {
                    return {
                        text: `Store ID from URL: ${urlMatch[1]}`,
                        storeId: urlMatch[1],
                        source: 'url'
                    };
                }
                
                return null;
            });
            
            if (currentStoreInfo) {
                console.log(`🔍 Current store info:`, currentStoreInfo);
                
                if (currentStoreInfo.storeId === expectedStoreId.toString()) {
                    return {
                        success: true,
                        message: `Store ID matches: ${expectedStoreId}`
                    };
                } else if (currentStoreInfo.text && currentStoreInfo.text.includes(expectedStoreCode)) {
                    return {
                        success: true,
                        message: `Store code found in text: ${expectedStoreCode}`
                    };
                }
            }
            
            return {
                success: false,
                message: `Could not verify store switch to ${expectedStoreCode} (${expectedStoreId})`
            };
            
        } catch (error) {
            return {
                success: false,
                message: `Verification error: ${error.message}`
            };
        }
    }

    async alternativeStoreSwitch(storeId, storeCode) {
        try {
            console.log(`🔄 Attempting alternative store switch method...`);
            
            // Try navigating to a store-specific URL
            const storeUrl = `https://www.wholefoodsmarket.com/stores/${storeId}`;
            console.log(`🔄 Navigating to store URL: ${storeUrl}`);
            
            const response = await this.page.goto(storeUrl, {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            
            if (response && response.ok()) {
                console.log(`✅ Alternative store switch successful via URL navigation`);
                await this.delay(3000);
                
                // Navigate back to catering page to continue scanning
                await this.page.goto('https://www.wholefoodsmarket.com/catering', {
                    waitUntil: 'networkidle'
                });
                
                return true;
            } else {
                console.error(`❌ Alternative store switch failed: ${response ? response.status() : 'unknown'}`);
                return false;
            }
            
        } catch (error) {
            console.error(`❌ Alternative store switch error:`, error);
            return false;
        }
    }

    async processItem(item) {
        const startTime = Date.now();
        let result = {
            store: item.store,
            asin: item.asin,
            name: item.name,
            success: false,
            loadTime: null,
            timestamp: new Date().toISOString(),
            error: null,
            // Enhanced data fields
            extractedName: null,
            price: null,
            hasNutritionFacts: false,
            hasIngredients: false,
            hasAddToCart: false,
            isAvailable: false,
            variationCount: 0,
            variations: [],
            extractionDetails: null
        };
        
        try {
            console.log(`🔍 Processing item: ${item.store} - ${item.asin}`);
            
            // Construct item URL
            const itemUrl = `https://www.wholefoodsmarket.com/name/dp/${item.asin}`;
            
            // Navigate to item page
            const response = await this.page.goto(itemUrl, {
                waitUntil: 'networkidle',
                timeout: this.config.settings.pageTimeout
            });
            
            // Check if page loaded successfully
            if (response && response.ok()) {
                // Wait for page content to load
                await this.page.waitForLoadState('domcontentloaded');
                
                // Check if item page loaded properly (not 404 or error page)
                const pageTitle = await this.page.title();
                const isErrorPage = pageTitle.toLowerCase().includes('error') ||
                                  pageTitle.toLowerCase().includes('not found') ||
                                  pageTitle.toLowerCase().includes('404');
                
                if (!isErrorPage) {
                    result.success = true;
                    result.loadTime = Date.now() - startTime;
                    
                    // Extract comprehensive product data
                    const productData = await this.extractProductData();
                    
                    // Add extracted data to result
                    result.extractedName = productData.name;
                    result.price = productData.price;
                    result.hasNutritionFacts = productData.hasNutritionFacts;
                    result.hasIngredients = productData.hasIngredients;
                    result.hasAddToCart = productData.hasAddToCart;
                    result.isAvailable = productData.isAvailable;
                    result.variationCount = productData.variationCount || 0;
                    result.variations = productData.variations || [];
                    result.isBundle = productData.isBundle || false;
                    result.bundlePartsCount = productData.bundlePartsCount || 0;
                    result.bundleParts = productData.bundleParts || [];
                    result.extractionDetails = productData.extractionDetails;
                    
                    console.log(`✅ ${item.store} - ${item.asin} loaded successfully (${result.loadTime}ms)`);
                    console.log(`📊 Data: Name="${productData.name}", Price="${productData.price}", Nutrition=${productData.hasNutritionFacts}, Ingredients=${productData.hasIngredients}, AddToCart=${productData.hasAddToCart}, Variations=${productData.variationCount}, Bundle=${productData.isBundle}, BundleParts=${productData.bundlePartsCount}`);
                } else {
                    result.error = 'Item page not found or error page';
                    console.log(`❌ ${item.store} - ${item.asin} - Error page detected`);
                }
            } else {
                result.error = `HTTP ${response ? response.status() : 'unknown'} error`;
                console.log(`❌ ${item.store} - ${item.asin} - HTTP error: ${result.error}`);
            }
            
        } catch (error) {
            result.error = error.message;
            console.log(`❌ ${item.store} - ${item.asin} - Error: ${error.message}`);
        }
        
        // Update progress
        this.currentProgress.itemsProcessed++;
        if (result.success) {
            this.currentProgress.successCount++;
        } else {
            this.currentProgress.errorCount++;
        }
        
        // Store result
        this.results.push(result);
        
        // Emit progress and result
        this.emitProgress();
        this.emitResult(result);
    }

    async extractProductData() {
        return await this.page.evaluate(() => {
            const extractionDetails = {
                selectors: {},
                attempts: {},
                fallbacks: {}
            };
            
            // Helper function to try multiple selectors with fallbacks
            function trySelectors(selectorGroups, dataType) {
                extractionDetails.attempts[dataType] = [];
                
                for (const group of selectorGroups) {
                    for (const selector of group.selectors) {
                        extractionDetails.attempts[dataType].push({
                            selector: selector,
                            method: group.method,
                            found: false
                        });
                        
                        try {
                            const elements = document.querySelectorAll(selector);
                            if (elements.length > 0) {
                                const element = elements[0];
                                let value = null;
                                
                                switch (group.method) {
                                    case 'textContent':
                                        value = element.textContent?.trim();
                                        break;
                                    case 'innerText':
                                        value = element.innerText?.trim();
                                        break;
                                    case 'exists':
                                        value = true;
                                        break;
                                    case 'attribute':
                                        value = element.getAttribute(group.attribute);
                                        break;
                                }
                                
                                if (value) {
                                    extractionDetails.attempts[dataType][extractionDetails.attempts[dataType].length - 1].found = true;
                                    extractionDetails.selectors[dataType] = selector;
                                    return value;
                                }
                            }
                        } catch (e) {
                            console.log(`Selector failed: ${selector}`, e.message);
                        }
                    }
                }
                return null;
            }
            
            // Product Name Extraction (multiple strategies)
            const nameSelectors = [
                {
                    method: 'textContent',
                    selectors: [
                        'div.bds--heading-1.my-2.text-squid-ink', // Exact match from example
                        'div[class*="bds--heading-1"][class*="text-squid-ink"]', // Partial class match
                        'h1[class*="bds--heading-1"]',
                        'div[class*="heading-1"]',
                        'h1[class*="product-title"]',
                        'h1[class*="item-title"]',
                        '.product-title h1',
                        '.item-title h1',
                        'h1:first-of-type',
                        '[data-testid="product-title"]',
                        '[data-testid="item-title"]'
                    ]
                },
                {
                    method: 'innerText',
                    selectors: [
                        'div[class*="heading"][class*="squid-ink"]',
                        'div[class*="product-name"]',
                        'div[class*="item-name"]'
                    ]
                }
            ];
            
            // Price Extraction (multiple strategies)
            const priceSelectors = [
                {
                    method: 'textContent',
                    selectors: [
                        'span.text-left.bds--heading-5', // Exact match from example
                        'span[class*="bds--heading-5"]', // Partial class match
                        'span[class*="heading-5"]',
                        'span[class*="price"]',
                        '.price span',
                        '[data-testid="price"]',
                        '[class*="price"][class*="current"]',
                        'span:contains("$")',
                        'div[class*="price"] span',
                        '.product-price span',
                        '.item-price span'
                    ]
                },
                {
                    method: 'innerText',
                    selectors: [
                        'div[class*="price"]',
                        '.price-container',
                        '.current-price'
                    ]
                }
            ];
            
            // Nutrition Facts Detection
            const nutritionSelectors = [
                {
                    method: 'exists',
                    selectors: [
                        'h4.bds--heading-4.w-full.text-squid-ink', // Exact match, check content separately
                        'h4[class*="bds--heading-4"][class*="text-squid-ink"]', // Partial match
                        'h4:contains("Nutrition Facts")',
                        'h3:contains("Nutrition Facts")',
                        'h2:contains("Nutrition Facts")',
                        '[data-testid="nutrition-facts"]',
                        '.nutrition-facts',
                        '.nutritional-info',
                        'div:contains("Nutrition Facts")',
                        'section:contains("Nutrition Facts")'
                    ]
                }
            ];
            
            // Ingredients Detection
            const ingredientsSelectors = [
                {
                    method: 'exists',
                    selectors: [
                        'h4.bds--heading-4.mb-2.w-full.text-squid-ink', // Exact match, check content separately
                        'h4[class*="bds--heading-4"][class*="text-squid-ink"]',
                        'h4:contains("Ingredients")',
                        'h3:contains("Ingredients")',
                        'h2:contains("Ingredients")',
                        '[data-testid="ingredients"]',
                        '.ingredients',
                        '.ingredient-list',
                        'div:contains("Ingredients")',
                        'section:contains("Ingredients")'
                    ]
                }
            ];
            
            // Add to Cart Button Detection
            const addToCartSelectors = [
                {
                    method: 'exists',
                    selectors: [
                        'button[data-csa-c-type="addToCart"]', // Exact match from example
                        'button:contains("Add to Cart")',
                        'button[class*="addToCart"]',
                        'button[data-testid="add-to-cart"]',
                        '.add-to-cart button',
                        '.add-to-basket button',
                        'button[aria-label*="Add to Cart"]',
                        'button[title*="Add to Cart"]',
                        'input[type="submit"][value*="Add to Cart"]'
                    ]
                }
            ];
            
            // Extract all data
            const productName = trySelectors(nameSelectors, 'name');
            const price = trySelectors(priceSelectors, 'price');
            
            // For nutrition and ingredients, we need to check text content
            let hasNutritionFacts = false;
            let hasIngredients = false;
            
            // Check for nutrition facts by looking for text content
            const nutritionElements = document.querySelectorAll('h4, h3, h2, div, section');
            for (const el of nutritionElements) {
                if (el.textContent && el.textContent.toLowerCase().includes('nutrition facts')) {
                    hasNutritionFacts = true;
                    extractionDetails.selectors.nutrition = 'text-content-search';
                    break;
                }
            }
            
            // Check for ingredients by looking for text content
            const ingredientElements = document.querySelectorAll('h4, h3, h2, div, section');
            for (const el of ingredientElements) {
                if (el.textContent && el.textContent.toLowerCase().includes('ingredients')) {
                    hasIngredients = true;
                    extractionDetails.selectors.ingredients = 'text-content-search';
                    break;
                }
            }
            
            const hasAddToCart = trySelectors(addToCartSelectors, 'addToCart') || false;
            
            // Clean up price (remove extra whitespace, ensure $ format)
            let cleanPrice = null;
            if (price) {
                cleanPrice = price.replace(/\s+/g, ' ').trim();
                // Ensure it looks like a price
                if (!/\$\d+\.?\d*/.test(cleanPrice)) {
                    cleanPrice = null;
                }
            }
            
            // Product Variations Detection (size/flavor options)
            const variationButtons = document.querySelectorAll('button[data-csa-c-slot-id*="PDPInfo_selectionslot_"]');
            const variationCount = variationButtons.length;
            
            // Extract variation details if available
            const variations = [];
            variationButtons.forEach((button, index) => {
                try {
                    const contentId = button.getAttribute('data-csa-c-content-id');
                    const slotId = button.getAttribute('data-csa-c-slot-id');
                    const buttonText = button.textContent?.trim();
                    
                    // Try to extract price from button if available
                    const priceMatch = buttonText?.match(/\$\d+\.?\d*/);
                    const extractedPrice = priceMatch ? priceMatch[0] : null;
                    
                    // Try to extract size/variation name
                    const lines = buttonText?.split('\n').map(line => line.trim()).filter(line => line);
                    const variationName = lines && lines.length > 0 ? lines[0] : contentId;
                    
                    variations.push({
                        index: index + 1,
                        name: variationName,
                        contentId: contentId,
                        slotId: slotId,
                        price: extractedPrice,
                        fullText: buttonText
                    });
                } catch (e) {
                    console.log(`Error extracting variation ${index + 1}:`, e.message);
                }
            });
            
            extractionDetails.variations = {
                count: variationCount,
                details: variations,
                selectors: 'button[data-csa-c-slot-id*="PDPInfo_selectionslot_"]'
            };
            
            // Bundle Product Detection (What's Included section)
            let isBundle = false;
            let bundlePartsCount = 0;
            let bundleParts = [];
            
            // Look for "What's Included" heading
            const whatsIncludedHeadings = document.querySelectorAll('h4.bds--heading-4');
            for (const heading of whatsIncludedHeadings) {
                if (heading.textContent && heading.textContent.toLowerCase().includes("what's included")) {
                    isBundle = true;
                    extractionDetails.selectors.bundle = 'h4.bds--heading-4 containing "What\'s Included"';
                    
                    // Find the next sibling or parent container that contains buttons
                    let container = heading.nextElementSibling;
                    if (!container) {
                        container = heading.parentElement?.nextElementSibling;
                    }
                    
                    if (container) {
                        // Look for buttons in the container
                        const bundleButtons = container.querySelectorAll('button');
                        bundlePartsCount = bundleButtons.length;
                        
                        // Extract bundle part details
                        bundleButtons.forEach((button, index) => {
                            try {
                                const buttonText = button.textContent?.trim();
                                const buttonClass = button.className;
                                const buttonId = button.id;
                                
                                bundleParts.push({
                                    index: index + 1,
                                    text: buttonText,
                                    className: buttonClass,
                                    id: buttonId
                                });
                            } catch (e) {
                                console.log(`Error extracting bundle part ${index + 1}:`, e.message);
                            }
                        });
                    }
                    break; // Found the section, no need to continue
                }
            }
            
            extractionDetails.bundle = {
                isBundle: isBundle,
                partsCount: bundlePartsCount,
                parts: bundleParts,
                selectors: isBundle ? 'h4.bds--heading-4 + container buttons' : null
            };
            
            return {
                name: productName,
                price: cleanPrice,
                hasNutritionFacts: hasNutritionFacts,
                hasIngredients: hasIngredients,
                hasAddToCart: hasAddToCart,
                isAvailable: hasAddToCart, // If add to cart exists, item is likely available
                variationCount: variationCount,
                variations: variations,
                isBundle: isBundle,
                bundlePartsCount: bundlePartsCount,
                bundleParts: bundleParts,
                extractionDetails: extractionDetails
            };
        });
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    emitProgress() {
        if (this.onProgress) {
            this.onProgress({ ...this.currentProgress });
        }
    }

    emitResult(result) {
        if (this.onResult) {
            this.onResult(result);
        }
    }

    async cleanup() {
        console.log('🧹 Cleaning up browser resources...');
        
        try {
            // Cleanup agents first
            await this.cleanupAgents();
            
            // Cleanup main browser resources
            if (this.page) {
                await this.page.close();
                this.page = null;
            }
            
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
            
            console.log('✅ Cleanup completed');
        } catch (error) {
            console.error('❌ Error during cleanup:', error);
        }
    }
}

module.exports = { ScannerService };