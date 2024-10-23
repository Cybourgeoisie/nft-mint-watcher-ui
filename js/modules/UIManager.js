// UIManager.js

export class UIManager {
    constructor(domManager, eventManager) {
        this.domManager = domManager;
        this.eventManager = eventManager;
        this.currentPage = 1;
        this.itemsPerPage = 25;
        this.renderTimeout = null;
        this.lastBlockTimeUpdateInterval = null;
        this.maxStoredEvents = 1000;
        this.pendingEvents = [];
        this.batchTimeout = null;
        this.isRendering = false;
        this.lastRenderTime = 0;
        this.minRenderInterval = 1000; // Minimum time between renders in ms
        
        this.setupBlockTimeUpdater();
        this.setupVirtualScroll();
    }

    setupBlockTimeUpdater() {
        // Update block time every 10 seconds
        this.lastBlockTimeUpdateInterval = setInterval(() => {
            window.requestAnimationFrame(() => this.updateLastBlockTime());
        }, 10000);
    }

    setupVirtualScroll() {
        const container = this.domManager.elements.eventsContainer;
        let ticking = false;

        container.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    this.handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    handleScroll() {
        const container = this.domManager.elements.eventsContainer;
        const scrollPosition = container.scrollTop;
        const containerHeight = container.clientHeight;
        const totalHeight = container.scrollHeight;
        
        // Load more items when scrolling near bottom
        if (totalHeight - (scrollPosition + containerHeight) < 200) {
            this.loadMoreItems();
        }
    }

    loadMoreItems() {
        if (this.isRendering) return;
        this.currentPage++;
        this.renderEvents();
    }

    setupEventTypeToggles() {
        const toggleContainer = this.domManager.elements.eventTypeToggles;
        this.eventManager.getEventTypes().forEach(type => {
            const button = this.domManager.createElement('button', {
                textContent: type,
                className: 'btn event-type-btn active'
            });
            button.addEventListener('click', () => this.toggleEventType(type, button));
            toggleContainer.appendChild(button);
        });
    }

    toggleEventType(type, button) {
        this.eventManager.toggleEventType(type);
        button.classList.toggle('active', this.eventManager.isEventTypeActive(type));
    }

    setupPaginationControls() {
        const pageSizes = [10, 25, 50, 100];
        const pageSizeContainer = this.domManager.elements.pageSizeContainer;
        pageSizes.forEach(size => {
            const button = this.domManager.createElement('button', { 
                textContent: size,
                className: `btn page-size-btn ${this.itemsPerPage === size ? 'active' : ''}`
            });
            button.addEventListener('click', () => {
                this.itemsPerPage = size;
                this.currentPage = 1;
                // Update active state of all page size buttons
                pageSizeContainer.querySelectorAll('.page-size-btn').forEach(btn => {
                    btn.classList.toggle('active', parseInt(btn.textContent) === size);
                });
                this.renderEvents();
            });
            pageSizeContainer.appendChild(button);
        });
    }

    updateInfoHeader() {
        const { currentBlockEl, lastBlockTimeEl } = this.domManager.elements;
        currentBlockEl.textContent = window.app.blockchainManager.getCurrentBlock();
        this.updateLastBlockTime();
    }

    updateLastBlockTime() {
        const { lastBlockTimeEl } = this.domManager.elements;
        const lastBlockTime = window.app.blockchainManager.getLastBlockTime();
        if (lastBlockTime) {
            const now = new Date();
            const secondsAgo = Math.floor((now - lastBlockTime) / 1000);
            lastBlockTimeEl.textContent = `${secondsAgo} seconds ago`;
        }
    }

    renderEvents() {
        // Clear any existing render timeout
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
            this.renderTimeout = null;
        }

        // If already rendering, schedule next render
        if (this.isRendering) {
            if (!this.renderTimeout) {
                this.renderTimeout = setTimeout(() => {
                    this.renderTimeout = null;
                    this.renderEvents();
                }, this.minRenderInterval);
            }
            return;
        }
        
        const now = Date.now();
        const timeSinceLastRender = now - this.lastRenderTime;
        
        // Enforce minimum render interval
        if (timeSinceLastRender < this.minRenderInterval) {
            if (!this.renderTimeout) {
                this.renderTimeout = setTimeout(() => {
                    this.renderTimeout = null;
                    this.renderEvents();
                }, this.minRenderInterval - timeSinceLastRender);
            }
            return;
        }

        this.isRendering = true;
        this.lastRenderTime = now;

        // Use requestAnimationFrame for smoother rendering
        window.requestAnimationFrame(() => {
            try {
                this._renderEventsImpl();
            } catch (error) {
                console.error('Error in render implementation:', error);
            } finally {
                this.isRendering = false;
                // Removed call to processPendingEvents() here
            }
        });
    }

    _renderEventsImpl() {
        const { eventsContainer } = this.domManager.elements;
        
        try {
            // Initialize if needed
            if (!eventsContainer.querySelector('#events-header')) {
                const header = this.initializeEventsContainer();
                if (!header) {
                    console.error('Failed to initialize events container');
                    return;
                }
            }

            const filteredEvents = this.eventManager.getFilteredEvents();
            const startIndex = (this.currentPage - 1) * this.itemsPerPage;
            const endIndex = startIndex + this.itemsPerPage;
            const eventsToRender = filteredEvents.slice(startIndex, endIndex);

            // Get content container
            let contentContainer = eventsContainer.querySelector('#events-content');
            if (!contentContainer) {
                contentContainer = document.createElement('div');
                contentContainer.id = 'events-content';
                eventsContainer.appendChild(contentContainer);
            }

            // Clear existing content
            contentContainer.innerHTML = '';

            // Create and append elements one by one
            for (const event of eventsToRender) {
                const element = this.createEventElement(event);
                if (element) {
                    contentContainer.appendChild(element);
                }
            }

            // Update pagination after successful render
            this.updatePagination(filteredEvents.length);
        } catch (error) {
            console.error('Error in render implementation:', error);
            this.isRendering = false;
        }
    }

    updateEventElement(element, event) {
        const { type, data } = event;
        element.className = `event ${type} text-sm grid grid-cols-6 gap-2 items-center p-2 border-b`;
        element.setAttribute('data-event-id', `${type}-${data.txHash}`);
        
        // Update existing child elements instead of creating new ones
        const children = Array.from(element.children);
        children[0].textContent = type;
        children[1].textContent = `${data.name} (${data.symbol})`;
        
        if (type.includes('Transfer') || type.includes('Mint')) {
            children[2].textContent = data.from;
            children[3].textContent = data.to;
            children[4].textContent = data.value;
        } else if (type === 'newContract') {
            children[2].textContent = data.contractAddress;
            children[2].className = 'contract-address font-mono col-span-3';
        }
        
        const link = children[children.length - 1];
        link.href = `${window.app.settingsManager.getSettings().blockExplorerPrefix}/tx/${data.txHash}`;
        
        return element;
    }

    createEventElement(event) {
        const { type, data } = event;
        const element = this.domManager.createElement('div', { 
            className: `event ${type} text-sm grid grid-cols-6 gap-2 items-center p-2 border-b`,
            attributes: {
                'data-event-id': `${type}-${data.txHash}`
            }
        });
        
        // Event Type
        element.appendChild(this.domManager.createElement('div', { 
            className: 'event-type font-medium',
            textContent: type
        }));
        
        // Token Info
        element.appendChild(this.domManager.createElement('div', { 
            className: 'token-info',
            textContent: `${data.name} (${data.symbol})`
        }));
        
        if (type.includes('Transfer') || type.includes('Mint')) {
            // From
            element.appendChild(this.domManager.createElement('div', { 
                className: 'from font-mono',
                textContent: data.from
            }));
            
            // To
            element.appendChild(this.domManager.createElement('div', { 
                className: 'to font-mono',
                textContent: data.to
            }));
            
            // Value
            element.appendChild(this.domManager.createElement('div', { 
                className: 'value font-mono',
                textContent: data.value
            }));
        } else if (type === 'newContract') {
            // Contract Address (spans 3 columns)
            const contractAddress = this.domManager.createElement('div', { 
                className: 'contract-address font-mono col-span-3',
                textContent: data.contractAddress
            });
            element.appendChild(contractAddress);
        }
        
        // View Transaction Link
        const link = this.domManager.createElement('a', {
            className: 'event-link text-blue-500 hover:text-blue-700',
            textContent: 'view tx',
            attributes: {
                href: `${window.app.settingsManager.getSettings().blockExplorerPrefix}/tx/${data.txHash}`,
                target: '_blank'
            }
        });
        element.appendChild(link);
        
        return element;
    }

    initializeEventsContainer() {
        const { eventsContainer } = this.domManager.elements;
        
        // Look for existing header within the events container
        let header = eventsContainer.querySelector('div#events-header');
        
        // Create header if it doesn't exist
        if (!header) {
            // Clear container and create new header
            eventsContainer.innerHTML = '';
            
            header = this.domManager.createElement('div', {
                className: 'grid grid-cols-6 gap-2 font-bold text-sm p-2 bg-gray-100 dark:bg-gray-800 border-b',
            });
            header.id = 'events-header';
            header.appendChild(this.domManager.createElement('div', { textContent: 'Type' }));
            header.appendChild(this.domManager.createElement('div', { textContent: 'Token' }));
            header.appendChild(this.domManager.createElement('div', { textContent: 'From' }));
            header.appendChild(this.domManager.createElement('div', { textContent: 'To' }));
            header.appendChild(this.domManager.createElement('div', { textContent: 'Value' }));
            header.appendChild(this.domManager.createElement('div', { textContent: 'Action' }));
            eventsContainer.appendChild(header);
        }
        
        return header;
    }

    addNewEvent(event) {
        // Add to pending events
        this.pendingEvents.push(event);
        
        // If we're not already batching, start a new batch
        if (!this.batchTimeout) {
            this.batchTimeout = setTimeout(() => {
                this.processPendingEvents();
            }, 1000); // Process events every second
        }
    }

    processPendingEvents() {
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        
        // Only trigger render if we're on first page and have active events
        if (this.currentPage === 1 && 
            this.pendingEvents.some(event => this.eventManager.isEventTypeActive(event.type))) {

            const now = Date.now();
            const timeSinceLastRender = now - this.lastRenderTime;

            if (!this.isRendering && timeSinceLastRender >= this.minRenderInterval) {
                // Schedule render with requestAnimationFrame
                window.requestAnimationFrame(() => {
                    this.renderEvents();
                });
            } else if (!this.renderTimeout) {
                // Schedule the next render to occur after the minimum interval
                this.renderTimeout = setTimeout(() => {
                    this.renderTimeout = null;
                    this.processPendingEvents();
                }, this.minRenderInterval - timeSinceLastRender);
            }
        }
        
        // Clear pending events
        this.pendingEvents = [];
    }

    updatePagination(totalEvents) {
        const { paginationContainer } = this.domManager.elements;
        const totalPages = Math.ceil(totalEvents / this.itemsPerPage);
        paginationContainer.innerHTML = '';

        // Ensure current page is valid
        if (this.currentPage > totalPages) {
            this.currentPage = totalPages || 1;
        }

        if (totalPages > 1) {
            // Previous button
            if (this.currentPage > 1) {
                const prevButton = this.domManager.createElement('button', {
                    textContent: '←',
                    className: 'btn pagination-btn'
                });
                prevButton.addEventListener('click', () => {
                    this.currentPage--;
                    this.renderEvents();
                });
                paginationContainer.appendChild(prevButton);
            }

            // Show limited number of pages with ellipsis
            const maxVisiblePages = 5;
            let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
            let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

            // Adjust start if we're near the end
            if (endPage - startPage + 1 < maxVisiblePages) {
                startPage = Math.max(1, endPage - maxVisiblePages + 1);
            }

            // First page if not in range
            if (startPage > 1) {
                const firstButton = this.domManager.createElement('button', {
                    textContent: '1',
                    className: 'btn pagination-btn'
                });
                firstButton.addEventListener('click', () => {
                    this.currentPage = 1;
                    this.renderEvents();
                });
                paginationContainer.appendChild(firstButton);

                if (startPage > 2) {
                    paginationContainer.appendChild(
                        this.domManager.createElement('span', {
                            textContent: '...',
                            className: 'px-2'
                        })
                    );
                }
            }

            // Visible page buttons
            for (let i = startPage; i <= endPage; i++) {
                const pageButton = this.domManager.createElement('button', {
                    textContent: i,
                    className: `btn pagination-btn ${i === this.currentPage ? 'active' : ''}`
                });
                pageButton.addEventListener('click', () => {
                    this.currentPage = i;
                    this.renderEvents();
                });
                paginationContainer.appendChild(pageButton);
            }

            // Last page if not in range
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    paginationContainer.appendChild(
                        this.domManager.createElement('span', {
                            textContent: '...',
                            className: 'px-2'
                        })
                    );
                }

                const lastButton = this.domManager.createElement('button', {
                    textContent: totalPages,
                    className: 'btn pagination-btn'
                });
                lastButton.addEventListener('click', () => {
                    this.currentPage = totalPages;
                    this.renderEvents();
                });
                paginationContainer.appendChild(lastButton);
            }

            // Next button
            if (this.currentPage < totalPages) {
                const nextButton = this.domManager.createElement('button', {
                    textContent: '→',
                    className: 'btn pagination-btn'
                });
                nextButton.addEventListener('click', () => {
                    this.currentPage++;
                    this.renderEvents();
                });
                paginationContainer.appendChild(nextButton);
            }
        }
    }

    showView(viewName) {
        this.domManager.showView(this.domManager.elements[`${viewName}View`]);
    }
}