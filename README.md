# WTS Tampermonkey Scripts - Modular Structure

This project has been refactored into a modular structure using Tampermonkey's `@require` system for better maintainability and organization.

## File Structure

### Main Script
- **`WtsMain.js`** - The main entry point that loads all modules and initializes the application

### Modules
- **`csrf-manager.js`** - Handles CSRF token capture, extraction, and management
- **`data-extractor.js`** - Manages card data extraction and CSV functionality
- **`store-manager.js`** - Handles store mapping and switching functionality
- **`ui-components.js`** - Creates and manages the user interface components

## Module Details

### CSRF Manager (`csrf-manager.js`)
**Global Object:** `window.WTSCSRFManager`

**Key Functions:**
- `startNetworkInterception()` - Starts monitoring network requests for CSRF tokens
- `getCapturedToken()` - Retrieves captured CSRF token from storage
- `extractCSRFToken()` - Extracts CSRF token from DOM using multiple methods
- `extractTokenWithRetry()` - Main token extraction with retry logic and fallback
- `getFallbackToken()` - Returns fallback CSRF token

### Data Extractor (`data-extractor.js`)
**Global Object:** `window.WTSDataExtractor`

**Key Functions:**
- `extractDataFromCards()` - Extracts ASIN data from visible cards on the page
- `downloadCSV(rows)` - Downloads extracted data as CSV file
- `parseCSV(csvText)` - Parses CSV content for store mapping
- `getCurrentCardCount()` - Returns current card count information

### Store Manager (`store-manager.js`)
**Global Object:** `window.WTSStoreManager`

**Key Functions:**
- `loadStoredMappings()` - Loads store mappings from Tampermonkey storage
- `saveStoredMappings()` - Saves store mappings to persistent storage
- `updateMappings(newMappings)` - Updates store mappings with new data
- `switchToStore(storeCode)` - Switches to a different Whole Foods store
- `handleFileUpload(file)` - Handles CSV file upload for store mappings
- `getSortedStoreList()` - Returns sorted list of stores for dropdown

### UI Components (`ui-components.js`)
**Global Object:** `window.WTSUIComponents`

**Key Functions:**
- `createControlPanel()` - Creates the main draggable control panel
- `addDragFunctionality()` - Adds drag and drop functionality to the panel
- `addControlButtons()` - Adds export and refresh buttons
- `addStoreManagement()` - Adds store upload and switching components
- `addCSRFSettings()` - Adds CSRF token configuration modal
- `updateStoreUI()` - Updates store-related UI elements
- `addCardCounter()` - Adds dynamic card counter display

## Installation

1. Install all module files in Tampermonkey:
   - `csrf-manager.js`
   - `data-extractor.js`
   - `store-manager.js`
   - `ui-components.js`

2. Install the main script:
   - `WtsMain.js`

The main script will automatically load all required modules using the `@require` directives.

## Usage

Once installed, the script will:

1. **Automatically start CSRF token interception** when any Whole Foods page loads
2. **Display a draggable control panel** with the following features:
   - Export ASIN data to CSV
   - Refresh data extraction
   - Upload store mapping CSV files
   - Switch between stores (when mappings are loaded)
   - Configure CSRF token settings
   - Real-time card counter

3. **Provide debugging capabilities** via the console:
   - Type `WTSStatus()` in the browser console to check script status

## Store Mapping CSV Format

Upload a CSV file with the following columns:
- `StoreCode` - 3-character store code (e.g., "ABC")
- `StoreId` - Numeric store ID (e.g., 12345)

Example:
```csv
StoreCode,StoreId
ABC,12345
DEF,67890
GHI,11111
```

## Development

### Adding New Modules

1. Create a new `.js` file with proper Tampermonkey headers
2. Expose functionality via `window.YourModuleName = { ... }`
3. Add `@require` directive to `WtsMain.js`
4. Initialize the module in the `initializeModules()` function

### Module Communication

Modules communicate through their global objects:
- `window.WTSCSRFManager`
- `window.WTSDataExtractor`
- `window.WTSStoreManager`
- `window.WTSUIComponents`

### Error Handling

The main script includes:
- Module loading verification
- Global error handling
- User-friendly error messages
- Console debugging information

## Troubleshooting

### Common Issues

1. **"Missing required modules" error**
   - Ensure all module files are installed and enabled in Tampermonkey
   - Check that the `@require` URLs are accessible

2. **CSRF token issues**
   - Use the CSRF Settings modal to configure fallback tokens
   - Check browser console for detailed token extraction debugging

3. **Store switching fails**
   - Verify store mappings are loaded correctly
   - Check network connectivity
   - Ensure CSRF token is valid

### Debug Commands

- `WTSStatus()` - Check overall script status
- Check browser console for detailed logging from each module

## Version History

- **v1.2.001** - Modular refactor with `@require` system
- Previous versions were monolithic single-file scripts