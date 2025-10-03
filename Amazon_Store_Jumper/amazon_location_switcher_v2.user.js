// ==UserScript==
// @name         Amazon Location Switcher v2
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Switch between Amazon/Whole Foods locations using uploaded store map
// @author       You
// @match        https://www.amazon.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// ==/UserScript==

(function() {
    'use strict';

    // Storage for our store map and CSRF token
    let storeMap = GM_getValue('store_map', {});
    let csrfToken = GM_getValue('csrf_token', '');

    // Function to parse CSV
    function parseCSV(text) {
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const stores = {};

        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;

            const values = lines[i].split(',').map(v => v.trim());
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });

            // Extract TLC (remove first character from store_acronym)
            const tlc = row.store_acronym ? row.store_acronym.substring(1) : '';
            const pickupAddressId = row.pickup_address_id;

            if (tlc && pickupAddressId) {
                stores[tlc] = {
                    tlc: tlc,
                    destinationId: pickupAddressId,
                    storeName: row.store_name || '',
                    city: row.city || '',
                    state: row.state || '',
                    storeCode: row.store_code || '',
                    regionId: row.region_id || '',
                    isActive: row.is_active === 'true' || row.is_active === '1'
                };
            }
        }

        return stores;
    }

    // Function to parse XLSX
    function parseXLSX(data) {
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);
        const stores = {};

        jsonData.forEach(row => {
            // Extract TLC (remove first character from store_acronym)
            const tlc = row.store_acronym ? row.store_acronym.substring(1) : '';
            const pickupAddressId = row.pickup_address_id;

            if (tlc && pickupAddressId) {
                stores[tlc] = {
                    tlc: tlc,
                    destinationId: pickupAddressId,
                    storeName: row.store_name || '',
                    city: row.city || '',
                    state: row.state || '',
                    storeCode: row.store_code || '',
                    regionId: row.region_id || '',
                    isActive: row.is_active === 'true' || row.is_active === '1'
                };
            }
        });

        return stores;
    }

    // Function to update CSRF token
    function updateCSRFToken() {
        const token = document.querySelector('input[name="anti-csrftoken-a2z"]')?.value ||
                     document.getElementById('anti-csrftoken-a2z')?.value || '';
        
        if (token && token !== csrfToken) {
            csrfToken = token;
            GM_setValue('csrf_token', token);
            console.log('CSRF token updated');
        }
    }

    // Periodically check for CSRF token updates
    setInterval(updateCSRFToken, 5000);

    // Function to change location
    function changeLocation(tlc) {
        const store = storeMap[tlc];
        if (!store) {
            console.error('Store not found:', tlc);
            return;
        }

        updateCSRFToken(); // Get latest token before switching

        const destinationId = store.destinationId;
        const regionId = store.regionId || '';

        console.log('Attempting to switch to:', {
            tlc: tlc,
            destinationId: destinationId,
            regionId: regionId,
            csrfToken: csrfToken ? 'Present' : 'Missing'
        });

        // Try without regionId first, as it may not be required
        const requestBody = `brandId=aNHVc2Akvg&client=glow&newLocation=${encodeURIComponent(JSON.stringify({
            "destinationId": destinationId,
            "geocode": {}
        }))}&newAddressId=${destinationId}&anti-csrftoken-a2z=${encodeURIComponent(csrfToken)}`;

        console.log('Request body (without regionId):', requestBody);

        fetch("https://www.amazon.com/afx/cartconflicts/resolve", {
            method: "POST",
            credentials: "include",
            headers: {
                "accept": "text/html,*/*",
                "accept-language": "en-US,en;q=0.9",
                "content-type": "application/x-www-form-urlencoded",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "x-requested-with": "XMLHttpRequest",
                "anti-csrftoken-a2z": csrfToken
            },
            referrer: window.location.href,
            body: requestBody
        })
        .then(response => {
            console.log('Response status:', response.status);
            console.log('Response ok:', response.ok);
            if(response.ok) {
                console.log('Location change successful to:', tlc);
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            } else {
                console.error('Failed to switch location. Status:', response.status);
                response.text().then(text => {
                    console.error('Error response:', text);
                    // If it failed without regionId, try with regionId
                    if (regionId) {
                        console.log('Retrying with regionId...');
                        retryWithRegionId(tlc, destinationId, regionId);
                    } else {
                        alert(`Failed to switch location. Status: ${response.status}\nCheck console for details.`);
                    }
                });
            }
        })
        .catch(error => {
            console.error('Error switching location:', error);
            alert(`Error switching location: ${error.message}`);
        });
    }

    function retryWithRegionId(tlc, destinationId, regionId) {
        updateCSRFToken();
        
        const requestBody = `brandId=aNHVc2Akvg&client=glow&newLocation=${encodeURIComponent(JSON.stringify({
            "destinationId": destinationId,
            "geocode": {}
        }))}&newRegionId=${regionId}&newAddressId=${destinationId}&anti-csrftoken-a2z=${encodeURIComponent(csrfToken)}`;

        console.log('Retry request body (with regionId):', requestBody);

        fetch("https://www.amazon.com/afx/cartconflicts/resolve", {
            method: "POST",
            credentials: "include",
            headers: {
                "accept": "text/html,*/*",
                "accept-language": "en-US,en;q=0.9",
                "content-type": "application/x-www-form-urlencoded",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin",
                "x-requested-with": "XMLHttpRequest",
                "anti-csrftoken-a2z": csrfToken
            },
            referrer: window.location.href,
            body: requestBody
        })
        .then(response => {
            console.log('Retry response status:', response.status);
            if(response.ok) {
                console.log('Location change successful with regionId to:', tlc);
                setTimeout(() => {
                    window.location.reload();
                }, 500);
            } else {
                console.error('Failed to switch location even with regionId. Status:', response.status);
                response.text().then(text => {
                    console.error('Error response:', text);
                    alert(`Failed to switch location. Status: ${response.status}\nCheck console for details.`);
                });
            }
        })
        .catch(error => {
            console.error('Error on retry:', error);
            alert(`Error switching location: ${error.message}`);
        });
    }

    // Add UI once DOM is ready
    window.addEventListener('load', function() {
        updateCSRFToken(); // Initial token capture

        GM_addStyle(`
            #location-switcher {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
                font-family: Arial, sans-serif;
            }

            #location-toggle {
                background: #232f3e;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 20px;
                cursor: pointer;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            }

            #location-toggle:hover {
                background: #37475a;
            }

            #location-panel {
                position: fixed;
                bottom: 70px;
                right: 20px;
                width: 350px;
                max-height: 500px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                overflow: hidden;
                display: none;
            }

            #location-header {
                background: #232f3e;
                color: white;
                padding: 15px;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            #upload-section {
                padding: 15px;
                border-bottom: 2px solid #eee;
                background: #f9f9f9;
            }

            #file-input {
                display: none;
            }

            #upload-button {
                background: #febd69;
                border: none;
                padding: 8px 15px;
                border-radius: 3px;
                cursor: pointer;
                width: 100%;
                font-weight: bold;
            }

            #upload-button:hover {
                background: #f3a847;
            }

            #store-count {
                font-size: 0.9em;
                color: #666;
                margin-top: 8px;
                text-align: center;
            }

            #search-box {
                width: calc(100% - 20px);
                padding: 8px;
                margin: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
            }

            #location-list {
                max-height: 300px;
                overflow-y: auto;
                padding: 10px;
            }

            .location-item {
                padding: 10px;
                border-bottom: 1px solid #eee;
                cursor: pointer;
                transition: background 0.2s;
            }

            .location-item:hover {
                background: #f5f5f5;
            }

            .location-tlc {
                font-weight: bold;
                font-size: 1.1em;
                color: #232f3e;
                margin-bottom: 3px;
            }

            .location-details {
                font-size: 0.85em;
                color: #666;
            }

            .location-inactive {
                opacity: 0.5;
            }

            .no-stores {
                padding: 20px;
                text-align: center;
                color: #666;
            }

            #clear-button {
                background: #d32f2f;
                color: white;
                border: none;
                padding: 5px 10px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 0.85em;
            }

            #clear-button:hover {
                background: #b71c1c;
            }
        `);

        const container = document.createElement('div');
        container.id = 'location-switcher';

        const toggleButton = document.createElement('button');
        toggleButton.id = 'location-toggle';
        toggleButton.innerText = '📍 Store Switcher';

        const panel = document.createElement('div');
        panel.id = 'location-panel';

        const header = document.createElement('div');
        header.id = 'location-header';
        header.innerHTML = '<span>Store Locations</span>';

        const clearButton = document.createElement('button');
        clearButton.id = 'clear-button';
        clearButton.textContent = 'Clear Map';
        clearButton.onclick = () => {
            if (confirm('Are you sure you want to clear the store map?')) {
                storeMap = {};
                GM_setValue('store_map', {});
                updateDisplay();
            }
        };
        header.appendChild(clearButton);

        const uploadSection = document.createElement('div');
        uploadSection.id = 'upload-section';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'file-input';
        fileInput.accept = '.csv,.xlsx,.xls';

        const uploadButton = document.createElement('button');
        uploadButton.id = 'upload-button';
        uploadButton.textContent = '📁 Upload Store Map (CSV/XLSX)';

        const storeCount = document.createElement('div');
        storeCount.id = 'store-count';

        uploadButton.onclick = () => fileInput.click();

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    let newStores = {};
                    
                    if (file.name.endsWith('.csv')) {
                        newStores = parseCSV(event.target.result);
                    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                        newStores = parseXLSX(event.target.result);
                    }

                    storeMap = newStores;
                    GM_setValue('store_map', storeMap);
                    updateDisplay();
                    alert(`Successfully loaded ${Object.keys(newStores).length} stores!`);
                } catch (error) {
                    console.error('Error parsing file:', error);
                    alert('Error parsing file. Please check the format.');
                }
            };

            if (file.name.endsWith('.csv')) {
                reader.readAsText(file);
            } else {
                reader.readAsBinaryString(file);
            }
        };

        uploadSection.appendChild(fileInput);
        uploadSection.appendChild(uploadButton);
        uploadSection.appendChild(storeCount);

        const searchBox = document.createElement('input');
        searchBox.id = 'search-box';
        searchBox.type = 'text';
        searchBox.placeholder = 'Search by TLC, name, or city...';

        const locationList = document.createElement('div');
        locationList.id = 'location-list';

        panel.appendChild(header);
        panel.appendChild(uploadSection);
        panel.appendChild(searchBox);
        panel.appendChild(locationList);
        container.appendChild(panel);
        container.appendChild(toggleButton);
        document.body.appendChild(container);

        // Toggle panel visibility
        toggleButton.onclick = () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') {
                updateDisplay();
                searchBox.focus();
            }
        };

        // Search functionality
        searchBox.oninput = () => {
            updateDisplay(searchBox.value.toLowerCase());
        };

        function updateDisplay(searchTerm = '') {
            storeMap = GM_getValue('store_map', storeMap);
            locationList.innerHTML = '';

            const storeArray = Object.values(storeMap);
            storeCount.textContent = `${storeArray.length} stores loaded`;

            if (storeArray.length === 0) {
                locationList.innerHTML = '<div class="no-stores">No store map loaded.<br>Upload a CSV or XLSX file to begin.</div>';
                return;
            }

            // Filter stores based on search term
            const filteredStores = storeArray.filter(store => {
                if (!searchTerm) return true;
                return (
                    store.tlc.toLowerCase().includes(searchTerm) ||
                    store.storeName.toLowerCase().includes(searchTerm) ||
                    store.city.toLowerCase().includes(searchTerm) ||
                    store.state.toLowerCase().includes(searchTerm)
                );
            });

            // Sort by TLC
            filteredStores.sort((a, b) => a.tlc.localeCompare(b.tlc));

            if (filteredStores.length === 0) {
                locationList.innerHTML = '<div class="no-stores">No stores match your search.</div>';
                return;
            }

            filteredStores.forEach(store => {
                const div = document.createElement('div');
                div.className = 'location-item';
                if (!store.isActive) {
                    div.className += ' location-inactive';
                }

                const tlcDiv = document.createElement('div');
                tlcDiv.className = 'location-tlc';
                tlcDiv.textContent = store.tlc;

                const detailsDiv = document.createElement('div');
                detailsDiv.className = 'location-details';
                detailsDiv.textContent = `${store.storeName} - ${store.city}, ${store.state}`;
                if (!store.isActive) {
                    detailsDiv.textContent += ' (Inactive)';
                }

                div.appendChild(tlcDiv);
                div.appendChild(detailsDiv);

                div.onclick = () => {
                    if (confirm(`Switch to ${store.tlc} - ${store.storeName}?`)) {
                        changeLocation(store.tlc);
                    }
                };

                locationList.appendChild(div);
            });
        }

        // Initial display update
        updateDisplay();
    });
})();