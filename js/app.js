// ethers is now available globally

// DOM elements
const settingsBtn = document.getElementById('settingsBtn');
const liveFeedBtn = document.getElementById('liveFeedBtn');
const themeToggle = document.getElementById('themeToggle');
const settingsView = document.getElementById('settings');
const liveFeedView = document.getElementById('liveFeed');
const settingsForm = document.getElementById('settingsForm');
const currentBlockEl = document.getElementById('currentBlock');
const lastBlockTimeEl = document.getElementById('lastBlockTime');
const eventsContainer = document.getElementById('eventsContainer');
const paginationContainer = document.getElementById('paginationContainer');

// Global variables
let provider;
let currentBlock;
let lastBlockTime;
let events = [];
let currentPage = 1;
let itemsPerPage = 10;
const eventTypes = ['erc20Transfer', 'erc721Transfer', 'erc1155Transfer', 'erc20Mint', 'erc721Mint', 'erc1155Mint', 'newErc20Contract', 'newErc721Contract', 'newErc1155Contract'];
let activeEventTypes = new Set(eventTypes);

// Initialize the app
function init() {
    loadSettings();
    setupEventListeners();
    setTheme(localStorage.getItem('theme') || 'light');
    setupEventTypeToggles();
    setupPaginationControls();
}

// Load settings from localStorage
function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('settings')) || {};
    Object.keys(settings).forEach(key => {
        const input = document.getElementById(key);
        if (input) input.value = settings[key];
    });
}

// Setup event listeners
function setupEventListeners() {
    settingsBtn.addEventListener('click', () => showView(settingsView));
    liveFeedBtn.addEventListener('click', () => showView(liveFeedView));
    themeToggle.addEventListener('click', toggleTheme);
    settingsForm.addEventListener('submit', saveSettings);
}

// Setup event type toggle buttons
function setupEventTypeToggles() {
    const toggleContainer = document.getElementById('eventTypeToggles');
    eventTypes.forEach(type => {
        const button = document.createElement('button');
        button.textContent = type;
        button.classList.add('active');
        button.addEventListener('click', () => toggleEventType(type, button));
        toggleContainer.appendChild(button);
    });
}

// Toggle event type visibility
function toggleEventType(type, button) {
    if (activeEventTypes.has(type)) {
        activeEventTypes.delete(type);
        button.classList.remove('active');
    } else {
        activeEventTypes.add(type);
        button.classList.add('active');
    }
    renderEvents();
}

// Setup pagination controls
function setupPaginationControls() {
    const pageSizes = [10, 25, 50, 100];
    const pageSizeContainer = document.getElementById('pageSizeContainer');
    pageSizes.forEach(size => {
        const button = document.createElement('button');
        button.textContent = size;
        button.addEventListener('click', () => {
            itemsPerPage = size;
            currentPage = 1;
            renderEvents();
        });
        pageSizeContainer.appendChild(button);
    });
}

// Show the selected view
function showView(view) {
    settingsView.classList.add('hidden');
    liveFeedView.classList.add('hidden');
    view.classList.remove('hidden');

    if (view === liveFeedView && !provider) {
        startLiveFeed();
    }
}

// Toggle between light and dark themes
function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

// Set the theme
function setTheme(theme) {
    document.body.classList.toggle('dark-mode', theme === 'dark');
    localStorage.setItem('theme', theme);
}

// Save settings to localStorage
function saveSettings(e) {
    e.preventDefault();
    const settings = {};
    new FormData(settingsForm).forEach((value, key) => {
        settings[key] = value;
    });
    localStorage.setItem('settings', JSON.stringify(settings));
    alert('Settings saved successfully!');
}

// Start the live feed
async function startLiveFeed() {
    const settings = JSON.parse(localStorage.getItem('settings'));
    if (!settings || !settings.wsRpc) {
        alert('Please configure settings first!');
        showView(settingsView);
        return;
    }

    provider = new ethers.providers.WebSocketProvider(settings.wsRpc);
    provider.on('block', handleNewBlock);
}

// Handle new block events
async function handleNewBlock(blockNumber) {
    currentBlock = blockNumber;
    lastBlockTime = new Date();
    updateInfoHeader();

    const block = await provider.getBlock(blockNumber);
    for (const txHash of block.transactions) {
        const tx = await provider.getTransactionReceipt(txHash);
        await checkForEvents(tx);
    }
}

// Update the info header
function updateInfoHeader() {
    currentBlockEl.textContent = currentBlock;
    updateLastBlockTime();
}

// Update the "x seconds ago" for the last block
function updateLastBlockTime() {
    const now = new Date();
    const secondsAgo = Math.floor((now - lastBlockTime) / 1000);
    lastBlockTimeEl.textContent = `${secondsAgo} seconds ago`;
}

// Check for events in a transaction
async function checkForEvents(tx) {
    for (const log of tx.logs) {
        const eventType = getEventType(log);
        if (eventType) {
            const eventData = await parseEventData(eventType, log, tx);
            addEventToFeed(eventType, eventData);
        }
    }
}

// Get the event type based on the log
function getEventType(log) {
    const topics = {
        'Transfer(address,address,uint256)': ['erc20Transfer', 'erc721Transfer'],
        'TransferSingle(address,address,address,uint256,uint256)': 'erc1155Transfer',
    };

    const topicHash = log.topics[0];
    for (const [signature, eventType] of Object.entries(topics)) {
        if (topicHash === ethers.utils.id(signature)) {
            if (Array.isArray(eventType)) {
                // Differentiate between ERC20 and ERC721
                return log.topics.length === 3 ? eventType[0] : eventType[1];
            }
            return eventType;
        }
    }

    // Check for contract creation
    if (log.address === tx.contractAddress) {
        return 'newContract';
    }

    return null;
}

// Parse event data based on the event type
async function parseEventData(eventType, log, tx) {
    const contract = new ethers.Contract(log.address, ['function name() view returns (string)', 'function symbol() view returns (string)'], provider);
    const [name, symbol] = await Promise.all([contract.name(), contract.symbol()]);

    const baseData = {
        name,
        symbol,
        txHash: tx.transactionHash,
    };

    switch (eventType) {
        case 'erc20Transfer':
        case 'erc721Transfer':
            return {
                ...baseData,
                from: '0x' + log.topics[1].slice(26),
                to: '0x' + log.topics[2].slice(26),
                value: ethers.BigNumber.from(log.topics[3] || log.data).toString(),
            };
        case 'erc1155Transfer':
            const [, from, to, id, value] = ethers.utils.defaultAbiCoder.decode(['address', 'address', 'address', 'uint256', 'uint256'], log.data);
            return {
                ...baseData,
                from,
                to,
                id: id.toString(),
                value: value.toString(),
            };
        case 'newContract':
            return {
                ...baseData,
                contractAddress: log.address,
            };
        default:
            return baseData;
    }
}

// Add an event to the live feed
function addEventToFeed(type, data) {
    events.unshift({ type, data });
    renderEvents();
}

// Render events
function renderEvents() {
    const filteredEvents = events.filter(event => activeEventTypes.has(event.type));
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const eventsToRender = filteredEvents.slice(startIndex, endIndex);

    eventsContainer.innerHTML = '';
    eventsToRender.forEach(event => {
        const eventElement = createEventElement(event);
        eventsContainer.appendChild(eventElement);
    });

    updatePagination(filteredEvents.length);
}

// Create an event element
function createEventElement(event) {
    const { type, data } = event;
    const element = document.createElement('div');
    element.classList.add('event', type);
    
    const header = document.createElement('div');
    header.classList.add('event-header');
    
    const typeSpan = document.createElement('span');
    typeSpan.classList.add('event-type');
    typeSpan.textContent = type;
    
    const nameSymbol = document.createElement('strong');
    nameSymbol.textContent = `${data.name} (${data.symbol})`;
    
    header.appendChild(typeSpan);
    header.appendChild(nameSymbol);
    
    const content = document.createElement('div');
    content.classList.add('event-content');
    
    if (type.includes('Transfer')) {
        addField(content, 'From', data.from);
        addField(content, 'To', data.to);
        addField(content, 'Value', data.value);
    }
    
    if (type === 'newContract') {
        addField(content, 'Contract Address', data.contractAddress);
    }
    
    const link = document.createElement('a');
    link.href = `${settings.blockExplorerPrefix}/tx/${data.txHash}`;
    link.target = '_blank';
    link.textContent = 'View Transaction';
    link.classList.add('event-link');
    
    element.appendChild(header);
    element.appendChild(content);
    element.appendChild(link);
    
    return element;
}

function addField(container, label, value) {
    const field = document.createElement('div');
    field.classList.add('event-field');
    
    const labelElement = document.createElement('span');
    labelElement.classList.add('event-field-label');
    labelElement.textContent = label;
    
    const valueElement = document.createElement('span');
    valueElement.classList.add('event-field-value');
    valueElement.textContent = value;
    
    field.appendChild(labelElement);
    field.appendChild(valueElement);
    container.appendChild(field);
}

// Update pagination
function updatePagination(totalEvents) {
    const totalPages = Math.ceil(totalEvents / itemsPerPage);
    paginationContainer.innerHTML = '';

    if (totalPages > 1) {
        for (let i = 1; i <= totalPages; i++) {
            const pageButton = document.createElement('button');
            pageButton.textContent = i;
            pageButton.addEventListener('click', () => {
                currentPage = i;
                renderEvents();
            });
            if (i === currentPage) {
                pageButton.classList.add('active');
            }
            paginationContainer.appendChild(pageButton);
        }
    }
}

// Update the last block time every second
setInterval(updateLastBlockTime, 1000);

// Initialize the app
init();