const express = require('express');
const http = require('http');
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

const BASE_HOST = 'ananasmine.ru';

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
        conLog: console.log,
        connectTimeout: 20000 // Увеличиваем таймаут подключения
    };

    console.log(`[Bot #${botId}] Connecting to ${config.port} as ${config.username}...`);
    
    let client;
    let isReconnecting = false; // Флаг, чтобы не реконнектиться дважды
    let afkInterval = null;     // Переменная для таймера анти-афк

    // Единая функция для перезапуска
    const scheduleReconnect = () => {
        if (isReconnecting) return;
        isReconnecting = true;

        // Очищаем таймер анти-афк, если он был
        if (afkInterval) clearInterval(afkInterval);

        console.log(`[Bot #${botId}] Disconnected/Kicked. Reconnecting in 60s...`);
        
        // Пытаемся закрыть клиент, чтобы не висел в памяти
        try { client?.close(); } catch (e) {}

        setTimeout(() => {
            startBot(config, index);
        }, 60000); // 60 секунд (1 минута)
    };

    try {
        client = bedrock.createClient(options);
    } catch (e) {
        console.log(`[Bot #${botId}] Startup error:`, e.message);
        scheduleReconnect();
        return;
    }

    client.on('error', (err) => {
        console.log(`[Bot #${botId}] Error:`, err.message); 
        scheduleReconnect();
    });

    client.on('kick', (reason) => {
        // При ночной перезагрузке сервер шлет kick
        console.log(`[Bot #${botId}] Kicked by server.`); 
        scheduleReconnect();
    });

    client.on('end', () => {
        console.log(`[Bot #${botId}] Session ended.`);
        scheduleReconnect();
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
                // Проверяем, жив ли клиент перед отправкой ответа
                if (!isReconnecting) {
                    client.queue('modal_form_response', {
                        form_id: packet.form_id,
                        has_response_data: true,
                        data: JSON.stringify(responseArray),
                        cancel_reason: undefined
                    });
                }
            }, 2000);
        } catch (e) {}
    });

    client.on('spawn', () => {
        console.log(`[Bot #${botId}] Spawned successfully!`);
        
        // Анти-АФК
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

        const spamFilters = ['Очистка', 'удалено', 'anmine.su', 'vk.com', '/donate', '/guide', '/marry', '/ac', 'Подписывайся', 'Справочник'];
        if (spamFilters.some(filter => message.includes(filter))) return;

        message = message.replace(/^\[CHAT\]\s*/, '').replace(/[Ⓖ]/g, '').trim();

        io.emit('chat_message', {
            id: botId,
            html: minecraftToHtml(message)
        });
    });
}

async function startAllBots() {
    console.log('Starting all bots with 10s delay between each...');
    for (let i = 0; i < botsConfig.length; i++) {
        startBot(botsConfig[i], i);
        // Задержка между запусками ботов, чтобы не спамить сервер подключениями
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
    console.log('All start sequences initiated.');
}

startAllBots();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
