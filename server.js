const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bedrock = require('bedrock-protocol');

const app = express();
const server = http.createServer(app);

// Настройка Socket.IO с разрешением для InfinityFree
const io = socketIo(server, {
    cors: {
        origin: "*", // Разрешаем подключение с любого сайта (включая твой на InfinityFree)
        methods: ["GET", "POST"]
    }
});

// --- НАСТРОЙКИ БОТА ---
const botOptions = {
    host: 'ananasmine.ru',
    port: 19133,
    username: 'skin 5438',
    offline: true
};
const BOT_PASSWORD = 'manka321';

let client;

// --- СТРАНИЦА-ЗАГЛУШКА (ЧТОБЫ RENDER НЕ РУГАЛСЯ) ---
app.get('/', (req, res) => {
    res.send('Bot Server is Running! Use index.html on InfinityFree to view chat.');
});

// --- ЛОГИКА БОТА ---
function startBot() {
    console.log('Запуск бота...');
    client = bedrock.createClient(botOptions);

    client.on('error', (err) => {
        console.log('Ошибка клиента:', err); 
    });

    client.on('packet', (packet) => {
        const packetName = packet.data.name || packet.name;
        if (packetName === 'disconnect') {
            console.log('Сервер разорвал соединение.');
        }
    });

    // Обработка формы пароля
    client.on('modal_form_request', (packet) => {
        let formData = packet.data;
        try {
            if (typeof formData === 'string') formData = JSON.parse(formData);
            let responseArray = [];
            
            if (formData.content && Array.isArray(formData.content)) {
                formData.content.forEach((field) => {
                    if (field.type === 'input') responseArray.push(BOT_PASSWORD);
                    else if (field.type === 'toggle') responseArray.push(true);
                    else responseArray.push(null);
                });
            } else {
                responseArray = [BOT_PASSWORD];
            }

            setTimeout(() => {
                client.queue('modal_form_response', {
                    form_id: packet.form_id,
                    has_response_data: true,
                    data: JSON.stringify(responseArray),
                    cancel_reason: undefined
                });
            }, 1000);
        } catch (e) {}
    });

    // Анти-АФК
    client.on('spawn', () => {
        console.log('Бот заспавнился!');
        setInterval(() => {
            client.queue('animate', { action_id: 1, runtime_entity_id: 0 });
        }, 5000);
    });

    // Чат
    client.on('text', (packet) => {
        let message = packet.message;
        if (!message) return;

        // Фильтры
        const spamFilters = ['Очистка', 'удалено', 'anmine.su', 'vk.com', '/donate', '/guide', '/marry', '/ac', 'Подписывайся', 'Справочник'];
        if (spamFilters.some(filter => message.includes(filter))) return;

        // Очистка текста
        message = message.replace(/^\[CHAT\]\s*/, '').replace(/[Ⓖ]/g, '').trim();

        // Отправка на сайт
        io.emit('chat_message', minecraftToHtml(message));
    });

    // Перезапуск при вылете
    client.on('end', () => {
        console.log('Бот отключился. Перезапуск через 10 сек...');
        setTimeout(startBot, 10000);
    });
}

// Конвертер цветов
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
    
    if (parts[0].length > 0) html += `<span style="color:${currentColor}">${parts[0]}</span>`;

    for (let i = 1; i < parts.length; i++) {
        let code = parts[i].charAt(0);
        let content = parts[i].substring(1);
        if (colorMap[code]) currentColor = colorMap[code];
        else if (code === 'r') currentColor = '#ffffff';
        if (content.length > 0) html += `<span style="color:${currentColor}">${content}</span>`;
    }
    return html;
}

startBot();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});