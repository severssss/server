const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bedrock = require('bedrock-protocol');
const https = require('https'); // Добавлено для Телеграм

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- КОНФИГУРАЦИЯ TELEGRAM ---
const TG_TOKEN = '8418289926:AAG8SZ73owF0eL3KQGz_l-tKKv7C4TpukeE';
const TG_CHAT_ID = '6639998286';

// Функция отправки логов в Телеграм
function logToTelegram(text) {
    // Сначала выводим в консоль
    console.log(text);

    // Подготовка данных для отправки
    const data = JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: text,
        parse_mode: 'HTML' // Можно использовать базовый HTML если нужно
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TG_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, (res) => {
        // Мы не обрабатываем ответ, чтобы не засорять память, нам важна только отправка
    });

    req.on('error', (error) => {
        console.error('Ошибка отправки в Telegram (игнорируется):', error.message);
    });

    req.write(data);
    req.end();
}

// --- ГЛОБАЛЬНАЯ ЗАЩИТА ОТ ПАДЕНИЙ (НЕУБИВАЕМОСТЬ) ---
process.on('uncaughtException', (err) => {
    console.error('!!! CRITICAL ERROR (Uncaught):', err);
    // Скрипт не упадет, боты продолжат переподключаться по своим таймерам
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('!!! CRITICAL ERROR (Unhandled Rejection):', reason);
});
// -----------------------------------------------------

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
    res.send('Bot Server Running. Bots are auto-reconnecting...');
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
        conLog: console.log, // Логи библиотеки оставляем в консоли
        connectTimeout: 20000,
        skipPing: true // Иногда помогает ускорить реконнект
    };

    logToTelegram(`[Bot #${botId}] 🟡 Подключение к ${config.port} как ${config.username}...`);
    
    let client;
    let isReconnecting = false; 
    let afkInterval = null;     

    const scheduleReconnect = (reason) => {
        if (isReconnecting) return;
        isReconnecting = true;

        if (afkInterval) clearInterval(afkInterval);

        const msg = `[Bot #${botId}] 🔴 Отключен/Кикнут (${reason || 'Unknown'}). Реконнект через 45 сек...`;
        logToTelegram(msg);
        
        try { client?.close(); } catch (e) {}

        // Используем setTimeout, который гарантированно перезапустит бота
        setTimeout(() => {
            startBot(config, index);
        }, 45000); // 45 секунд задержка перед реконнектом
    };

    try {
        client = bedrock.createClient(options);
    } catch (e) {
        logToTelegram(`[Bot #${botId}] ❌ Ошибка при старте: ${e.message}`);
        scheduleReconnect('Start Error');
        return;
    }

    client.on('error', (err) => {
        // Ошибки соединения не должны крашить скрипт
        console.log(`[Bot #${botId}] Client Error Logged:`, err.message);
        scheduleReconnect(`Error: ${err.message}`);
    });

    client.on('kick', (reason) => {
        logToTelegram(`[Bot #${botId}] 🦶 Кикнут сервером: ${reason}`); 
        scheduleReconnect('Kicked');
    });

    client.on('end', (reason) => {
        logToTelegram(`[Bot #${botId}] ⚪ Сессия завершена.`);
        scheduleReconnect('Session End');
    });

    client.on('modal_form_request', (packet) => {
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
                if (!isReconnecting) {
                    client.queue('modal_form_response', {
                        form_id: packet.form_id,
                        has_response_data: true,
                        data: JSON.stringify(responseArray),
                        cancel_reason: undefined
                    });
                    console.log(`[Bot #${botId}] Форма логина отправлена.`);
                }
            }, 2000);
        } catch (e) {
            console.error(`[Bot #${botId}] Ошибка формы:`, e);
        }
    });

    client.on('spawn', () => {
        logToTelegram(`[Bot #${botId}] 🟢 Успешно заспавнился на сервере!`);
        
        afkInterval = setInterval(() => {
            if (isReconnecting) {
                clearInterval(afkInterval);
                return;
            }
            try {
                client.queue('animate', { action_id: 1, runtime_entity_id: 0 });
            } catch (e) {
                clearInterval(afkInterval);
            }
        }, 8000);
    });

    client.on('text', (packet) => {
        let message = packet.message;
        if (!message) return;

        // Фильтры спама (не отправляем в веб, не отправляем в тг)
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

async function startAllBots() {
    logToTelegram('🚀 ЗАПУСК ВСЕХ БОТОВ (Задержка 10с)...');
    for (let i = 0; i < botsConfig.length; i++) {
        startBot(botsConfig[i], i);
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
    logToTelegram('✅ Все последовательности запуска инициированы.');
}

startAllBots();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
