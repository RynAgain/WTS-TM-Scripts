// ==UserScript==
// @name         WTS Data Exporter Module
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  ASIN data extraction and CSV export functionality for WTS
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
    let lastExtractedData = [];
    let isInitialized = false;
    
    // Private functions
    function extractDataFromCards() {
        WTS.shared.logger.log('DataExporter', 'extractDataFromCards', 'Starting ASIN card extraction');
        
        const cards = WTS.shared.utils.querySelectorAll('[data-csa-c-type="item"][data-csa-c-item-type="asin"]');
        const emptyCards = WTS.shared.utils.querySelectorAll('li.a-carousel-card.a-carousel-card-empty');
        const data = [];

        WTS.shared.logger.debug('DataExporter', 'extractDataFromCards', `Found ${cards.length} ASIN cards and ${emptyCards.length} empty cards`);

        cards.forEach((card, index) => {
            try {
                const asin = card.getAttribute('data-csa-c-item-id') || '';
                const nameElement = card.querySelector('.a-truncate-full') || card.querySelector('.a-truncate-cut');
                const section = card.closest('[data-cel-widget]')?.getAttribute('data-cel-widget') || 'Unknown';
                const name = nameElement?.textContent?.trim() || '[No Name]';

                // Additional data extraction
                const priceElement = card.querySelector('.a-price-whole, .a-price .a-offscreen');
                const price = priceElement?.textContent?.trim() || '';
                
                const imageElement = card.querySelector('img');
                const imageUrl = imageElement?.src || '';
                
                const linkElement = card.querySelector('a[href]');
                const productUrl = linkElement?.href || '';

                const cardData = {
                    ASIN: asin,
                    Name: name,
                    Section: section,
                    Price: price,
                    ImageUrl: imageUrl,
                    ProductUrl: productUrl,
                    ExtractedAt: new Date().toISOString()
                };

                data.push(cardData);
                
                WTS.shared.logger.debug('DataExporter', 'extractDataFromCards', `Extracted card ${index + 1}: ${asin} - ${name}`);
            } catch (error) {
                WTS.shared.logger.error('DataExporter', 'extractDataFromCards', `Error extracting card ${index + 1}: ${error.message}`);
            }
        });

        const result = {
            data: data,
            emptyCount: emptyCards.length,
            totalCards: cards.length,
            timestamp: Date.now()
        };
        
        // Update shared state
        WTS.shared.state.export.lastExtracted = data;
        WTS.shared.state.export.lastCount = data.length;
        
        // Save to storage
        WTS.shared.storage.set(WTS.shared.storage.keys.LAST_EXPORT_DATA, result);
        
        WTS.shared.logger.log('DataExporter', 'extractDataFromCards', `Extraction complete: ${data.length} items, ${emptyCards.length} empty cards`);
        
        // Emit event for other modules
        WTS.shared.events.emit('dataExtracted', result);
        
        return result;
    }
    
    function generateCSV(rows, options = {}) {
        WTS.shared.logger.log('DataExporter', 'generateCSV', `Generating CSV for ${rows.length} rows`);
        
        if (!rows || rows.length === 0) {
            throw new Error('No data provided for CSV generation');
        }
        
        // Default options
        const defaultOptions = {
            includeHeaders: true,
            delimiter: ',',
            quote: '"',
            escape: '""',
            includeExtendedData: false
        };
        
        const config = { ...defaultOptions, ...options };
        
        // Determine headers based on options
        let headers;
        if (config.includeExtendedData) {
            headers = ['ASIN', 'Name', 'Section', 'Price', 'ImageUrl', 'ProductUrl', 'ExtractedAt'];
        } else {
            headers = ['ASIN', 'Name', 'Section'];
        }
        
        const csvRows = [];
        
        // Add headers if requested
        if (config.includeHeaders) {
            csvRows.push(headers.join(config.delimiter));
        }
        
        // Process data rows
        rows.forEach((row, index) => {
            try {
                const csvRow = headers.map(header => {
                    let value = row[header] || '';
                    
                    // Convert to string and handle special characters
                    value = String(value);
                    
                    // Escape quotes
                    if (value.includes(config.quote)) {
                        value = value.replace(new RegExp(config.quote, 'g'), config.escape);
                    }
                    
                    // Quote if contains delimiter, quote, or newline
                    if (value.includes(config.delimiter) || value.includes(config.quote) || value.includes('\n') || value.includes('\r')) {
                        value = config.quote + value + config.quote;
                    }
                    
                    return value;
                });
                
                csvRows.push(csvRow.join(config.delimiter));
            } catch (error) {
                WTS.shared.logger.error('DataExporter', 'generateCSV', `Error processing row ${index + 1}: ${error.message}`);
            }
        });
        
        const csvContent = csvRows.join('\n');
        WTS.shared.logger.log('DataExporter', 'generateCSV', `CSV generated successfully: ${csvRows.length} rows`);
        
        return csvContent;
    }
    
    function downloadCSV(rows, filename = null, options = {}) {
        WTS.shared.logger.log('DataExporter', 'downloadCSV', `Starting CSV download for ${rows.length} rows`);
        
        try {
            const csvContent = generateCSV(rows, options);
            
            // Generate filename if not provided
            if (!filename) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const storeInfo = WTS.shared.state.stores.currentStore;
                const storeCode = storeInfo ? `_${storeInfo.code}` : '';
                filename = `wholefoods_items${storeCode}_${timestamp}.csv`;
            }
            
            // Create and trigger download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            
            const downloadLink = WTS.shared.utils.createElement('a', {
                href: url,
                download: filename
            }, {
                display: 'none'
            });
            
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            // Clean up the URL object
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            
            WTS.shared.logger.log('DataExporter', 'downloadCSV', `CSV download initiated: ${filename}`);
            
            // Emit event
            WTS.shared.events.emit('csvDownloaded', {
                filename: filename,
                rowCount: rows.length,
                timestamp: Date.now()
            });
            
            return {
                success: true,
                filename: filename,
                rowCount: rows.length,
                size: blob.size
            };
            
        } catch (error) {
            WTS.shared.logger.error('DataExporter', 'downloadCSV', `Download failed: ${error.message}`);
            throw error;
        }
    }
    
    function validateData(data) {
        if (!Array.isArray(data)) {
            return { valid: false, error: 'Data must be an array' };
        }
        
        if (data.length === 0) {
            return { valid: false, error: 'Data array is empty' };
        }
        
        const requiredFields = ['ASIN', 'Name', 'Section'];
        const missingFields = [];
        
        // Check first item for required fields
        const firstItem = data[0];
        requiredFields.forEach(field => {
            if (!(field in firstItem)) {
                missingFields.push(field);
            }
        });
        
        if (missingFields.length > 0) {
            return {
                valid: false,
                error: `Missing required fields: ${missingFields.join(', ')}`
            };
        }
        
        // Count items with valid ASINs
        const validItems = data.filter(item => item.ASIN && item.ASIN.trim() !== '');
        
        return {
            valid: true,
            totalItems: data.length,
            validItems: validItems.length,
            invalidItems: data.length - validItems.length
        };
    }
    
    function refreshData() {
        WTS.shared.logger.log('DataExporter', 'refreshData', 'Refreshing ASIN data');
        
        // Clear previous data
        lastExtractedData = [];
        WTS.shared.state.export.lastExtracted = [];
        WTS.shared.state.export.lastCount = 0;
        
        // Extract fresh data
        const result = extractDataFromCards();
        lastExtractedData = result.data;
        
        WTS.shared.logger.log('DataExporter', 'refreshData', `Data refreshed: ${result.data.length} items found`);
        
        // Emit refresh event
        WTS.shared.events.emit('dataRefreshed', result);
        
        return result;
    }
    
    function getDataSummary() {
        const data = lastExtractedData.length > 0 ? lastExtractedData : WTS.shared.state.export.lastExtracted;
        
        if (!data || data.length === 0) {
            return {
                totalItems: 0,
                sections: {},
                hasData: false
            };
        }
        
        // Group by section
        const sections = {};
        data.forEach(item => {
            const section = item.Section || 'Unknown';
            if (!sections[section]) {
                sections[section] = 0;
            }
            sections[section]++;
        });
        
        return {
            totalItems: data.length,
            sections: sections,
            hasData: true,
            lastExtracted: data[0]?.ExtractedAt || null
        };
    }
    
    function exportToJSON(data = null, filename = null) {
        const exportData = data || lastExtractedData;
        
        if (!exportData || exportData.length === 0) {
            throw new Error('No data available for JSON export');
        }
        
        WTS.shared.logger.log('DataExporter', 'exportToJSON', `Exporting ${exportData.length} items to JSON`);
        
        // Generate filename if not provided
        if (!filename) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const storeInfo = WTS.shared.state.stores.currentStore;
            const storeCode = storeInfo ? `_${storeInfo.code}` : '';
            filename = `wholefoods_items${storeCode}_${timestamp}.json`;
        }
        
        const jsonContent = JSON.stringify({
            metadata: {
                exportedAt: new Date().toISOString(),
                itemCount: exportData.length,
                store: WTS.shared.state.stores.currentStore,
                version: WTS.shared.config.version
            },
            items: exportData
        }, null, 2);
        
        // Create and trigger download
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const downloadLink = WTS.shared.utils.createElement('a', {
            href: url,
            download: filename
        }, {
            display: 'none'
        });
        
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        // Clean up the URL object
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        WTS.shared.logger.log('DataExporter', 'exportToJSON', `JSON export completed: ${filename}`);
        
        return {
            success: true,
            filename: filename,
            itemCount: exportData.length,
            size: blob.size
        };
    }
    
    // Public API
    WTS.modules.DataExporter = {
        // Extract data from current page
        extractData: function() {
            const result = extractDataFromCards();
            lastExtractedData = result.data;
            return result;
        },
        
        // Generate CSV content
        generateCSV: function(data = null, options = {}) {
            const exportData = data || lastExtractedData;
            return generateCSV(exportData, options);
        },
        
        // Download CSV file
        downloadCSV: function(data = null, filename = null, options = {}) {
            const exportData = data || lastExtractedData;
            return downloadCSV(exportData, filename, options);
        },
        
        // Download JSON file
        downloadJSON: function(data = null, filename = null) {
            const exportData = data || lastExtractedData;
            return exportToJSON(exportData, filename);
        },
        
        // Refresh data from page
        refreshData: function() {
            return refreshData();
        },
        
        // Get last extracted data
        getLastExtracted: function() {
            return [...lastExtractedData];
        },
        
        // Get data summary
        getSummary: function() {
            return getDataSummary();
        },
        
        // Validate data structure
        validateData: function(data) {
            return validateData(data);
        },
        
        // Clear stored data
        clearData: function() {
            lastExtractedData = [];
            WTS.shared.state.export.lastExtracted = [];
            WTS.shared.state.export.lastCount = 0;
            WTS.shared.storage.delete(WTS.shared.storage.keys.LAST_EXPORT_DATA);
            
            WTS.shared.logger.log('DataExporter', 'clearData', 'All extracted data cleared');
            WTS.shared.events.emit('dataCleared');
        },
        
        // Get current data count
        getDataCount: function() {
            return lastExtractedData.length;
        },
        
        // Check if data is available
        hasData: function() {
            return lastExtractedData.length > 0;
        },
        
        // Filter data by criteria
        filterData: function(criteria) {
            if (!lastExtractedData || lastExtractedData.length === 0) {
                return [];
            }
            
            return lastExtractedData.filter(item => {
                for (const [key, value] of Object.entries(criteria)) {
                    if (typeof value === 'string') {
                        if (!item[key] || !item[key].toLowerCase().includes(value.toLowerCase())) {
                            return false;
                        }
                    } else if (typeof value === 'function') {
                        if (!value(item[key], item)) {
                            return false;
                        }
                    } else {
                        if (item[key] !== value) {
                            return false;
                        }
                    }
                }
                return true;
            });
        },
        
        // Get unique sections
        getSections: function() {
            if (!lastExtractedData || lastExtractedData.length === 0) {
                return [];
            }
            
            const sections = new Set();
            lastExtractedData.forEach(item => {
                if (item.Section) {
                    sections.add(item.Section);
                }
            });
            
            return Array.from(sections).sort();
        }
    };
    
    // Module initialization
    WTS.modules.DataExporter.init = function() {
        if (isInitialized) {
            WTS.shared.logger.warn('DataExporter', 'init', 'Module already initialized');
            return;
        }
        
        WTS.shared.logger.log('DataExporter', 'init', 'Initializing Data Exporter module');
        
        // Load last extracted data from storage if available
        const storedData = WTS.shared.storage.get(WTS.shared.storage.keys.LAST_EXPORT_DATA, null);
        if (storedData && storedData.data && Array.isArray(storedData.data)) {
            lastExtractedData = storedData.data;
            WTS.shared.state.export.lastExtracted = storedData.data;
            WTS.shared.state.export.lastCount = storedData.data.length;
            
            WTS.shared.logger.log('DataExporter', 'init', `Loaded ${storedData.data.length} items from storage`);
        }
        
        isInitialized = true;
        WTS.shared.logger.log('DataExporter', 'init', 'Data Exporter module initialized successfully');
        WTS.shared.events.emit('dataExporterReady');
    };
    
    // Auto-initialize when shared utilities are ready
    if (WTS.shared && WTS.shared.logger) {
        WTS.modules.DataExporter.init();
    } else {
        WTS.shared.events.on('sharedReady', WTS.modules.DataExporter.init);
    }
    
    WTS.shared.logger.log('DataExporter', 'load', 'Data Exporter module loaded successfully');
})();