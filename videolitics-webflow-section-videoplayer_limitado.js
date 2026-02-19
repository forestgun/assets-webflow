/*!
 * Videolitics para Webflow - Integración No Invasiva v2.2
 * Compatible con sitios Webflow existentes
 *
 * NUEVO EN v2.2:
 * - disableSeek: impide avanzar/retroceder en el video
 * - disableVolume: oculta los controles de volumen
 * - centerPlayOnly: reproduce únicamente mediante botón central superpuesto
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURACIÓN PREDETERMINADA
    // ============================================
    var defaultConfig = {
        // Video
        video: '',
        poster: '',

        // Sección
        showSectionPercent: 75,
        sectionId: '',
        enableSectionScroll: true,
        scrollOffset: 100,

        // WhatsApp (opcional)
        whatsappNumber: '',
        whatsappMessage: 'Hola, me gustaría más información',
        showWhatsAppButton: false,
        whatsappButtonPercent: 75,

        // Textos
        returningTitle: '¡Bienvenido de nuevo!',
        continueText: '▶ Continuar donde lo dejaste',
        restartText: '🔄 Empezar desde el principio',

        // ============================================
        // NUEVAS OPCIONES v2.2
        // ============================================
        disableSeek: false,     // Impide que el usuario adelante o retroceda
        disableVolume: false,   // Oculta los controles de volumen/mute
        centerPlayOnly: false,  // Solo permite reproducir con el botón central
                                // (activa disableSeek y disableVolume automáticamente)

        // Debug
        debug: false,

        // Controles base
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen']
    };

    // ============================================
    // MERGE DE CONFIGURACIÓN
    // ============================================
    var config = {};
    for (var key in defaultConfig) {
        config[key] = defaultConfig[key];
    }
    if (window.VideoliticsConfig) {
        for (var key in window.VideoliticsConfig) {
            config[key] = window.VideoliticsConfig[key];
        }
    }

    // centerPlayOnly activa implícitamente disableSeek y disableVolume
    if (config.centerPlayOnly) {
        config.disableSeek   = true;
        config.disableVolume = true;
    }

    // ============================================
    // VARIABLES GLOBALES
    // ============================================
    var player            = null;
    var container         = null;
    var sectionShown      = false;
    var whatsappButtonShown = false;
    var targetSection     = null;
    var lastValidTime     = 0;   // Para bloquear el seek

    // ============================================
    // LOGGING
    // ============================================
    function log(message, data) {
        if (config.debug) {
            data !== undefined
                ? console.log('[Videolitics]', message, data)
                : console.log('[Videolitics]', message);
        }
    }
    function warn(message)  { if (config.debug) console.warn('[Videolitics]', message); }
    function error(message) { console.error('[Videolitics]', message); }

    // ============================================
    // CONSTRUIR ARRAY DE CONTROLES SEGÚN CONFIG
    // ============================================
    function buildControls() {
        var controls = config.controls.slice(); // copia

        if (config.centerPlayOnly) {
            // Solo botón central + tiempo + pantalla completa
            controls = ['play-large', 'current-time', 'duration', 'fullscreen'];
        } else {
            // Eliminar controles de volumen si disableVolume
            if (config.disableVolume) {
                controls = controls.filter(function(c) {
                    return c !== 'mute' && c !== 'volume';
                });
            }
            // Eliminar barra de progreso si disableSeek
            if (config.disableSeek) {
                controls = controls.filter(function(c) {
                    return c !== 'progress' && c !== 'rewind' && c !== 'fast-forward';
                });
            }
        }

        log('Controles construidos:', controls);
        return controls;
    }

    // ============================================
    // INYECTAR ESTILOS DEL BOTÓN CENTRAL Y BLOQUEOS
    // ============================================
    function injectStyles() {
        var css = '';

        // ---- Botón de play central personalizado ----
        if (config.centerPlayOnly) {
            css += '\
                #videolitics-player .vl-center-play {\
                    position: absolute;\
                    top: 50%;\
                    left: 50%;\
                    transform: translate(-50%, -50%);\
                    width: 80px;\
                    height: 80px;\
                    background: rgba(0,0,0,0.65);\
                    border-radius: 50%;\
                    display: flex;\
                    align-items: center;\
                    justify-content: center;\
                    cursor: pointer;\
                    z-index: 10;\
                    transition: background 0.2s ease, transform 0.2s ease;\
                    pointer-events: all;\
                }\
                #videolitics-player .vl-center-play:hover {\
                    background: rgba(0,0,0,0.85);\
                    transform: translate(-50%, -50%) scale(1.1);\
                }\
                #videolitics-player .vl-center-play svg {\
                    width: 32px;\
                    height: 32px;\
                    fill: #fff;\
                    margin-left: 6px; /* compensa el triángulo óptico */\
                }\
                /* Ocultar cuando está reproduciendo */\
                #videolitics-player.vl-playing .vl-center-play {\
                    opacity: 0;\
                    pointer-events: none;\
                    transition: opacity 0.3s ease;\
                }\
                /* Mostrar al hacer hover aunque esté reproduciendo */\
                #videolitics-player.vl-playing:hover .vl-center-play {\
                    opacity: 1;\
                    pointer-events: all;\
                }\
            ';
        }

        // ---- Bloquear cursor sobre la barra de progreso ----
        if (config.disableSeek) {
            css += '\
                #videolitics-player .plyr__progress {\
                    pointer-events: none !important;\
                    cursor: default !important;\
                }\
                #videolitics-player .plyr__progress input[type=range] {\
                    pointer-events: none !important;\
                    cursor: default !important;\
                }\
            ';
        }

        // ---- Ocultar controles de volumen ----
        if (config.disableVolume) {
            css += '\
                #videolitics-player .plyr__volume,\
                #videolitics-player [data-plyr="mute"],\
                #videolitics-player [data-plyr="volume"] {\
                    display: none !important;\
                }\
            ';
        }

        if (css) {
            var style = document.createElement('style');
            style.id  = 'vl-custom-styles';
            style.textContent = css;
            document.head.appendChild(style);
            log('Estilos inyectados');
        }
    }

    // ============================================
    // CREAR BOTÓN CENTRAL SUPERPUESTO
    // ============================================
    function createCenterPlayButton() {
        if (!config.centerPlayOnly) return;

        // El contenedor necesita position relative para anclar el botón
        container.style.position = 'relative';

        var btn = document.createElement('div');
        btn.className = 'vl-center-play';
        btn.title     = 'Reproducir';
        btn.innerHTML =
            '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M8 5v14l11-7z"/>' +
            '</svg>';

        btn.addEventListener('click', function() {
            if (!player) return;
            if (player.playing) {
                player.pause();
            } else {
                player.play();
            }
        });

        container.appendChild(btn);
        log('Botón central creado');

        return btn;
    }

    // ============================================
    // BLOQUEAR SEEK (avanzar/retroceder)
    // ============================================
    function setupSeekBlock() {
        if (!config.disableSeek || !player) return;

        // En Plyr el evento nativo de seeking viene del media interno
        var media = player.media;

        media.addEventListener('seeking', function() {
            // Si la diferencia es mayor a 1s asumimos seek manual
            if (Math.abs(media.currentTime - lastValidTime) > 1) {
                log('Seek bloqueado. Volviendo a:', lastValidTime);
                media.currentTime = lastValidTime;
            }
        });

        log('Bloqueo de seek activado');
    }

    // ============================================
    // DETECCIÓN DE TIPO DE VIDEO
    // ============================================
    function getVideoType(url) {
        if (!url) return 'unknown';
        var lowerUrl = url.toLowerCase();
        if (lowerUrl.indexOf('youtube.com') !== -1 || lowerUrl.indexOf('youtu.be') !== -1) return 'youtube';
        if (lowerUrl.indexOf('vimeo.com') !== -1)  return 'vimeo';
        if (lowerUrl.indexOf('.m3u8') !== -1)       return 'hls';
        if (lowerUrl.indexOf('.mp4') !== -1 || lowerUrl.indexOf('.webm') !== -1) return 'mp4';
        return 'mp4';
    }

    // ============================================
    // STORAGE
    // ============================================
    var STORAGE_KEY = 'videolitics_data_v2';

    function getVideoData() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            if (data) return JSON.parse(data);
        } catch (e) { warn('Error al leer localStorage: ' + e.message); }
        return { visitNumber: 0, lastProgress: 0, lastProgressPercent: 0, hasWatchedBefore: false, lastVisit: null };
    }

    function saveVideoData(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            log('Datos guardados:', data);
        } catch (e) { warn('Error al guardar en localStorage: ' + e.message); }
    }

    function saveProgress(time, percent) {
        var data = getVideoData();
        data.lastProgress        = time;
        data.lastProgressPercent = percent;
        data.lastVisit           = new Date().toISOString();
        saveVideoData(data);
    }

    function incrementVisit() {
        var data = getVideoData();
        data.visitNumber    += 1;
        data.hasWatchedBefore = data.visitNumber > 1;
        data.lastVisit       = new Date().toISOString();
        saveVideoData(data);
        log('Visita número:', data.visitNumber);
    }

    // ============================================
    // BUSCAR SECCIÓN DE WEBFLOW
    // ============================================
    function findTargetSection() {
        if (!config.sectionId) { warn('No se configuró sectionId'); return null; }
        var section = document.getElementById(config.sectionId)
                   || document.querySelector('.' + config.sectionId)
                   || document.querySelector('[data-videolitics-section="' + config.sectionId + '"]');
        if (!section) warn('Sección no encontrada: ' + config.sectionId);
        else log('Sección encontrada:', section);
        return section;
    }

    // ============================================
    // MOSTRAR SECCIÓN DE WEBFLOW
    // ============================================
    function showFormSection() {
        if (sectionShown) return;
        if (!targetSection) targetSection = findTargetSection();
        if (!targetSection) return;

        log('Mostrando sección de Webflow');

        if (!targetSection.hasAttribute('data-original-display')) {
            targetSection.setAttribute('data-original-display', window.getComputedStyle(targetSection).display);
        }
        var originalDisplay = targetSection.getAttribute('data-original-display');
        targetSection.style.display = originalDisplay === 'none' ? 'block' : originalDisplay;

        setTimeout(function() {
            targetSection.classList.add('vl-section-visible');
            targetSection.style.opacity   = '1';
            targetSection.style.transform = 'translateY(0)';
            sectionShown = true;
        }, 50);

        if (config.enableSectionScroll) {
            setTimeout(function() {
                var rect   = targetSection.getBoundingClientRect();
                var offset = rect.top + window.pageYOffset - config.scrollOffset;
                window.scrollTo({ top: offset, behavior: 'smooth' });
            }, 300);
        }

        dispatchEvent('videolitics:section-shown', { sectionId: config.sectionId, percent: config.showSectionPercent });
    }

    // ============================================
    // HELPER: DISPATCH CUSTOM EVENTS
    // ============================================
    function dispatchEvent(name, detail) {
        var evt;
        if (typeof CustomEvent === 'function') {
            evt = new CustomEvent(name, { detail: detail || null });
        } else {
            evt = document.createEvent('CustomEvent');
            evt.initCustomEvent(name, true, true, detail || null);
        }
        document.dispatchEvent(evt);
    }

    // ============================================
    // UTM
    // ============================================
    function getUTMParams() {
        var params    = {};
        var urlParams = new URLSearchParams(window.location.search);
        ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(function(k) {
            if (urlParams.has(k)) params[k] = urlParams.get(k);
        });
        return params;
    }

    // ============================================
    // WHATSAPP
    // ============================================
    function buildWhatsAppUrl(phoneNumber, message) {
        if (!phoneNumber) return '#';
        var cleanNumber  = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
        var utmParams    = getUTMParams();
        var finalMessage = message;
        if (Object.keys(utmParams).length > 0) {
            finalMessage += '\n\n(Origen: ' + (utmParams.utm_source || 'directo');
            if (utmParams.utm_campaign) finalMessage += ' | Campaña: ' + utmParams.utm_campaign;
            finalMessage += ')';
        }
        return 'https://wa.me/' + cleanNumber + '?text=' + encodeURIComponent(finalMessage);
    }

    function showWhatsAppButton() {
        if (!config.showWhatsAppButton || whatsappButtonShown) return;
        var existing = document.getElementById('vl-whatsapp-button');
        if (existing) { existing.style.display = 'block'; whatsappButtonShown = true; return; }

        var button = document.createElement('a');
        button.id        = 'vl-whatsapp-button';
        button.className = 'vl-whatsapp-btn';
        button.href      = buildWhatsAppUrl(config.whatsappNumber, config.whatsappMessage);
        button.target    = '_blank';
        button.rel       = 'noopener noreferrer';
        button.textContent = '💬 WhatsApp';
        document.body.appendChild(button);
        whatsappButtonShown = true;
    }

    // ============================================
    // ACTUALIZAR PROGRESO
    // ============================================
    function updateProgress() {
        if (!player) return;
        var current  = player.currentTime;
        var duration = player.duration;
        if (!duration || duration <= 0) return;

        var percent = (current / duration) * 100;

        // Actualizar tiempo válido (solo si no hay seek bloqueado)
        lastValidTime = current;

        saveProgress(current, percent);

        if (config.sectionId && percent >= config.showSectionPercent)       showFormSection();
        if (config.showWhatsAppButton && percent >= config.whatsappButtonPercent) showWhatsAppButton();

        dispatchEvent('videolitics:progress', { percent: percent, current: current, duration: duration });
    }

    // ============================================
    // MODAL CONTINUAR / REINICIAR
    // ============================================
    function showContinueModal(lastProgress, lastPercent) {
        var overlay = document.createElement('div');
        overlay.className = 'vl-modal-overlay';
        overlay.innerHTML =
            '<div class="vl-modal-content">' +
                '<h3>' + config.returningTitle + '</h3>' +
                '<p>Viste el <strong>' + Math.round(lastPercent) + '%</strong> del video</p>' +
                '<div class="vl-modal-buttons">' +
                    '<button class="vl-btn-primary vl-continue-btn">'  + config.continueText + '</button>' +
                    '<button class="vl-btn-secondary vl-restart-btn">' + config.restartText  + '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        overlay.querySelector('.vl-continue-btn').addEventListener('click', function() {
            // Permitir temporalmente el seek solo para continuar
            lastValidTime       = lastProgress;
            player.currentTime  = lastProgress;
            player.play();
            document.body.removeChild(overlay);
        });

        overlay.querySelector('.vl-restart-btn').addEventListener('click', function() {
            lastValidTime      = 0;
            player.currentTime = 0;
            player.play();
            document.body.removeChild(overlay);
        });
    }

    // ============================================
    // INICIALIZAR PLYR
    // ============================================
    function initPlyr(videoElement, videoType) {
        log('Inicializando Plyr para tipo:', videoType);

        var plyrConfig = {
            controls:      buildControls(),
            autoplay:      false,
            muted:         true,
            volume:        0.8,
            clickToPlay:   !config.centerPlayOnly, // deshabilitar click en video si usamos botón central
            hideControls:  false,
            resetOnEnd:    false
        };

        if (videoType === 'youtube') plyrConfig.youtube = { noCookie: true, rel: 0, showinfo: 0 };
        if (videoType === 'vimeo')   plyrConfig.vimeo   = { byline: false, portrait: false, title: false };

        player = new Plyr(videoElement, plyrConfig);

        // Crear botón central (debe estar en el DOM antes del ready)
        var centerBtn = createCenterPlayButton();

        player.on('ready', function() {
            log('Plyr listo');
            hideLoading();
            setupSeekBlock();

            // Sincronizar estado del botón central con reproducción
            if (centerBtn) {
                player.on('play',  function() { container.classList.add('vl-playing'); });
                player.on('pause', function() { container.classList.remove('vl-playing'); });
                player.on('ended', function() { container.classList.remove('vl-playing'); });
            }

            var data = getVideoData();
            if (data.hasWatchedBefore && data.lastProgressPercent > 10 && data.lastProgressPercent < 95) {
                showContinueModal(data.lastProgress, data.lastProgressPercent);
            } else if (data.hasWatchedBefore) {
                player.muted = true;
                player.play().catch(function(e) { warn('Autoplay bloqueado: ' + e.message); });
            }

            dispatchEvent('videolitics:ready');
        });

        player.on('timeupdate', function() { updateProgress(); });

        player.on('ended', function() {
            log('Video finalizado');
            var data = getVideoData();
            data.lastProgressPercent = 100;
            saveVideoData(data);
            dispatchEvent('videolitics:ended');
        });
    }

    // ============================================
    // HLS
    // ============================================
    function initHLS(videoElement) {
        if (typeof Hls === 'undefined') { error('Hls.js no está cargado'); return; }
        if (Hls.isSupported()) {
            var hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 90 });
            hls.loadSource(config.video);
            hls.attachMedia(videoElement);
            hls.on(Hls.Events.MANIFEST_PARSED, function() { initPlyr(videoElement, 'hls'); });
            hls.on(Hls.Events.ERROR, function(e, data) { if (data.fatal) error('Error fatal HLS'); });
        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            videoElement.src = config.video;
            initPlyr(videoElement, 'hls');
        } else {
            error('HLS no soportado');
        }
    }

    // ============================================
    // EXTRAER ID DE VIDEO
    // ============================================
    function extractVideoId(url, type) {
        if (type === 'youtube') {
            var m = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
            return (m && m[2].length === 11) ? m[2] : null;
        }
        if (type === 'vimeo') {
            var m = url.match(/vimeo.*\/(\d+)/i);
            return m ? m[1] : null;
        }
        return null;
    }

    // ============================================
    // CREAR REPRODUCTOR
    // ============================================
    function createPlayer() {
        var videoType = getVideoType(config.video);
        log('Tipo de video:', videoType);

        var videoElement;

        if (videoType === 'youtube' || videoType === 'vimeo') {
            videoElement = document.createElement('div');
            videoElement.setAttribute('data-plyr-provider', videoType);
            videoElement.setAttribute('data-plyr-embed-id', extractVideoId(config.video, videoType));
        } else {
            videoElement = document.createElement('video');
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('controls', '');
            if (config.poster)               videoElement.setAttribute('poster', config.poster);
            if (videoType === 'mp4')         videoElement.src = config.video;
        }

        container.innerHTML = '';
        container.appendChild(videoElement);

        videoType === 'hls' ? initHLS(videoElement) : initPlyr(videoElement, videoType);
    }

    // ============================================
    // UTILS
    // ============================================
    function hideLoading() {
        var loading = container.querySelector('.vl-loading');
        if (loading) loading.style.display = 'none';
    }

    function validateConfig() {
        if (!config.video) { error('No se ha configurado la URL del video'); return false; }
        return true;
    }

    // ============================================
    // INIT
    // ============================================
    function init() {
        log('Iniciando Videolitics para Webflow v2.2');
        log('Configuración:', config);

        container = document.getElementById('videolitics-player');
        if (!container) { error('Contenedor #videolitics-player no encontrado'); return; }
        if (!validateConfig()) return;

        injectStyles();

        if (config.sectionId) {
            targetSection = findTargetSection();
            if (targetSection) {
                targetSection.style.display    = 'none';
                targetSection.style.opacity    = '0';
                targetSection.style.transform  = 'translateY(30px)';
                targetSection.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            }
        }

        incrementVisit();
        createPlayer();

        log('Videolitics v2.2 inicializado');
    }

    // ============================================
    // AUTO-INIT
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // API pública
    window.Videolitics = {
        showSection:  showFormSection,
        getProgress:  function() {
            return player ? {
                current:  player.currentTime,
                duration: player.duration,
                percent:  (player.currentTime / player.duration) * 100
            } : null;
        },
        getData: getVideoData
    };

})();