/*!
 * Videolitics para Webflow - Integración No Invasiva v2.1
 * Compatible con sitios Webflow existentes
 * 
 * CARACTERÍSTICAS:
 * - No interfiere con estilos ni scripts existentes
 * - Usa selectores específicos y únicos
 * - Totalmente encapsulado
 * - Compatible con Webflow CMS y interacciones
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
        
        // Sección (ID del elemento de Webflow a mostrar)
        showSectionPercent: 75,
        sectionId: '',  // ID o clase del elemento de Webflow
        enableSectionScroll: true,
        scrollOffset: 100,  // Píxeles de offset para el scroll
        
        // Opcional: WhatsApp
        whatsappNumber: '',
        whatsappMessage: 'Hola, me gustaría más información',
        showWhatsAppButton: false,  // false por defecto para no interferir
        whatsappButtonPercent: 75,
        
        // Textos
        returningTitle: '¡Bienvenido de nuevo!',
        continueText: '▶ Continuar donde lo dejaste',
        restartText: '🔄 Empezar desde el principio',
        
        // Debug
        debug: false,
        
        // Controles
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

    // ============================================
    // VARIABLES GLOBALES
    // ============================================
    var player = null;
    var container = null;
    var sectionShown = false;
    var whatsappButtonShown = false;
    var targetSection = null;

    // ============================================
    // LOGGING
    // ============================================
    function log(message, data) {
        if (config.debug) {
            if (data !== undefined) {
                console.log('[Videolitics]', message, data);
            } else {
                console.log('[Videolitics]', message);
            }
        }
    }

    function warn(message) {
        if (config.debug) {
            console.warn('[Videolitics]', message);
        }
    }

    function error(message) {
        console.error('[Videolitics]', message);
    }

    // ============================================
    // DETECCIÓN DE TIPO DE VIDEO
    // ============================================
    function getVideoType(url) {
        if (!url) return 'unknown';
        
        var lowerUrl = url.toLowerCase();
        
        if (lowerUrl.indexOf('youtube.com') !== -1 || lowerUrl.indexOf('youtu.be') !== -1) {
            return 'youtube';
        }
        if (lowerUrl.indexOf('vimeo.com') !== -1) {
            return 'vimeo';
        }
        if (lowerUrl.indexOf('.m3u8') !== -1) {
            return 'hls';
        }
        if (lowerUrl.indexOf('.mp4') !== -1 || lowerUrl.indexOf('.webm') !== -1) {
            return 'mp4';
        }
        
        return 'mp4';
    }

    // ============================================
    // STORAGE (LocalStorage)
    // ============================================
    var STORAGE_KEY = 'videolitics_data_v2';

    function getVideoData() {
        try {
            var data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            warn('Error al leer localStorage: ' + e.message);
        }
        
        return {
            visitNumber: 0,
            lastProgress: 0,
            lastProgressPercent: 0,
            hasWatchedBefore: false,
            lastVisit: null
        };
    }

    function saveVideoData(data) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            log('Datos guardados:', data);
        } catch (e) {
            warn('Error al guardar en localStorage: ' + e.message);
        }
    }

    function saveProgress(time, percent) {
        var data = getVideoData();
        data.lastProgress = time;
        data.lastProgressPercent = percent;
        data.lastVisit = new Date().toISOString();
        saveVideoData(data);
    }

    function incrementVisit() {
        var data = getVideoData();
        data.visitNumber += 1;
        data.hasWatchedBefore = data.visitNumber > 1;
        data.lastVisit = new Date().toISOString();
        saveVideoData(data);
        log('Visita número:', data.visitNumber);
    }

    // ============================================
    // BUSCAR SECCIÓN DE WEBFLOW
    // ============================================
    function findTargetSection() {
        if (!config.sectionId) {
            warn('No se configuró sectionId');
            return null;
        }

        // Buscar por ID
        var section = document.getElementById(config.sectionId);
        
        // Si no se encuentra por ID, buscar por clase
        if (!section) {
            section = document.querySelector('.' + config.sectionId);
        }
        
        // Si no se encuentra, buscar por atributo data
        if (!section) {
            section = document.querySelector('[data-videolitics-section="' + config.sectionId + '"]');
        }
        
        if (!section) {
            warn('Sección no encontrada: ' + config.sectionId);
            warn('Asegúrate de que existe un elemento con:');
            warn('- ID: ' + config.sectionId);
            warn('- O clase: ' + config.sectionId);
            warn('- O atributo: data-videolitics-section="' + config.sectionId + '"');
            return null;
        }
        
        log('Sección encontrada:', section);
        return section;
    }

    // ============================================
    // ✨ MOSTRAR SECCIÓN DE WEBFLOW
    // ============================================
    function showFormSection() {
        if (sectionShown) return;
        
        if (!targetSection) {
            targetSection = findTargetSection();
        }
        
        if (!targetSection) return;
        
        log('Mostrando sección de Webflow');
        
        // Guardar estilo original de display si no existe
        if (!targetSection.hasAttribute('data-original-display')) {
            var currentDisplay = window.getComputedStyle(targetSection).display;
            targetSection.setAttribute('data-original-display', currentDisplay);
        }
        
        // Mostrar con el display original o 'block'
        var originalDisplay = targetSection.getAttribute('data-original-display');
        targetSection.style.display = originalDisplay === 'none' ? 'block' : originalDisplay;
        
        // Añadir clase para animación CSS (opcional en Webflow)
        setTimeout(function() {
            targetSection.classList.add('vl-section-visible');
            targetSection.style.opacity = '1';
            targetSection.style.transform = 'translateY(0)';
            sectionShown = true;
            log('Sección visible con animación aplicada');
        }, 50);
        
        // Scroll suave hacia la sección
        if (config.enableSectionScroll) {
            setTimeout(function() {
                var rect = targetSection.getBoundingClientRect();
                var offset = rect.top + window.pageYOffset - config.scrollOffset;
                
                window.scrollTo({
                    top: offset,
                    behavior: 'smooth'
                });
                
                log('Scroll automático hacia la sección');
            }, 300);
        }
        
        // Disparar evento personalizado para Webflow Interactions
        var event;
        if (typeof CustomEvent === 'function') {
            event = new CustomEvent('videolitics:section-shown', { 
                detail: { 
                    sectionId: config.sectionId,
                    percent: config.showSectionPercent 
                } 
            });
        } else {
            event = document.createEvent('CustomEvent');
            event.initCustomEvent('videolitics:section-shown', true, true, {
                sectionId: config.sectionId,
                percent: config.showSectionPercent
            });
        }
        document.dispatchEvent(event);
    }

    // ============================================
    // CAPTURA DE PARÁMETROS UTM
    // ============================================
    function getUTMParams() {
        var params = {};
        var urlParams = new URLSearchParams(window.location.search);
        
        var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
        
        utmKeys.forEach(function(key) {
            if (urlParams.has(key)) {
                params[key] = urlParams.get(key);
            }
        });
        
        return params;
    }

    // ============================================
    // CONSTRUCCIÓN DE URL DE WHATSAPP
    // ============================================
    function buildWhatsAppUrl(phoneNumber, message) {
        if (!phoneNumber) return '#';

        var cleanNumber = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
        var utmParams = getUTMParams();
        var finalMessage = message;
        
        if (Object.keys(utmParams).length > 0) {
            finalMessage += '\n\n(Origen: ' + (utmParams.utm_source || 'directo');
            if (utmParams.utm_campaign) {
                finalMessage += ' | Campaña: ' + utmParams.utm_campaign;
            }
            finalMessage += ')';
        }
        
        var encodedMessage = encodeURIComponent(finalMessage);
        return 'https://wa.me/' + cleanNumber + '?text=' + encodedMessage;
    }

    // ============================================
    // MOSTRAR BOTÓN DE WHATSAPP (OPCIONAL)
    // ============================================
    function showWhatsAppButton() {
        if (!config.showWhatsAppButton) return;
        if (whatsappButtonShown) return;
        
        var existingButton = document.getElementById('vl-whatsapp-button');
        if (existingButton) {
            existingButton.style.display = 'block';
            whatsappButtonShown = true;
            log('Botón de WhatsApp mostrado');
            return;
        }
        
        var button = document.createElement('a');
        button.id = 'vl-whatsapp-button';
        button.className = 'vl-whatsapp-btn';
        button.href = buildWhatsAppUrl(config.whatsappNumber, config.whatsappMessage);
        button.target = '_blank';
        button.rel = 'noopener noreferrer';
        button.textContent = '💬 WhatsApp';
        
        document.body.appendChild(button);
        whatsappButtonShown = true;
        
        log('Botón de WhatsApp creado');
    }

    // ============================================
    // ACTUALIZAR PROGRESO DEL VIDEO
    // ============================================
    function updateProgress() {
        if (!player) return;
        
        var current = player.currentTime;
        var duration = player.duration;
        
        if (!duration || duration <= 0) return;
        
        var percent = (current / duration) * 100;
        
        saveProgress(current, percent);
        
        // Mostrar sección al % configurado
        if (config.sectionId && percent >= config.showSectionPercent) {
            showFormSection();
        }
        
        // Mostrar botón de WhatsApp (si está habilitado)
        if (config.showWhatsAppButton && config.whatsappNumber && percent >= config.whatsappButtonPercent) {
            showWhatsAppButton();
        }
        
        // Disparar evento de progreso para Webflow
        var event;
        if (typeof CustomEvent === 'function') {
            event = new CustomEvent('videolitics:progress', { 
                detail: { 
                    percent: percent,
                    current: current,
                    duration: duration
                } 
            });
        } else {
            event = document.createEvent('CustomEvent');
            event.initCustomEvent('videolitics:progress', true, true, {
                percent: percent,
                current: current,
                duration: duration
            });
        }
        document.dispatchEvent(event);
    }

    // ============================================
    // MODAL DE CONTINUAR/REINICIAR
    // ============================================
    function showContinueModal(lastProgress, lastPercent) {
        var overlay = document.createElement('div');
        overlay.className = 'vl-modal-overlay';
        overlay.innerHTML = 
            '<div class="vl-modal-content">' +
                '<h3>' + config.returningTitle + '</h3>' +
                '<p>Viste el <strong>' + Math.round(lastPercent) + '%</strong> del video</p>' +
                '<div class="vl-modal-buttons">' +
                    '<button class="vl-btn-primary vl-continue-btn">' + config.continueText + '</button>' +
                    '<button class="vl-btn-secondary vl-restart-btn">' + config.restartText + '</button>' +
                '</div>' +
            '</div>';
        
        document.body.appendChild(overlay);
        
        overlay.querySelector('.vl-continue-btn').addEventListener('click', function() {
            player.currentTime = lastProgress;
            player.play();
            document.body.removeChild(overlay);
            log('Usuario continuó desde:', lastProgress);
        });
        
        overlay.querySelector('.vl-restart-btn').addEventListener('click', function() {
            player.currentTime = 0;
            player.play();
            document.body.removeChild(overlay);
            log('Usuario reinició el video');
        });
    }

    // ============================================
    // INICIALIZAR PLYR
    // ============================================
    function initPlyr(videoElement, videoType) {
        log('Inicializando Plyr para tipo:', videoType);
        
        var plyrConfig = {
            controls: config.controls,
            autoplay: false,
            muted: true,
            volume: 0.8,
            clickToPlay: true,
            hideControls: false,
            resetOnEnd: false
        };

        if (videoType === 'youtube') {
            plyrConfig.youtube = { noCookie: true, rel: 0, showinfo: 0 };
        } else if (videoType === 'vimeo') {
            plyrConfig.vimeo = { byline: false, portrait: false, title: false };
        }

        player = new Plyr(videoElement, plyrConfig);
        
        // Eventos
        player.on('ready', function() {
            log('Plyr listo');
            hideLoading();
            
            var data = getVideoData();
            
            if (data.hasWatchedBefore && data.lastProgressPercent > 10 && data.lastProgressPercent < 95) {
                showContinueModal(data.lastProgress, data.lastProgressPercent);
            } else if (data.hasWatchedBefore) {
                player.muted = true;
                player.play().catch(function(e) {
                    warn('Autoplay bloqueado:', e.message);
                });
            }
            
            // Evento personalizado
            var event;
            if (typeof CustomEvent === 'function') {
                event = new CustomEvent('videolitics:ready');
            } else {
                event = document.createEvent('CustomEvent');
                event.initCustomEvent('videolitics:ready', true, true, null);
            }
            document.dispatchEvent(event);
        });

        player.on('play', function() {
            log('Video reproduciendo');
        });

        player.on('timeupdate', function() {
            updateProgress();
        });

        player.on('ended', function() {
            log('Video finalizado');
            
            var data = getVideoData();
            data.lastProgressPercent = 100;
            saveVideoData(data);
            
            // Evento personalizado
            var event;
            if (typeof CustomEvent === 'function') {
                event = new CustomEvent('videolitics:ended');
            } else {
                event = document.createEvent('CustomEvent');
                event.initCustomEvent('videolitics:ended', true, true, null);
            }
            document.dispatchEvent(event);
        });
    }

    // ============================================
    // INICIALIZAR VIDEO HLS
    // ============================================
    function initHLS(videoElement) {
        if (typeof Hls === 'undefined') {
            error('Hls.js no está cargado');
            return;
        }

        if (Hls.isSupported()) {
            var hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 90
            });
            
            hls.loadSource(config.video);
            hls.attachMedia(videoElement);
            
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                log('HLS manifest cargado');
                initPlyr(videoElement, 'hls');
            });
            
            hls.on(Hls.Events.ERROR, function(event, data) {
                if (data.fatal) {
                    error('Error fatal de HLS:', data);
                }
            });
        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            videoElement.src = config.video;
            initPlyr(videoElement, 'hls');
        } else {
            error('HLS no soportado en este navegador');
        }
    }

    // ============================================
    // EXTRAER ID DE VIDEO
    // ============================================
    function extractVideoId(url, type) {
        if (type === 'youtube') {
            var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
            var match = url.match(regExp);
            return (match && match[2].length === 11) ? match[2] : null;
        } else if (type === 'vimeo') {
            var regExp = /vimeo.*\/(\d+)/i;
            var match = url.match(regExp);
            return match ? match[1] : null;
        }
        return null;
    }

    // ============================================
    // CREAR REPRODUCTOR
    // ============================================
    function createPlayer() {
        var videoType = getVideoType(config.video);
        log('Tipo de video detectado:', videoType);
        
        var videoElement;
        
        if (videoType === 'youtube' || videoType === 'vimeo') {
            videoElement = document.createElement('div');
            videoElement.setAttribute('data-plyr-provider', videoType);
            videoElement.setAttribute('data-plyr-embed-id', extractVideoId(config.video, videoType));
        } else {
            videoElement = document.createElement('video');
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('controls', '');
            
            if (config.poster) {
                videoElement.setAttribute('poster', config.poster);
            }
            
            if (videoType === 'mp4') {
                videoElement.src = config.video;
            }
        }
        
        container.innerHTML = '';
        container.appendChild(videoElement);
        
        if (videoType === 'hls') {
            initHLS(videoElement);
        } else {
            initPlyr(videoElement, videoType);
        }
    }

    // ============================================
    // MOSTRAR/OCULTAR LOADING
    // ============================================
    function hideLoading() {
        var loading = container.querySelector('.vl-loading');
        if (loading) {
            loading.style.display = 'none';
        }
    }

    // ============================================
    // VALIDACIONES
    // ============================================
    function validateConfig() {
        if (!config.video) {
            error('No se ha configurado la URL del video');
            return false;
        }
        
        return true;
    }

    // ============================================
    // INICIALIZACIÓN PRINCIPAL
    // ============================================
    function init() {
        // Comprobar si está habilitado
        if (config.enabled === false) {
            log('Videolitics desactivado (enabled: false)');
            return;
        }
        
        log('Iniciando Videolitics para Webflow v2.1');
        log('Configuración:', config);
        
        container = document.getElementById('videolitics-player');
        
        if (!container) {
            error('Contenedor #videolitics-player no encontrado');
            error('Añade un Embed con: <div id="videolitics-player"></div>');
            return;
        }
        
        if (!validateConfig()) {
            return;
        }
        
        // Buscar sección objetivo
        if (config.sectionId) {
            targetSection = findTargetSection();
            
            // Ocultar inicialmente si existe
            if (targetSection) {
                targetSection.style.display = 'none';
                targetSection.style.opacity = '0';
                targetSection.style.transform = 'translateY(30px)';
                targetSection.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                log('Sección oculta inicialmente');
            }
        }
        
        incrementVisit();
        createPlayer();
        
        log('Videolitics inicializado correctamente');
    }

    // ============================================
    // AUTO-INIT
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Exponer API pública para Webflow
    window.Videolitics = {
        showSection: showFormSection,
        getProgress: function() {
            return player ? {
                current: player.currentTime,
                duration: player.duration,
                percent: (player.currentTime / player.duration) * 100
            } : null;
        },
        getData: getVideoData
    };

})();
