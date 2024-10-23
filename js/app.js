// Main application file

// Import modules
import { DOMManager } from './modules/DOMManager.js';
import { SettingsManager } from './modules/SettingsManager.js';
import { EventManager } from './modules/EventManager.js';
import { BlockchainManager } from './modules/BlockchainManager.js';
import { UIManager } from './modules/UIManager.js';

class App {
    constructor() {
        this.domManager = new DOMManager();
        this.settingsManager = new SettingsManager();
        this.eventManager = new EventManager();
        this.blockchainManager = new BlockchainManager(this.eventManager);
        this.uiManager = new UIManager(this.domManager, this.eventManager);
    }

    init() {
        this.settingsManager.loadSettings();
        
        // Start updating the last block time every second
        setInterval(() => this.uiManager.updateLastBlockTime(), 1000);
    }

    async startLiveFeed() {
        const settings = this.settingsManager.getSettings();
        if (!settings || !settings.wsRpc) {
            alert('Please configure settings first!');
            this.uiManager.showView('settings');
            return;
        }

        await this.blockchainManager.connect(settings.wsRpc);
        this.blockchainManager.startListening();
    }
}

// Initialize the app
const app = new App();
app.init();

// Expose app to window for debugging purposes
window.app = app;

// Add event listener for DOMContentLoaded to ensure DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.domManager.setupEventListeners();
    app.uiManager.setupEventTypeToggles();
    app.uiManager.setupPaginationControls();
});