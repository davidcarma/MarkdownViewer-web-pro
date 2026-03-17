/**
 * Google Analytics 4 with explicit consent on production only.
 * The editor must remain fully usable when analytics is unavailable or denied.
 */
(function () {
    'use strict';

    const MEASUREMENT_ID = 'G-CPZVPLENGZ';
    const CONSENT_STORAGE_KEY = 'markdownpro-analytics-consent';
    const PRODUCTION_HOSTS = new Set([
        'markdownpro.eyesondash.com'
    ]);
    const CONSENT_GRANTED = 'granted';
    const CONSENT_DENIED = 'denied';

    let analyticsConfigured = false;

    function isProductionHost() {
        return typeof window !== 'undefined' && PRODUCTION_HOSTS.has(window.location.hostname);
    }

    function isOnline() {
        return typeof navigator === 'undefined' || navigator.onLine !== false;
    }

    function getStoredConsent() {
        try {
            return localStorage.getItem(CONSENT_STORAGE_KEY);
        } catch (_) {
            return null;
        }
    }

    function persistConsent(value) {
        try {
            localStorage.setItem(CONSENT_STORAGE_KEY, value);
        } catch (_) {}
    }

    function ensureGtag() {
        window.dataLayer = window.dataLayer || [];
        window.gtag = window.gtag || function () {
            window.dataLayer.push(arguments);
        };
    }

    function applyDeniedConsent() {
        ensureGtag();
        window.gtag('consent', 'default', {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied'
        });
    }

    function applyGrantedConsent() {
        ensureGtag();
        window.gtag('consent', 'update', {
            analytics_storage: 'granted',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied'
        });
    }

    function loadAnalyticsScript() {
        if (window.__mdproAnalyticsScriptLoaded || !isOnline()) {
            return;
        }
        window.__mdproAnalyticsScriptLoaded = true;

        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
        script.onerror = function () {
            window.__mdproAnalyticsScriptLoaded = false;
        };
        document.head.appendChild(script);
    }

    function configureAnalytics() {
        if (analyticsConfigured) {
            return;
        }
        analyticsConfigured = true;
        ensureGtag();
        window.gtag('js', new Date());
        window.gtag('config', MEASUREMENT_ID, {
            anonymize_ip: true,
            transport_type: 'beacon'
        });
    }

    function getConsentLink() {
        return document.getElementById('analyticsConsentLink');
    }

    function updateConsentLink() {
        const link = getConsentLink();
        if (!link) {
            return;
        }
        link.hidden = !isProductionHost();
        const consent = getStoredConsent();
        if (consent === CONSENT_GRANTED) {
            link.textContent = 'Analytics: On';
        } else if (consent === CONSENT_DENIED) {
            link.textContent = 'Analytics: Off';
        } else {
            link.textContent = 'Cookie Settings';
        }
    }

    function buildBanner() {
        if (document.getElementById('analyticsConsentBanner')) {
            return document.getElementById('analyticsConsentBanner');
        }

        const banner = document.createElement('section');
        banner.id = 'analyticsConsentBanner';
        banner.className = 'analytics-consent-banner';
        banner.setAttribute('aria-live', 'polite');
        banner.innerHTML = [
            '<h2 class="analytics-consent-title">Analytics consent</h2>',
            '<p class="analytics-consent-copy">Markdown Pro can use Google Analytics on the production site to measure aggregate usage. Analytics stays off until you allow it. See <a href="./privacy.html" target="_blank" rel="noopener">Privacy</a>.</p>',
            '<div class="analytics-consent-actions">',
            '<button type="button" class="btn btn-secondary" id="analyticsRejectBtn">Reject</button>',
            '<button type="button" class="btn btn-primary" id="analyticsAcceptBtn">Allow analytics</button>',
            '</div>'
        ].join('');

        document.body.appendChild(banner);

        banner.querySelector('#analyticsAcceptBtn').addEventListener('click', function () {
            grantConsent();
            hideBanner();
        });
        banner.querySelector('#analyticsRejectBtn').addEventListener('click', function () {
            denyConsent();
            hideBanner();
        });

        return banner;
    }

    function showBanner() {
        const banner = buildBanner();
        banner.hidden = false;
    }

    function hideBanner() {
        const banner = document.getElementById('analyticsConsentBanner');
        if (banner) {
            banner.hidden = true;
        }
        updateConsentLink();
    }

    function denyConsent() {
        persistConsent(CONSENT_DENIED);
        applyDeniedConsent();
        updateConsentLink();
    }

    function grantConsent() {
        persistConsent(CONSENT_GRANTED);
        applyGrantedConsent();
        configureAnalytics();
        loadAnalyticsScript();
        updateConsentLink();
    }

    function wireConsentLink() {
        const link = getConsentLink();
        if (!link || link.dataset.bound === '1') {
            return;
        }
        link.dataset.bound = '1';
        link.addEventListener('click', function () {
            showBanner();
        });
    }

    function initAnalyticsConsent() {
        if (!isProductionHost()) {
            return;
        }

        applyDeniedConsent();
        wireConsentLink();
        updateConsentLink();

        const consent = getStoredConsent();
        if (consent === CONSENT_GRANTED) {
            grantConsent();
            hideBanner();
            return;
        }

        if (consent === CONSENT_DENIED) {
            denyConsent();
            hideBanner();
            return;
        }

        showBanner();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAnalyticsConsent, { once: true });
    } else {
        initAnalyticsConsent();
    }
})();
