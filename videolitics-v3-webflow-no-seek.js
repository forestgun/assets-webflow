/*!
 * Videolitics v3.0 - Sin Navegación de Video
 * Sistema de video inteligente para Webflow
 * - Bloquea adelantar/retroceder el video
 * - Oculta barra de progreso
 * - Muestra sección al % configurado
 * - Memoria de progreso inteligente
 * 
 * @author Videolitics
 * @version 3.0.0
 * @license MIT
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
        
        // Sección de Webflow
        showSectionPercent: 75,
        sectionId: '',
        enableSectionScroll: true,
        scrollOffset: 100,
        
        // WhatsApp (opcional)
        whatsappNumber: '',
        whatsappMessage: 'Hola, me gustaría más información',
        showWhatsAppButton: false,
        whatsappButtonPercent: 75,
        
        // ✨ CONTROL DE NAVEGACIÓN (v3.0)
        allowSeek: false,           // Permitir adelantar/retroceder
        showProgress: false,        // Mostrar barra de progreso
        showTime: false,            // Mostrar tiempo transcurrido
        
        // Textos personalizables
        returningTitle: '¡Bienvenido de nuevo!',
        continueText: '▶ Continuar donde lo dejaste',
        restartText: '🔄 Empezar desde el principio',
        seekBlockedMessage: '⚠️ Debes ver el video completo sin adelantar',
        
        // Debug
        debug: false,
        
        // Controles de Plyr (sin progress bar por defecto)
        controls: ['play-large', 'play', 'mute', 'volume', 'fullscreen']
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
    var maxWatchedTime = 0;      // Tiempo máximo alcanzado por el usuario
    var seekBlocked = false;     // Control de toast de bloqueo

    // ============================================
    // SISTEMA DE LOGGING
    // ============================================
    function log(message, data) {
        if (config.debug) {
            if (data !== undefined) {
                console.log('[Videolitics v3]', message, data);
            } else {
                console.log('[Videolitics v3]', message);
            }
        }
    }

    function warn(message) {
        if (config.debug) {
            console.warn('[Videolitics v3]', message);
        }
    }

    function error(message) {
        console.error('[Videolitics v3]', message);
    }

    // ============================================
    // ✨ BLOQUEO DE NAVEGACIÓN (v3.0)
    // ============================================
    function blockSeek(targetTime) {
        // Permitir retroceder siempre
        if (targetTime < player.currentTime) {
            return false;
        }
        
        // Bloquear adelantar más allá del máximo visto (con margen de 1 segundo)
        if (!config.allowSeek && targetTime > maxWatchedTime + 1) {
            log('⛔ Intento de adelantar bloqueado:', {
                intentado: targetTime,
                maximo: maxWatchedTime
            });
            
            player.currentTime = maxWatchedTime;
            showSeekBlockedMessage();
            return true;
        }
        
        return false;
    }

    function showSeekBlockedMessage() {
        if (seekBlocked) return;
        seekBlocked = true;
        
        var message = document.createElement('div');
        message.className = 'vl-seek-blocked-toast';
        message.textContent = config.seekBlockedMessage;
        
        document.body.appendChild(message);
        
        setTimeout(function() {
            message.classList.add('vl-toast-show');
        }, 10);
        
        setTimeout(function() {
            message.classList.remove('vl-toast-show');
            setTimeout(function() {
                if (document.body.contains(message)) {
                    document.body.removeChild(message);
                }
                seekBlocked = false;
            }, 300);
        }, 2500);
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
    var STORAGE_KEY = 'videolitics_v3_data';

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
            lastVisit: null,
            maxWatchedTime: 0,
            completedVideo: false
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
        
        // Actualizar tiempo máximo alcanzado
        if (time > data.maxWatchedTime) {
            data.maxWatchedTime = time;
            maxWatchedTime = time;
        }
        
        saveVideoData(data);
    }

    function incrementVisit() {
        var data = getVideoData();
        data.visitNumber += 1;
        data.hasWatchedBefore = data.visitNumber > 1;
        data.lastVisit = new Date().toISOString();
        
        // Cargar tiempo máximo alcanzado
        maxWatchedTime = data.maxWatchedTime || 0;
        
        saveVideoData(data);
        log('Visita número:', data.visitNumber);
        log('Tiempo máximo visto:', maxWatchedTime);
    }

    // ============================================
    // BUSCAR SECCIÓN DE WEBFLOW
    // ============================================
    function findTargetSection() {
        if (!config.sectionId) {
            return null;
        }

        // Buscar por ID
        var section = document.getElementById(config.sectionId);
        
        // Si no existe, buscar por clase
        if (!section) {
            section = document.querySelector('.' + config.sectionId);
        }
        
        // Si no existe, buscar por atributo data
        if (!section) {
            section = document.querySelector('[data-videolitics-section="' + config.sectionId + '"]');
        }
        
        if (!section) {
            warn('Sección no encontrada: ' + config.sectionId);
            warn('Asegúrate de que existe un elemento con ID, clase o atributo data-videolitics-section');
            return null;
        }
        
        log('Sección encontrada:', section);
        return section;
    }

    // ============================================
    // MOSTRAR SECCIÓN DE WEBFLOW
    // ============================================
    function showFormSection() {
        if (sectionShown) return;
        
        if (!targetSection) {
            targetSection = findTargetSection();
        }
        
        if (!targetSection) return;
        
        log('Mostrando sección de Webflow');
        
        // Guardar display original
        if (!targetSection.hasAttribute('data-original-display')) {
            var currentDisplay = window.getComputedStyle(targetSection).display;
            targetSection.setAttribute('data-original-display', currentDisplay);
        }
        
        // Mostrar sección
        var originalDisplay = targetSection.getAttribute('data-original-display');
        targetSection.style.display = originalDisplay === 'none' ? 'block' : originalDisplay;
        
        // Animar entrada
        setTimeout(function() {
            targetSection.classList.add('vl-section-visible');
            targetSection.style.opacity = '1';
            targetSection.style.transform = 'translateY(0)';
            sectionShown = true;
            log('Sección visible con animación');
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
        
        // Disparar evento personalizado
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
    // MOSTRAR BOTÓN DE WHATSAPP
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
        
        // Actualizar tiempo máximo visto
        if (current > maxWatchedTime) {
            maxWatchedTime = current;
        }
        
        var percent = (current / duration) * 100;
        
        saveProgress(current, percent);
        
        // Mostrar sección al % configurado
        if (config.sectionId && percent >= config.showSectionPercent) {
            showFormSection();
        }
        
        // Mostrar botón de WhatsApp
        if (config.showWhatsAppButton && config.whatsappNumber && percent >= config.whatsappButtonPercent) {
            showWhatsAppButton();
        }
        
        // Disparar evento de progreso
        var event;
        if (typeof CustomEvent === 'function') {
            event = new CustomEvent('videolitics:progress', { 
                detail: { 
                    percent: percent,
                    current: current,
                    duration: duration,
                    maxWatched: maxWatchedTime
                } 
            });
        } else {
            event = document.createEvent('CustomEvent');
            event.initCustomEvent('videolitics:progress', true, true, {
                percent: percent,
                current: current,
                duration: duration,
                maxWatched: maxWatchedTime
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
            maxWatchedTime = 0;
            player.play();
            document.body.removeChild(overlay);
            
            // Resetear datos
            var data = getVideoData();
            data.maxWatchedTime = 0;
            saveVideoData(data);
            
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
            resetOnEnd: false,
            seekTime: 0,  // Deshabilitar saltos con teclado
            keyboard: { focused: false, global: false }  // Deshabilitar atajos de teclado
        };

        if (videoType === 'youtube') {
            plyrConfig.youtube = { noCookie: true, rel: 0, showinfo: 0, modestbranding: 1 };
        } else if (videoType === 'vimeo') {
            plyrConfig.vimeo = { byline: false, portrait: false, title: false };
        }

        player = new Plyr(videoElement, plyrConfig);
        
        // ✨ BLOQUEAR SEEKING (v3.0)
        if (!config.allowSeek) {
            var lastValidTime = 0;
            
            player.on('seeking', function(event) {
                var targetTime = player.currentTime;
                lastValidTime = player.currentTime;
            });
            
            player.on('seeked', function() {
                var targetTime = player.currentTime;
                if (blockSeek(targetTime)) {
                    // Ya se ha revertido en blockSeek()
                }
            });
            
            // Bloquear también con timeupdate por seguridad
            player.on('timeupdate', function() {
                var current = player.currentTime;
                if (!config.allowSeek && current > maxWatchedTime + 2) {
                    player.currentTime = maxWatchedTime;
                }
            });
        }
        
        // Evento: ready
        player.on('ready', function() {
            log('✅ Plyr listo');
            hideLoading();
            
            var data = getVideoData();
            
            // Modal de continuar si ya vio parte del video
            if (data.hasWatchedBefore && data.lastProgressPercent > 10 && data.lastProgressPercent < 95) {
                showContinueModal(data.lastProgress, data.lastProgressPercent);
            } else if (data.hasWatchedBefore && !data.completedVideo) {
                // Autoplay silenciado en visitas recurrentes
                player.muted = true;
                player.play().catch(function(e) {
                    warn('Autoplay bloqueado por el navegador:', e.message);
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

        // Evento: play
        player.on('play', function() {
            log('▶ Video reproduciendo');
        });

        // Evento: pause
        player.on('pause', function() {
            log('⏸ Video pausado');
        });

        // Evento: timeupdate
        player.on('timeupdate', function() {
            updateProgress();
        });

        // Evento: ended
        player.on('ended', function() {
            log('✅ Video finalizado');
            
            // Marcar como completado
            var data = getVideoData();
            data.lastProgressPercent = 100;
            data.maxWatchedTime = player.duration;
            data.completedVideo = true;
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
            error('❌ Hls.js no está cargado. Incluye el script en tu página.');
            showErrorMessage('Error: Biblioteca HLS no cargada');
            return;
        }

        if (Hls.isSupported()) {
            var hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 90,
                debug: config.debug
            });
            
            hls.loadSource(config.video);
            hls.attachMedia(videoElement);
            
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                log('✅ HLS manifest cargado correctamente');
                initPlyr(videoElement, 'hls');
            });
            
            hls.on(Hls.Events.ERROR, function(event, data) {
                if (data.fatal) {
                    error('❌ Error fatal de HLS:', data);
                    
                    switch(data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            error('Error de red. Verifica:');
                            error('1. La URL del video es correcta');
                            error('2. CORS está configurado en Bunny.net');
                            error('3. El dominio está en "Allowed Referrers"');
                            error('URL actual:', config.video);
                            showErrorMessage(
                                'Error de conexión con el video.<br>' +
                                '<strong>Verifica la configuración de CORS.</strong><br>' +
                                '<small>URL: ' + config.video + '</small>'
                            );
                            break;
                            
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            error('Error de medio. Intentando recuperar...');
                            hls.recoverMediaError();
                            break;
                            
                        default:
                            showErrorMessage('Error al cargar el video');
                            break;
                    }
                } else {
                    warn('Error no fatal de HLS:', data.details);
                }
            });
            
        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari nativo
            log('Usando reproducción HLS nativa de Safari');
            videoElement.src = config.video;
            initPlyr(videoElement, 'hls');
            
        } else {
            error('❌ HLS no soportado en este navegador');
            showErrorMessage('Tu navegador no soporta este formato de video');
        }
    }

    // ============================================
    // MOSTRAR MENSAJE DE ERROR
    // ============================================
    function showErrorMessage(message) {
        hideLoading();
        
        var errorDiv = document.createElement('div');
        errorDiv.className = 'vl-error-message';
        errorDiv.innerHTML = 
            '<div class="vl-error-content">' +
                '<span class="vl-error-icon">⚠️</span>' +
                '<p>' + message + '</p>' +
                '<button class="vl-error-reload" onclick="location.reload()">Recargar Página</button>' +
            '</div>';
        
        container.innerHTML = '';
        container.appendChild(errorDiv);
    }

    // ============================================
    // EXTRAER ID DE VIDEO (YouTube/Vimeo)
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
            error('❌ No se ha configurado la URL del video');
            error('Añade: video: "URL_DEL_VIDEO" en VideoliticsConfig');
            return false;
        }
        
        if (config.sectionId && !findTargetSection()) {
            warn('⚠️ Sección configurada pero no encontrada en el DOM');
        }
        
        return true;
    }

    // ============================================
    // INICIALIZACIÓN PRINCIPAL
    // ============================================
    function init() {
        log('╔════════════════════════════════════════╗');
        log('║   Videolitics v3.0 - No Seek Edition  ║');
        log('╚════════════════════════════════════════╝');
        log('Configuración:', config);
        
        container = document.getElementById('videolitics-player');
        
        if (!container) {
            error('❌ Contenedor #videolitics-player no encontrado');
            error('Añade un Embed con: <div id="videolitics-player"></div>');
            return;
        }
        
        if (!validateConfig()) {
            return;
        }
        
        // Buscar y ocultar sección objetivo
        if (config.sectionId) {
            targetSection = findTargetSection();
            
            if (targetSection) {
                targetSection.style.display = 'none';
                targetSection.style.opacity = '0';
                targetSection.style.transform = 'translateY(30px)';
                targetSection.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
                log('✅ Sección oculta inicialmente');
            }
        }
        
        incrementVisit();
        createPlayer();
        
        log('✅ Videolitics v3.0 inicializado correctamente');
    }

    // ============================================
    // AUTO-INIT
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================
    // API PÚBLICA
    // ============================================
    window.Videolitics = {
        version: '3.0.0',
        showSection: showFormSection,
        getProgress: function() {
            return player ? {
                current: player.currentTime,
                duration: player.duration,
                percent: (player.currentTime / player.duration) * 100,
                maxWatched: maxWatchedTime
            } : null;
        },
        getData: getVideoData,
        resetProgress: function() {
            maxWatchedTime = 0;
            var data = getVideoData();
            data.maxWatchedTime = 0;
            data.lastProgress = 0;
            data.lastProgressPercent = 0;
            saveVideoData(data);
            log('Progreso reseteado');
        }
    };

})();