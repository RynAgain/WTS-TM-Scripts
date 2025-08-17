# WFM Scanner App

An Electron application that uses Playwright to systematically scan Whole Foods Market items across different stores. The app provides a side-by-side view with the Electron control interface on the left and the Playwright browser window on the right.

## Features

- 🏪 **Store Switching**: Automatically switch between different WFM stores using store mapping data
- 🔍 **Systematic Scanning**: Process item lists with ASINs across multiple stores
- 📊 **Real-time Progress**: Live progress tracking and result display
- 📤 **Excel Export**: Comprehensive Excel reports with multiple worksheets
- 🖥️ **Side-by-Side Display**: Electron app and Playwright browser positioned side-by-side
- ⚙️ **Configurable Settings**: Adjustable delays, timeouts, and scanning options

## Prerequisites

- Node.js (version 16 or higher)
- Windows, macOS, or Linux

## Installation

1. **Clone or download the project**
   ```bash
   cd Scanner_APP
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Playwright browsers**
   ```bash
   npm run install-playwright
   ```

## Usage

### 1. Start the Application

```bash
npm start
```

For development mode with DevTools:
```bash
npm run dev
```

### 2. Configure the Scan

#### Store Mapping File (CSV)
Create a CSV file with store codes and IDs:
```csv
StoreCode,StoreId
ABC,12345
DEF,67890
GHI,11111
```

#### Item List File (Excel/CSV)
Create a file with store codes and ASINs:
```csv
store,asin,name
ABC,B08N5WRWNW,Example Product 1
ABC,B07XYZ1234,Example Product 2
DEF,B09ABC5678,Example Product 3
```

### 3. Run the Scan

1. **Select Files**: Use the file selection buttons to choose your store mapping and item list files
2. **Configure Settings**: Adjust delays, timeouts, and other scanning parameters
3. **Start Scan**: Click "Start Scan" to begin the automated process
4. **Monitor Progress**: Watch real-time progress and results in the interface
5. **Export Results**: Save comprehensive Excel reports when the scan completes

## Window Layout

The application automatically positions windows side-by-side:
- **Left Half**: Electron control interface
- **Right Half**: Playwright browser window (when not in headless mode)

The Playwright window scales its content to fit the available space and shows the actual scanning process.

## Configuration Options

### Scan Settings
- **Delay between items**: Time to wait between processing each item (500-10000ms)
- **Delay between stores**: Time to wait when switching stores (1000-30000ms)
- **Page timeout**: Maximum time to wait for pages to load (5000-60000ms)
- **Max retries**: Number of retry attempts for failed items (1-10)

### Display Options
- **Headless mode**: Run browser invisibly (faster but no visual feedback)
- **Capture screenshots**: Save screenshots when errors occur
- **Skip existing results**: Skip items that have already been processed

## File Formats

### Store Mapping CSV
Required columns:
- `StoreCode`: 3-letter store identifier (e.g., "ABC")
- `StoreId`: Numeric store ID used by WFM API

### Item List Files
Supported formats: CSV, Excel (.xlsx, .xls)

Required columns (case-insensitive):
- Store column: `store`, `store_code`, `tlc`, or similar
- ASIN column: `asin`
- Optional: `name`, `item_name`, `title` for item names

## Output

The application generates Excel files with multiple worksheets:

1. **Scan Results**: Detailed results for each item
   - Store code, ASIN, item name
   - Success/failure status
   - Load times and error messages
   - Clickable URLs to item pages

2. **Summary**: Overall scan statistics
   - Total items processed
   - Success/failure counts and rates
   - Average load times
   - Scan date and duration

3. **Store Breakdown**: Per-store statistics
   - Items processed per store
   - Success rates by store
   - Average load times by store

## Troubleshooting

### Common Issues

1. **CSRF Token Errors**
   - Ensure you're logged into Whole Foods Market in your default browser
   - The app extracts CSRF tokens from the page for store switching

2. **Store Switch Failures**
   - Verify store mapping file has correct StoreCode/StoreId pairs
   - Check that store IDs are valid and active

3. **Item Loading Failures**
   - Some ASINs may not be available in certain stores
   - Network timeouts can cause failures (adjust timeout settings)

4. **Window Positioning Issues**
   - The app automatically detects screen size and positions windows
   - Ensure sufficient screen resolution (minimum 1200px width recommended)

### Performance Tips

1. **Use appropriate delays**: Too short delays may trigger rate limiting
2. **Enable headless mode**: For faster scanning without visual feedback
3. **Process in batches**: For large item lists, consider splitting into smaller batches
4. **Monitor system resources**: Large scans may consume significant CPU/memory

## Development

### Project Structure
```
Scanner_APP/
├── src/
│   ├── main.js                 # Main Electron process
│   └── services/
│       ├── scannerService.js   # Core scanning logic
│       └── excelExporter.js    # Excel export functionality
├── renderer/
│   ├── index.html             # UI layout
│   ├── styles.css             # UI styling
│   └── renderer.js            # UI logic and IPC communication
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

### Building for Distribution

```bash
npm run build
```

This creates distributable packages in the `dist/` directory.

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review console logs in the application
3. Check the activity log in the app interface
4. Ensure all prerequisites are installed correctly

---

**Note**: This application is designed for testing and monitoring purposes. Please use responsibly and in accordance with Whole Foods Market's terms of service.