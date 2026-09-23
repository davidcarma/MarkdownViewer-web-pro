/**
 * Pure Drive identity helpers.
 * Drive addresses files by ID. The same name in one parent can exist many times.
 * Callers must reuse one ID per (parent, name, kind), not POST a second item.
 */
(function (root) {
    'use strict';

    function escapeDriveQueryValue(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }

    function parentKey(item) {
        const parents = (item && item.parents) || [];
        if (!parents.length) return '';
        return parents.slice().map(String).sort().join(',');
    }

    function sameParent(a, b) {
        return parentKey(a) === parentKey(b);
    }

    /**
     * Pick one survivor from same-name siblings.
     * Prefer a known ID (stored root or the file we just wrote), then most children, then oldest.
     */
    function selectCanonicalItem(items, preferredId) {
        const list = Array.isArray(items) ? items.filter((item) => item && item.id) : [];
        if (list.length === 0) return null;
        if (preferredId) {
            const hit = list.find((item) => item.id === preferredId);
            if (hit) return hit;
        }
        return list.slice().sort((a, b) => {
            const childA = a.childCount || 0;
            const childB = b.childCount || 0;
            if (childB !== childA) return childB - childA;
            const timeA = Date.parse(a.createdTime || '') || 0;
            const timeB = Date.parse(b.createdTime || '') || 0;
            if (timeA !== timeB) return timeA - timeB;
            return String(a.id).localeCompare(String(b.id));
        })[0];
    }

    const api = {
        escapeDriveQueryValue,
        parentKey,
        sameParent,
        selectCanonicalItem
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.DriveIdentity = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
