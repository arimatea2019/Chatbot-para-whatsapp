const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const moment = require('moment');
const mysql = require('mysql');
const fs = require('fs');

// Configurações de conexão com o banco de dados
const db = mysql.createConnection({
    host: '*',
    user: '*',
    password: '*',
    database: '*'
});

// Conectar ao banco de dados
db.connect(err => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados: ' + err.stack);
        return;
    }
    console.log('Conectado ao banco de dados com sucesso.');
});

const client = new Client({
    authStrategy: new LocalAuth(),
    webVersionCache: {
      type: "remote",
      remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
    },
});

let correspondentIndex = 0;
const correspondents = [
    '55***@c.us', // correspondente 1
    '55***@c.us', // correspondente 2
];

// Lê o arquivo para obter os números já contatados ou cria um novo se não existir
const contactedNumbersFile = 'contactedNumbers.txt';
let contactedNumbers = new Set();
if (fs.existsSync(contactedNumbersFile)) {
    const data = fs.readFileSync(contactedNumbersFile, 'utf8');
    if (data) { // Verifica se data não é vazia ou undefined
        const lines = data.split('\n').filter(Boolean);
        contactedNumbers = new Set(lines.map(line => line.split(' - ')[0]));

        // Pega o último índice registrado
        const lastLine = lines[lines.length - 1];
        if (lastLine) { // Verifica se lastLine não é vazia ou undefined
            const lastLineParts = lastLine.split(', Index: ');
            if (lastLineParts.length > 1) {
                correspondentIndex = (parseInt(lastLineParts[1]) + 1) % correspondents.length;
            }
        }
    }
}
function saveNumber(number, clientName, correspondentNumber, index) {
    const record = `${number} - Cliente: ${clientName}, Encaminhado para: ${correspondentNumber}, Index: ${index}\n`;
    fs.appendFileSync(contactedNumbersFile, record);
}

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

client.on('message', async message => {
    console.log(`Received message from ${message.from}: ${message.body} | Type: ${message.type}`);
    if (message.from.includes('@g.us') || message.type === 'ptt') {
        return; // Ignora mensagens de grupo e áudios
    }

    let phoneNumber = message.from.replace(/[^0-9]/g, '').substring(2); // Remove tudo exceto números e '55'
    // Checa se o phoneNumber tem menos de 11 dígitos
    if (phoneNumber.length < 11) {
        phoneNumber = phoneNumber.substring(0, 2) + '9' + phoneNumber.substring(2); // Formata com '9' depois do DDD se necessário
    }

    if (contactedNumbers.has(phoneNumber)) {
        console.log(`Número ${phoneNumber} já contatado, ignorando.`);
        return; // Ignora se o número já foi contatado
    }

    // Marca o número como processado para evitar que seja pego novamente
    contactedNumbers.add(phoneNumber);
    
    db.query('SELECT nome, cpf, agencia, conta FROM consulta WHERE celular = ?', [phoneNumber], (err, results) => {
        if (err) {
            console.error('Erro ao buscar no banco de dados: ' + err.stack);
            saveNumber(phoneNumber, "Erro no DB", "N/A"); // Grava como erro se não puder consultar o DB
            return;
        }
        if (results.length > 0) {
            const result = results[0];
            console.log(`Dados encontrados: ${JSON.stringify(result)}`);
            const correspondent = correspondents[correspondentIndex];
            const greeting = getGreeting();
            const clientMessage = `${greeting} Bem vindo ao atendimento digital, vou estar te encaminhando para um dos nossos correspondentes autorizados.`;
            const correspondentMessage = `Novo Cliente, por favor entrar em contato Cliente: ${result.nome}, CPF: ${result.cpf}, Agência: ${result.agencia}, Conta: ${result.conta}, Número: ${phoneNumber}`;
            
            // Envia as mensagens
            message.reply(clientMessage);
            client.sendMessage(correspondent, correspondentMessage);
            console.log(`Cliente enviado para ${correspondent}`);

           // Salva no arquivo após a ação para garantir que tudo foi processado corretamente
           saveNumber(phoneNumber, result.nome, correspondent, correspondentIndex);


            // Atualiza o índice do correspondente
            correspondentIndex = (correspondentIndex + 1) % correspondents.length;
        } else {
            console.log('Número não encontrado na base de dados, ignorando.');
            saveNumber(phoneNumber, "Não encontrado", "N/A"); // Grava como não encontrado
        }
    });
});

function getGreeting() {
    const hour = moment().hour();
    if (hour < 12) {
        return 'Olá, bom dia!';
    } else if (hour < 18) {
        return 'Olá, boa tarde!';
    } else {
        return 'Olá, boa noite!';
    }
}

client.on('disconnected', (reason) => {
    console.log('Client was logged out', reason);
    client.initialize();
});

client.initialize();