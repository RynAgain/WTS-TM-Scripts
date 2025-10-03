# Amazon Location Switcher v2.0

A Tampermonkey userscript that allows you to quickly switch between Amazon/Whole Foods store locations using an uploaded store map.

## Features

### 🆕 Version 2.0 Updates

- **CSV/XLSX Upload**: Upload a complete store map from CSV or Excel files
- **TLC Display**: Shows three-letter store codes (TLC) for easy identification
- **Persistent Storage**: Store map is saved locally and persists across sessions
- **CSRF Token Management**: Automatically captures and maintains anti-CSRF tokens every 5 seconds
- **Search Functionality**: Quickly find stores by TLC, name, or city
- **Active/Inactive Status**: Visual indication of store status
- **Smart Region ID Handling**: Automatically tries with and without region ID for maximum compatibility
- **Improved UI**: Cleaner, more intuitive interface with real-time store count

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) browser extension
2. Click on the Tampermonkey icon and select "Create a new script"
3. Copy the contents of `amazon_location_switcher_v2.user.js`
4. Paste into the editor and save (Ctrl+S or Cmd+S)
5. Navigate to amazon.com - you should see a "📍 Store Switcher" button in the bottom-right corner

## Usage

### Initial Setup

1. **Prepare Your Store Map File**
   - Export your store data to CSV or XLSX format
   - Required columns:
     - `store_acronym` - The store acronym (first character will be removed to create TLC)
     - `pickup_address_id` - The destination/address ID for the store
     - `store_name` - Store name (for display)
     - `city` - City location
     - `state` - State location
     - `is_active` - Active status (true/false or 1/0)
     - `region_id` - Region ID (optional - script will try without it first, then with it if needed)

2. **Upload the Store Map**
   - Click the "📍 Store Switcher" button
   - Click "📁 Upload Store Map (CSV/XLSX)"
   - Select your prepared file
   - Wait for confirmation message

### Switching Stores

1. Click the "📍 Store Switcher" button to open the panel
2. Use the search box to filter stores by:
   - Three-letter code (TLC)
   - Store name
   - City or state
3. Click on any store to switch to that location
4. Confirm the switch when prompted
5. The page will reload with the new location active

### Managing the Store Map

- **View Store Count**: The panel shows how many stores are loaded
- **Clear Map**: Click the "Clear Map" button in the header to remove all stored data
- **Re-upload**: Simply upload a new file to replace the existing map

## Technical Details

### Data Storage

- **Store Map**: Stored in Tampermonkey's GM_setValue storage as `store_map`
- **CSRF Token**: Automatically captured and stored as `csrf_token`
- **Persistence**: Data persists across browser sessions and page reloads

### CSRF Token Management

The script automatically:
- Captures the anti-CSRF token on page load
- Updates the token every 5 seconds in the background
- Stores the token persistently using Tampermonkey storage
- Retrieves a fresh token before each location switch attempt
- Uses the latest token in both request headers and body

### Smart Region ID Handling

The location switching logic is intelligent:
1. **First Attempt**: Tries to switch using only the `pickup_address_id` (without `region_id`)
2. **Automatic Retry**: If the first attempt fails and a `region_id` exists, automatically retries with it included
3. **Console Logging**: Both attempts are logged so you can see which method works for your stores

This ensures maximum compatibility whether Amazon requires the region ID or not.

### Store Data Structure

Each store in the map contains:
```javascript
{
  tlc: "ABC",                    // Three-letter code
  destinationId: "12345",        // Pickup address ID
  storeName: "Store Name",       // Full store name
  city: "City",                  // City location
  state: "ST",                   // State code
  storeCode: "STORE123",         // Internal store code
  regionId: "region123",         // Region ID
  isActive: true                 // Active status
}
```

### File Format Requirements

**CSV Format:**
```csv
store_acronym,pickup_address_id,store_name,city,state,is_active,region_id
WABC,addr123,Store Name,City,ST,true,region1
```

**XLSX Format:**
- First row must contain column headers
- Data starts from row 2
- Same column names as CSV

## Troubleshooting

### Upload Issues

- **File not parsing**: Ensure your CSV/XLSX has the correct column names
- **No stores loaded**: Check that `store_acronym` and `pickup_address_id` columns have values
- **Wrong TLC displayed**: Verify `store_acronym` format (first character is automatically removed)

### Switching Issues

- **Switch fails**:
  - The script automatically tries without `region_id` first, then with it if available
  - Check browser console for detailed error messages
  - Verify CSRF token is being captured (look for "CSRF token updated" in console)
- **Page doesn't reload**: Check browser console for errors and response status
- **Wrong location**: Verify the `pickup_address_id` in your uploaded data matches Amazon's expected format

### Storage Issues

- **Map disappears**: Check Tampermonkey storage limits (shouldn't be an issue for normal use)
- **Can't clear map**: Try manually through Tampermonkey's storage viewer

## Browser Compatibility

Tested and working on:
- Chrome/Chromium with Tampermonkey
- Firefox with Tampermonkey
- Edge with Tampermonkey

## Dependencies

- **XLSX.js**: Loaded from CDN for Excel file parsing
  - `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js`

## Version History

### v2.0 (Current)
- Complete rewrite for production use
- CSV/XLSX upload functionality
- TLC-based display and selection
- Persistent CSRF token management
- Search and filter capabilities
- Improved UI/UX

### v0.2 (Proof of Concept)
- Basic location collection from page
- Manual location switching
- Simple storage system

## Notes

- The `region_id` field is optional - the script intelligently tries without it first, then with it if needed
- Inactive stores are shown with reduced opacity but can still be selected
- The script only works on amazon.com domains
- Store map is stored locally in your browser - not synced across devices
- CSRF tokens are automatically managed - no manual intervention needed
- Console logging provides detailed debugging information for troubleshooting

## Support

For issues or questions, check:
1. Browser console for error messages
2. Tampermonkey's script log
3. Verify your CSV/XLSX file format matches requirements