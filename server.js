const express = require('express');
const http = require('http');
const https = require('https'); // Добавлено для Телеграма
const socketIo = require('socket.io');
const bedrock = require('bedrock-protocol');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- КОНФИГУРАЦИЯ ТЕЛЕГРАМ ---
const TG_TOKEN = '8418289926:AAG8SZ73owF0eL3KQGz_l-tKKv7C4TpukeE';
const TG_CHAT_ID = '6639998286';

// Функция отправки логов в Телеграм
function sendTelegramLog(message) {
    if (!message) return;
    // Убираем HTML теги если они есть, чтобы не ломать парсинг ТГ
    const cleanMsg = message.replace(/<[^>]*>?/gm, '');
    const text = encodeURIComponent(cleanMsg);
    const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage?chat_id=${TG_CHAT_ID}&text=${text}`;

    https.get(url, (res) => {
        // Ответ от ТГ не обрабатываем
    }).on('error', (e) => {
        console.error(`Ошибка отправки в Telegram: ${e.message}`);
    });
}

// Функция для логирования и в консоль, и в ТГ
function logStatus(botId, message) {
    const logString = `[Bot #${botId}] ${message}`;
    console.log(logString); // Пишем в консоль
    sendTelegramLog(logString); // Шлем в ТГ
}

const BASE_HOST = 'ananasmine.ru';
let chatHistory = [];

const botsConfig = [
    { port: 19133, username: 'zveruga1', password: 'garova' },
    { port: 19134, username: 'zveruga2', password: 'garova' },
    { port: 19135, username: 'zveruga3', password: 'garova' },
    { port: 19136, username: 'zveruga4', password: 'garova' },
    { port: 19137, username: 'zveruga5', password: 'garova' },
    { port: 19138, username: 'zveruga6', password: 'garova' },
    { port: 19139, username: 'zveruga7', password: 'garova' },
    { port: 19140, username: 'zveruga8', password: 'garova' }
];

app.get('/', (req, res) => {
    res.send('Bot Server Running. Monitoring active.');
});

io.on('connection', (socket) => {
    const now = Date.now();
    chatHistory = chatHistory.filter(m => now - m.t < 300000);
    chatHistory.forEach(m => socket.emit('chat_message', m));
});

function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function minecraftToHtml(text) {
    const colorMap = {
        '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
        '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
        '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
        'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF',
        'g': '#DDD605' 
    };
    
    let parts = text.split('§');
    let html = '';
    let currentColor = '#aaaaaa'; 
    
    if (parts[0].length > 0) html += `<span style="color:${currentColor}">${escapeHtml(parts[0])}</span>`;

    for (let i = 1; i < parts.length; i++) {
        let code = parts[i].charAt(0);
        let content = parts[i].substring(1);
        if (colorMap[code]) currentColor = colorMap[code];
        else if (code === 'r') currentColor = '#ffffff';
        if (content.length > 0) html += `<span style="color:${currentColor}">${escapeHtml(content)}</span>`;
    }
    return html;
}

function startBot(config, index) {
    const botId = index + 1;
    
    const options = {
        host: BASE_HOST,
        port: config.port,
        username: config.username,
        offline: true,
        conLog: null, 
        connectTimeout: 20000,
        skipPing: true
    };

    console.log(`[Bot #${botId}] Попытка подключения к порту ${config.port}...`);
    
    let client;
    let isReconnecting = false; 
    let afkInterval = null;     

    // Функция гарантированного перезапуска
    const scheduleReconnect = (reason) => {
        if (isReconnecting) return;
        isReconnecting = true;

        if (afkInterval) clearInterval(afkInterval);

        // ВАЖНО: Удаляем слушатели, чтобы старый клиент не слал события error/close
        // после того, как мы уже решили его перезагрузить.
        if (client) {
            client.removeAllListeners();
            try { client.close(); } catch (e) {}
        }

        logStatus(botId, `Отключен. Причина: ${reason || 'Неизвестна'}. Реконнект через 60с...`);
        
        setTimeout(() => {
            startBot(config, index);
        }, 60000); 
    };

    try {
        client = bedrock.createClient(options);
    } catch (e) {
        scheduleReconnect(`Ошибка инициализации клиента: ${e.message}`);
        return;
    }

    client.on('error', (err) => {
        // Ошибка сокета часто предшествует close, но если она критическая, 
        // лучше сразу уйти в реконнект, чтобы не висеть
        console.error(`[Bot #${botId}] Ошибка сокета: ${err.message}`);
        // Не вызываем scheduleReconnect сразу, ждем close, 
        // но если close не придет в течение 5 сек - форсируем.
    });

    client.on('kick', (reason) => {
        // ИСПРАВЛЕНИЕ [object Object]:
        // Bedrock protocol иногда присылает объект в качестве причины
        let reasonMsg = reason;
        if (typeof reason === 'object') {
            reasonMsg = reason.message || JSON.stringify(reason);
        }
        scheduleReconnect(`Кикнут сервером. Сообщение: ${reasonMsg}`);
    });

    client.on('end', (reason) => {
        scheduleReconnect(`Сессия завершена (end). Причина: ${reason}`);
    });

    client.on('close', () => {
        scheduleReconnect(`Соединение разорвано (close).`);
    });

    // Обработка модальных форм (пароль)
    client.on('modal_form_request', (packet) => {
        if (isReconnecting) return; // Если мы уже уходим в ребут, игнорируем формы

        let formData = packet.data;
        try {
            if (typeof formData === 'string') formData = JSON.parse(formData);
            let responseArray = [];
            
            if (formData.content && Array.isArray(formData.content)) {
                formData.content.forEach((field) => {
                    if (field.type === 'input') responseArray.push(config.password);
                    else if (field.type === 'toggle') responseArray.push(true);
                    else responseArray.push(null);
                });
            } else {
                responseArray = [config.password];
            }

            setTimeout(() => {
                // Проверяем, жив ли клиент перед отправкой
                if (!isReconnecting && client) {
                    client.queue('modal_form_response', {
                        form_id: packet.form_id,
                        has_response_data: true,
                        data: JSON.stringify(responseArray),
                        cancel_reason: undefined
                    });
                }
            }, 2000);
        } catch (e) {
            console.error(`[Bot #${botId}] Ошибка формы: ${e.message}`);
        }
    });

    client.on('spawn', () => {
        logStatus(botId, `Успешно заспавнился на сервере!`);
        
        // Анти-АФК
        afkInterval = setInterval(() => {
            if (isReconnecting) {
                clearInterval(afkInterval);
                return;
            }
            try {
                if(client) client.queue('animate', { action_id: 1, runtime_entity_id: 0 });
            } catch (e) {
                clearInterval(afkInterval);
            }
        }, 8000);
    });

    client.on('text', (packet) => {
        if (isReconnecting) return; // Не обрабатываем чат, если бот "умер"

        let message = packet.message;
        if (!message) return;

        const spamFilters = ['Очистка', 'удалено', 'anmine.su', 'vk.com', '/donate', '/guide', '/marry', '/ac', 'Подписывайся', 'Справочник'];
        if (spamFilters.some(filter => message.includes(filter))) return;

        message = message.replace(/^\[CHAT\]\s*/, '').replace(/[Ⓖ]/g, '').trim();

        const msgObj = {
            id: botId,
            html: minecraftToHtml(message),
            t: Date.now()
        };

        chatHistory.push(msgObj);
        chatHistory = chatHistory.filter(m => Date.now() - m.t < 300000);

        io.emit('chat_message', msgObj);
    });
}

// Защита от падения всего скрипта
process.on('uncaughtException', (err) => {
    console.error(`[CRITICAL] Необработанная ошибка: ${err.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[CRITICAL] Необработанный промис: ${reason}`);
});

async function startAllBots() {
    console.log('Запуск всех ботов с задержкой 10с...');
    sendTelegramLog('Система мониторинга ботов запущена.');
    
    for (let i = 0; i < botsConfig.length; i++) {
        startBot(botsConfig[i], i);
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
    console.log('Все боты инициализированы.');
}

startAllBots();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
