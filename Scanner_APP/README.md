# WFM Scanner App

A comprehensive Electron application for systematically scanning Whole Foods Market items across different stores using Playwright automation.

## Features
### Catering
### Item Specific Analysis

- **Multi-Store Scanning**: Automatically switch between different Whole Foods stores
- **Comprehensive Data Extraction**: Extract product names, prices, nutrition facts, ingredients, availability, variations, and bundle information
- **Multi-Agent Processing**: Parallel processing with configurable concurrent agents using shared browser tabs
- **Bundle Detection**: Identify bundle products with "What's Included" sections
- **Product Variations**: Detect size/flavor variations with detailed information
- **Excel Export**: Export results to Excel with comprehensive statistics and multiple worksheets
- **Real-time Progress**: Live progress tracking with success rates and timing
- **Side-by-Side Display**: Electron and Playwright windows positioned side-by-side for monitoring

## Installation & Setup

### Option 1: Download Pre-built Releases (Recommended)

1. Go to the [Releases](../../releases) page
2. Download the appropriate version for your operating system:
   - **Windows**: `WFM-Scanner-App-Setup-x.x.x.exe` (installer) or `wfm-scanner-windows.zip` (portable)
   - **macOS**: `WFM-Scanner-App-x.x.x.dmg` (Intel/Apple Silicon)
   - **Linux**: `WFM-Scanner-App-x.x.x.AppImage` (portable)

### Option 2: Build from Source

1. **Clone the repository**
2. **Navigate to the Scanner_APP directory**
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Install Playwright browsers:**
   ```bash
   npm run install-playwright
   ```
5. **Run the application:**
   ```bash
   npm start
   ```

## Building with GitHub Actions

This project uses GitHub Actions for automated building across multiple platforms. The builds are triggered:

- **Automatically**: On push to main/master branch
- **On Release**: When creating a new tag (e.g., `v1.0.0`)
- **Manually**: Using the "Actions" tab in GitHub

### Creating a Release

1. Create and push a new tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. GitHub Actions will automatically build for Windows, macOS, and Linux
3. A new release will be created with all build artifacts

### Build Artifacts

The GitHub Actions workflow produces:
- **Windows**: `.exe` installer and unpacked directory
- **macOS**: `.dmg` installer and app bundle (Intel + Apple Silicon)
- **Linux**: `.AppImage` portable executable and unpacked directory

## Usage

### Running the Application

```bash
npm start
```

The application will launch with an Electron window for configuration and control.

### Configuration

1. **Select Store Mapping File**: CSV file with StoreCode and StoreId columns
2. **Select Item List File**: CSV/Excel file with store codes and ASINs
3. **Configure Settings**:
   - Delay between items (ms)
   - Delay between stores (ms)
   - Page timeout (ms)
   - Max retries
   - Max concurrent agents (1-5 recommended)
   - Headless mode (disable for side-by-side viewing)
   - Screenshot capture
   - Skip existing results

### File Formats

#### Store Mapping File (CSV)
```csv
StoreCode,StoreId
ATX,10555
DAL,10556
HOU,10557
```

#### Item List File (CSV/Excel)
```csv
store_tlc,asin,name
ATX,B08XYZ123,Sample Product 1
DAL,B08ABC456,Sample Product 2
HOU,B08DEF789,Sample Product 3
```

### Multi-Agent Processing

The app supports parallel processing with multiple browser tabs:
- **Shared Context**: All agents share cookies and store session
- **Store Boundaries**: Agents work in parallel within each store, then move to next store
- **Persistent Tabs**: Agent tabs are reused across all stores for optimal performance
- **Cookie Inheritance**: Store switches automatically propagate to all agent tabs

### Data Extraction

The scanner extracts comprehensive product information:
- **Basic Info**: Product name, price, availability
- **Features**: Nutrition facts, ingredients, add-to-cart button
- **Variations**: Size/flavor options with individual pricing
- **Bundles**: "What's Included" sections with part counting
- **Metadata**: Load times, timestamps, extraction details

### Export Features

Results are exported to Excel with multiple worksheets:
- **Scan Results**: Complete data for all items
- **Summary**: Overall statistics and success rates
- **Store Breakdown**: Per-store performance metrics
- **Enhanced Statistics**: Variation counts, bundle statistics, feature availability

## Development

### Project Structure

```
Scanner_APP/
├── .github/workflows/
│   └── build.yml              # GitHub Actions build workflow
├── src/
│   ├── main.js                # Main Electron process
│   └── services/
│       ├── scannerService.js  # Core scanning logic
│       └── excelExporter.js   # Excel export functionality
├── renderer/
│   ├── index.html            # Main UI
│   ├── renderer.js           # UI logic and IPC communication
│   └── styles.css            # Application styling
├── sample_data/              # Sample CSV files
├── package.json             # Dependencies and scripts
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

### Scripts

- `npm start` - Run the application in development
- `npm run dev` - Run in development mode
- `npm run build` - Build for current platform (use GitHub Actions for multi-platform)
- `npm run install-playwright` - Install Playwright browsers

### Key Technologies

- **Electron**: Desktop application framework
- **Playwright**: Browser automation
- **ExcelJS**: Excel file generation
- **CSV Parser**: CSV file processing
- **Node.js**: Runtime environment

## GitHub Actions Workflow

The `.github/workflows/build.yml` file defines the automated build process:

- **Multi-Platform**: Builds for Windows, macOS, and Linux simultaneously
- **Code Signing Disabled**: Avoids permission issues during build
- **Artifact Upload**: Automatically uploads build results
- **Release Creation**: Creates GitHub releases for tagged versions
- **Dependency Caching**: Speeds up builds with npm cache

## Troubleshooting

### Common Issues

1. **CSRF Token Issues**: The app automatically captures and manages CSRF tokens. If store switching fails, try manual store selection in the browser window.

2. **Permission Errors**: Ensure the app has permission to create files in the export directory.

3. **Browser Launch Issues**: Make sure Playwright browsers are installed with `npm run install-playwright`.

4. **Memory Issues**: For large datasets (300k+ items), the app uses virtual scrolling and efficient memory management.

### Build Issues

If you encounter build issues locally:
1. Use GitHub Actions for building (recommended)
2. Clear electron-builder cache: `npx electron-builder install-app-deps`
3. Try building with code signing disabled: `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build`

### Performance Tips

- Use 2-3 concurrent agents for optimal performance
- Enable headless mode for faster processing (disables side-by-side viewing)
- Adjust delays based on network conditions
- Use skip existing results to resume interrupted scans

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `npm start`
5. Push to your fork and create a Pull Request
6. GitHub Actions will automatically test your changes

## License

MIT License - See package.json for details.

## Support

For issues or questions:
1. Check the [Issues](../../issues) page
2. Review console logs in the Electron app for debugging information
3. Use GitHub Actions for reliable cross-platform builds