// SettingsManager.js

export class SettingsManager {
    constructor() {
        this.settings = {};
    }

    loadSettings() {
        this.settings = JSON.parse(localStorage.getItem('settings')) || {};
        Object.keys(this.settings).forEach(key => {
            const input = document.getElementById(key);
            if (input) input.value = this.settings[key];
        });
    }

    saveSettings(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        formData.forEach((value, key) => {
            this.settings[key] = value;
        });
        localStorage.setItem('settings', JSON.stringify(this.settings));
        alert('Settings saved successfully!');
    }

    getSettings() {
        return this.settings;
    }

    getTheme() {
        return localStorage.getItem('theme') || 'light';
    }

    setTheme(theme) {
        localStorage.setItem('theme', theme);
    }
}