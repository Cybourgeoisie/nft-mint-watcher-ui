// DOMManager.js

export class DOMManager {
    constructor() {
        this.elements = {
            settingsBtn: document.getElementById('settingsBtn'),
            liveFeedBtn: document.getElementById('liveFeedBtn'),
            settingsView: document.getElementById('settings'),
            liveFeedView: document.getElementById('liveFeed'),
            settingsForm: document.getElementById('settingsForm'),
            currentBlockEl: document.getElementById('currentBlock'),
            lastBlockTimeEl: document.getElementById('lastBlockTime'),
            eventsContainer: document.getElementById('eventsContainer'),
            paginationContainer: document.getElementById('paginationContainer'),
            eventTypeToggles: document.getElementById('eventTypeToggles'),
            pageSizeContainer: document.getElementById('pageSizeContainer')
        };
    }

    setupEventListeners() {
        this.elements.settingsBtn.addEventListener('click', () => this.showView(this.elements.settingsView));
        this.elements.liveFeedBtn.addEventListener('click', () => this.showView(this.elements.liveFeedView));
        this.elements.settingsForm.addEventListener('submit', (e) => window.app.settingsManager.saveSettings(e));
    }

    showView(view) {
        this.elements.settingsView.classList.add('hidden');
        this.elements.liveFeedView.classList.add('hidden');
        view.classList.remove('hidden');

        if (view === this.elements.liveFeedView && !window.app.blockchainManager.isConnected()) {
            window.app.startLiveFeed();
        }
    }

    createElement(tag, options = {}) {
        const element = document.createElement(tag);
        if (options.className) element.className = options.className;
        if (options.textContent) element.textContent = options.textContent;
        if (options.attributes) {
            for (const [key, value] of Object.entries(options.attributes)) {
                element.setAttribute(key, value);
            }
        }
        return element;
    }
}