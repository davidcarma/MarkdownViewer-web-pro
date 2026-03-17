/**
 * Google Analytics 4 loader for the production site only.
 * The editor must remain fully usable when analytics is unavailable.
 */
(function () {
    'use strict';

    const MEASUREMENT_ID = 'G-CPZVPLENGZ';
    const PRODUCTION_HOSTS = new Set([
        'markdownpro.eyesondash.com'
    ]);

    function isProductionHost() {
        return typeof window !== 'undefined' && PRODUCTION_HOSTS.has(window.location.hostname);
    }

    function isDoNotTrackEnabled() {
        if (typeof navigator === 'undefined') return false;
        const value = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
        return value === '1' || value === 'yes';
    }

    function isOnline() {
        return typeof navigator === 'undefined' || navigator.onLine !== false;
    }

    function loadAnalytics() {
        if (!isProductionHost() || !isOnline() || isDoNotTrackEnabled()) {
            return;
        }

        if (window.__mdproAnalyticsLoaded) {
            return;
        }
        window.__mdproAnalyticsLoaded = true;

        window.dataLayer = window.dataLayer || [];
        window.gtag = window.gtag || function () {
            window.dataLayer.push(arguments);
        };

        window.gtag('js', new Date());
        window.gtag('config', MEASUREMENT_ID, {
            anonymize_ip: true,
            transport_type: 'beacon'
        });

        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
        script.onerror = function () {
            window.__mdproAnalyticsLoaded = false;
        };
        document.head.appendChild(script);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadAnalytics, { once: true });
    } else {
        loadAnalytics();
    }
})();
