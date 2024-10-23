// EventManager.js

export class EventManager {
    constructor() {
        this.events = [];
        this.eventTypes = ['erc20Transfer', 'erc721Transfer', 'erc1155Transfer', 'erc20Mint', 'erc721Mint', 'erc1155Mint', 'newErc20Contract', 'newErc721Contract', 'newErc1155Contract'];
        this.activeEventTypes = new Set(this.eventTypes);
    }

    addEvent(type, data) {
        // Don't add events if they're not of an active type
        if (!this.activeEventTypes.has(type)) {
            return;
        }

        const maxEvents = window.app.uiManager.maxStoredEvents;
        
        try {
            const event = { type, data };
            
            // Remove oldest events if we're at the limit
            if (this.events.length >= maxEvents) {
                this.events = this.events.slice(0, maxEvents - 1);
            }

            // Add new event at the beginning
            this.events.unshift(event);
            
            // Only notify UI if we're on first page and type is active
            if (window.app.uiManager.currentPage === 1 && this.isEventTypeActive(type)) {
                // Debounce UI updates
                if (window.app.uiManager && !window.app.uiManager.isRendering) {
                    window.app.uiManager.addNewEvent(event);
                }
            }
        } catch (error) {
            console.error('Error adding event:', error);
        }
    }

    getEvents() {
        return this.events;
    }

    getFilteredEvents() {
        // Since we're now filtering on add, we can just return the events
        return this.events;
    }

    toggleEventType(type) {
        if (this.activeEventTypes.has(type)) {
            this.activeEventTypes.delete(type);
        } else {
            this.activeEventTypes.add(type);
        }
        window.app.uiManager.renderEvents();
    }

    isEventTypeActive(type) {
        return this.activeEventTypes.has(type);
    }

    getEventTypes() {
        return this.eventTypes;
    }
}