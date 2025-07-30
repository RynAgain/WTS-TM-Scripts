// ==UserScript==
// @name         WTS Data Extractor
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Data extraction and CSV functionality for WTS scripts
// @author       WTS-TM-Scripts
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Data Extraction Module
    window.WTSDataExtractor = {
        
        // Extract data from visible cards on the page
        extractDataFromCards() {
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
        },

        // Download data as CSV file
        downloadCSV(rows) {
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
        },

        // Parse CSV content for store mapping
        parseCSV(csvText) {
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
        },

        // Get current card count for display
        getCurrentCardCount() {
            const { data, emptyCount } = this.extractDataFromCards();
            return {
                visibleCount: data.length,
                emptyCount: emptyCount,
                data: data
            };
        }
    };

})();