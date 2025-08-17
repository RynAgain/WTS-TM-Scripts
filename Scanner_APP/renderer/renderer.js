const { ipcRenderer } = require('electron');

class WFMScannerUI {
    constructor() {
        this.isScanning = false;
        this.scanStartTime = null;
        this.elapsedTimeInterval = null;
        this.storeMappingFile = null;
        this.itemListFile = null;
        this.scanResults = [];
        this.logMessages = [];
        this.screenDimensions = null;
        this.savedConfig = null;
        
        this.initializeUI();
        this.setupEventListeners();
        this.setupIpcListeners();
        this.getScreenDimensions();
        this.loadSavedConfig();
    }

    async getScreenDimensions() {
        try {
            this.screenDimensions = await ipcRenderer.invoke('get-screen-dimensions');
            console.log('📐 Screen dimensions received:', this.screenDimensions);
        } catch (error) {
            console.error('❌ Error getting screen dimensions:', error);
        }
    }

    async loadSavedConfig() {
        try {
            this.savedConfig = await ipcRenderer.invoke('load-config');
            console.log('📁 Loaded saved configuration:', this.savedConfig);
            
            // Apply saved files if they exist and are still valid
            if (this.savedConfig.lastStoreMappingFile) {
                this.storeMappingFile = this.savedConfig.lastStoreMappingFile;
                const fileName = this.savedConfig.lastStoreMappingFile.split(/[\\/]/).pop();
                this.elements.storeMappingFile.textContent = fileName;
                this.elements.storeMappingFile.classList.add('selected');
                this.log(`📁 Restored store mapping file: ${fileName}`, 'info');
            }
            
            if (this.savedConfig.lastItemListFile) {
                this.itemListFile = this.savedConfig.lastItemListFile;
                const fileName = this.savedConfig.lastItemListFile.split(/[\\/]/).pop();
                this.elements.itemListFile.textContent = fileName;
                this.elements.itemListFile.classList.add('selected');
                this.log(`📊 Restored item list file: ${fileName}`, 'info');
            }
            
            // Apply saved settings
            if (this.savedConfig.lastSettings) {
                const settings = this.savedConfig.lastSettings;
                this.elements.delayBetweenItems.value = settings.delayBetweenItems || 2000;
                this.elements.delayBetweenStores.value = settings.delayBetweenStores || 5000;
                this.elements.pageTimeout.value = settings.pageTimeout || 30000;
                this.elements.maxRetries.value = settings.maxRetries || 3;
                this.elements.headlessMode.checked = settings.headlessMode || false;
                this.elements.captureScreenshots.checked = settings.captureScreenshots || false;
                this.elements.skipExistingResults.checked = settings.skipExistingResults || false;
                this.elements.maxConcurrentAgents.value = settings.maxConcurrentAgents || 1;
                this.log('⚙️ Restored previous settings', 'info');
            }
            
            this.updateUI();
        } catch (error) {
            console.error('❌ Error loading saved configuration:', error);
            this.log('⚠️ Could not load previous configuration, using defaults', 'warning');
        }
    }

    initializeUI() {
        // Get DOM elements
        this.elements = {
            // File selection
            selectStoreMappingBtn: document.getElementById('selectStoreMappingBtn'),
            storeMappingFile: document.getElementById('storeMappingFile'),
            selectItemListBtn: document.getElementById('selectItemListBtn'),
            itemListFile: document.getElementById('itemListFile'),
            
            // Settings
            delayBetweenItems: document.getElementById('delayBetweenItems'),
            delayBetweenStores: document.getElementById('delayBetweenStores'),
            pageTimeout: document.getElementById('pageTimeout'),
            maxRetries: document.getElementById('maxRetries'),
            headlessMode: document.getElementById('headlessMode'),
            captureScreenshots: document.getElementById('captureScreenshots'),
            skipExistingResults: document.getElementById('skipExistingResults'),
            maxConcurrentAgents: document.getElementById('maxConcurrentAgents'),
            
            // Controls
            startScanBtn: document.getElementById('startScanBtn'),
            stopScanBtn: document.getElementById('stopScanBtn'),
            exportResultsBtn: document.getElementById('exportResultsBtn'),
            
            // Progress
            progressFill: document.getElementById('progressFill'),
            progressText: document.getElementById('progressText'),
            progressPercent: document.getElementById('progressPercent'),
            currentStore: document.getElementById('currentStore'),
            itemsProcessed: document.getElementById('itemsProcessed'),
            totalItems: document.getElementById('totalItems'),
            successRate: document.getElementById('successRate'),
            errorCount: document.getElementById('errorCount'),
            elapsedTime: document.getElementById('elapsedTime'),
            
            // Results
            resultsBody: document.getElementById('resultsBody'),
            
            // Log
            logOutput: document.getElementById('logOutput'),
            clearLogBtn: document.getElementById('clearLogBtn'),
            exportLogBtn: document.getElementById('exportLogBtn')
        };

        // Set headless mode to false by default for side-by-side viewing
        this.elements.headlessMode.checked = false;

        this.log('🚀 WFM Scanner App initialized', 'info');
        this.log('📐 Configured for side-by-side window display', 'info');
        this.updateUI();
    }

    setupEventListeners() {
        // File selection
        this.elements.selectStoreMappingBtn.addEventListener('click', () => {
            this.selectStoreMappingFile();
        });

        this.elements.selectItemListBtn.addEventListener('click', () => {
            this.selectItemListFile();
        });

        // Control buttons
        this.elements.startScanBtn.addEventListener('click', () => {
            this.startScan();
        });

        this.elements.stopScanBtn.addEventListener('click', () => {
            this.stopScan();
        });

        this.elements.exportResultsBtn.addEventListener('click', () => {
            this.exportResults();
        });

        // Log controls
        this.elements.clearLogBtn.addEventListener('click', () => {
            this.clearLog();
        });

        this.elements.exportLogBtn.addEventListener('click', () => {
            this.exportLog();
        });

        // Settings change validation
        const settingsInputs = [
            this.elements.delayBetweenItems,
            this.elements.delayBetweenStores,
            this.elements.pageTimeout,
            this.elements.maxRetries,
            this.elements.maxConcurrentAgents
        ];

        settingsInputs.forEach(input => {
            input.addEventListener('change', () => {
                this.validateSettings();
                this.saveCurrentSettings();
                this.updateUI();
            });
        });
        
        // Save settings when checkboxes change
        [this.elements.headlessMode, this.elements.captureScreenshots, this.elements.skipExistingResults].forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.saveCurrentSettings();
            });
        });

        // Headless mode warning
        this.elements.headlessMode.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.log('⚠️ Headless mode enabled - Playwright window will not be visible', 'warning');
            } else {
                this.log('👁️ Headless mode disabled - Playwright window will appear side-by-side', 'info');
            }
        });

        // File selection change
        [this.elements.storeMappingFile, this.elements.itemListFile].forEach(element => {
            const observer = new MutationObserver(() => {
                this.updateUI();
            });
            observer.observe(element, { childList: true, subtree: true });
        });
    }

    setupIpcListeners() {
        // Scan progress updates
        ipcRenderer.on('scan-progress', (event, progress) => {
            this.updateProgress(progress);
        });

        // Scan result updates
        ipcRenderer.on('scan-result', (event, result) => {
            this.addResult(result);
        });
    }

    async selectStoreMappingFile() {
        try {
            const filePath = await ipcRenderer.invoke('select-store-mapping-file');
            if (filePath) {
                this.storeMappingFile = filePath;
                const fileName = filePath.split(/[\\/]/).pop();
                this.elements.storeMappingFile.textContent = fileName;
                this.elements.storeMappingFile.classList.add('selected');
                this.log(`📁 Store mapping file selected: ${fileName}`, 'success');
                this.updateUI();
            }
        } catch (error) {
            this.log(`❌ Error selecting store mapping file: ${error.message}`, 'error');
        }
    }

    async selectItemListFile() {
        try {
            const filePath = await ipcRenderer.invoke('select-item-list-file');
            if (filePath) {
                this.itemListFile = filePath;
                const fileName = filePath.split(/[\\/]/).pop();
                this.elements.itemListFile.textContent = fileName;
                this.elements.itemListFile.classList.add('selected');
                this.log(`📊 Item list file selected: ${fileName}`, 'success');
                this.updateUI();
            }
        } catch (error) {
            this.log(`❌ Error selecting item list file: ${error.message}`, 'error');
        }
    }

    validateSettings() {
        const settings = this.getSettings();
        let isValid = true;
        const errors = [];

        if (settings.delayBetweenItems < 500) {
            errors.push('Delay between items must be at least 500ms');
            isValid = false;
        }

        if (settings.delayBetweenStores < 1000) {
            errors.push('Delay between stores must be at least 1000ms');
            isValid = false;
        }

        if (settings.pageTimeout < 5000) {
            errors.push('Page timeout must be at least 5000ms');
            isValid = false;
        }

        if (settings.maxRetries < 1) {
            errors.push('Max retries must be at least 1');
            isValid = false;
        }

        if (!isValid) {
            errors.forEach(error => this.log(`⚠️ ${error}`, 'warning'));
        }

        return isValid;
    }

    async saveCurrentSettings() {
        try {
            if (!this.savedConfig) {
                this.savedConfig = await ipcRenderer.invoke('load-config');
            }
            
            this.savedConfig.lastSettings = this.getSettings();
            await ipcRenderer.invoke('save-config', this.savedConfig);
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    getSettings() {
        return {
            delayBetweenItems: parseInt(this.elements.delayBetweenItems.value),
            delayBetweenStores: parseInt(this.elements.delayBetweenStores.value),
            pageTimeout: parseInt(this.elements.pageTimeout.value),
            maxRetries: parseInt(this.elements.maxRetries.value),
            headlessMode: this.elements.headlessMode.checked,
            captureScreenshots: this.elements.captureScreenshots.checked,
            skipExistingResults: this.elements.skipExistingResults.checked,
            maxConcurrentAgents: parseInt(this.elements.maxConcurrentAgents.value)
        };
    }

    async startScan() {
        try {
            if (!this.storeMappingFile || !this.itemListFile) {
                this.log('❌ Please select both store mapping and item list files', 'error');
                return;
            }

            if (!this.validateSettings()) {
                this.log('❌ Please fix settings validation errors', 'error');
                return;
            }

            const config = {
                storeMappingFile: this.storeMappingFile,
                itemListFile: this.itemListFile,
                settings: this.getSettings()
            };

            // Log window positioning info
            if (!config.settings.headlessMode && this.screenDimensions) {
                this.log(`📐 Playwright window will appear at position (${this.screenDimensions.playwrightX}, ${this.screenDimensions.playwrightY})`, 'info');
                this.log(`📐 Playwright window size: ${this.screenDimensions.playwrightWidth}x${this.screenDimensions.playwrightHeight}`, 'info');
            }

            this.log('🚀 Starting scan...', 'info');
            
            // Add guidance for manual store selection if needed
            if (!config.settings.headlessMode) {
                this.log('💡 If no CSRF token is found, you may need to manually select a store in the browser window', 'info');
                this.log('👆 Watch for the browser window to appear and follow any prompts for manual store selection', 'info');
            }
            
            this.isScanning = true;
            this.scanStartTime = Date.now();
            this.startElapsedTimer();
            this.updateUI();

            const result = await ipcRenderer.invoke('start-scan', config);
            
            if (result.success) {
                this.log(`✅ Scan completed successfully! Processed ${result.totalResults} items`, 'success');
            } else {
                this.log(`❌ Scan failed: ${result.error}`, 'error');
            }

        } catch (error) {
            this.log(`❌ Error starting scan: ${error.message}`, 'error');
        } finally {
            this.isScanning = false;
            this.stopElapsedTimer();
            this.updateUI();
        }
    }

    async stopScan() {
        try {
            this.log('🛑 Stopping scan...', 'info');
            const result = await ipcRenderer.invoke('stop-scan');
            
            if (result.success) {
                this.log('✅ Scan stopped successfully', 'success');
            } else {
                this.log(`❌ Error stopping scan: ${result.error}`, 'error');
            }

        } catch (error) {
            this.log(`❌ Error stopping scan: ${error.message}`, 'error');
        } finally {
            this.isScanning = false;
            this.stopElapsedTimer();
            this.updateUI();
        }
    }

    async exportResults() {
        try {
            if (this.scanResults.length === 0) {
                this.log('❌ No results to export', 'error');
                return;
            }

            const exportPath = await ipcRenderer.invoke('select-export-location');
            if (!exportPath) return;

            this.log('📤 Exporting results...', 'info');
            const result = await ipcRenderer.invoke('export-results', exportPath);
            
            if (result.success) {
                this.log(`✅ Results exported to: ${result.filePath}`, 'success');
            } else {
                this.log(`❌ Export failed: ${result.error}`, 'error');
            }

        } catch (error) {
            this.log(`❌ Error exporting results: ${error.message}`, 'error');
        }
    }

    updateProgress(progress) {
        const { currentStore, itemsProcessed, totalItems, successCount, errorCount } = progress;
        
        // Update progress bar
        const percentage = totalItems > 0 ? Math.round((itemsProcessed / totalItems) * 100) : 0;
        this.elements.progressFill.style.width = `${percentage}%`;
        this.elements.progressPercent.textContent = `${percentage}%`;
        
        // Update progress text
        this.elements.progressText.textContent = `Processing ${currentStore || 'Unknown Store'}...`;
        
        // Update stats
        this.elements.currentStore.textContent = currentStore || '-';
        this.elements.itemsProcessed.textContent = itemsProcessed.toLocaleString();
        this.elements.totalItems.textContent = totalItems.toLocaleString();
        this.elements.errorCount.textContent = errorCount.toLocaleString();
        
        // Update success rate
        const successRate = itemsProcessed > 0 ? Math.round((successCount / itemsProcessed) * 100) : 0;
        this.elements.successRate.textContent = `${successRate}%`;
    }

    addResult(result) {
        this.scanResults.push(result);
        
        // Make scanResults available globally for export
        if (typeof window !== 'undefined') {
            window.scannerUI = this;
        }
        
        // Initialize virtual scroll if not already done
        if (!this.virtualScrollContainer) {
            this.initializeVirtualScroll();
        }
        
        // Update virtual scroll display efficiently
        this.updateVirtualScrollIncremental();
        
        // Only show recent results in UI for performance (but keep all in scanResults)
        const maxDisplayResults = 500; // Increased from 100 to 500
        
        // Add to results table with enhanced data
        const resultRow = document.createElement('div');
        resultRow.className = `result-row ${result.success ? 'success' : 'error'} new`;
        
        // Enhanced result display with new data fields including variations and bundle data
        const extractedName = result.extractedName && result.extractedName !== 'N/A' ? result.extractedName : '-';
        const price = result.price && result.price !== 'N/A' ? result.price : '-';
        const nutrition = result.hasNutritionFacts ? '✅' : '❌';
        const ingredients = result.hasIngredients ? '✅' : '❌';
        const addToCart = result.hasAddToCart ? '✅' : '❌';
        const available = result.isAvailable ? '✅ Available' : '❌ Unavailable';
        const variations = result.variationCount || 0;
        const isBundle = result.isBundle ? '✅ Bundle' : '❌ Single';
        const bundleParts = result.bundlePartsCount || 0;
        
        resultRow.innerHTML = `
            <span class="store-cell">${result.store}</span>
            <span class="asin-cell">${result.asin}</span>
            <span class="name-cell" title="${result.name}">${result.name}</span>
            <span class="extracted-name-cell" title="${extractedName}">${extractedName}</span>
            <span class="price-cell">${price}</span>
            <span class="nutrition-cell">${nutrition}</span>
            <span class="ingredients-cell">${ingredients}</span>
            <span class="cart-cell">${addToCart}</span>
            <span class="availability-cell ${result.isAvailable ? 'available' : 'unavailable'}">${available}</span>
            <span class="variations-cell">${variations}</span>
            <span class="bundle-cell">${isBundle}</span>
            <span class="bundle-parts-cell">${bundleParts}</span>
            <span class="status-cell">${result.success ? '✅ Success' : '❌ Error'}</span>
            <span class="time-cell">${result.loadTime || '-'}ms</span>
            <span class="timestamp-cell">${new Date(result.timestamp).toLocaleTimeString()}</span>
        `;
        
        // Remove "no results" message if it exists
        const noResults = this.elements.resultsBody.querySelector('.no-results');
        if (noResults) {
            noResults.remove();
        }
        
        // Add new result at the top
        this.elements.resultsBody.insertBefore(resultRow, this.elements.resultsBody.firstChild);
        
        // Limit displayed results for performance (but keep all data in scanResults)
        const rows = this.elements.resultsBody.querySelectorAll('.result-row');
        if (rows.length > maxDisplayResults) {
            // Remove oldest displayed results (but keep all data in scanResults array)
            for (let i = maxDisplayResults; i < rows.length; i++) {
                rows[i].remove();
            }
        }
        
        // Enhanced logging with new data including bundle information
        const status = result.success ? '✅' : '❌';
        let message = `${status} ${result.store} - ${result.asin} ${result.success ? 'loaded' : 'failed'}`;
        
        if (result.success && result.extractedName && result.extractedName !== 'N/A') {
            message += ` | Name: "${result.extractedName}"`;
        }
        if (result.success && result.price && result.price !== 'N/A') {
            message += ` | Price: ${result.price}`;
        }
        if (result.success) {
            const features = [];
            if (result.hasNutritionFacts) features.push('Nutrition');
            if (result.hasIngredients) features.push('Ingredients');
            if (result.hasAddToCart) features.push('AddToCart');
            if (result.isBundle) features.push(`Bundle(${result.bundlePartsCount || 0} parts)`);
            if (result.variationCount > 0) features.push(`${result.variationCount} variations`);
            if (features.length > 0) {
                message += ` | Features: ${features.join(', ')}`;
            }
        }
        
        // Log with total count information
        this.log(`${message} | Total Results: ${this.scanResults.length}`, result.success ? 'success' : 'error');
        
        this.updateUI();
    }

    initializeVirtualScroll() {
        // Virtual scroll implementation for handling large result sets
        this.virtualScrollContainer = {
            itemHeight: 40, // Height of each result row
            visibleItems: Math.ceil(window.innerHeight / 40),
            scrollTop: 0,
            totalItems: 0
        };
        
        console.log('📊 Virtual scroll initialized for large result sets');
    }

    updateVirtualScrollIncremental() {
        // Update virtual scroll when new results are added
        if (this.virtualScrollContainer) {
            this.virtualScrollContainer.totalItems = this.scanResults.length;
            
            // Only update display if we have a large number of results
            if (this.scanResults.length > 1000) {
                this.renderVirtualScrollItems();
            }
        }
    }

    renderVirtualScrollItems() {
        // Render only visible items for performance with large datasets
        const container = this.virtualScrollContainer;
        const startIndex = Math.floor(container.scrollTop / container.itemHeight);
        const endIndex = Math.min(startIndex + container.visibleItems + 5, this.scanResults.length);
        
        // Clear existing items
        this.elements.resultsBody.innerHTML = '';
        
        // Render visible items
        for (let i = startIndex; i < endIndex; i++) {
            const result = this.scanResults[i];
            if (result) {
                const resultRow = this.createResultRow(result);
                this.elements.resultsBody.appendChild(resultRow);
            }
        }
        
        console.log(`📊 Virtual scroll rendered items ${startIndex}-${endIndex} of ${this.scanResults.length}`);
    }

    createResultRow(result) {
        const resultRow = document.createElement('div');
        resultRow.className = `result-row ${result.success ? 'success' : 'error'}`;
        
        const extractedName = result.extractedName && result.extractedName !== 'N/A' ? result.extractedName : '-';
        const price = result.price && result.price !== 'N/A' ? result.price : '-';
        const nutrition = result.hasNutritionFacts ? '✅' : '❌';
        const ingredients = result.hasIngredients ? '✅' : '❌';
        const addToCart = result.hasAddToCart ? '✅' : '❌';
        const available = result.isAvailable ? '✅ Available' : '❌ Unavailable';
        const variations = result.variationCount || 0;
        const isBundle = result.isBundle ? '✅ Bundle' : '❌ Single';
        const bundleParts = result.bundlePartsCount || 0;
        
        resultRow.innerHTML = `
            <span class="store-cell">${result.store}</span>
            <span class="asin-cell">${result.asin}</span>
            <span class="name-cell" title="${result.name}">${result.name}</span>
            <span class="extracted-name-cell" title="${extractedName}">${extractedName}</span>
            <span class="price-cell">${price}</span>
            <span class="nutrition-cell">${nutrition}</span>
            <span class="ingredients-cell">${ingredients}</span>
            <span class="cart-cell">${addToCart}</span>
            <span class="availability-cell ${result.isAvailable ? 'available' : 'unavailable'}">${available}</span>
            <span class="variations-cell">${variations}</span>
            <span class="bundle-cell">${isBundle}</span>
            <span class="bundle-parts-cell">${bundleParts}</span>
            <span class="status-cell">${result.success ? '✅ Success' : '❌ Error'}</span>
            <span class="time-cell">${result.loadTime || '-'}ms</span>
            <span class="timestamp-cell">${new Date(result.timestamp).toLocaleTimeString()}</span>
        `;
        
        return resultRow;
    }

    startElapsedTimer() {
        this.elapsedTimeInterval = setInterval(() => {
            if (this.scanStartTime) {
                const elapsed = Date.now() - this.scanStartTime;
                const hours = Math.floor(elapsed / 3600000);
                const minutes = Math.floor((elapsed % 3600000) / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                
                const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                this.elements.elapsedTime.textContent = timeString;
            }
        }, 1000);
    }

    stopElapsedTimer() {
        if (this.elapsedTimeInterval) {
            clearInterval(this.elapsedTimeInterval);
            this.elapsedTimeInterval = null;
        }
    }

    updateUI() {
        const hasFiles = this.storeMappingFile && this.itemListFile;
        const hasResults = this.scanResults.length > 0;
        
        // Enable/disable buttons based on state
        this.elements.startScanBtn.disabled = this.isScanning || !hasFiles;
        this.elements.stopScanBtn.disabled = !this.isScanning;
        this.elements.exportResultsBtn.disabled = !hasResults || this.isScanning;
        
        // Update button text based on state
        if (this.isScanning) {
            this.elements.startScanBtn.textContent = '🔄 Scanning...';
        } else {
            this.elements.startScanBtn.textContent = '🚀 Start Scan';
        }
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
            timestamp,
            message,
            type
        };
        
        this.logMessages.push(logEntry);
        
        // Create log element
        const logElement = document.createElement('div');
        logElement.className = `log-${type}`;
        logElement.textContent = `[${timestamp}] ${message}`;
        
        // Add to log output
        this.elements.logOutput.appendChild(logElement);
        
        // Auto-scroll to bottom
        this.elements.logOutput.scrollTop = this.elements.logOutput.scrollHeight;
        
        // Limit log entries to last 1000
        const logEntries = this.elements.logOutput.children;
        if (logEntries.length > 1000) {
            this.elements.logOutput.removeChild(logEntries[0]);
            this.logMessages.shift();
        }
        
        // Also log to console
        console.log(`[WFM Scanner] ${message}`);
    }

    clearLog() {
        this.elements.logOutput.innerHTML = '';
        this.logMessages = [];
        this.log('📝 Log cleared', 'info');
    }

    async exportLog() {
        try {
            const logContent = this.logMessages
                .map(entry => `[${entry.timestamp}] ${entry.message}`)
                .join('\n');
            
            const blob = new Blob([logContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `WFM_Scanner_Log_${new Date().toISOString().split('T')[0]}.txt`;
            a.click();
            
            URL.revokeObjectURL(url);
            this.log('📤 Log exported successfully', 'success');
            
        } catch (error) {
            this.log(`❌ Error exporting log: ${error.message}`, 'error');
        }
    }
}

// Initialize the UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WFMScannerUI();
});