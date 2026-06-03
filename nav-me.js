// Me Page (Page 4) JavaScript

(function() {
    'use strict';

    const PROFILE_KEY = 'miffy_profile_v1';

    // Read profile from localStorage
    function readProfile() {
        try {
            return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    // Write profile to localStorage
    function writeProfile(profile) {
        try {
            localStorage.setItem(PROFILE_KEY, JSON.stringify(profile || {}));
        } catch (e) {}
    }

    // Apply profile data to UI
    function applyProfile(profile) {
        profile = profile || {};
        
        var nameEl = document.querySelector('.me-name');
        var idEl = document.querySelector('.me-id');
        var avatarEl = document.querySelector('.me-header .avatar');
        
        if (nameEl) nameEl.textContent = profile.name || 'Miffy';
        if (idEl) idEl.textContent = 'ID: ' + (profile.id || 'miffy_yoo');
        if (avatarEl) {
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.style.backgroundImage = profile.avatar 
                ? 'url("' + profile.avatar.replace(/"/g, '\\"') + '")' 
                : '';
        }
    }

    // Edit a specific field (avatar, name, or id)
    function editField(field) {
        var profile = readProfile();
        var currentValue = profile[field] || '';
        var label = field === 'avatar' ? '头像 URL' : field === 'name' ? '昵称' : 'ID';
        
        var nextValue = prompt('修改' + label, currentValue);
        if (nextValue === null) return;
        
        profile[field] = (nextValue || '').trim();
        
        // Set defaults if emptied
        if (field === 'name' && !profile[field]) profile[field] = 'Miffy';
        if (field === 'id' && !profile[field]) profile[field] = 'miffy_yoo';
        
        writeProfile(profile);
        applyProfile(profile);
    }

    // Initialize when DOM is ready or immediately if DOM is already loaded
    function initMe() {
        // Apply saved profile on page load
        applyProfile(readProfile());

        // Bind click events to avatar and name
        var meAvatarEl = document.querySelector('.me-header .avatar');
        var meNameEl = document.querySelector('.me-name');
        
        if (meAvatarEl) {
            meAvatarEl.addEventListener('click', function(e) {
                e.stopPropagation();
                editField('avatar');
            });
        }

        if (meNameEl) {
            meNameEl.addEventListener('click', function(e) {
                e.stopPropagation();
                editField('name');
            });
        }
    }

    // If DOM is already loaded, initialize immediately
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMe);
    } else {
        initMe();
    }

    // Export for external use if needed
    window.MePageModule = {
        readProfile,
        writeProfile,
        applyProfile,
        editField
    };
})();
