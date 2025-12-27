const express = require('express');
const http = require('http');
const https = require('https'); // Нужно для запросов к Telegram
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

// --- КОНФИГУРАЦИЯ TELEGRAM ---
const TELEGRAM_TOKEN = '8418289926:AAG8SZ73owF0eL3KQGz_l-tKKv7C4TpukeE';
// ВНИМАНИЕ: Замените 'ВАШ_CHAT_ID' на цифры, которые выдаст @userinfobot
const TELEGRAM_CHAT_ID = 'ВАШ_CHAT_ID'; 

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
    res.send('Bot Server Running with Telegram Logs.');
});

// --- ФУНКЦИЯ ОТПРАВКИ ЛОГОВ В TELEGRAM ---
function logToTelegram(message) {
    if (!TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID === '6639998286') {
        console.log('[Telegram Error] Chat ID не указан! Лог не отправлен.');
        return;
    }

    const data = JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML' // Можно использовать жирный шрифт и т.д.
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = https.request(options, (res) => {
        // Ответ от телеграма нам не особо важен, если статус 200
    });

    req.on('error', (e) => {
        console.error(`[Telegram Fail] Не удалось отправить лог: ${e.message}`);
    });

    req.write(data);
    req.end();
}

io.on('connection', (socket) => {
    const now = Date.now();
    chatHistory = chatHistory.filter(m => now - m.t < 300000);
    chatHistory.forEach(m => socket.emit('chat_message', m));
});

function minecraftToHtml(text) {
    // Упрощенная версия для примера
    return text; 
}

function startBot(config, index) {
    const botId = index + 1;
    const logPrefix = `<b>[Bot ${botId} - ${config.username}]</b>`;
    
    const options = {
        host: BASE_HOST,
        port: config.port,
        username: config.username,
        offline: true,
        connectTimeout: 30000, 
        skipPing: true 
    };

    console.log(`[Bot #${botId}] Подключение к ${config.port}...`);
    
    let client;
    let isReconnecting = false; 
    let afkInterval = null;     

    // ЕДИНАЯ ФУНКЦИЯ РЕКОННЕКТА
    const scheduleReconnect = (reason) => {
        if (isReconnecting) return;
        isReconnecting = true;

        if (afkInterval) clearInterval(afkInterval);

        const logMsg = `${logPrefix} Отключен: <i>${reason}</i>. Реконнект через 60 сек...`;
        console.log(`[Bot #${botId}] ${reason}. Reconnecting in 60s...`);
        logToTelegram(logMsg);
        
        // Удаляем старый клиент полностью
        if (client) {
            try {
                client.removeAllListeners(); 
                client.close(); 
            } catch (e) {}
            client = null;
        }

        // ЖДЕМ РОВНО 60 СЕКУНД (чтобы сервер забыл сессию)
        setTimeout(() => {
            console.log(`[Bot #${botId}] Таймер истек. Перезапуск...`);
            startBot(config, index);
        }, 60000); 
    };

    try {
        client = bedrock.createClient(options);
    } catch (e) {
        scheduleReconnect(`Ошибка старта: ${e.message}`);
        return;
    }

    client.on('error', (err) => {
        scheduleReconnect(`Error: ${err.message}`);
    });

    client.on('kick', (reason) => {
        scheduleReconnect(`Kicked: ${reason}`);
    });

    client.on('end', () => {
        scheduleReconnect('Сессия завершена (End)');
    });

    client.on('close', () => {
        scheduleReconnect('Соединение закрыто (Close)');
    });

    client.on('disconnect', (packet) => {
        scheduleReconnect(`Disconnect Packet: ${packet.reason}`);
    });

    client.on('modal_form_request', (packet) => {
        if (isReconnecting) return;
        // ... (Ваш код обработки формы остается без изменений) ...
        // Для краткости я оставил тут только вызов, логика стандартная
        handleForm(client, packet, config, botId);
    });

    client.on('spawn', () => {
        const msg = `${logPrefix} ✅ Успешно зашел на сервер!`;
        console.log(`[Bot #${botId}] Spawned!`);
        logToTelegram(msg);
        
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
        if (isReconnecting) return;
        let message = packet.message;
        if (!message) return;

        // Фильтры спама
        const spamFilters = ['Очистка', 'удалено', 'anmine.su', 'vk.com', '/donate', '/guide'];
        if (spamFilters.some(filter => message.includes(filter))) return;

        message = message.replace(/^\[CHAT\]\s*/, '').replace(/[Ⓖ]/g, '').trim();

        const msgObj = {
            id: botId,
            html: message, // Тут можно вернуть функцию minecraftToHtml
            t: Date.now()
        };

        // В TELEGRAM ЧАТ НЕ ОТПРАВЛЯЕМ, ЧТОБЫ НЕ БЫЛО СПАМА И БАНА ОТ ТЕЛЕГРАМА
        // Только в веб-интерфейс
        chatHistory.push(msgObj);
        chatHistory = chatHistory.filter(m => Date.now() - m.t < 300000);
        io.emit('chat_message', msgObj);
    });
}

// Вынес обработку формы отдельно для чистоты
function handleForm(client, packet, config, botId) {
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
            try {
                client.queue('modal_form_response', {
                    form_id: packet.form_id,
                    has_response_data: true,
                    data: JSON.stringify(responseArray),
                    cancel_reason: undefined
                });
            } catch(e){}
        }, 2000);
    } catch (e) {}
}

async function startAllBots() {
    logToTelegram(`🚀 <b>Запуск сервера ботов...</b>`);
    console.log('Starting all bots...');
    for (let i = 0; i < botsConfig.length; i++) {
        startBot(botsConfig[i], i);
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

startAllBots();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
